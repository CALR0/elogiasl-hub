import "server-only";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { almacenEstudios } from "./demo";
import { simularConsulta } from "./simulador";
import type { Estudio, TipoDocumento } from "./tipos";
import type {
  ConsultaDocumento,
  ConsultaVehiculo,
} from "./schemas";

/**
 * Crea la solicitud y ejecuta la consulta en modo SIMULADO. Devuelve el
 * número visible (SOL-xxxxxx). Mientras no exista la API real de TusDatos
 * conectada, toda solicitud se simula: la bandera `simulada = true` queda
 * registrada.
 */

export interface EntradaConsulta {
  tipoDocumento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  fechaExpedicion: string | null;
  placa: string | null;
  tipoDocPropietario: string | null;
}

export function entradaDocumento(d: ConsultaDocumento): EntradaConsulta {
  switch (d.tipo) {
    case "PP":
      return {
        tipoDocumento: "PP",
        documento: d.documento,
        nombre: d.nombre,
        fechaExpedicion: null,
        placa: null,
        tipoDocPropietario: null,
      };
    case "CE":
    case "PPT":
      return {
        tipoDocumento: d.tipo,
        documento: d.documento,
        nombre: null,
        fechaExpedicion: d.fechaExpedicion,
        placa: null,
        tipoDocPropietario: null,
      };
    case "CC":
    case "NIT":
      return {
        tipoDocumento: d.tipo,
        documento: d.documento,
        nombre: null,
        fechaExpedicion: null,
        placa: null,
        tipoDocPropietario: null,
      };
  }
}

export function entradaVehiculo(v: ConsultaVehiculo): EntradaConsulta {
  return {
    tipoDocumento: "PLACA",
    documento: v.documentoPropietario,
    nombre: null,
    fechaExpedicion: null,
    placa: v.placa,
    tipoDocPropietario: v.tipoPropietario,
  };
}

export interface ResultadoCreacion {
  numero: number;
  id: string;
}

export async function crearSolicitud(
  usuarioId: string,
  entrada: EntradaConsulta,
): Promise<ResultadoCreacion> {
  const simulacion = simularConsulta({
    tipoDocumento: entrada.tipoDocumento,
    documento: entrada.documento,
    placa: entrada.placa,
  });

  if (MODO_DEMO) {
    const almacen = almacenEstudios();
    const numero = almacen.siguienteNumero++;
    const id = crypto.randomUUID();
    const modulo = entrada.tipoDocumento === "PLACA" ? "vehiculo" : "documento";
    const descripcion =
      modulo === "vehiculo"
        ? `Placa ${entrada.placa}`
        : `${entrada.tipoDocumento} ${entrada.documento ?? entrada.nombre ?? ""}`.trim();
    const estudio: Estudio = {
      id,
      numero,
      modulo,
      descripcion,
      nombreConsultado: simulacion.nombre,
      solicitante: usuarioId,
      fecha: new Date().toISOString(),
      estado: "finalizada",
      nivel: simulacion.nivel,
      fuentes: simulacion.fuentes,
      hallazgos: simulacion.hallazgos,
      decision: "pendiente",
      comentario: null,
      simulada: true,
    };
    almacen.solicitudes.unshift(estudio);
    return { numero, id };
  }

  // Crear solicitud con el cliente del usuario (RLS verifica permiso crear)
  const supabase = await createClient();
  const { data: creada, error } = await supabase
    .from("estudio_solicitudes")
    .insert({
      tipo_documento: entrada.tipoDocumento,
      documento: entrada.documento,
      nombre: entrada.nombre,
      fecha_expedicion: entrada.fechaExpedicion,
      placa: entrada.placa,
      tipo_doc_propietario: entrada.tipoDocPropietario,
      autorizacion_titular: true,
      estado: "finalizada",
      finalizada_at: new Date().toISOString(),
      simulada: true,
    })
    .select("id, numero")
    .single();
  if (error || !creada) {
    throw new Error(error?.message ?? "No fue posible crear la solicitud.");
  }

  // Resultados y hallazgos: se escriben con el admin client (tabla solo
  // verificador en lectura; la escritura es del sistema).
  const admin = createAdminClient();
  await admin.from("estudio_resultados").insert({
    solicitud_id: creada.id,
    nombre_consultado: simulacion.nombre,
    nivel_maximo: simulacion.nivel,
    fuentes: simulacion.fuentes,
  });
  if (simulacion.hallazgos.length) {
    await admin.from("estudio_hallazgos").insert(
      simulacion.hallazgos.map((h) => ({
        solicitud_id: creada.id,
        nivel: h.nivel,
        fuente: h.fuente,
        codigo: h.codigo,
        titulo: h.titulo,
        descripcion: h.descripcion,
      })),
    );
  }
  await admin.from("estudio_eventos").insert({
    solicitud_id: creada.id,
    tipo: "info",
    texto: "Consulta simulada (sin créditos reales).",
  });

  return { numero: creada.numero as number, id: creada.id as string };
}
