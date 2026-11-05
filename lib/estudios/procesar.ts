import "server-only";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { almacenEstudios } from "./demo";
import {
  type EntradaConsulta,
  interpretarResultado,
  nivelMasGrave,
  type PlanConsulta,
  planDeConsultas,
  type ResultadoInterpretado,
} from "./resultado.ts";
import type { ConsultaDocumento, ConsultaVehiculo } from "./schemas";
import { simularConsulta } from "./simulador";
import { enmascarar, trazar } from "./traza.ts";
import {
  type ClienteTusDatos,
  obtenerClienteTusDatos,
  type TusDatosDocType,
  type TusDatosOwnerDocType,
} from "./tusdatos.ts";
import type {
  ConsultaEstudio,
  Estudio,
  NivelHallazgo,
  RolConsulta,
} from "./tipos";

/*
 * Procesamiento de un estudio. Lo hace el SISTEMA (secret key) tras
 * requirePermiso(). Un estudio tiene una consulta por documento, o una por cada
 * placa del vehículo: cabezote y, si lleva, remolque, cada una con su propietario.
 *
 *  1. crearSolicitud(): guarda la solicitud y sus consultas y DESPUÉS las lanza
 *     en TusDatos, para que siempre quede registro de lo que gasta créditos. No
 *     espera el resultado (tarda en promedio un minuto).
 *  2. sincronizarPendientes(): pregunta a TusDatos por los jobs pendientes. La
 *     llaman las pantallas mientras haya consultas en proceso. El jobid vence a
 *     las 2 horas: si nadie abre una pantalla en ese tiempo, la consulta queda
 *     con error (falta el webhook de TusDatos para no depender de esto).
 *
 * Si TusDatos falla, la consulta queda en error con el mensaje recibido: nunca
 * se llenan datos simulados en una consulta real. Sin credenciales todo el
 * estudio es simulado y queda marcado como tal.
 */

const VACIO: Omit<EntradaConsulta, "tipoDocumento"> = {
  documento: null,
  nombre: null,
  fechaExpedicion: null,
  placa: null,
  tipoDocPropietario: null,
  placaRemolque: null,
  tipoDocPropietarioRemolque: null,
  documentoPropietarioRemolque: null,
  tipoDocTenedor: null,
  documentoTenedor: null,
  fechaExpedicionTenedor: null,
  tipoDocConductor: null,
  documentoConductor: null,
  fechaExpedicionConductor: null,
  incluirAntecedentes: false,
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
    tipoDocTenedor: v.incluirTenedor ? v.tipoTenedor : null,
    documentoTenedor: v.incluirTenedor ? v.documentoTenedor : null,
    fechaExpedicionTenedor:
      v.incluirTenedor && v.fechaExpedicionTenedor
        ? v.fechaExpedicionTenedor
        : null,
    tipoDocConductor: v.incluirConductor ? v.tipoConductor : null,
    documentoConductor: v.incluirConductor ? v.documentoConductor : null,
    fechaExpedicionConductor:
      v.incluirConductor && v.fechaExpedicionConductor
        ? v.fechaExpedicionConductor
        : null,
    incluirAntecedentes: v.incluirAntecedentes,
  };
}

const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
  propietario: "Propietario",
  tenedor: "Tenedor",
  conductor: "Conductor",
  prop_remolque: "Propietario del remolque",
};

const etiquetaConsulta = (c: { rol: RolConsulta; placa: string | null }) =>
  c.placa ? `${NOMBRE_ROL[c.rol]} ${c.placa}` : NOMBRE_ROL[c.rol];

const referencia = (numero: number, rol: RolConsulta) =>
  `SOL-${String(numero).padStart(6, "0")}/${rol}`;

