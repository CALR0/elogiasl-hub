import "server-only";
import type { RespuestaResultado } from "./resultado.ts";
import { trazar, trazaEnvio, trazaRespuesta } from "./traza.ts";

/**
 * Cliente de TusDatos (ver docs.tusdatos.co). Solo servidor. Se construye con
 * credenciales de la cuenta de Elogia desde las variables de entorno.
 *
 * Flujo de una consulta:
 *  1. POST /api/launch (documento) o POST /api/launch/car (cada placa) → jobid,
 *     con vigencia de 2 horas.
 *  2. GET /api/results/{jobid}: 207 en proceso, 200 finalizado, 404 job vencido
 *     o inexistente, 500 consulta fallida. Tarda en promedio un minuto.
 *  3. Con el `id` del resultado: GET /api/report_json/{id} (detalle de hallazgos)
 *     y los reportes en HTML y PDF.
 * Cada petición deja una línea en el log del servidor (lib/estudios/traza.ts).
 */

export type TusDatosDocType =
  "CC" | "CE" | "NIT" | "PP" | "PPT" | "INT" | "NOMBRE";

export type TusDatosOwnerDocType = "CC" | "CE" | "NIT" | "TI";

export class TusDatosError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "TusDatosError";
    this.status = status;
    this.body = body;
  }
}

/**
 * ¿Vale la pena volver a lanzar la consulta? Sí ante fallos de red, tiempo
 * agotado, 5xx, 429 o un 200 sin jobid (TusDatos lo usa para "realice la
 * consulta nuevamente"). Un 4xx es definitivo: datos inválidos o sin créditos.
 */
export function esReintentable(e: unknown) {
  if (!(e instanceof TusDatosError)) return true;
  return (
    e.status < 400 || e.status >= 500 || e.status === 408 || e.status === 429
  );
}

export interface LanzamientoIndividual {
  typedoc: TusDatosDocType;
  doc?: string;
  /** Nombre completo para PP e INT (mín. 5 caracteres). */
  name?: string;
  /** dd/mm/yyyy — obligatorio para CE y PPT. */
  fechaE?: string;
  force?: boolean;
}

export interface LanzamientoVehiculo {
  placa: string;
  tdoc: TusDatosOwnerDocType;
  /** Numérico, sin puntos ni comas (LaunchCarIn). */
  doc: number;
}

/** Respuesta de POST /api/launch/car: además del job trae datos del vehículo. */
export interface LanzamientoVehiculoOut {
  jobid: string;
  vehiculo?: unknown;
  soat?: unknown;
  revision?: unknown;
}

export type EstadoJob =
  | { fase: "procesando"; cuerpo: RespuestaResultado }
  | { fase: "finalizado"; cuerpo: RespuestaResultado }
  | { fase: "error"; mensaje: string };

export interface TusDatosConfig {
  usuario: string;
  clave: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Lanzar una placa consulta el RUNT en línea: tarda bastante más. */
  timeoutLanzarMs?: number;
}

/** Base oficial del API de TusDatos (ver docs.tusdatos.co). */
export const TUSDATOS_BASE_URL_DEFAULT = "https://dash-board.tusdatos.co";

const detalleError = (body: unknown, respaldo: string) => {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const d = b.error ?? b.detail ?? b.estado;
    if (d) return typeof d === "string" ? d : JSON.stringify(d);
  }
  return respaldo;
};

