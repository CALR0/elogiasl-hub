import * as cheerio from "cheerio";
import { normalizarPlanilla, type TipoBusqueda } from "./planilla.ts";

/** Anticipo encontrado en el Log de la Interfaz de Silogtran. */
export interface PayloadAnticipo {
  planilla: string;
  consolidado: string | null;
  payload: {
    id?: string;
    type?: string;
    data?: Record<string, unknown>;
  } & Record<string, unknown>;
}

/**
 * En cada fila del grid, el "Documento" (consolidado) viene en un input
 * hl_documento cuyo value trae un <a ...contra_codigo=NNN>NNN</a> escapado.
 */
function extraerConsolidado($: cheerio.CheerioAPI, idTextarea: string) {
  const idDoc = idTextarea.replace("_hl_parametrosentrada", "_hl_documento");
  const v = $(`#${idDoc}`).attr("value") || "";
  const m =
    v.match(/contra_codigo=(\d+)/) || v.replace(/<[^>]*>/g, " ").match(/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Extrae los payloads de anticipos de flota de tercero (create o update) del
 * HTML de resultados; descarta los GET LogById. Una planilla puede traer
 * varias transferencias de consolidados distintos (una fila por cada una).
 * Portado de SMA (parsearPayloads).
 */
export function parsearPayloads(
  html: string,
  tipo: TipoBusqueda,
  valor: string,
) {
  const $ = cheerio.load(html);
  const resultados: PayloadAnticipo[] = [];
  $("textarea").each((_, el) => {
    const id = $(el).attr("id") || "";
    if (!id.includes("hl_parametrosentrada")) return;
    let payload: PayloadAnticipo["payload"];
    try {
      // .text() decodifica el JSON que viene HTML-escapado (&quot;)
      payload = JSON.parse($(el).text());
    } catch {
      return;
    }
    if (!/^Anticipo\w*Set\.(create|update)$/.test(String(payload?.type || "")))
      return;
    resultados.push({
      planilla: normalizarPlanilla(
        (payload?.data as { Zplanilla?: string } | undefined)?.Zplanilla ||
          (tipo === "planilla" ? valor : "?"),
      ),
      consolidado: tipo === "consolidado" ? valor : extraerConsolidado($, id),
      payload,
    });
  });
  return resultados;
}
