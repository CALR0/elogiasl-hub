import "server-only";
import { getUsuarioActual } from "@/lib/auth";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { almacenEstudios, aResumen } from "./demo";
import { PESO_NIVEL } from "./resultado.ts";
import type {
  ConsultaEstudio,
  Decision,
  EstadoConsulta,
  EstadoEstudio,
  Estudio,
  EventoEstudio,
  Hallazgo,
  NivelHallazgo,
  ResultadoFuente,
  RolConsulta,
  SolicitudResumen,
  TipoDocumento,
} from "./tipos";

/**
 * Lecturas del módulo Estudios. Todo pasa por RLS: el solicitante solo verá
 * las filas donde created_by = auth.uid(), el verificador verá todas y los
 * resultados detallados (fuentes + hallazgos).
 */

function descripcion(fila: {
  tipo_documento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  placa: string | null;
  placa_remolque?: string | null;
}) {
  if (fila.tipo_documento === "PLACA") {
    const remolque = fila.placa_remolque ? ` + ${fila.placa_remolque}` : "";
    return `Placa ${fila.placa ?? "—"}${remolque}`;
  }
  if (fila.tipo_documento === "PP") {
    return fila.nombre ? `PP · ${fila.nombre}` : `PP · ${fila.documento ?? ""}`;
  }
  return `${fila.tipo_documento} ${fila.documento ?? "—"}`;
}

function moduloDe(tipo: TipoDocumento): "documento" | "vehiculo" {
  return tipo === "PLACA" ? "vehiculo" : "documento";
}

interface FilaMisRaw {
  id: string;
  numero: number;
  tipo_documento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  placa: string | null;
  tipo_doc_propietario: string | null;
  placa_remolque: string | null;
  tipo_doc_propietario_remolque: string | null;
  documento_propietario_remolque: string | null;
  tipo_doc_tenedor: string | null;
  documento_tenedor: string | null;
  tipo_doc_conductor: string | null;
  documento_conductor: string | null;
  incluir_antecedentes: boolean;
  estado: EstadoEstudio;
  created_at: string;
  decision: Decision;
  comentario_verificador: string | null;
  decidida_at: string | null;
}

/** ¿El estudio tiene más de una persona / placa en la consulta? */
function esCombo(f: FilaMisRaw) {
  return Boolean(
    f.documento_tenedor ||
      f.documento_conductor ||
      f.placa_remolque ||
      f.incluir_antecedentes,
  );
}

function entradaDe(f: FilaMisRaw): import("./tipos").EntradaSolicitud {
  return {
    placa: f.placa,
    tipoDocPropietario: f.tipo_doc_propietario,
    documentoPropietario: f.documento,
    tipoDocTenedor: f.tipo_doc_tenedor,
    documentoTenedor: f.documento_tenedor,
    tipoDocConductor: f.tipo_doc_conductor,
    documentoConductor: f.documento_conductor,
    placaRemolque: f.placa_remolque,
    tipoDocPropietarioRemolque: f.tipo_doc_propietario_remolque,
    documentoPropietarioRemolque: f.documento_propietario_remolque,
    incluirAntecedentes: f.incluir_antecedentes,
  };
}

/**
 * "Mis solicitudes": solo las que YO creé. Filtramos explícitamente aunque
 * exista la policy de "propias", porque un verificador también tiene la
 * policy que le deja leer todas, y se activa aquí si no filtramos.
 */
export async function listarMisSolicitudes(): Promise<SolicitudResumen[]> {
  if (MODO_DEMO) {
    return almacenEstudios().solicitudes.map(aResumen);
  }
  const usuario = await getUsuarioActual();
  if (!usuario) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, tipo_doc_propietario, placa_remolque, tipo_doc_propietario_remolque, documento_propietario_remolque, tipo_doc_tenedor, documento_tenedor, tipo_doc_conductor, documento_conductor, incluir_antecedentes, estado, created_at, decision, comentario_verificador, decidida_at",
    )
    .eq("created_by", usuario.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[estudios]", error);
    return [];
  }
  return (data as unknown as FilaMisRaw[]).map((f) => ({
    id: f.id,
    numero: f.numero,
    modulo: moduloDe(f.tipo_documento),
    tipo: esCombo(f) ? "combo" : "individual",
    descripcion: descripcion(f as never),
    estado: f.estado,
    fecha: f.created_at,
    decision: f.decision ?? "pendiente",
    comentario: f.comentario_verificador ?? null,
    decididaAt: f.decidida_at ?? null,
    entrada: entradaDe(f),
  }));
}

