-- ════════════════════════════════════════════════════════════════════════════
-- Overrides individuales de permisos por usuario · 2026-11-03
--
-- Un rol da los accesos por defecto; además, a un usuario concreto se le puede
-- OTORGAR un módulo adicional (que su rol no tiene) o REVOCAR uno que su rol
-- sí trae. Útil cuando dos personas con el mismo rol necesitan diferencias
-- puntuales (ej. un auxiliar de despacho sí expide manifiesto y otro no).
--
-- Permiso efectivo = (está en el rol) ∪ (otorgado al usuario) ∖ (revocado al usuario)
-- El rol superadmin ignora todo override (siempre tiene acceso total).
-- ════════════════════════════════════════════════════════════════════════════

create table public.usuario_permisos (
  usuario_id    uuid not null references public.perfiles (id) on delete cascade,
  modulo_clave  text not null references public.modulos (clave) on update cascade on delete cascade,
  tipo          text not null check (tipo in ('otorgar', 'revocar')),
  created_at    timestamptz not null default now(),
  primary key (usuario_id, modulo_clave)
);

create index usuario_permisos_usuario_idx on public.usuario_permisos (usuario_id);

-- Reemplaza tiene_permiso para incluir overrides del usuario. La acción es
-- aceptada mientras el módulo esté en los accesos del rol (o en un otorgar);
-- en la plataforma la autorización se hace a nivel de módulo (ver lib/auth.ts).
create or replace function public.tiene_permiso(p_modulo text, p_accion text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.es_superadmin()
    or (
      exists (
        select 1 from public.perfiles p
        join public.roles r on r.id = p.rol_id
        where p.id = auth.uid() and p.activo and r.activo
      )
      and
      case
        -- Revocado al usuario: siempre niega
        when exists (
          select 1 from public.usuario_permisos
          where usuario_id = auth.uid()
            and modulo_clave = p_modulo
            and tipo = 'revocar'
        ) then false
        -- Otorgado al usuario: siempre permite
        when exists (
          select 1 from public.usuario_permisos
          where usuario_id = auth.uid()
            and modulo_clave = p_modulo
            and tipo = 'otorgar'
        ) then true
        -- Sin override: el módulo debe estar en el rol
        else exists (
          select 1 from public.perfiles p
          join public.roles r on r.id = p.rol_id
          join public.rol_permisos rp on rp.rol_id = r.id
          where p.id = auth.uid()
            and p.activo and r.activo
            and rp.modulo_clave = p_modulo
        )
      end
    )
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.usuario_permisos enable row level security;

revoke all on public.usuario_permisos from anon, authenticated;
grant select, insert, update, delete on public.usuario_permisos to authenticated;

-- Cada usuario puede leer sus propios overrides (para que lib/auth los traiga)
create policy "usuario_permisos: leer los propios" on public.usuario_permisos
  for select to authenticated
  using (usuario_id = auth.uid());

-- Quien gestiona usuarios lee y escribe todos
create policy "usuario_permisos: gestor lee todos" on public.usuario_permisos
  for select to authenticated
  using (public.tiene_permiso('configuracion.usuarios', 'ver'));

create policy "usuario_permisos: gestor edita" on public.usuario_permisos
  for all to authenticated
  using (public.tiene_permiso('configuracion.usuarios', 'editar'))
  with check (
    public.tiene_permiso('configuracion.usuarios', 'editar')
    -- No tiene sentido crear overrides sobre un superadmin (siempre tiene todo)
    and not exists (
      select 1 from public.perfiles p
      join public.roles r on r.id = p.rol_id
      where p.id = usuario_id and r.es_superadmin
    )
  );
