-- ════════════════════════════════════════════════════════════════════════════
-- Estudios — Soporte de remolque / tráiler y tusdatos_jobid
--
-- Un vehículo puede llevar remolque con su propia placa y, opcionalmente,
-- otro propietario. Se migra del comportamiento de elogix-app: la consulta
-- combinada (cabezote + remolque) la hace TusDatos, aquí guardamos los
-- datos de entrada para auditarla.
--
-- Agrega también tusdatos_jobid para correlacionar con el webhook de
-- TusDatos cuando se procese de forma asíncrona (modo real).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.estudio_solicitudes
  add column if not exists placa_remolque text
    check (placa_remolque is null or placa_remolque ~ '^[RS][0-9]{5}$'),
  add column if not exists tipo_doc_propietario_remolque text
    check (tipo_doc_propietario_remolque in ('CC','CE','NIT','PP','PPT')),
  add column if not exists documento_propietario_remolque text,
  add column if not exists tusdatos_jobid text,
  add column if not exists tusdatos_report_id text,
  add column if not exists intentos int not null default 0;

-- Remolque: sin tipo = sin documento. Y solo tiene sentido en PLACA.
alter table public.estudio_solicitudes
  add constraint estudio_remolque_solo_en_vehiculo
    check (placa_remolque is null or tipo_documento = 'PLACA'),
  add constraint estudio_remolque_propietario_completo
    check (
      (tipo_doc_propietario_remolque is null) = (documento_propietario_remolque is null)
    );

create index if not exists estudio_solicitudes_jobid_idx
  on public.estudio_solicitudes (tusdatos_jobid)
  where tusdatos_jobid is not null;
