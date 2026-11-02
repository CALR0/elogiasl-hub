-- Cierra dos saltos de privilegios para quien gestiona usuarios o roles sin
-- ser superadministrador:
--   1. Perfiles: solo un superadministrador modifica a otro superadministrador
--      (rol, estado, nombre) o asigna el rol de superadministrador. Antes,
--      con acceso a Configuración › Usuarios bastaba para darse ese rol a una
--      cuenta propia o desactivar a un administrador.
--   2. Roles: nadie sin ese rango edita, desactiva ni cambia los accesos del rol
--      al que pertenece (se daría a sí mismo cualquier acceso).
-- Las peticiones del servidor con la secret key (sin auth.uid()) no pasan por
-- aquí: esas operaciones las valida la aplicación (lib/auth + acciones).

create function public.rol_propio()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rol_id from public.perfiles where id = auth.uid();
$$;

revoke all on function public.rol_propio() from public, anon;
grant execute on function public.rol_propio() to authenticated;

-- ─── 1. Perfiles de superadministradores ───────────────────────────────────

create function public.proteger_perfil_superadmin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.es_superadmin() then
    return new;
  end if;
  if exists (select 1 from public.roles where id = old.rol_id and es_superadmin) then
    raise exception 'Solo un superadministrador puede modificar a otro superadministrador'
      using errcode = '42501';
  end if;
  if new.rol_id is distinct from old.rol_id
     and exists (select 1 from public.roles where id = new.rol_id and es_superadmin) then
    raise exception 'Solo un superadministrador puede asignar el rol de superadministrador'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_superadmin before update on public.perfiles
  for each row execute function public.proteger_perfil_superadmin();

-- ─── 2. El rol propio ──────────────────────────────────────────────────────

/** ¿La petición es de un usuario sin rango de superadmin sobre su propio rol? */
create function public.es_rol_propio_protegido(p_rol uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and not public.es_superadmin()
     and p_rol = public.rol_propio();
$$;

create function public.proteger_rol_propio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.es_rol_propio_protegido(old.id) then
    raise exception 'No puedes modificar el rol al que perteneces'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger roles_proteger_propio before update on public.roles
  for each row execute function public.proteger_rol_propio();

create function public.proteger_accesos_rol_propio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op <> 'INSERT' and public.es_rol_propio_protegido(old.rol_id))
     or (tg_op <> 'DELETE' and public.es_rol_propio_protegido(new.rol_id)) then
    raise exception 'No puedes cambiar los accesos del rol al que perteneces'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger rol_permisos_proteger_propio
  before insert or update or delete on public.rol_permisos
  for each row execute function public.proteger_accesos_rol_propio();
