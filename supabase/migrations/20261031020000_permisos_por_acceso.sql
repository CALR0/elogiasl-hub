-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Permisos como ACCESO por módulo · 2026-10-31
--
-- Se aplica DESPUÉS de las dos migraciones anteriores (pegar en el SQL Editor).
--
-- Antes: cada rol tenía acciones (ver, crear, editar…) por funcionalidad.
-- Ahora: un rol simplemente TIENE ACCESO o no a cada funcionalidad (hoja del
-- árbol). Tener acceso a una hoja da acceso a su submódulo y a su módulo; así
-- un rol puede tener "Financiero" con solo "Migración anticipo SAP" y sin
-- "Factura". Los accesos que ya existían se conservan.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Quitar lo que dependía de las acciones ─────────────────────────────

drop policy "roles: crear con permiso" on public.roles;
drop policy "roles: editar con permiso" on public.roles;
drop policy "rol_permisos: leer los propios o gestionar" on public.rol_permisos;
drop policy "rol_permisos: asignar con permiso" on public.rol_permisos;
drop policy "perfiles: gestor de usuarios lee todos" on public.perfiles;
drop policy "perfiles: gestor de usuarios edita" on public.perfiles;
drop policy "auditoria: leer con permiso" on public.audit_logs;

drop function public.guardar_rol(uuid, text, text, boolean, jsonb);
drop function public.tiene_permiso(text, text);

alter table public.rol_permisos drop column acciones;
alter table public.modulos drop column acciones;

-- ─── 2. Acceso ─────────────────────────────────────────────────────────────

/**
 * ¿El usuario de la sesión tiene acceso al nodo `p_modulo`? Para un módulo o
 * submódulo basta con tener acceso a alguna funcionalidad debajo de él.
 */
create function public.tiene_acceso(p_modulo text)
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
    join public.rol_permisos rp on rp.rol_id = r.id
    where p.id = auth.uid()
      and p.activo and r.activo
      and (rp.modulo_clave = p_modulo or rp.modulo_clave like p_modulo || '.%')
  )
$$;

-- Los accesos se asignan solo a funcionalidades (nodos sin hijos)
create function public.validar_acceso_hoja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.modulos where padre = new.modulo_clave) then
    raise exception 'Solo se asigna acceso a funcionalidades, no a %', new.modulo_clave
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger rol_permisos_validar_hoja before insert or update on public.rol_permisos
  for each row execute function public.validar_acceso_hoja();

-- Por si quedó alguna fila sobre un nodo padre
delete from public.rol_permisos rp
where exists (select 1 from public.modulos m where m.padre = rp.modulo_clave);

/**
 * Crea o edita un rol y reemplaza sus accesos en una sola transacción.
 * p_accesos: claves de funcionalidades, p. ej. {financiero.transferencia.migracion-anticipo-sap}
 */
create function public.guardar_rol(
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_activo boolean,
  p_accesos text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_clave text;
begin
  if not public.tiene_acceso('configuracion.roles') then
    raise exception 'Sin acceso a la gestión de roles' using errcode = '42501';
  end if;
  if p_id is not null and exists (select 1 from public.roles where id = p_id and es_superadmin) then
    raise exception 'El rol de superadministrador no se puede modificar' using errcode = '42501';
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

  foreach v_clave in array coalesce(p_accesos, '{}') loop
    if not exists (select 1 from public.modulos where clave = v_clave) then
      raise exception 'Módulo inválido: %', v_clave using errcode = '22023';
    end if;
    insert into public.rol_permisos (rol_id, modulo_clave)
    values (v_id, v_clave)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.guardar_rol(uuid, text, text, boolean, text[]) from public, anon;
grant execute on function public.guardar_rol(uuid, text, text, boolean, text[]) to authenticated;

-- ─── 3. Políticas con acceso ───────────────────────────────────────────────

create policy "roles: crear con acceso" on public.roles
  for insert to authenticated
  with check (public.tiene_acceso('configuracion.roles') and not es_superadmin);

create policy "roles: editar con acceso" on public.roles
  for update to authenticated
  using (public.tiene_acceso('configuracion.roles'))
  with check (public.tiene_acceso('configuracion.roles'));

create policy "rol_permisos: leer los propios o gestionar" on public.rol_permisos
  for select to authenticated
  using (
    public.es_usuario_activo() and (
      rol_id = (select rol_id from public.perfiles where id = auth.uid())
      or public.tiene_acceso('configuracion.roles')
    )
  );

create policy "rol_permisos: asignar con acceso" on public.rol_permisos
  for all to authenticated
  using (
    public.tiene_acceso('configuracion.roles')
    and not exists (select 1 from public.roles r where r.id = rol_id and r.es_superadmin)
  )
  with check (
    public.tiene_acceso('configuracion.roles')
    and not exists (select 1 from public.roles r where r.id = rol_id and r.es_superadmin)
  );

create policy "perfiles: gestor de usuarios lee todos" on public.perfiles
  for select to authenticated
  using (public.tiene_acceso('configuracion.usuarios'));

create policy "perfiles: gestor de usuarios edita" on public.perfiles
  for update to authenticated
  using (public.tiene_acceso('configuracion.usuarios'))
  with check (public.tiene_acceso('configuracion.usuarios'));

create policy "auditoria: leer con acceso" on public.audit_logs
  for select to authenticated
  using (public.tiene_acceso('auditoria.visor-logs'));
