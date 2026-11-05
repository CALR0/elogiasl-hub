-- ════════════════════════════════════════════════════════════════════════════
-- Estudios: consulta por combo (vehículo + tenedor + conductor + antecedentes)
--
-- TusDatos tiene en dash-board.tusdatos.co/vehiculos un formulario que permite
-- agregar Tenedor / Poseedor, Conductor y, con un check, consultar antecedentes
-- de todas las personas del combo. Un solo estudio en el hub guarda varias
-- consultas con roles distintos.
--
-- Roles nuevos:
--   - tenedor         Persona agregada como tenedor o poseedor del vehículo.
--                     Se consulta como antecedentes (/api/launch) con el doc.
--   - conductor       Persona agregada como conductor del vehículo. Misma vía.
--   - propietario     Antecedentes del propietario del cabezote. Se crea solo
--                     si se marca "Incluir consulta de antecedentes".
--   - prop_remolque   Antecedentes del propietario del remolque. Igual que el
--                     anterior, para el propietario del remolque.
--
-- La solicitud guarda también:
--   - tipo_doc_tenedor / documento_tenedor / fecha_expedicion_tenedor
--   - tipo_doc_conductor / documento_conductor / fecha_expedicion_conductor
--   - incluir_antecedentes  (dispara propietario y prop_remolque)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.estudio_consultas
  drop constraint estudio_consultas_rol_check,
  add constraint estudio_consultas_rol_check
    check (
      rol in (
        'documento',
        'cabezote',
        'remolque',
        'propietario',
        'tenedor',
        'conductor',
        'prop_remolque'
      )
    );

alter table public.estudio_solicitudes
  add column if not exists tipo_doc_tenedor text
    check (tipo_doc_tenedor is null or tipo_doc_tenedor in ('CC','CE','NIT','TI','PP','PPT')),
  add column if not exists documento_tenedor text,
  add column if not exists fecha_expedicion_tenedor date,
  add column if not exists tipo_doc_conductor text
    check (tipo_doc_conductor is null or tipo_doc_conductor in ('CC','CE','NIT','TI','PP','PPT')),
  add column if not exists documento_conductor text,
  add column if not exists fecha_expedicion_conductor date,
  add column if not exists incluir_antecedentes boolean not null default false;

-- tenedor: tipo y documento vienen juntos o no vienen (igual que el remolque)
alter table public.estudio_solicitudes
  add constraint estudio_tenedor_completo
    check ((tipo_doc_tenedor is null) = (documento_tenedor is null)),
  add constraint estudio_conductor_completo
    check ((tipo_doc_conductor is null) = (documento_conductor is null));
