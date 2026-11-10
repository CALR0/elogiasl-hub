-- Estudios: vuelve a guardar el propietario del remolque EN LA SOLICITUD.
--
-- 20261105040000_estudios_cierre_y_limpieza.sql había dejado el dato solo en
-- estudio_consultas (una consulta con rol=prop_remolque). Eso rompe "Mis
-- solicitudes": RLS solo deja al solicitante leer estudio_solicitudes — ni
-- estudio_consultas ni estudio_hallazgos — así que no puede ver lo que digitó
-- del propietario del remolque. Al insertar, el servidor también falla con
-- "Could not find the 'documento_propietario_remolque' column".
--
-- Se vuelve a guardar en la solicitud, con el mismo check "ambos o ninguno"
-- del remolque. El dato en estudio_consultas se mantiene (es lo que viaja a
-- TusDatos como consulta de antecedentes del propietario del remolque).

alter table public.estudio_solicitudes
  add column if not exists tipo_doc_propietario_remolque text
    check (
      tipo_doc_propietario_remolque is null
      or tipo_doc_propietario_remolque in ('CC','CE','NIT','TI','PP','PPT')
    ),
  add column if not exists documento_propietario_remolque text;

alter table public.estudio_solicitudes
  drop constraint if exists estudio_remolque_propietario_completo,
  add constraint estudio_remolque_propietario_completo
    check (
      (tipo_doc_propietario_remolque is null)
        = (documento_propietario_remolque is null)
    );
