-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Esquema inicial · 2026-10-31
--
-- Usuarios, roles con permisos por módulo y auditoría de toda la plataforma.
-- Se aplica pegándolo en Supabase → SQL Editor (o con `npm run db:push`).
--
-- Modelo de permisos:
--   modulos       árbol Módulo → Submódulo → Funcionalidad (espejo de lib/modulos.ts).
--   roles         un rol "superadmin" tiene acceso total y no se puede restringir.
--   rol_permisos  por cada nodo HOJA del árbol, qué acciones tiene el rol
--                 (ver, crear, editar, eliminar, exportar, ejecutar).
--   Un módulo o submódulo padre es visible si el rol puede ver alguno de sus hijos.
--
-- Autorización en tres capas: proxy.ts (sesión) → lib/auth.ts (permiso en cada
-- página y acción del servidor) → RLS (aquí).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Utilidades ─────────────────────────────────────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Catálogo de módulos ────────────────────────────────────────────────────

create table public.modulos (
  clave      text primary key,                  -- 'financiero.transferencia.migracion-anticipo-sap'
  padre      text references public.modulos (clave) on update cascade on delete cascade,
  nombre     text not null,
  orden      int not null default 0,
  -- Acciones que tienen sentido en este nodo (solo en hojas; en padres va vacío)
  acciones   text[] not null default '{}',
  check (acciones <@ array['ver', 'crear', 'editar', 'eliminar', 'exportar', 'ejecutar'])
);

-- ─── Roles y permisos ───────────────────────────────────────────────────────

create table public.roles (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique check (length(trim(nombre)) between 3 and 60),
  descripcion    text,
  es_superadmin  boolean not null default false,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create table public.rol_permisos (
  rol_id        uuid not null references public.roles (id) on delete cascade,
  modulo_clave  text not null references public.modulos (clave) on update cascade on delete cascade,
  acciones      text[] not null default '{ver}',
  primary key (rol_id, modulo_clave),
  check (acciones <@ array['ver', 'crear', 'editar', 'eliminar', 'exportar', 'ejecutar']),
  -- Sin "ver" no tiene sentido ninguna otra acción
  check (cardinality(acciones) = 0 or 'ver' = any (acciones))
);

-- ─── Perfiles (1:1 con auth.users) ──────────────────────────────────────────

create table public.perfiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null unique,
  nombre_completo  text,
  rol_id           uuid references public.roles (id) on delete restrict,
  activo           boolean not null default true,
  ultimo_acceso    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index perfiles_rol_idx on public.perfiles (rol_id);

create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Crea el perfil cuando el servidor crea un usuario (auth.admin.createUser),
-- tomando nombre y rol de user_metadata / app_metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre_completo, rol_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'nombre_completo',
    nullif(new.raw_app_meta_data ->> 'rol_id', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Helpers de autorización (security definer: evitan recursión de RLS) ────

create function public.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    join public.roles r on r.id = p.rol_id
    where p.id = auth.uid() and p.activo and r.activo
  )
$$;

create function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    join public.roles r on r.id = p.rol_id
    where p.id = auth.uid() and p.activo and r.activo and r.es_superadmin
  )
$$;

/** ¿El usuario de la sesión puede hacer `p_accion` en el nodo `p_modulo`? */
create function public.tiene_permiso(p_modulo text, p_accion text default 'ver')
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
      and rp.modulo_clave = p_modulo
      and p_accion = any (rp.acciones)
  )
$$;

-- Protecciones de integridad: el rol superadmin no se desactiva ni se le
-- asignan permisos (los tiene todos), y nadie se quita a sí mismo el acceso.
create function public.proteger_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.es_superadmin and (not new.activo or not new.es_superadmin) then
    raise exception 'El rol de superadministrador no se puede desactivar ni degradar';
  end if;
  if new.es_superadmin and not old.es_superadmin then
    raise exception 'No se puede convertir un rol en superadministrador desde la aplicación';
  end if;
  return new;
end;
$$;

create trigger roles_proteger before update on public.roles
  for each row execute function public.proteger_roles();

create function public.proteger_perfil_propio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = auth.uid() and (new.activo is distinct from old.activo or new.rol_id is distinct from old.rol_id) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_propio before update on public.perfiles
  for each row execute function public.proteger_perfil_propio();

