import "server-only";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { almacenEstudios } from "./demo";
import { simularConsulta } from "./simulador";
import {
  esperarConsulta,
  obtenerClienteTusDatos,
  TusDatosError,
  type EstadoConsulta,
  type TusDatosDocType,
  type TusDatosHallazgoNivel,
} from "./tusdatos";
import type {
  Estudio,
  Hallazgo,
  NivelHallazgo,
  ResultadoFuente,
  TipoDocumento,
} from "./tipos";
import type {
  ConsultaDocumento,
  ConsultaVehiculo,
} from "./schemas";

/**
 * Crea la solicitud y ejecuta la consulta:
 *  - Si hay credenciales de TusDatos (`TUSDATOS_USUARIO`/`TUSDATOS_CLAVE`),
 *    se lanza y se espera hasta ~90 s el resultado.
 *  - Sin credenciales, se usa el simulador determinista.
 * Devuelve el número visible (SOL-xxxxxx) y marca `simulada = true/false`.
 */

export interface EntradaConsulta {
  tipoDocumento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  fechaExpedicion: string | null;
  placa: string | null;
  tipoDocPropietario: string | null;
  // Remolque (solo PLACA)
  placaRemolque: string | null;
  tipoDocPropietarioRemolque: string | null;
  documentoPropietarioRemolque: string | null;
}

const VACIO: Omit<EntradaConsulta, "tipoDocumento"> = {
  documento: null,
  nombre: null,
  fechaExpedicion: null,
  placa: null,
  tipoDocPropietario: null,
  placaRemolque: null,
  tipoDocPropietarioRemolque: null,
  documentoPropietarioRemolque: null,
};

export function entradaDocumento(d: ConsultaDocumento): EntradaConsulta {
  switch (d.tipo) {
    case "PP":
      return {
        ...VACIO,
        tipoDocumento: "PP",
        documento: d.documento,
        nombre: d.nombre,
      };
    case "CE":
    case "PPT":
      return {
        ...VACIO,
        tipoDocumento: d.tipo,
        documento: d.documento,
        fechaExpedicion: d.fechaExpedicion,
      };
    case "CC":
    case "NIT":
      return {
        ...VACIO,
        tipoDocumento: d.tipo,
        documento: d.documento,
      };
  }
}

export function entradaVehiculo(v: ConsultaVehiculo): EntradaConsulta {
  const incluir = v.incluirRemolque;
  const mismo = v.remolqueMismoPropietario;
  return {
    ...VACIO,
    tipoDocumento: "PLACA",
    documento: v.documentoPropietario,
    placa: v.placa,
    tipoDocPropietario: v.tipoPropietario,
    placaRemolque: incluir ? v.placaRemolque : null,
    tipoDocPropietarioRemolque:
      incluir && !mismo ? v.tipoPropietarioRemolque : null,
    documentoPropietarioRemolque:
      incluir && !mismo ? v.documentoPropietarioRemolque : null,
  };
}

export interface ResultadoCreacion {
  numero: number;
  id: string;
  simulada: boolean;
}

