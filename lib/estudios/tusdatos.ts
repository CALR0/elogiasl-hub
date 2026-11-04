import "server-only";

/**
 * Cliente de TusDatos (api.tusdatos.co). Solo servidor. Se construye con
 * credenciales de la cuenta de Elogia desde las variables de entorno.
 *
 * Flujo típico (consulta individual):
 *  1. POST /api/launch → { jobid }
 *  2. GET  /api/results/{jobid} cada ~5s hasta que `estado` deje de ser
 *     "procesando" (responde 424 mientras tanto).
 *  3. Resultado final trae `id` (reportId), `hallazgos` (nivel máximo),
 *     `results` (mapa fuente → true/false/"Error") y `nombre`.
 *
 * Vehículo (combinado cabezote + propietarios + remolque): POST /api/launch/car.
 */

export type TusDatosDocType =
  | "CC"
  | "CE"
  | "NIT"
  | "PP"
  | "PPT"
  | "INT"
  | "NOMBRE";

export type TusDatosOwnerDocType = "CC" | "CE" | "NIT" | "TI";

export type TusDatosHallazgoNivel = "alto" | "medio" | "bajo" | "info" | "";

export class TusDatosError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "TusDatosError";
  }
  /** 424: la consulta aún no está lista. */
  get noLista() {
    return this.status === 424;
  }
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
  doc: string;
}

export interface EstadoConsulta {
  /** reportId: se usa para /api/v2/report_json, /api/retry, etc. */
  id: string;
  estado: "procesando" | "finalizado" | "error";
  error: boolean;
  errores?: string[];
  hallazgo: boolean;
  hallazgos: TusDatosHallazgoNivel;
  nombre?: string;
  typedoc?: string;
  /** true = hallazgo, false = sin hallazgo, "Error" = la fuente falló */
  results?: Record<string, boolean | "Error">;
}

export interface TusDatosConfig {
  usuario: string;
  clave: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Base oficial del API de TusDatos (ver docs.tusdatos.co). */
export const TUSDATOS_BASE_URL_DEFAULT = "https://dash-board.tusdatos.co";

export function clienteTusDatos({
  usuario,
  clave,
  baseUrl = TUSDATOS_BASE_URL_DEFAULT,
  timeoutMs = 30_000,
}: TusDatosConfig) {
  const auth =
    "Basic " + Buffer.from(`${usuario}:${clave}`).toString("base64");

  async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${baseUrl}${ruta}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: auth,
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const detalle =
        (body &&
          typeof body === "object" &&
          ("error" in body
            ? (body as { error: unknown }).error
            : "detail" in body
              ? (body as { detail: unknown }).detail
              : null)) ||
        res.statusText;
      throw new TusDatosError(
        `TusDatos ${res.status} en ${ruta}: ${JSON.stringify(detalle)}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as T;
  }

  return {
    /** Lanza una consulta individual. Devuelve jobid (vigencia 2h). */
    lanzarIndividual(
      input: LanzamientoIndividual,
    ): Promise<{ jobid: string; typedoc: string; validado?: boolean }> {
      return pedir("/api/launch", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    /** Lanza una consulta de vehículo + propietario. */
    lanzarVehiculo(
      input: LanzamientoVehiculo,
    ): Promise<{ jobid: string; placa: string; typedoc: string }> {
      return pedir("/api/launch/car", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    /** Estado de la consulta. Mientras procesa, devuelve 424 (noLista). */
    estado(jobid: string): Promise<EstadoConsulta> {
      return pedir(`/api/results/${encodeURIComponent(jobid)}`);
    },
    /** Créditos restantes. */
    creditos(): Promise<{ amount: number }> {
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

/**
 * Espera hasta que la consulta esté lista o se agote el tiempo. Devuelve el
 * último estado conocido. 424 significa "aún procesa" — se espera y reintenta.
 */
export async function esperarConsulta(
  cliente: ClienteTusDatos,
  jobid: string,
  { maxEsperaMs = 90_000, intervaloMs = 4_000 }: { maxEsperaMs?: number; intervaloMs?: number } = {},
): Promise<EstadoConsulta> {
  const limite = Date.now() + maxEsperaMs;
  let ultimo: EstadoConsulta | null = null;
  while (Date.now() < limite) {
    try {
      const estado = await cliente.estado(jobid);
      ultimo = estado;
      if (estado.estado !== "procesando") return estado;
    } catch (e) {
      if (e instanceof TusDatosError && e.noLista) {
        // aún no lista, seguir esperando
      } else {
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  if (!ultimo) {
    throw new TusDatosError(
      "La consulta aún no está lista tras el tiempo de espera.",
      424,
      null,
    );
  }
  return ultimo;
}
