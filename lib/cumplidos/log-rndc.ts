/*
 * Log de envíos al RNDC que guarda Silogtran (Maestros › Visor Log Interfaz
 * RNDC). La pantalla consulta una API GraphQL de Colombia Software
 * (getLogRndc) con el JWT "token_fenix" que entrega la propia página; aquí se
 * hace lo mismo para tomar el XML del último intento de un documento (p. ej.
 * el cumplido de una remesa, que Silogtran ya no vuelve a enviar si quedó con
 * radicado aunque en el RNDC lo hayan anulado).
 */

const GRAPHQL =
  process.env.SILOG_GRAPHQL_URL ||
  "https://serviciosfx.colombiasoftware.net:8000/graphql_servicios/";
const BD = process.env.MINISTERIO_BASE || "bd_construproyec";
/** Años hacia atrás que se buscan en el log. */
const ANOS_LOG = 2;

// El JWT dura ~1 h: se reutiliza (por instancia) hasta 5 min antes de vencer,
// así no se carga la página del visor de Silogtran en cada cumplido
let tokenEnMemoria: { valor: string; vence: number } | null = null;

/** Momento (ms) en que vence un JWT según su "exp"; 0 si no se puede leer. */
function venceJwt(token: string) {
  try {
    const carga = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as { exp?: number };
    return carga.exp ? carga.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Token del visor vigente: el guardado o uno nuevo con `obtener`. */
export async function tokenVisorVigente(obtener: () => Promise<string>) {
  if (tokenEnMemoria && tokenEnMemoria.vence - 5 * 60_000 > Date.now())
    return tokenEnMemoria.valor;
  const valor = await obtener();
  const vence = venceJwt(valor) || Date.now() + 30 * 60_000;
  tokenEnMemoria = { valor, vence };
  return valor;
}

/** Olvida el token (p. ej. si la API lo rechazó). */
export function olvidarTokenVisor() {
  tokenEnMemoria = null;
}

export type TipoDocumentoLog = "CUMPLIDOREMESA" | "CUMPLIDOMANIFIESTO";

export interface EnvioLog {
  request: string;
  response: string;
  radicado: string | null;
  /** "AAAA-MM-DD HH:MM:SS" */
  fecha: string;
}

interface FilaLog {
  logmin_request?: string;
  logmin_response?: string;
  logmin_radicado?: string | null;
  logmin_fecha?: string;
  logmin_hora?: string;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
// Literal GraphQL: solo dígitos/letras, así no hay inyección en la consulta
const literal = (s: string) => JSON.stringify(s.replace(/[^\w-]/g, ""));

/** Intentos registrados en el log para un documento, del más reciente al más antiguo. */
export async function buscarLogRndc(
  token: string,
  tipo: TipoDocumentoLog,
  documento: string,
): Promise<EnvioLog[]> {
  const hoy = new Date(Date.now() - 5 * 3600_000); // hora de Colombia
  const desde = new Date(hoy);
  desde.setUTCFullYear(hoy.getUTCFullYear() - ANOS_LOG);
  const query =
    "query QueryLog { getLogRndc(input: {" +
    `baseDatos: ${literal(BD)}, fechaInicio: ${literal(dia(desde))}, ` +
    `fechaFin: ${literal(dia(hoy))}, documento: ${literal(documento)}, ` +
    `tipoDocumento: ${literal(tipo)}}) { resultados } }`;
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: {} }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403) olvidarTokenVisor();
  if (!res.ok)
    throw new Error(`El log RNDC de Silogtran respondió HTTP ${res.status}.`);
  const data = (await res.json()) as {
    data?: { getLogRndc?: { resultados?: unknown } };
    errors?: { message?: string }[];
  };
  if (data.errors?.length)
    throw new Error(
      `El log RNDC de Silogtran respondió: ${data.errors[0]?.message ?? "error"}.`,
    );
  let filas = data.data?.getLogRndc?.resultados ?? [];
  if (typeof filas === "string") filas = JSON.parse(filas);
  if (!Array.isArray(filas)) return [];
  return (filas as FilaLog[])
    .filter((f) => f.logmin_request)
    .map((f) => ({
      request: f.logmin_request!.trim(),
      response: (f.logmin_response ?? "").trim(),
      radicado: f.logmin_radicado || null,
      fecha:
        `${f.logmin_fecha ?? ""} ${(f.logmin_hora ?? "").slice(0, 8)}`.trim(),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
