import "server-only";
import { getUsuarioActual } from "@/lib/auth";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { almacenEstudios, aResumen } from "./demo";
import type {
  Decision,
  EstadoEstudio,
  Estudio,
  Hallazgo,
  NivelHallazgo,
  ResultadoFuente,
  SolicitudResumen,
  TipoDocumento,
} from "./tipos";
import { PESO_NIVEL } from "./tipos";

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
}) {
  if (fila.tipo_documento === "PLACA") return `Placa ${fila.placa ?? "—"}`;
  if (fila.tipo_documento === "PP") {
    return fila.nombre ? `PP · ${fila.nombre}` : `PP · ${fila.documento ?? ""}`;
  }
  return `${fila.tipo_documento} ${fila.documento ?? "—"}`;
}

function moduloDe(tipo: TipoDocumento): "documento" | "vehiculo" {
  return tipo === "PLACA" ? "vehiculo" : "documento";
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
      "id, numero, tipo_documento, documento, nombre, placa, estado, created_at, decision, comentario_verificador, decidida_at",
    )
    .eq("created_by", usuario.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[estudios]", error);
    return [];
  }
  return (data ?? []).map((f) => ({
    id: f.id as string,
    numero: f.numero as number,
    modulo: moduloDe(f.tipo_documento as TipoDocumento),
    descripcion: descripcion(f as never),
    estado: f.estado as EstadoEstudio,
    fecha: f.created_at as string,
    decision: (f.decision ?? "pendiente") as Decision,
    comentario: (f.comentario_verificador as string | null) ?? null,
    decididaAt: (f.decidida_at as string | null) ?? null,
  }));
}

/** Fila para la bandeja del verificador (sin hallazgos individuales). */
export interface FilaBandeja {
  id: string;
  numero: number;
  modulo: "documento" | "vehiculo";
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
  return {
    id: f.id,
    numero: f.numero,
    modulo: moduloDe(f.tipo_documento),
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
      .solicitudes.filter(
        (s) => s.decision === "pendiente" && s.estado !== "error",
      )
      .map(aBandeja)
      .sort(porRiesgo);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, estado, decision, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo )",
    )
    .eq("decision", "pendiente")
    .neq("estado", "error")
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
      "id, numero, tipo_documento, documento, nombre, placa, estado, decision, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo )",
    )
    .neq("decision", "pendiente")
    .order("decidida_at", { ascending: false });
  if (error) {
    console.error("[estudios]", error);
    return [];
  }
  return (data as unknown as FilaPendienteRaw[]).map(construirFila);
}

/** Detalle completo del estudio para el verificador. */
export async function obtenerEstudio(numero: number): Promise<Estudio | null> {
  if (MODO_DEMO) {
    return almacenEstudios().solicitudes.find((s) => s.numero === numero) ?? null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, estado, decision, comentario_verificador, simulada, created_at, perfiles:created_by ( nombre_completo, email ), estudio_resultados ( nombre_consultado, nivel_maximo, fuentes ), estudio_hallazgos ( nivel, fuente, codigo, titulo, descripcion )",
    )
    .eq("numero", numero)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[estudios]", error);
    return null;
  }
  const d = data as unknown as FilaPendienteRaw & {
    comentario_verificador: string | null;
    estudio_resultados: {
      nombre_consultado: string | null;
      nivel_maximo: NivelHallazgo;
      fuentes: Record<string, ResultadoFuente>;
    } | null;
    estudio_hallazgos: Hallazgo[];
  };
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
    fuentes: d.estudio_resultados?.fuentes ?? {},
    hallazgos: d.estudio_hallazgos ?? [],
    decision: d.decision,
    comentario: d.comentario_verificador,
    simulada: d.simulada,
  };
}

function aBandeja(e: Estudio): FilaBandeja {
  return {
    id: e.id,
    numero: e.numero,
    modulo: e.modulo,
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
