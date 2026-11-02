import * as cheerio from "cheerio";

/*
 * Página de Colombia Software con el historial de envíos del CUMPLIDO de un
 * manifiesto (consumoministeriocumplido.php). De la sección "Informacion de
 * Envio Cumplido de Manifiesto" se toma el mensaje del último intento y el
 * XML (proceso 6) del enlace "Xml"; de "Envio Cumplido de Remesa", las remesas
 * del manifiesto con el estado que les da Silogtran.
 */

const BASE =
  process.env.MINISTERIO_URL ||
  "https://ministerio.colombiasoftware.net/webservice/";
const BD = process.env.MINISTERIO_BASE || "bd_construproyec";

/** Remesa del manifiesto según Silogtran (puede decir CUMPLIDA aunque en el RNDC la hayan anulado). */
export interface RemesaSilogtran {
  remesa: string;
  estado: string;
  radicado: string | null;
}

export interface EstadoCumplido {
  /** Remesas del manifiesto (sección "Envio Cumplido de Remesa"). */
  remesas: RemesaSilogtran[];
  mensaje: string;
  xml: string | null;
  /** Códigos de error del último intento (CMA273, CMA262…). */
  errores: string[];
  registrado: boolean;
}

const desescaparHtml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Interpreta el HTML de consumoministeriocumplido.php (exportado para las pruebas). */
export function leerPaginaCumplido(html: string): EstadoCumplido {
  const $ = cheerio.load(html);
  const remesas: RemesaSilogtran[] = [];
  // Cada remesa: <li>Remesa: N</li><li>Estado: …</li><li>Radicado RNDC: …</li>
  $("h3")
    .filter((_, h) => /Envio Cumplido de Remesa/i.test($(h).text()))
    .first()
    .next()
    .find("li")
    .each((_, li) => {
      const [campo, ...resto] = $(li).text().split(":");
      const valor = resto.join(":").replace(/\s+/g, " ").trim();
      const clave = campo.replace(/\s+/g, " ").trim().toLowerCase();
      if (clave === "remesa" && /^\d+$/.test(valor))
        remesas.push({ remesa: valor, estado: "", radicado: null });
      const actual = remesas.at(-1);
      if (!actual) return;
      if (clave === "estado") actual.estado = valor;
      if (clave === "radicado rndc") actual.radicado = valor || null;
    });
  const titulo = $("h3")
    .filter((_, h) => /Envio Cumplido de Manifiesto/i.test($(h).text()))
    .first();
  if (!titulo.length)
    return { remesas, mensaje: "", xml: null, errores: [], registrado: false };
  const seccion = titulo.next();
  const mensaje = seccion
    .find("li")
    .filter((_, li) => /Informacion\s*:/i.test($(li).text()))
    .last()
    .text()
    .replace(/^[\s\S]*?Informacion\s*:/i, "")
    .replace(/\s*USUARIO:\s*\d+\s*$/i, "")
    .replace(/\s+/g, " ")
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
    // Puede venir URL-codificado (%3C…) o como texto con entidades HTML (&lt;…)
    let crudo = enlace.slice(enlace.indexOf("xml=") + 4);
    if (/%3C/i.test(crudo))
      crudo = decodeURIComponent(crudo.replace(/\+/g, " "));
    xml = desescaparHtml(crudo).trim();
  }
  return {
    remesas,
    mensaje,
    xml,
    errores: [...new Set(mensaje.match(/\b[A-Z]{3}\d{3}\b/g) ?? [])],
    registrado: /REGISTRO INGRESADO/i.test(mensaje),
  };
}

/** Consulta el estado de envío del cumplido de un manifiesto (consecutivo con 0 inicial). */
export async function consultarCumplido(manifiesto: string) {
  const url = new URL("consumoministeriocumplido.php", BASE);
  url.searchParams.set("base", BD);
  url.searchParams.set("manifiesto", manifiesto);
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok)
    throw new Error(`La consulta del cumplido respondió HTTP ${res.status}.`);
  return leerPaginaCumplido(await res.text());
}
