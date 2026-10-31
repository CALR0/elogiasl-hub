import "server-only";
import type { PayloadAnticipo } from "./parser.ts";
import type { FilaMigracion } from "./tipos.ts";

/*
 * Envío del anticipo al API de AWS (POST /events) y confirmación por el log
 * de la transacción (GET /logs/{id}). La x-api-key es secreta y solo vive en
 * el servidor. Portado de SMA (src/anticipos.js) sin cambios de lógica.
 */

const AWS_API_BASE =
  process.env.AWS_API_BASE ||
  "https://uss5a626ei.execute-api.sa-east-1.amazonaws.com/prod";
const X_API_KEY = process.env.X_API_KEY || "";

/** Sin llave real (o con SIMULATE_CREATE=true) no se crea nada en SAP: solo se confirma vía /logs. */
export function simulaCreacion() {
  return (
    String(process.env.SIMULATE_CREATE || "").toLowerCase() === "true" ||
    !X_API_KEY ||
    X_API_KEY === "coloca_aqui_tu_api_key"
  );
}

interface LogAws {
  status?: string;
  message?: string;
  updatedAt?: string;
  createdAt?: string;
  data?: unknown;
  entity?: unknown;
  id?: string;
  response?: { Belnr?: string };
}

async function crearAnticipo(payload: PayloadAnticipo["payload"]) {
  if (simulaCreacion())
    return {
      httpStatus: 201,
      simulado: true,
      id: payload.id ?? null,
      body: null,
    };
  const resp = await fetch(`${AWS_API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": X_API_KEY },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await resp.text().catch(() => "");
  let body: unknown = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    // Respuesta no JSON: se deja el texto
  }
  const b = body as { id?: string; Id?: string; transactionId?: string } | null;
  const id =
    (b && typeof b === "object" && (b.id || b.Id || b.transactionId)) ||
    payload.id ||
    null;
  return { httpStatus: resp.status, simulado: false, id, body };
}

/** Lectura del log de una transacción (GET público). */
async function leerLog(
  id: string,
): Promise<{ httpStatus: number | null; body: LogAws | null }> {
  const resp = await fetch(`${AWS_API_BASE}/logs/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  let body: LogAws | null = null;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  return { httpStatus: resp.status, body };
}

/**
 * SAP procesa en ~1-2 s. El /logs puede traer un resultado VIEJO de un intento
 * anterior; con `desde` (updatedAt previo al POST) solo se acepta uno posterior.
 */
async function confirmarLog(
  id: string,
  { intentos = 10, esperaMs = 1500, desde = null as string | null } = {},
) {
  let ultimo: Awaited<ReturnType<typeof leerLog>> = {
    httpStatus: null,
    body: null,
  };
  for (let i = 0; i < intentos; i++) {
    ultimo = await leerLog(id);
    const b = ultimo.body;
    if (ultimo.httpStatus === 200 && b) {
      const fresco = !desde || (b.updatedAt && b.updatedAt > desde);
      if (fresco && (b.status === "success" || b.message)) return ultimo;
    }
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaMs));
  }
  return ultimo;
}

const info = (b: LogAws) => ({
  createdAt: b.createdAt,
  data: b.data,
  entity: b.entity,
  id: b.id,
});

/**
 * Crea y confirma cada payload. No reenvía duplicados del mismo lote ni lo que
 * ya fue creado en SAP (idempotencia).
 */
export async function procesarPayloads(
  payloads: PayloadAnticipo[],
): Promise<FilaMigracion[]> {
  const filas: FilaMigracion[] = [];
  const vistos = new Set<string>();
  for (const item of payloads) {
    const id = item.payload?.id || null;
    const fila: FilaMigracion = {
      consolidado: item.consolidado,
      planilla: item.planilla,
      estado: "Error",
      httpStatus: null,
      mensaje: "",
      info: null,
      entrada: item.payload,
      simulado: false,
      enviado: false,
    };

    // 1) Duplicado dentro del mismo envío
    if (id && vistos.has(id)) {
      fila.estado = "Duplicado";
      fila.mensaje =
        "Duplicado en la lista: ya se procesó en este mismo envío. No se reenvió.";
      filas.push(fila);
      continue;
    }
    if (id) vistos.add(id);

    try {
      // Estado previo: (a) si ya es success no se recrea; (b) base para distinguir el resultado nuevo
      const previo = id ? await leerLog(id) : { httpStatus: null, body: null };

      // 2) Ya creado en SAP (no aplica en modo simulado)
      if (
        !simulaCreacion() &&
        previo.httpStatus === 200 &&
        previo.body?.status === "success"
      ) {
        const b = previo.body;
        fila.estado = "Duplicado";
        fila.httpStatus = 200;
        fila.mensaje = `Ya existe: este anticipo ya fue migrado${b.response?.Belnr ? ` (documento ${b.response.Belnr})` : ""}. No se reenvió para evitar duplicarlo.`;
        fila.info = info(b);
        filas.push(fila);
        continue;
      }

      const antes = previo.body?.updatedAt || null;
      const creado = await crearAnticipo(item.payload);
      fila.httpStatus = creado.httpStatus;
      fila.simulado = creado.simulado;
      fila.enviado = !creado.simulado;
      if (creado.httpStatus === 201 && creado.id) {
        const log = await confirmarLog(creado.id, {
          desde: creado.simulado ? null : antes,
        });
        if (log.httpStatus === 200 && log.body) {
          const b = log.body;
          fila.estado = b.status === "success" ? "Exitoso" : "Error";
          fila.mensaje = b.message || "(sin mensaje)";
          fila.info = info(b);
        } else {
          fila.mensaje = `Creado (${creado.httpStatus}) pero la confirmación falló (log ${log.httpStatus}).`;
        }
      } else {
        const b = creado.body as { message?: string } | string | null;
        fila.mensaje =
          (b && typeof b === "object" && b.message) ||
          (b ? (typeof b === "string" ? b : JSON.stringify(b)) : "") ||
          `La creación no devolvió 201 (HTTP ${creado.httpStatus}).`;
      }
    } catch (e) {
      fila.mensaje = `Error de red o de proceso: ${(e as Error).message}`;
    }
    filas.push(fila);
  }
  return filas;
}
