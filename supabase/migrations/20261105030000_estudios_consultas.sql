-- Estudios: una fila por cada consulta a TusDatos dentro de un estudio.
--   - Documento: una consulta.
--   - Vehículo: cabezote y, si lleva, remolque. Cada placa se consulta por
--     aparte (POST /api/launch/car) con su propietario, que puede ser el mismo
--     u otro, y el verificador las evalúa en un solo estudio.
-- Se guarda ANTES de lanzar: si algo falla después, queda registro de la
-- consulta y de su jobid. Solo escribe el servidor (secret key).

create table public.estudio_consultas (
  id              uuid primary key default gen_random_uuid(),
  solicitud_id    uuid not null references public.estudio_solicitudes (id) on delete cascade,
  rol             text not null check (rol in ('documento', 'cabezote', 'remolque')),
  placa           text,
  tipo_doc        text not null,
  documento       text,
  estado          text not null default 'procesando'
                    check (estado in ('procesando', 'finalizada', 'error')),
  jobid           text,
  report_id       text,
  nombre_consultado text,
  nivel           public.estudio_nivel_hallazgo,
  -- { "Fuente": "ok" | "hallazgo" | "error" }
  fuentes         jsonb not null default '{}'::jsonb,
  -- Lo que TusDatos entrega además de las fuentes (vehiculo, soat, revision, validado)
  datos           jsonb not null default '{}'::jsonb,
  mensaje_error   text,
  simulada        boolean not null default false,
  created_at      timestamptz not null default now(),
  ultima_revision timestamptz,
  finalizada_at   timestamptz,
  unique (solicitud_id, rol)
);

create index estudio_consultas_solicitud_idx on public.estudio_consultas (solicitud_id);
create index estudio_consultas_pendientes_idx on public.estudio_consultas (ultima_revision)
  where estado = 'procesando';

alter table public.estudio_consultas enable row level security;
revoke all on public.estudio_consultas from public, anon, authenticated;
grant select on public.estudio_consultas to authenticated;

-- Como los hallazgos: quien solicita nunca ve los resultados
create policy "estudio_consultas: verificador / historial" on public.estudio_consultas
  for select to authenticated
  using (
    public.tiene_permiso('estudios.verificar', 'ver')
    or public.tiene_permiso('estudios.historial', 'ver')
  );

-- Cada hallazgo pertenece a la consulta que lo encontró (null en los anteriores)
alter table public.estudio_hallazgos
  add column consulta_id uuid references public.estudio_consultas (id) on delete cascade;

create index estudio_hallazgos_consulta_idx on public.estudio_hallazgos (consulta_id);

-- El remolque se consulta igual que el cabezote: CC, CE, NIT o TI (se conservan
-- PP y PPT para las solicitudes anteriores).
alter table public.estudio_solicitudes
  drop constraint if exists estudio_solicitudes_tipo_doc_propietario_remolque_check;
alter table public.estudio_solicitudes
  add constraint estudio_solicitudes_tipo_doc_propietario_remolque_check
    check (tipo_doc_propietario_remolque in ('CC', 'CE', 'NIT', 'TI', 'PP', 'PPT'));
