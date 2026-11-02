import * as cheerio from "cheerio";

/*
 * Página de Colombia Software con el historial de envíos al Ministerio de un
 * manifiesto (consumoministerio.php). De la sección "Informacion de Envio de
 * Manifiesto" se toma el mensaje del último intento y el XML enviado (viene
 * en el enlace "Xml" → consumoministerioxml.php?xml=…).
 */

const BASE =
  process.env.MINISTERIO_URL ||
  "https://ministerio.colombiasoftware.net/webservice/";
const BD = process.env.MINISTERIO_BASE || "bd_construproyec";

export interface EstadoMinisterio {
  /** Texto del último intento de envío del manifiesto (error o registro). */
  mensaje: string;
  /** XML del manifiesto (proceso 4), o null si la página no lo trae. */
  xml: string | null;
  errorSicetac: boolean;
  /** Ya quedó registrado ("REGISTRO INGRESADO"). */
  registrado: boolean;
}

/** Interpreta el HTML de consumoministerio.php (exportado para las pruebas). */
export function leerPaginaMinisterio(html: string): EstadoMinisterio {
  const $ = cheerio.load(html);
  const titulo = $("h3")
    .filter((_, h) => /Envio de Manifiesto/i.test($(h).text()))
    .first();
  if (!titulo.length)
    return { mensaje: "", xml: null, errorSicetac: false, registrado: false };
  const seccion = titulo.next();
  const crudo = seccion
    .find("li")
    .filter((_, li) => /Informacion\s*:/i.test($(li).text()))
    .last()
    .text()
    .replace(/^[\s\S]*?Informacion\s*:/i, "")
    .replace(/\s+/g, " ");
  // El mensaje trae restos del XML de respuesta ("?xml … root ErrorError MAN045: … /root")
  const codigo =
    /([A-Z]{3}\d{3}:[\s\S]*?)(?:\s*Usuario:|\s*\/Error|\s*\/root|$)/.exec(
      crudo,
    );
  const info = codigo
    ? `Error ${codigo[1].trim()}`
    : crudo
        .replace(/\?xml[^?]*\?/g, "")
        .replace(/\/?root/g, "")
        .trim();
  const enlace = seccion
    .find("a")
    .filter((_, a) =>
      /consumoministerioxml\.php\?xml=/i.test($(a).attr("href") || ""),
    )
    .last()
    .attr("href");
  let xml: string | null = null;
  if (enlace) {
    const crudo = enlace.slice(enlace.indexOf("xml=") + 4);
    xml = decodeURIComponent(crudo.replace(/\+/g, " "));
  }
  return {
    mensaje: info,
    xml,
    errorSicetac: /MAN045/i.test(info),
    registrado: /REGISTRO INGRESADO/i.test(info),
  };
}

/** Consulta el estado de envío de un manifiesto (consecutivo con 0 inicial). */
export async function consultarMinisterio(manifiesto: string) {
  const url = new URL("consumoministerio.php", BASE);
  url.searchParams.set("base", BD);
  url.searchParams.set("documento", manifiesto);
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok)
    throw new Error(`La consulta al ministerio respondió HTTP ${res.status}.`);
  const html = await res.text(); // UTF-8
  return leerPaginaMinisterio(html);
}
