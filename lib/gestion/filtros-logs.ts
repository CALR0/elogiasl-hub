import { z } from "zod";
import type { FiltrosLogs } from "./tipos";

/** Lee y valida los filtros del visor desde la URL (lo inválido se ignora). */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquema = z.object({
  desde: fecha.optional().catch(undefined),
  hasta: fecha.optional().catch(undefined),
  usuario: z.email().max(254).optional().catch(undefined),
  modulo: z
    .string()
    .regex(/^[a-z0-9.-]{1,120}$/)
    .optional()
    .catch(undefined),
  accion: z
    .string()
    .regex(/^[a-z0-9._-]{1,60}$/)
    .optional()
    .catch(undefined),
  resultado: z.enum(["ok", "error", "denegado"]).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(100_000).catch(1),
});

type Parametros = Record<string, string | string[] | undefined>;

export function leerFiltros(sp: Parametros): FiltrosLogs & { pagina: number } {
  const uno = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) || undefined;
  return esquema.parse(
    Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, uno(v)])),
  );
}

/** Querystring de los filtros (sin vacíos), opcionalmente con otra página. */
export function aQuery(f: FiltrosLogs, pagina?: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v && k !== "pagina") p.set(k, String(v));
  if (pagina && pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return s ? `?${s}` : "";
}
