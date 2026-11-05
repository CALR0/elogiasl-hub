-- Accesos individuales por usuario: los lleva también a las políticas RLS y
-- cierra el autootorgamiento.
--   1. tiene_acceso() solo miraba el rol, y es la función que protege Usuarios,
--      Roles y el Visor de logs: un acceso otorgado abría la página sin datos y
--      uno revocado seguía leyendo y escribiendo por la API. Ahora calcula lo
--      mismo que lib/auth.ts: (rol) ∪ (otorgado) ∖ (revocado).
--   2. Quien gestiona usuarios podía cambiar sus propios accesos llamando a la
--      API de Supabase (la pantalla sí lo bloqueaba). Ahora lo impide un trigger.
--   3. Los accesos individuales solo aplican a funcionalidades, como en el rol.
-- Las peticiones del servidor con la secret key (sin auth.uid()) no pasan por
-- el punto 2: esas operaciones las valida la aplicación (usuarios/acciones.ts).

-- ─── 1. Permiso efectivo ───────────────────────────────────────────────────

create or replace function public.tiene_acceso(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_superadmin() or exists (
    select 1
    from public.perfiles p
    join public.roles r on r.id = p.rol_id
    where p.id = auth.uid()
      and p.activo and r.activo
      and (
        exists (
          select 1 from public.rol_permisos rp
          where rp.rol_id = r.id
            and (rp.modulo_clave = p_modulo or rp.modulo_clave like p_modulo || '.%')
            and not exists (
              select 1 from public.usuario_permisos up
              where up.usuario_id = p.id
                and up.modulo_clave = rp.modulo_clave
                and up.tipo = 'revocar'
            )
        )
        or exists (
          select 1 from public.usuario_permisos up
          where up.usuario_id = p.id
            and up.tipo = 'otorgar'
            and (up.modulo_clave = p_modulo or up.modulo_clave like p_modulo || '.%')
        )
      )
  )
$$;

-- Una sola regla: tiene_permiso (Estudios y usuario_permisos) usa la misma.
create or replace function public.tiene_permiso(p_modulo text, p_accion text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tiene_acceso(p_modulo)
$$;

-- ─── 2. Nadie (salvo el superadmin) cambia sus propios accesos ─────────────

create function public.proteger_accesos_propios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.es_superadmin()
     and ((tg_op <> 'INSERT' and old.usuario_id = auth.uid())
          or (tg_op <> 'DELETE' and new.usuario_id = auth.uid())) then
    raise exception 'No puedes cambiar tus propios accesos individuales'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger usuario_permisos_proteger_propios
  before insert or update or delete on public.usuario_permisos
  for each row execute function public.proteger_accesos_propios();

-- ─── 3. Solo funcionalidades ───────────────────────────────────────────────

create trigger usuario_permisos_validar_hoja
  before insert or update on public.usuario_permisos
  for each row execute function public.validar_acceso_hoja();
