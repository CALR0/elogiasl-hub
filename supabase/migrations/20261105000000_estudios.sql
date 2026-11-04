-- ════════════════════════════════════════════════════════════════════════════
-- Estudios — Esquema inicial (migrado de elogix-app, adaptado al hub)
--
-- Separación por RLS:
--  - estudio_solicitudes: lo que ve quien solicita (datos de entrada +
--    estado + decisión y comentario copiados por trigger). Nunca hallazgos.
--  - estudio_resultados / estudio_hallazgos / estudio_eventos: solo quien
--    tiene 'estudios.verificar' o 'estudios.historial'.
--
-- Permisos (ya registrados en 20261031000000_init.sql):
--   estudios.solicitar      ver,crear
--   estudios.mis-solicitudes ver,exportar
--   estudios.verificar      ver,editar
--   estudios.historial      ver,exportar
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type public.estudio_tipo_documento as enum (
  'CC', 'CE', 'NIT', 'PP', 'PPT', 'PLACA'
);

-- Estado visible: enviada → procesando → finalizada → (aprobado | rechazado) | error
create type public.estudio_estado as enum (
  'enviada', 'procesando', 'finalizada', 'aprobado', 'rechazado', 'error'
);

create type public.estudio_nivel_hallazgo as enum (
  'alto', 'medio', 'bajo', 'info', 'sin_hallazgo'
);

create type public.estudio_decision as enum ('pendiente', 'aprobado', 'rechazado');

-- ─── Tabla: estudio_solicitudes (visible al solicitante) ─────────────────────

create table public.estudio_solicitudes (
  id                    uuid primary key default gen_random_uuid(),
  numero                bigint generated always as identity unique,

  -- Quién la creó. created_by es quien aparece como solicitante.
  created_by            uuid not null default auth.uid() references public.perfiles (id),

  -- Entrada
  tipo_documento        public.estudio_tipo_documento not null,
  documento             text,
  nombre                text,
  fecha_expedicion      date,                   -- CE / PPT
  placa                 text,                   -- tipo PLACA
  tipo_doc_propietario  text check (tipo_doc_propietario in ('CC', 'CE', 'NIT', 'TI')),

  -- Habeas Data (Ley 1581): evidencia de autorización del titular
  autorizacion_titular  boolean not null check (autorizacion_titular),

  -- Estado y trazabilidad
  estado                public.estudio_estado not null default 'enviada',
  decision              public.estudio_decision not null default 'pendiente',
  comentario_verificador text,                  -- copiado por trigger desde resultados
  simulada              boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  finalizada_at         timestamptz,
  decidida_at           timestamptz,

  constraint estudio_campos_por_tipo check (
    case tipo_documento
      when 'PLACA'  then placa is not null and documento is not null and tipo_doc_propietario is not null
      when 'CE'     then documento is not null and fecha_expedicion is not null
      when 'PPT'    then documento is not null and fecha_expedicion is not null
      when 'PP'     then documento is not null and nombre is not null
      else documento is not null
    end
  )
);

create index estudio_solicitudes_created_idx on public.estudio_solicitudes (created_at desc);
create index estudio_solicitudes_created_by_idx on public.estudio_solicitudes (created_by, created_at desc);
create index estudio_solicitudes_estado_idx on public.estudio_solicitudes (estado);

create trigger estudio_solicitudes_updated_at before update on public.estudio_solicitudes
  for each row execute function public.set_updated_at();

-- ─── Tabla: estudio_resultados (solo verificador / historial) ────────────────

