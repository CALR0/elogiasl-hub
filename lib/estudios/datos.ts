import "server-only";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { almacenEstudios, aResumen } from "./demo";
import type {
  EstadoEstudio,
  SolicitudResumen,
  TipoDocumento,
} from "./tipos";

/**
 * Lecturas del módulo Estudios. Todo pasa por RLS: el solicitante solo verá
 * las filas donde created_by = auth.uid(), el verificador verá todas.
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

/** "Mis solicitudes": solo las que yo creé. */
export async function listarMisSolicitudes(): Promise<SolicitudResumen[]> {
  if (MODO_DEMO) {
    return almacenEstudios().solicitudes.map(aResumen);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, tipo_documento, documento, nombre, placa, estado, created_at, decision, comentario_verificador, decidida_at",
    )
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
    decision: (f.decision ?? "pendiente") as SolicitudResumen["decision"],
    comentario: (f.comentario_verificador as string | null) ?? null,
    decididaAt: (f.decidida_at as string | null) ?? null,
  }));
}