export async function crearSolicitud(
  usuarioId: string,
  entrada: EntradaConsulta,
): Promise<ResultadoCreacion> {
  const cliente = obtenerClienteTusDatos();
  const usarReal = cliente !== null && !MODO_DEMO;

  // Ejecuta la consulta (real o simulada) ANTES de persistir, para poder
  // dejar todo en estado "finalizada" en una sola transacción — igual que
  // antes, el flujo es síncrono hasta ~90s. Un flujo asíncrono con webhook
  // queda para una fase posterior.
  const resultado = usarReal
    ? await consultarReal(cliente, entrada)
    : consultarSimulado(entrada);

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
      nombreConsultado: resultado.nombre,
      solicitante: usuarioId,
      fecha: new Date().toISOString(),
      estado: resultado.estado === "error" ? "error" : "finalizada",
      nivel: resultado.nivel,
      fuentes: resultado.fuentes,
      hallazgos: resultado.hallazgos,
      decision: "pendiente",
      comentario: null,
      simulada: resultado.simulada,
    };
    almacen.solicitudes.unshift(estudio);
    return { numero, id, simulada: resultado.simulada };
  }

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
      placa_remolque: entrada.placaRemolque,
      tipo_doc_propietario_remolque: entrada.tipoDocPropietarioRemolque,
      documento_propietario_remolque: entrada.documentoPropietarioRemolque,
      autorizacion_titular: true,
      estado: resultado.estado === "error" ? "error" : "finalizada",
      finalizada_at: new Date().toISOString(),
      simulada: resultado.simulada,
      tusdatos_jobid: resultado.jobid,
      tusdatos_report_id: resultado.reportId,
    })
    .select("id, numero")
    .single();
  if (error || !creada) {
    throw new Error(error?.message ?? "No fue posible crear la solicitud.");
  }

  const admin = createAdminClient();
  await admin.from("estudio_resultados").insert({
    solicitud_id: creada.id,
    nombre_consultado: resultado.nombre,
    nivel_maximo: resultado.nivel,
    fuentes: resultado.fuentes,
  });
  if (resultado.hallazgos.length) {
    await admin.from("estudio_hallazgos").insert(
      resultado.hallazgos.map((h) => ({
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
    tipo: resultado.simulada ? "info" : "ok",
    texto: resultado.simulada
      ? "Consulta simulada (sin créditos reales)."
      : `Consulta completada en TusDatos (job ${resultado.jobid ?? "—"}).`,
  });

  return {
    numero: creada.numero as number,
    id: creada.id as string,
    simulada: resultado.simulada,
  };
}

interface ResultadoProcesado {
  nombre: string | null;
  nivel: NivelHallazgo;
  fuentes: Record<string, ResultadoFuente>;
  hallazgos: Hallazgo[];
  simulada: boolean;
  estado: "finalizado" | "error";
  jobid: string | null;
  reportId: string | null;
}

function consultarSimulado(entrada: EntradaConsulta): ResultadoProcesado {
  const s = simularConsulta({
    tipoDocumento: entrada.tipoDocumento,
    documento: entrada.documento,
    placa: entrada.placa,
  });
  return {
    nombre: s.nombre,
    nivel: s.nivel,
    fuentes: s.fuentes,
    hallazgos: s.hallazgos,
    simulada: true,
    estado: "finalizado",
    jobid: null,
    reportId: null,
  };
}

const MAPEO_NIVEL: Record<TusDatosHallazgoNivel, NivelHallazgo> = {
  alto: "alto",
  medio: "medio",
  bajo: "bajo",
  info: "info",
  "": "sin_hallazgo",
};

async function consultarReal(
  cliente: NonNullable<ReturnType<typeof obtenerClienteTusDatos>>,
  entrada: EntradaConsulta,
): Promise<ResultadoProcesado> {
  try {
    let jobid: string;
    if (entrada.tipoDocumento === "PLACA") {
      const r = await cliente.lanzarVehiculo({
        placa: entrada.placa!,
        tdoc: (entrada.tipoDocPropietario ?? "CC") as "CC" | "CE" | "NIT" | "TI",
        doc: entrada.documento!,
      });
      jobid = r.jobid;
    } else {
      const r = await cliente.lanzarIndividual({
        typedoc: entrada.tipoDocumento as TusDatosDocType,
        doc: entrada.documento ?? undefined,
        name: entrada.nombre ?? undefined,
        fechaE: entrada.fechaExpedicion
          ? invertirFecha(entrada.fechaExpedicion)
          : undefined,
      });
      jobid = r.jobid;
    }
    const estado = await esperarConsulta(cliente, jobid);
    return estadoATipado(estado, jobid);
  } catch (e) {
    if (e instanceof TusDatosError) {
      // En error, caemos al simulador para no dejar la solicitud tirada;
      // pero marcamos estado 'error' en lugar de 'finalizada' para que el
      // verificador lo distinga.
      console.error("[tusdatos]", e.status, e.message);
      const sim = consultarSimulado(entrada);
      return { ...sim, estado: "error" };
    }
    throw e;
  }
}

function invertirFecha(iso: string) {
  // YYYY-MM-DD → DD/MM/YYYY (lo que TusDatos espera)
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function estadoATipado(
  estado: EstadoConsulta,
  jobid: string,
): ResultadoProcesado {
  const fuentes: Record<string, ResultadoFuente> = {};
  const nivelMapa: Record<string, NivelHallazgo> = {};
  for (const [fuente, r] of Object.entries(estado.results ?? {})) {
    if (r === "Error") fuentes[fuente] = "error";
    else if (r === true) fuentes[fuente] = "hallazgo";
    else fuentes[fuente] = "ok";
  }
  // TusDatos no devuelve el nivel por fuente, solo el nivel máximo.
  // Para el detalle, atribuimos el nivel máximo a cada fuente con hallazgo.
  const nivelMax = MAPEO_NIVEL[estado.hallazgos];
  const hallazgos: Hallazgo[] = [];
  for (const [fuente, r] of Object.entries(estado.results ?? {})) {
    if (r === true && nivelMax !== "sin_hallazgo") {
      hallazgos.push({
        nivel: nivelMax,
        fuente,
        codigo: nivelMapa[fuente] ?? `tusdatos.${fuente.toLowerCase()}`,
        titulo: `Hallazgo en ${fuente}`,
        descripcion:
          "TusDatos reporta coincidencia en esta fuente. Revisa el reporte completo para el detalle.",
      });
    }
  }
  return {
    nombre: estado.nombre ?? null,
    nivel: nivelMax,
    fuentes,
    hallazgos,
    simulada: false,
    estado: estado.error ? "error" : "finalizado",
    jobid,
    reportId: estado.id,
  };
}
