-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Gestión de roles y usuarios · 2026-10-31
--
-- Se aplica DESPUÉS de 20261031000000_init.sql (pegar en el SQL Editor).
--
-- 1. guardar_rol(): crea o edita un rol y reemplaza su matriz de permisos en
--    una sola transacción (si algo falla, no queda un rol a medias).
-- 2. Protección del último administrador: siempre debe quedar al menos un
--    usuario activo con rol superadmin.
-- ════════════════════════════════════════════════════════════════════════════

/**
 * p_permisos: {"financiero.transferencia.migracion-anticipo-sap": ["ver","ejecutar"], …}
 * Solo hojas del catálogo y solo acciones que aplican a cada hoja.
 * Devuelve el id del rol.
 */
create function public.guardar_rol(
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_activo boolean,
  p_permisos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_clave text;
  v_acciones text[];
  v_validas text[];
begin
  if p_id is null then
    if not public.tiene_permiso('configuracion.roles', 'crear') then
      raise exception 'Sin permiso para crear roles' using errcode = '42501';
    end if;
  else
    if not public.tiene_permiso('configuracion.roles', 'editar') then
      raise exception 'Sin permiso para editar roles' using errcode = '42501';
    end if;
    if exists (select 1 from public.roles where id = p_id and es_superadmin) then
      raise exception 'El rol de superadministrador no se puede modificar' using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.roles (nombre, descripcion, activo)
    values (trim(p_nombre), nullif(trim(p_descripcion), ''), p_activo)
    returning id into v_id;
  else
    update public.roles
    set nombre = trim(p_nombre), descripcion = nullif(trim(p_descripcion), ''), activo = p_activo
    where id = p_id;
    if not found then
      raise exception 'El rol no existe' using errcode = 'P0002';
    end if;
    delete from public.rol_permisos where rol_id = v_id;
  end if;

  for v_clave, v_acciones in
    select key, array(select jsonb_array_elements_text(value))
    from jsonb_each(coalesce(p_permisos, '{}'::jsonb))
  loop
    if cardinality(v_acciones) = 0 then
      continue;
    end if;
    select acciones into v_validas from public.modulos where clave = v_clave;
    if v_validas is null or cardinality(v_validas) = 0 then
      raise exception 'Módulo inválido: %', v_clave using errcode = '22023';
    end if;
    if not (v_acciones <@ v_validas) then
      raise exception 'Acciones inválidas para %', v_clave using errcode = '22023';
    end if;
    insert into public.rol_permisos (rol_id, modulo_clave, acciones)
    values (v_id, v_clave, v_acciones);
  end loop;

  return v_id;
end;
$$;

revoke all on function public.guardar_rol(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.guardar_rol(uuid, text, text, boolean, jsonb) to authenticated;

-- ─── Siempre al menos un administrador activo ──────────────────────────────

create function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo importa si el perfil era superadmin activo y deja de serlo
  if old.activo
     and exists (select 1 from public.roles where id = old.rol_id and es_superadmin)
     and (not new.activo
          or new.rol_id is distinct from old.rol_id
             and not exists (select 1 from public.roles where id = new.rol_id and es_superadmin))
     and not exists (
       select 1
       from public.perfiles p
       join public.roles r on r.id = p.rol_id
       where p.id <> old.id and p.activo and r.es_superadmin
     )
  then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_ultimo_admin before update on public.perfiles
  for each row execute function public.proteger_ultimo_admin();