-- ─── Auditoría ──────────────────────────────────────────────────────────────

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.perfiles (id) on delete set null,
  actor_email  text,                -- copia: el log sobrevive aunque cambie el perfil
  modulo       text,                -- clave del nodo ('financiero.transferencia.migracion-anticipo-sap') o 'sesion'
  accion       text not null,       -- 'sesion.iniciar', 'usuario.crear', 'anticipo.migrar'…
  entidad      text,
  entidad_id   text,
  resultado    text not null default 'ok' check (resultado in ('ok', 'error', 'denegado')),
  detalle      jsonb,               -- contexto legible. NUNCA contraseñas, tokens ni llaves.
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_modulo_idx on public.audit_logs (modulo, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════════════

alter table public.modulos       enable row level security;
alter table public.roles         enable row level security;
alter table public.rol_permisos  enable row level security;
alter table public.perfiles      enable row level security;
alter table public.audit_logs    enable row level security;

-- Privilegios mínimos (las políticas filtran filas; los GRANT por columna
-- limitan qué se puede escribir). audit_logs solo la escribe el servidor.
revoke all on public.modulos, public.roles, public.rol_permisos, public.perfiles, public.audit_logs
  from anon, authenticated;

grant select on public.modulos, public.roles, public.rol_permisos, public.perfiles, public.audit_logs
  to authenticated;
grant insert (nombre, descripcion, activo) on public.roles to authenticated;
grant update (nombre, descripcion, activo) on public.roles to authenticated;
grant insert, update, delete on public.rol_permisos to authenticated;
grant update (nombre_completo, rol_id, activo) on public.perfiles to authenticated;

-- modulos: cualquier usuario activo lee el catálogo (arma el menú)
create policy "modulos: usuarios activos leen" on public.modulos
  for select to authenticated
  using (public.es_usuario_activo());

-- roles
create policy "roles: usuarios activos leen" on public.roles
  for select to authenticated
  using (public.es_usuario_activo());

create policy "roles: crear con permiso" on public.roles
  for insert to authenticated
  with check (public.tiene_permiso('configuracion.roles', 'crear') and not es_superadmin);

create policy "roles: editar con permiso" on public.roles
  for update to authenticated
  using (public.tiene_permiso('configuracion.roles', 'editar'))
  with check (public.tiene_permiso('configuracion.roles', 'editar'));

-- rol_permisos: cada quien lee los de su rol; quien gestiona roles, todos
create policy "rol_permisos: leer los propios o gestionar" on public.rol_permisos
  for select to authenticated
  using (
    public.es_usuario_activo() and (
      rol_id = (select rol_id from public.perfiles where id = auth.uid())
      or public.tiene_permiso('configuracion.roles', 'ver')
    )
  );

create policy "rol_permisos: asignar con permiso" on public.rol_permisos
  for all to authenticated
  using (
    public.tiene_permiso('configuracion.roles', 'editar')
    and not exists (select 1 from public.roles r where r.id = rol_id and r.es_superadmin)
  )
  with check (
    public.tiene_permiso('configuracion.roles', 'editar')
    and not exists (select 1 from public.roles r where r.id = rol_id and r.es_superadmin)
  );

-- perfiles
create policy "perfiles: leer el propio" on public.perfiles
  for select to authenticated
  using (id = auth.uid());

create policy "perfiles: gestor de usuarios lee todos" on public.perfiles
  for select to authenticated
  using (public.tiene_permiso('configuracion.usuarios', 'ver'));

create policy "perfiles: gestor de usuarios edita" on public.perfiles
  for update to authenticated
  using (public.tiene_permiso('configuracion.usuarios', 'editar'))
  with check (public.tiene_permiso('configuracion.usuarios', 'editar'));

-- audit_logs: solo lectura y solo con permiso del visor
create policy "auditoria: leer con permiso" on public.audit_logs
  for select to authenticated
  using (public.tiene_permiso('auditoria.visor-logs', 'ver'));

-- Realtime para el visor de logs (respeta RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Datos base
-- ════════════════════════════════════════════════════════════════════════════

-- Catálogo de módulos. Mantener sincronizado con lib/modulos.ts: para agregar
-- un nodo, crea una migración nueva con su insert.
insert into public.modulos (clave, padre, nombre, orden, acciones) values
  ('despacho',                                   null,                        'Despacho',              1, '{}'),
  ('despacho.manifiesto',                        'despacho',                  'Manifiesto',            1, '{ver,crear,editar,eliminar,exportar}'),
  ('despacho.cumplido-manifiesto',               'despacho',                  'Cumplido manifiesto',   2, '{ver,crear,editar,eliminar,exportar}'),

  ('financiero',                                 null,                        'Financiero',            2, '{}'),
  ('financiero.factura',                         'financiero',                'Factura',               1, '{ver,crear,editar,eliminar,exportar}'),
  ('financiero.transferencia',                   'financiero',                'Transferencia',         2, '{}'),
  ('financiero.transferencia.migracion-anticipo-sap', 'financiero.transferencia', 'Migración anticipo SAP', 1, '{ver,ejecutar,exportar}'),

  ('maestros',                                   null,                        'Maestros',              3, '{}'),
  ('maestros.vehiculo',                          'maestros',                  'Vehículo',              1, '{}'),
  ('maestros.vehiculo.ficha-tecnica',            'maestros.vehiculo',         'Generar ficha técnica', 1, '{ver,ejecutar,exportar}'),

  ('estudios',                                   null,                        'Estudios',              4, '{}'),
  ('estudios.solicitar',                         'estudios',                  'Solicitar estudios',    1, '{ver,crear}'),
  ('estudios.mis-solicitudes',                   'estudios',                  'Mis solicitudes',       2, '{ver,exportar}'),
  ('estudios.verificar',                         'estudios',                  'Verificar estudios',    3, '{ver,editar}'),
  ('estudios.historial',                         'estudios',                  'Historial',             4, '{ver,exportar}'),

  ('auditoria',                                  null,                        'Auditoría',             5, '{}'),
  ('auditoria.visor-logs',                       'auditoria',                 'Visor de logs',         1, '{ver,exportar}'),

  ('configuracion',                              null,                        'Configuración',         6, '{}'),
  ('configuracion.roles',                        'configuracion',             'Roles',                 1, '{ver,crear,editar}'),
  ('configuracion.usuarios',                     'configuracion',             'Usuarios',              2, '{ver,crear,editar}');

-- Rol con acceso total (no editable desde la app)
insert into public.roles (nombre, descripcion, es_superadmin)
values ('Administrador', 'Acceso total a la plataforma. No se puede restringir ni desactivar.', true);