/** Fila para la bandeja del verificador (sin hallazgos individuales). */
export interface FilaBandeja {
  id: string;
  numero: number;
  modulo: "documento" | "vehiculo";
  tipo: "individual" | "combo";
  descripcion: string;
  nombreConsultado: string | null;
  fecha: string;
  estado: EstadoEstudio;
  nivel: NivelHallazgo;
  decision: Decision;
  simulada: boolean;
  solicitante: string;
}

interface FilaPendienteRaw {
  id: string;
  numero: number;
  tipo_documento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  placa: string | null;
  placa_remolque: string | null;
  documento_tenedor: string | null;
  documento_conductor: string | null;
  incluir_antecedentes: boolean;
  estado: EstadoEstudio;
  decision: Decision;
  simulada: boolean;
  created_at: string;
  perfiles: { nombre_completo: string | null; email: string } | null;
  estudio_resultados: {
    nombre_consultado: string | null;
    nivel_maximo: NivelHallazgo;
  } | null;
}

function construirFila(f: FilaPendienteRaw): FilaBandeja {
  const combo = Boolean(
    f.documento_tenedor ||
      f.documento_conductor ||
      f.placa_remolque ||
      f.incluir_antecedentes,
  );
  return {
    id: f.id,
    numero: f.numero,
    modulo: moduloDe(f.tipo_documento),
    tipo: combo ? "combo" : "individual",
    descripcion: descripcion(f),
    nombreConsultado: f.estudio_resultados?.nombre_consultado ?? null,
    fecha: f.created_at,
    estado: f.estado,
    nivel: f.estudio_resultados?.nivel_maximo ?? "sin_hallazgo",
    decision: f.decision,
    simulada: f.simulada,
    solicitante: f.perfiles?.nombre_completo ?? f.perfiles?.email ?? "—",
  };
}

/** Bandeja del verificador: pendientes ordenados por riesgo (grave primero). */
export async function listarPendientes(): Promise<FilaBandeja[]> {
  if (MODO_DEMO) {
    return almacenEstudios()
      .solicitudes.filter((s) => s.decision === "pendiente")
      .map(aBandeja)
      .sort(porRiesgo);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, placa_remolque, documento_tenedor, documento_conductor, incluir_antecedentes, estado, decision, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo )",
    )
    .eq("decision", "pendiente")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[estudios]", error);
    return [];
  }
  return (data as unknown as FilaPendienteRaw[])
    .map(construirFila)
    .sort(porRiesgo);
}

/** Historial: ya decididos (aprobados o rechazados). */
export async function listarHistorial(): Promise<FilaBandeja[]> {
  if (MODO_DEMO) {
    return almacenEstudios()
      .solicitudes.filter((s) => s.decision !== "pendiente")
      .map(aBandeja);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, placa_remolque, documento_tenedor, documento_conductor, incluir_antecedentes, estado, decision, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo )",
    )
    .neq("decision", "pendiente")
    .order("decidida_at", { ascending: false });
  if (error) {
    console.error("[estudios]", error);
    return [];
  }
  return (data as unknown as FilaPendienteRaw[]).map(construirFila);
}

const ORDEN_ROL: Record<RolConsulta, number> = {
  documento: 0,
  cabezote: 1,
  remolque: 2,
  propietario: 3,
  prop_remolque: 4,
  tenedor: 5,
  conductor: 6,
};

/** Detalle completo del estudio para el verificador. */
export async function obtenerEstudio(numero: number): Promise<Estudio | null> {
  if (MODO_DEMO) {
    return (
      almacenEstudios().solicitudes.find((s) => s.numero === numero) ?? null
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, placa_remolque, estado, decision, comentario_verificador, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo )",
    )
    .eq("numero", numero)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[estudios]", error);
    return null;
  }
  const d = data as unknown as FilaPendienteRaw & {
    comentario_verificador: string | null;
  };

  const [consultas, eventos] = await Promise.all([
    supabase
      .from("estudio_consultas")
      .select(
        "id, rol, placa, tipo_doc, documento, estado, nivel, nombre_consultado, fuentes, datos, mensaje_error, report_id, estudio_hallazgos ( nivel, fuente, codigo, titulo, descripcion )",
      )
      .eq("solicitud_id", d.id),
    supabase
      .from("estudio_eventos")
      .select("fecha, tipo, texto")
      .eq("solicitud_id", d.id)
      .order("fecha", { ascending: true }),
  ]);
  for (const r of [consultas, eventos])
    if (r.error) console.error("[estudios]", r.error);

  const filas = (consultas.data ?? []) as unknown as {
    id: string;
    rol: RolConsulta;
    placa: string | null;
    tipo_doc: string;
    documento: string | null;
    estado: EstadoConsulta;
    nivel: NivelHallazgo | null;
    nombre_consultado: string | null;
    fuentes: Record<string, ResultadoFuente>;
    datos: Record<string, unknown>;
    mensaje_error: string | null;
    report_id: string | null;
    estudio_hallazgos: Hallazgo[];
  }[];

  const lista: ConsultaEstudio[] = filas
    .map((c) => ({
      id: c.id,
      rol: c.rol,
      placa: c.placa,
      tipoDoc: c.tipo_doc,
      documento: c.documento,
      estado: c.estado,
      nivel: c.nivel,
      nombreConsultado: c.nombre_consultado,
      fuentes: c.fuentes ?? {},
      hallazgos: c.estudio_hallazgos ?? [],
      datos: c.datos ?? {},
      mensajeError: c.mensaje_error,
      tieneReporte: Boolean(c.report_id),
      simulada: d.simulada,
    }))
    .sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]);

  return {
    id: d.id,
    numero: d.numero,
    modulo: moduloDe(d.tipo_documento),
    descripcion: descripcion(d),
    nombreConsultado: d.estudio_resultados?.nombre_consultado ?? null,
    solicitante: d.perfiles?.nombre_completo ?? d.perfiles?.email ?? "—",
    fecha: d.created_at,
    estado: d.estado,
    nivel: d.estudio_resultados?.nivel_maximo ?? null,
    consultas: lista,
    eventos: (eventos.data ?? []) as EventoEstudio[],
    decision: d.decision,
    comentario: d.comentario_verificador,
    simulada: d.simulada,
  };
}