function invertirFecha(iso: string) {
  // YYYY-MM-DD → DD/MM/YYYY (lo que TusDatos espera)
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const simular = (
  p: PlanConsulta,
): ResultadoInterpretado & { nombre: string } => {
  const s = simularConsulta({
    tipoDocumento: p.placa ? "PLACA" : p.tipoDoc,
    documento: p.documento,
    placa: p.placa,
  });
  return {
    reportId: null,
    nombre: s.nombre,
    nivel: s.nivel,
    fuentes: s.fuentes,
    hallazgos: s.hallazgos,
  };
};

// ─── Bitácora del estudio ───────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>;

async function evento(
  admin: Admin,
  solicitudId: string,
  tipo: "info" | "ok" | "error",
  texto: string,
) {
  const { error } = await admin
    .from("estudio_eventos")
    .insert({ solicitud_id: solicitudId, tipo, texto });
  if (error) console.error("[estudios] bitácora", error.message);
}

// ─── Creación ───────────────────────────────────────────────────────────────

export interface ConsultaCreada {
  rol: RolConsulta;
  placa: string | null;
  tipoDoc: string;
  documento: string;
  jobid: string | null;
  error: string | null;
}

export interface ResultadoCreacion {
  numero: number;
  id: string;
  simulada: boolean;
  consultas: ConsultaCreada[];
  /** Ninguna consulta se pudo lanzar: el estudio no sigue. */
  fallida: boolean;
}

export async function crearSolicitud(
  usuarioId: string,
  entrada: EntradaConsulta,
): Promise<ResultadoCreacion> {
  const plan = planDeConsultas(entrada);
  if (MODO_DEMO) return crearDemo(usuarioId, entrada, plan);

  const cliente = obtenerClienteTusDatos();
  const simulada = !cliente;
  const admin = createAdminClient();

  const { data: creada, error } = await admin
    .from("estudio_solicitudes")
    .insert({
      created_by: usuarioId,
      tipo_documento: entrada.tipoDocumento,
      documento: entrada.documento,
      nombre: entrada.nombre,
      fecha_expedicion: entrada.fechaExpedicion,
      placa: entrada.placa,
      tipo_doc_propietario: entrada.tipoDocPropietario,
      placa_remolque: entrada.placaRemolque,
      tipo_doc_propietario_remolque: entrada.tipoDocPropietarioRemolque,
      documento_propietario_remolque: entrada.documentoPropietarioRemolque,
      tipo_doc_tenedor: entrada.tipoDocTenedor,
      documento_tenedor: entrada.documentoTenedor,
      fecha_expedicion_tenedor: entrada.fechaExpedicionTenedor,
      tipo_doc_conductor: entrada.tipoDocConductor,
      documento_conductor: entrada.documentoConductor,
      fecha_expedicion_conductor: entrada.fechaExpedicionConductor,
      incluir_antecedentes: entrada.incluirAntecedentes,
      autorizacion_titular: true,
      estado: "procesando",
      simulada,
    })
    .select("id, numero")
    .single();
  if (error || !creada)
    throw new Error(error?.message ?? "No fue posible crear la solicitud.");
  const solicitudId = creada.id as string;
  const numero = creada.numero as number;

  // Si no se pudo preparar, no queda colgada "en proceso" ni se gastan créditos
  const abortar = async (mensaje: string) => {
    trazar("estudio.no_preparado", { numero, mensaje });
    await admin
      .from("estudio_solicitudes")
      .update({ estado: "error" })
      .eq("id", solicitudId);
    return new Error(mensaje);
  };

  const { error: errorResultado } = await admin
    .from("estudio_resultados")
    .insert({ solicitud_id: solicitudId });
  if (errorResultado) throw await abortar(errorResultado.message);

  const { data: filas, error: errorConsultas } = await admin
    .from("estudio_consultas")
    .insert(
      plan.map((p) => ({
        solicitud_id: solicitudId,
        rol: p.rol,
        placa: p.placa,
        tipo_doc: p.tipoDoc,
        documento: p.documento,
      })),
    )
    .select("id, rol");
  if (errorConsultas || !filas)
    throw await abortar(
      errorConsultas?.message ?? "No se guardaron las consultas.",
    );
  const idDe = (rol: RolConsulta) =>
    filas.find((f) => f.rol === rol)!.id as string;

  trazar("estudio.creado", {
    numero,
    simulada,
    consultas: plan.map((p) => ({
      rol: p.rol,
      placa: p.placa,
      tipo: p.tipoDoc,
      doc: enmascarar(p.documento),
    })),
  });
  await evento(
    admin,
    solicitudId,
    "info",
    `Solicitud creada con ${plan.length === 1 ? "1 consulta" : `${plan.length} consultas`}.`,
  );

  // Cada placa por aparte: si una falla, la otra sigue
  const consultas = await Promise.all(
    plan.map(async (p): Promise<ConsultaCreada> => {
      const id = idDe(p.rol);
      const base = {
        rol: p.rol,
        placa: p.placa,
        tipoDoc: p.tipoDoc,
        documento: p.documento,
      };
      if (!cliente) {
        await finalizarConsulta(admin, id, solicitudId, p, simular(p), {});
        return { ...base, jobid: null, error: null };
      }
      try {
        const lanzada = await lanzar(cliente, p, referencia(numero, p.rol));
        await admin
          .from("estudio_consultas")
          .update({ jobid: lanzada.jobid, datos: lanzada.datos })
          .eq("id", id);
        await evento(
          admin,
          solicitudId,
          "info",
          `${etiquetaConsulta(p)}: consulta lanzada en TusDatos (job ${lanzada.jobid}).`,
        );
        return { ...base, jobid: lanzada.jobid, error: null };
      } catch (e) {
        const mensaje =
          e instanceof Error ? e.message : "No se pudo lanzar la consulta.";
        await marcarError(admin, id, solicitudId, p, mensaje);
        return { ...base, jobid: null, error: mensaje };
      }
    }),
  );

  const { fallida } = await cerrarSolicitud(admin, solicitudId);
  return { numero, id: solicitudId, simulada, consultas, fallida };
}

async function lanzar(
  cliente: ClienteTusDatos,
  p: PlanConsulta,
  ref: string,
): Promise<{ jobid: string; datos: Record<string, unknown> }> {
  if (p.placa) {
    const r = await cliente.lanzarVehiculo(
      {
        placa: p.placa,
        tdoc: p.tipoDoc as TusDatosOwnerDocType,
        doc: Number(p.documento),
      },
      ref,
    );
    return {
      jobid: r.jobid,
      datos: { vehiculo: r.vehiculo, soat: r.soat, revision: r.revision },
    };
  }
  const r = await cliente.lanzarIndividual(
    {
      typedoc: p.tipoDoc as TusDatosDocType,
      doc: p.documento,
      ...(p.nombre ? { name: p.nombre } : {}),
      ...(p.fechaExpedicion
        ? { fechaE: invertirFecha(p.fechaExpedicion) }
        : {}),
    },
    ref,
  );
  return { jobid: r.jobid, datos: { validado: r.validado } };
}

// ─── Cierre de consultas y del estudio ──────────────────────────────────────

async function marcarError(
  admin: Admin,
  consultaId: string,
  solicitudId: string,
  c: { rol: RolConsulta; placa: string | null },
  mensaje: string,
) {
  const { data } = await admin
    .from("estudio_consultas")
    .update({
      estado: "error",
      mensaje_error: mensaje,
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", consultaId)
    .eq("estado", "procesando")
    .select("id");
  if (!data?.length) return false;
  trazar("estudio.consulta_error", {
    consulta: consultaId,
    rol: c.rol,
    placa: c.placa,
    mensaje,
  });
  await evento(
    admin,
    solicitudId,
    "error",
    `${etiquetaConsulta(c)}: ${mensaje}`,
  );
  return true;
}

/** Guarda el resultado. Solo una vez aunque dos pantallas sincronicen a la par. */
async function finalizarConsulta(
  admin: Admin,
  consultaId: string,
  solicitudId: string,
  c: { rol: RolConsulta; placa: string | null },
  r: ResultadoInterpretado,
  datos: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from("estudio_consultas")
    .update({
      estado: "finalizada",
      report_id: r.reportId,
      nombre_consultado: r.nombre,
      nivel: r.nivel,
      fuentes: r.fuentes,
      finalizada_at: new Date().toISOString(),
      ...(Object.keys(datos).length ? { datos } : {}),
    })
    .eq("id", consultaId)
    .eq("estado", "procesando")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;

  if (r.hallazgos.length) {
    const { error: errorHallazgos } = await admin
      .from("estudio_hallazgos")
      .insert(
        r.hallazgos.map((h) => ({
          consulta_id: consultaId,
          nivel: h.nivel,
          fuente: h.fuente,
          codigo: h.codigo,
          titulo: h.titulo,
          descripcion: h.descripcion,
        })),
      );
    if (errorHallazgos) throw new Error(errorHallazgos.message);
  }
  await evento(
    admin,
    solicitudId,
    "ok",
    `${etiquetaConsulta(c)}: consulta finalizada, nivel ${r.nivel.replace("_", " ")}, ${r.hallazgos.length} hallazgo(s).`,
  );
  return true;
}

/** Si ya no hay consultas en proceso, consolida el estudio para el verificador. */
async function cerrarSolicitud(admin: Admin, solicitudId: string) {
  const { data, error } = await admin
    .from("estudio_consultas")
    .select("rol, estado, nivel, nombre_consultado")
    .eq("solicitud_id", solicitudId);
  if (error) throw new Error(error.message);
  const filas = data ?? [];
  if (filas.some((f) => f.estado === "procesando"))
    return { cerrada: false, fallida: false };

  const fallida = filas.every((f) => f.estado === "error");
  const finalizadas = filas.filter((f) => f.estado === "finalizada");
  await admin
    .from("estudio_resultados")
    .update({
      nivel_maximo: nivelMasGrave(
        finalizadas.map((f) => (f.nivel ?? "sin_hallazgo") as NivelHallazgo),
      ),
      nombre_consultado:
        finalizadas.find((f) => f.nombre_consultado)?.nombre_consultado ?? null,
    })
    .eq("solicitud_id", solicitudId);
  const { data: cambio } = await admin
    .from("estudio_solicitudes")
    .update({
      estado: fallida ? "error" : "finalizada",
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", solicitudId)
    .eq("estado", "procesando")
    .select("id");
  if (cambio?.length)
    await evento(
      admin,
      solicitudId,
      fallida ? "error" : "ok",
      fallida
        ? "Ninguna consulta se pudo completar."
        : "Estudio listo para revisión.",
    );
  return { cerrada: true, fallida };
}

// ─── Sincronización con TusDatos ────────────────────────────────────────────

/** Entre una revisión y otra del mismo job (la documentación sugiere ~5 s). */
const MS_ENTRE_REVISIONES = 8_000;
/** Por llamada, para no agotar el tiempo de la función. */
const MAX_POR_LLAMADA = 10;
/** Una consulta sin jobid tras este tiempo se interrumpió al lanzarse. */
const MS_SIN_JOB = 5 * 60_000;

interface FilaPendiente {
  id: string;
  solicitud_id: string;
  rol: RolConsulta;
  placa: string | null;
  jobid: string | null;
  datos: Record<string, unknown> | null;
  created_at: string;
  ultima_revision: string | null;
  estudio_solicitudes: { numero: number } | null;
}

/** Pregunta a TusDatos por las consultas en proceso. Devuelve cuántas cambiaron. */
export async function sincronizarPendientes(actor: {
  id: string;
  email: string;
}): Promise<{ cambios: number; pendientes: number }> {
  const cliente = obtenerClienteTusDatos();
  if (MODO_DEMO || !cliente) return { cambios: 0, pendientes: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("estudio_consultas")
    .select(
      "id, solicitud_id, rol, placa, jobid, datos, created_at, ultima_revision, estudio_solicitudes ( numero )",
    )
    .eq("estado", "procesando")
    .order("ultima_revision", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as FilaPendiente[];

  const ahora = Date.now();
  const porRevisar = filas
    .filter(
      (f) =>
        !f.ultima_revision ||
        ahora - new Date(f.ultima_revision).getTime() >= MS_ENTRE_REVISIONES,
    )
    .slice(0, MAX_POR_LLAMADA);

  const cambios = await Promise.all(
    porRevisar.map((f) => revisarConsulta(admin, cliente, f, actor)),
  );
  const hechos = cambios.filter(Boolean).length;
  return { cambios: hechos, pendientes: filas.length - hechos };
}

async function revisarConsulta(
  admin: Admin,
  cliente: ClienteTusDatos,
  f: FilaPendiente,
  actor: { id: string; email: string },
) {
  const numero = f.estudio_solicitudes?.numero ?? 0;
  const ref = referencia(numero, f.rol);
  const auditar = (
    resultado: "ok" | "error",
    detalle: Record<string, unknown>,
  ) =>
    registrarAuditoria({
      actorId: actor.id,
      actorEmail: actor.email,
      modulo: "estudios.verificar",
      accion: "estudio.consulta",
      entidad: "estudio",
      entidadId: String(numero),
      resultado,
      detalle: { rol: f.rol, placa: f.placa, jobid: f.jobid, ...detalle },
    });

  try {
    if (!f.jobid) {
      if (Date.now() - new Date(f.created_at).getTime() < MS_SIN_JOB)
        return false;
      const mensaje = "La consulta se interrumpió antes de lanzarse.";
      if (await marcarError(admin, f.id, f.solicitud_id, f, mensaje)) {
        await auditar("error", { mensaje });
        await cerrarSolicitud(admin, f.solicitud_id);
        return true;
      }
      return false;
    }

    await admin
      .from("estudio_consultas")
      .update({ ultima_revision: new Date().toISOString() })
      .eq("id", f.id);
    const job = await cliente.estado(f.jobid, ref);
    if (job.fase === "procesando") return false;

    if (job.fase === "error") {
      if (await marcarError(admin, f.id, f.solicitud_id, f, job.mensaje)) {
        await auditar("error", { mensaje: job.mensaje });
        await cerrarSolicitud(admin, f.solicitud_id);
        return true;
      }
      return false;
    }

    // El detalle de hallazgos es un extra: sin él quedan las fuentes y el reporte
    let reporte: unknown;
    if (job.cuerpo.id) {
      try {
        reporte = await cliente.reporteJson(job.cuerpo.id, ref);
      } catch (e) {
        trazar("estudio.sin_detalle", {
          ref,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const r = interpretarResultado(job.cuerpo, reporte);
    const datos = {
      ...f.datos,
      ...(job.cuerpo.validado !== undefined && {
        validado: job.cuerpo.validado,
      }),
    };
    if (await finalizarConsulta(admin, f.id, f.solicitud_id, f, r, datos)) {
      const fuentes = Object.values(r.fuentes);
      await auditar("ok", {
        report_id: r.reportId,
        nivel: r.nivel,
        fuentes: fuentes.length,
        fuentes_con_hallazgo: fuentes.filter((e) => e === "hallazgo").length,
        fuentes_con_error: fuentes.filter((e) => e === "error").length,
        hallazgos: r.hallazgos.length,
        segundos: job.cuerpo.time,
      });
      await cerrarSolicitud(admin, f.solicitud_id);
      return true;
    }
    return false;
  } catch (e) {
    // Fallo de red o de credenciales: la consulta sigue pendiente y se reintenta
    trazar("estudio.revision_fallo", {
      ref,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

// ─── Modo demostración ──────────────────────────────────────────────────────

function crearDemo(
  usuarioId: string,
  entrada: EntradaConsulta,
  plan: PlanConsulta[],
): ResultadoCreacion {
  const almacen = almacenEstudios();
  const numero = almacen.siguienteNumero++;
  const id = crypto.randomUUID();
  const consultas: ConsultaEstudio[] = plan.map((p) => {
    const s = simular(p);
    return {
      id: crypto.randomUUID(),
      rol: p.rol,
      placa: p.placa,
      tipoDoc: p.tipoDoc,
      documento: p.documento,
      estado: "finalizada",
      nivel: s.nivel,
      nombreConsultado: s.nombre,
      fuentes: s.fuentes,
      hallazgos: s.hallazgos,
      datos: {},
      mensajeError: null,
      tieneReporte: false,
      simulada: true,
    };
  });
  const remolque = entrada.placaRemolque ? ` + ${entrada.placaRemolque}` : "";
  const estudio: Estudio = {
    id,
    numero,
    modulo: entrada.tipoDocumento === "PLACA" ? "vehiculo" : "documento",
    descripcion:
      entrada.tipoDocumento === "PLACA"
        ? `Placa ${entrada.placa}${remolque}`
        : `${entrada.tipoDocumento} ${entrada.documento ?? ""}`.trim(),
    nombreConsultado: consultas[0].nombreConsultado,
    solicitante: usuarioId,
    fecha: new Date().toISOString(),
    estado: "finalizada",
    nivel: nivelMasGrave(consultas.map((c) => c.nivel ?? "sin_hallazgo")),
    consultas,
    eventos: [
      {
        fecha: new Date().toISOString(),
        tipo: "info",
        texto: "Consulta simulada (sin créditos reales).",
      },
    ],
    decision: "pendiente",
    comentario: null,
    simulada: true,
  };
  almacen.solicitudes.unshift(estudio);
  return {
    numero,
    id,
    simulada: true,
    fallida: false,
    consultas: plan.map((p) => ({
      rol: p.rol,
      placa: p.placa,
      tipoDoc: p.tipoDoc,
      documento: p.documento,
      jobid: null,
      error: null,
    })),
  };
}