create table public.estudio_resultados (
  solicitud_id    uuid primary key references public.estudio_solicitudes (id) on delete cascade,
  nombre_consultado text,
  nivel_maximo    public.estudio_nivel_hallazgo not null default 'sin_hallazgo',
  -- Fuentes consultadas: { "Policía Nacional": "ok" | "hallazgo" | "error", ... }
  fuentes         jsonb not null default '{}'::jsonb,
  decision        public.estudio_decision not null default 'pendiente',
  comentario      text,
  decidida_por    uuid references public.perfiles (id),
  decidida_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger estudio_resultados_updated_at before update on public.estudio_resultados
  for each row execute function public.set_updated_at();

-- ─── Tabla: estudio_hallazgos ────────────────────────────────────────────────

create table public.estudio_hallazgos (
  id            bigint generated always as identity primary key,
  solicitud_id  uuid not null references public.estudio_solicitudes (id) on delete cascade,
  nivel         public.estudio_nivel_hallazgo not null,
  fuente        text not null,
  codigo        text not null,
  titulo        text not null,
  descripcion   text not null,
  created_at    timestamptz not null default now()
);

create index estudio_hallazgos_solicitud_idx on public.estudio_hallazgos (solicitud_id);

-- ─── Tabla: estudio_eventos (bitácora del estudio) ───────────────────────────

create table public.estudio_eventos (
  id            bigint generated always as identity primary key,
  solicitud_id  uuid not null references public.estudio_solicitudes (id) on delete cascade,
  fecha         timestamptz not null default now(),
  tipo          text not null check (tipo in ('info', 'ok', 'error')),
  texto         text not null
);

create index estudio_eventos_solicitud_idx on public.estudio_eventos (solicitud_id, fecha desc);

-- ─── Trigger: copiar decisión y comentario a la solicitud ────────────────────
-- RLS filtra filas, no columnas. El solicitante NO puede leer resultados,
-- pero sí la columna decision/comentario_verificador de su propia solicitud,
-- porque viven en estudio_solicitudes (que sí puede leer).

create function public.estudio_propagar_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision is distinct from old.decision
     or new.comentario is distinct from old.comentario then
    update public.estudio_solicitudes
       set decision = new.decision,
           comentario_verificador = new.comentario,
           decidida_at = case when new.decision in ('aprobado', 'rechazado')
                              then coalesce(new.decidida_at, now())
                              else null end,
           estado = case new.decision
                      when 'aprobado'  then 'aprobado'::public.estudio_estado
                      when 'rechazado' then 'rechazado'::public.estudio_estado
                      else estado
                    end
     where id = new.solicitud_id;
  end if;
  return new;
end;
$$;

create trigger estudio_resultados_propagar
  after update on public.estudio_resultados
  for each row execute function public.estudio_propagar_decision();

-- ─── Permisos de tabla (defensa en profundidad; RLS hace el filtro real) ─────

alter table public.estudio_solicitudes enable row level security;
alter table public.estudio_resultados  enable row level security;
alter table public.estudio_hallazgos   enable row level security;
alter table public.estudio_eventos     enable row level security;

revoke all on public.estudio_solicitudes, public.estudio_resultados,
              public.estudio_hallazgos, public.estudio_eventos
  from public, anon, authenticated;

grant select, insert on public.estudio_solicitudes to authenticated;
grant select on public.estudio_resultados, public.estudio_hallazgos, public.estudio_eventos to authenticated;
-- La decisión del verificador se hace por Server Function con el secret key.

-- ─── RLS: estudio_solicitudes ────────────────────────────────────────────────

-- Solicitante ve las propias (necesita permiso 'estudios.mis-solicitudes')
create policy "estudio_solicitudes: lee las propias" on public.estudio_solicitudes
  for select to authenticated
  using (created_by = auth.uid() and public.tiene_permiso('estudios.mis-solicitudes', 'ver'));

-- Verificador / historial ven todas
create policy "estudio_solicitudes: verificador lee todas" on public.estudio_solicitudes
  for select to authenticated
  using (
    public.tiene_permiso('estudios.verificar', 'ver')
    or public.tiene_permiso('estudios.historial', 'ver')
  );

-- Crear: cualquiera con 'estudios.solicitar' crea, atribuida a sí mismo
create policy "estudio_solicitudes: crea con permiso" on public.estudio_solicitudes
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.tiene_permiso('estudios.solicitar', 'crear')
  );

-- ─── RLS: resultados / hallazgos / eventos (solo verificador o historial) ────

create policy "estudio_resultados: verificador / historial" on public.estudio_resultados
  for select to authenticated
  using (
    public.tiene_permiso('estudios.verificar', 'ver')
    or public.tiene_permiso('estudios.historial', 'ver')
  );

create policy "estudio_hallazgos: verificador / historial" on public.estudio_hallazgos
  for select to authenticated
  using (
    public.tiene_permiso('estudios.verificar', 'ver')
    or public.tiene_permiso('estudios.historial', 'ver')
  );

create policy "estudio_eventos: verificador / historial" on public.estudio_eventos
  for select to authenticated
  using (
    public.tiene_permiso('estudios.verificar', 'ver')
    or public.tiene_permiso('estudios.historial', 'ver')
  );