export function clienteTusDatos({
  usuario,
  clave,
  baseUrl = TUSDATOS_BASE_URL_DEFAULT,
  timeoutMs = 30_000,
  timeoutLanzarMs = 45_000,
}: TusDatosConfig) {
  const auth = "Basic " + Buffer.from(`${usuario}:${clave}`).toString("base64");

  /** Una petición con su línea de log. `ref` la relaciona con la consulta. */
  async function llamar(
    ruta: string,
    {
      cuerpo,
      ref,
      timeout = timeoutMs,
    }: { cuerpo?: Record<string, unknown>; ref?: string; timeout?: number } = {},
  ) {
    const inicio = Date.now();
    const metodo = cuerpo ? "POST" : "GET";
    try {
      const res = await fetch(`${baseUrl}${ruta}`, {
        method: metodo,
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
        headers: {
          Accept: "application/json",
          ...(cuerpo ? { "Content-Type": "application/json" } : {}),
          Authorization: auth,
        },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });
      const body: unknown = await res.json().catch(() => null);
      trazar("tusdatos.http", {
        ref,
        metodo,
        ruta,
        status: res.status,
        ms: Date.now() - inicio,
        envio: trazaEnvio(cuerpo),
        respuesta: trazaRespuesta(body),
      });
      return {
        status: res.status,
        ok: res.ok,
        statusText: res.statusText,
        body,
      };
    } catch (e) {
      trazar("tusdatos.http_fallo", {
        ref,
        metodo,
        ruta,
        ms: Date.now() - inicio,
        envio: trazaEnvio(cuerpo),
        error: e instanceof Error ? e.message : String(e),
      });
      if (e instanceof Error && e.name === "TimeoutError")
        throw new Error(
          `TusDatos no respondió en ${Math.round(timeout / 1000)} segundos.`,
        );
      throw e;
    }
  }

  /**
   * Lanza una consulta y EXIGE el jobid: TusDatos a veces responde 200 con
   * { error: "..." } y sin job, y eso no es una consulta lanzada.
   */
  async function lanzarJob<T extends { jobid: string }>(
    ruta: string,
    cuerpo: Record<string, unknown>,
    ref?: string,
  ): Promise<T> {
    const r = await llamar(ruta, { cuerpo, ref, timeout: timeoutLanzarMs });
    if (!r.ok)
      throw new TusDatosError(
        `TusDatos respondió ${r.status}: ${detalleError(r.body, r.statusText)}`,
        r.status,
        r.body,
      );
    const jobid = (r.body as { jobid?: unknown } | null)?.jobid;
    if (typeof jobid !== "string" || !jobid)
      throw new TusDatosError(
        detalleError(r.body, "TusDatos no devolvió el número de la consulta."),
        r.status,
        r.body,
      );
    return r.body as T;
  }

  async function pedir<T>(
    ruta: string,
    opciones?: { cuerpo?: Record<string, unknown>; ref?: string },
  ): Promise<T> {
    const r = await llamar(ruta, opciones);
    if (!r.ok)
      throw new TusDatosError(
        `TusDatos respondió ${r.status}: ${detalleError(r.body, r.statusText)}`,
        r.status,
        r.body,
      );
    return r.body as T;
  }

  return {
    /** Lanza una consulta individual. Devuelve jobid (vigencia 2 h). */
    lanzarIndividual(
      input: LanzamientoIndividual,
      ref?: string,
    ): Promise<{ jobid: string; validado?: boolean }> {
      return lanzarJob("/api/launch", { ...input }, ref);
    },
    /** Lanza la consulta de una placa (cabezote o remolque) con su propietario. */
    lanzarVehiculo(
      input: LanzamientoVehiculo,
      ref?: string,
    ): Promise<LanzamientoVehiculoOut> {
      return lanzarJob("/api/launch/car", { ...input }, ref);
    },
    /** Estado de un job. Un fallo de red o un 401 lanzan error: se reintenta luego. */
    async estado(jobid: string, ref?: string): Promise<EstadoJob> {
      const r = await llamar(`/api/results/${encodeURIComponent(jobid)}`, {
        ref,
      });
      const cuerpo = (r.body ?? {}) as RespuestaResultado;
      if (r.status === 207) return { fase: "procesando", cuerpo };
      if (r.status === 200)
        return cuerpo.estado === "finalizado"
          ? { fase: "finalizado", cuerpo }
          : cuerpo.estado === "procesando"
            ? { fase: "procesando", cuerpo }
            : {
                fase: "error",
                mensaje: detalleError(cuerpo, "Respuesta no reconocida."),
              };
      if (r.status === 404 || r.status === 500)
        return {
          fase: "error",
          mensaje: detalleError(r.body, `TusDatos respondió ${r.status}.`),
        };
      throw new TusDatosError(
        `TusDatos respondió ${r.status} al consultar el job.`,
        r.status,
        r.body,
      );
    },
    /** Reporte en JSON, con el detalle de hallazgos (`dict_hallazgos`). */
    reporteJson(reportId: string, ref?: string): Promise<unknown> {
      return pedir(`/api/report_json/${encodeURIComponent(reportId)}`, { ref });
    },
    /**
     * Reporte en HTML o PDF: devuelve la respuesta tal cual para pasarla al
     * navegador (el PDF responde 202 mientras se construye).
     */
    async descargar(ruta: string, ref?: string): Promise<Response> {
      const inicio = Date.now();
      const res = await fetch(`${baseUrl}${ruta}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: auth },
      });
      trazar("tusdatos.http", {
        ref,
        metodo: "GET",
        ruta,
        status: res.status,
        ms: Date.now() - inicio,
        tipo: res.headers.get("content-type"),
        tamano: res.headers.get("content-length"),
      });
      return res;
    },
    /**
     * Créditos del usuario. TusDatos devuelve un ARRAY con los planes:
     *   [{ amount, purchase_amount, user, ... }]
     * (en la práctica un solo elemento por cuenta).
     */
    creditos(): Promise<
      Array<{
        amount: number;
        purchase_amount: number;
        user: string;
        price_per_check?: number;
        demo?: boolean;
      }>
    > {
      return pedir("/api/plans");
    },
  };
}

export type ClienteTusDatos = ReturnType<typeof clienteTusDatos>;

/** ¿Hay credenciales de TusDatos configuradas? */
export function tusDatosConfigurado() {
  return Boolean(process.env.TUSDATOS_USUARIO && process.env.TUSDATOS_CLAVE);
}

/** Cliente con las credenciales de Elogia (o null si no están). */
export function obtenerClienteTusDatos(): ClienteTusDatos | null {
  if (!tusDatosConfigurado()) return null;
  return clienteTusDatos({
    usuario: process.env.TUSDATOS_USUARIO!,
    clave: process.env.TUSDATOS_CLAVE!,
    baseUrl: process.env.TUSDATOS_BASE_URL || TUSDATOS_BASE_URL_DEFAULT,
  });
}