/** Datos para la página de "Ver reporte": consulta + número de solicitud. */
export interface ConsultaConSolicitud {
  numero: number;
  modulo: "documento" | "vehiculo";
  solicitanteId: string;
  consulta: ConsultaEstudio;
}

/**
 * Lee una consulta por id (uuid). Devuelve también el número y el solicitante
 * para construir el encabezado del reporte. RLS (verificar / historial) filtra
 * el acceso: quien solicitó no puede leer esto.
 */
export async function obtenerConsultaParaReporte(
  id: string,
): Promise<ConsultaConSolicitud | null> {
  if (MODO_DEMO) {
    for (const s of almacenEstudios().solicitudes) {
      const c = s.consultas.find((x) => x.id === id);
      if (c) {
        return {
          numero: s.numero,
          modulo: s.modulo,
          solicitanteId: s.solicitante,
          consulta: c,
        };
      }
    }
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_consultas")
    .select(
      "id, rol, placa, tipo_doc, documento, estado, nivel, nombre_consultado, fuentes, datos, mensaje_error, report_id, estudio_hallazgos ( nivel, fuente, codigo, titulo, descripcion ), estudio_solicitudes ( numero, tipo_documento, simulada, created_by )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[estudios]", error);
    return null;
  }
  const c = data as unknown as {
    id: string;
    rol: RolConsulta;
    placa: string | null;
    tipo_doc: string;
    documento: string | null;
    estado: EstadoConsulta;
    nivel: NivelHallazgo | null;
    nombre_consultado: string | null;
    fuentes: Record<string, ResultadoFuente>;
    datos: Record<string, unknown>;
    mensaje_error: string | null;
    report_id: string | null;
    estudio_hallazgos: Hallazgo[];
    estudio_solicitudes: {
      numero: number;
      tipo_documento: TipoDocumento;
      simulada: boolean;
      created_by: string;
    } | null;
  };
  if (!c.estudio_solicitudes) return null;
  return {
    numero: c.estudio_solicitudes.numero,
    modulo: moduloDe(c.estudio_solicitudes.tipo_documento),
    solicitanteId: c.estudio_solicitudes.created_by,
    consulta: {
      id: c.id,
      rol: c.rol,
      placa: c.placa,
      tipoDoc: c.tipo_doc,
      documento: c.documento,
      estado: c.estado,
      nivel: c.nivel,
      nombreConsultado: c.nombre_consultado,
      fuentes: c.fuentes ?? {},
      hallazgos: c.estudio_hallazgos ?? [],
      datos: c.datos ?? {},
      mensajeError: c.mensaje_error,
      tieneReporte: Boolean(c.report_id),
      simulada: c.estudio_solicitudes.simulada,
    },
  };
}

function aBandeja(e: Estudio): FilaBandeja {
  return {
    id: e.id,
    numero: e.numero,
    modulo: e.modulo,
    tipo: e.consultas.length > 1 ? "combo" : "individual",
    descripcion: e.descripcion,
    nombreConsultado: e.nombreConsultado,
    fecha: e.fecha,
    estado: e.estado,
    nivel: e.nivel ?? "sin_hallazgo",
    decision: e.decision,
    simulada: e.simulada,
    solicitante: "Usuario demo",
  };
}

function porRiesgo(a: FilaBandeja, b: FilaBandeja) {
  const d = PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel];
  if (d !== 0) return d;
  return b.fecha.localeCompare(a.fecha);
}
