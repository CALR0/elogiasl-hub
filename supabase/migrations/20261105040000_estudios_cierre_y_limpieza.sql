-- Estudios: cierra un hueco y deja una sola fuente para cada dato.
--   1. Hueco: con Solicitar se podía insertar por la API una solicitud ya
--      aprobada (la política solo validaba quién la creaba). Las solicitudes las
--      crea el servidor tras validar, así que el navegador deja de poder insertar.
--   2. Lo que se consultó y su resultado viven solo en estudio_consultas.
--   3. tiene_permiso(modulo, accion) ignoraba la acción: queda solo tiene_acceso().
-- Se conserva lo fundamental: quién solicitó (created_by), qué pidió, la
-- autorización del titular, el estado, la decisión y su trazabilidad.

-- ─── Datos de prueba ───────────────────────────────────────────────────────

-- Solo había solicitudes simuladas: se borran en vez de convertirlas. Si ya
-- existe una consulta real, la migración se detiene y no cambia nada.
do $$
begin
  if exists (select 1 from public.estudio_solicitudes where not simulada)
     or exists (select 1 from public.estudio_consultas where jobid is not null) then
    raise exception 'Hay consultas reales de TusDatos: revisar antes de borrar';
  end if;
end;
$$;

-- En cascada: resultados, consultas, hallazgos y eventos
delete from public.estudio_solicitudes;
alter table public.estudio_solicitudes alter column numero restart with 1;

-- ─── 1. Nadie crea solicitudes desde el navegador ──────────────────────────

drop policy "estudio_solicitudes: crea con permiso" on public.estudio_solicitudes;
revoke insert on public.estudio_solicitudes from authenticated;

-- ─── 2. Una sola fuente para cada dato ─────────────────────────────────────

-- Cada hallazgo pertenece a una consulta, y la consulta a su solicitud
alter table public.estudio_hallazgos
  alter column consulta_id set not null,
  drop column solicitud_id;

-- Propietario del remolque, job y reporte: en estudio_consultas
alter table public.estudio_solicitudes
  drop constraint estudio_remolque_propietario_completo,
  drop column tipo_doc_propietario_remolque,
  drop column documento_propietario_remolque,
  drop column tusdatos_jobid,
  drop column tusdatos_report_id,
  drop column intentos,
  alter column estado set default 'procesando';

-- Las fuentes son de cada consulta; simulada se lee de la solicitud
alter table public.estudio_resultados drop column fuentes;
alter table public.estudio_consultas drop column simulada;

-- ─── 3. Una sola función de acceso ─────────────────────────────────────────

drop policy "usuario_permisos: gestor lee todos" on public.usuario_permisos;
create policy "usuario_permisos: gestor lee todos" on public.usuario_permisos
  for select to authenticated
  using (public.tiene_acceso('configuracion.usuarios'));

drop policy "usuario_permisos: gestor edita" on public.usuario_permisos;
create policy "usuario_permisos: gestor edita" on public.usuario_permisos
  for all to authenticated
  using (public.tiene_acceso('configuracion.usuarios'))
  with check (
    public.tiene_acceso('configuracion.usuarios')
    -- No tiene sentido crear overrides sobre un superadmin (siempre tiene todo)
    and not exists (
      select 1 from public.perfiles p
      join public.roles r on r.id = p.rol_id
      where p.id = usuario_id and r.es_superadmin
    )
  );

drop policy "estudio_solicitudes: lee las propias" on public.estudio_solicitudes;
create policy "estudio_solicitudes: lee las propias" on public.estudio_solicitudes
  for select to authenticated
  using (created_by = auth.uid() and public.tiene_acceso('estudios.mis-solicitudes'));

drop policy "estudio_solicitudes: verificador lee todas" on public.estudio_solicitudes;
create policy "estudio_solicitudes: verificador lee todas" on public.estudio_solicitudes
  for select to authenticated
  using (public.tiene_acceso('estudios.verificar') or public.tiene_acceso('estudios.historial'));

drop policy "estudio_resultados: verificador / historial" on public.estudio_resultados;
create policy "estudio_resultados: verificador / historial" on public.estudio_resultados
  for select to authenticated
  using (public.tiene_acceso('estudios.verificar') or public.tiene_acceso('estudios.historial'));

drop policy "estudio_hallazgos: verificador / historial" on public.estudio_hallazgos;
create policy "estudio_hallazgos: verificador / historial" on public.estudio_hallazgos
  for select to authenticated
  using (public.tiene_acceso('estudios.verificar') or public.tiene_acceso('estudios.historial'));

drop policy "estudio_eventos: verificador / historial" on public.estudio_eventos;
create policy "estudio_eventos: verificador / historial" on public.estudio_eventos
  for select to authenticated
  using (public.tiene_acceso('estudios.verificar') or public.tiene_acceso('estudios.historial'));

drop policy "estudio_consultas: verificador / historial" on public.estudio_consultas;
create policy "estudio_consultas: verificador / historial" on public.estudio_consultas
  for select to authenticated
  using (public.tiene_acceso('estudios.verificar') or public.tiene_acceso('estudios.historial'));

drop function public.tiene_permiso(text, text);
