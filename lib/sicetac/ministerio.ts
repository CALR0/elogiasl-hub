import * as cheerio from "cheerio";

/*
 * Página de Colombia Software con TODO el historial de envíos al Ministerio
 * para un manifiesto (consumoministerio.php). La página es un acordeón de
 * secciones:
 *   - Informacion de Envio de Clientes
 *   - Informacion de Envio de Tercero       (conductor, titular, etc.)
 *   - Informacion de Envio de Remitente
 *   - Informacion de Envio de Destinatario
 *   - Informacion de Envio de Vehiculo      (cabezote y remolque)
 *   - Informacion de Envio de Remesa        (a veces trae el error real)
 *   - Informacion de Envio de Manifiesto    (el que nos interesa principal)
 *
 * Cada sección puede tener 0..N registros, cada uno con su mensaje
 * ("REGISTRO INGRESADO. CODIGO DEL MINISTERIO ..." o "ErrorError MAN045: ...")
 * y, cuando aplica, un enlace al XML enviado. El manifiesto puede quedarse
 * sin radicar porque ALGUNA de las otras secciones (p. ej. una remesa con
 * REM054) venga en error, así que para analizar bien hay que leerlas todas.
 */

const BASE =
  process.env.MINISTERIO_URL ||
  "https://ministerio.colombiasoftware.net/webservice/";
const BD = process.env.MINISTERIO_BASE || "bd_construproyec";

export interface EntradaSeccion {
  /** Identificador del registro en esa sección (placa, NIT, nº remesa…). */
  documento: string | null;
  /** Código interno de Colombia Software (no el del Ministerio). */
  codigo: string | null;
  /** Mensaje del último intento: "REGISTRO INGRESADO…" o el error devuelto. */
  informacion: string;
  /** XML enviado al RNDC si la página lo trae; null si no. */
  xml: string | null;
  /** Códigos de error detectados en informacion (MAN045, REM054, VEH003…). */
  codigosError: string[];
}

export interface SeccionMinisterio {
  titulo: string;
  entradas: EntradaSeccion[];
  /** true si la sección literalmente dice "No hay Informacion para Enviar". */
  vacia: boolean;
}

export interface EstadoMinisterio {
  /** Mensaje del último intento de ENVÍO DE MANIFIESTO (compat. con servicio.ts). */
  mensaje: string;
  /** XML del manifiesto (si está); null si no. */
  xml: string | null;
  errorSicetac: boolean;
  /** Ya quedó registrado ("REGISTRO INGRESADO") el manifiesto. */
  registrado: boolean;
  /** Las 7 secciones del acordeón, para análisis más fino. */
  secciones: SeccionMinisterio[];
}

/** Extrae los códigos XXX999 de un mensaje (MAN045, REM054, VEH003…). */
export function codigosDeError(texto: string): string[] {
  const set = new Set<string>();
  const re = /\b([A-Z]{3}\d{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) set.add(m[1]);
  return [...set];
}

/** Limpia el "Informacion" dejando solo lo útil (sin los restos del XML de respuesta). */
function limpiarInformacion(crudo: string): string {
  const texto = crudo.replace(/\s+/g, " ").trim();
  // Caso frecuente: "?xml … root ErrorError REM054: … /Error /root …"
  const codigo = /([A-Z]{3}\d{3}:[\s\S]*?)(?:\s*Usuario:|\s*\/Error|\s*\/root|$)/.exec(
    texto,
  );
  if (codigo) return `Error ${codigo[1].trim()}`;
  return texto
    .replace(/\?xml[^?]*\?/g, "")
    .replace(/\/?root/g, "")
    .replace(/\/?Error/g, "")
    .trim();
}

/**
 * Decodifica una cadena URL-encoded cuyo contenido viene en bytes ISO-8859-1
 * (lo que usa el RNDC: el XML declara encoding='ISO-8859-1'). No podemos usar
 * decodeURIComponent porque espera UTF-8 y tira "URI malformed" con
 * secuencias como %CD (que en latin1 es Í).
 */
function decodificarLatin1(encoded: string): string {
  const s = encoded.replace(/\+/g, " ");
  const bytes: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "%" && i + 2 < s.length) {
      const h = s.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(h)) {
        bytes.push(parseInt(h, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(s.charCodeAt(i) & 0xff);
    i++;
  }
  return Buffer.from(bytes).toString("latin1");
}

function extraerXml(href: string | undefined): string | null {
  if (!href) return null;
  const i = href.indexOf("xml=");
  if (i < 0) return null;
  try {
    return decodificarLatin1(href.slice(i + 4));
  } catch {
    return null;
  }
}

/** Interpreta el HTML de consumoministerio.php (exportado para las pruebas). */
export function leerPaginaMinisterio(html: string): EstadoMinisterio {
  const $ = cheerio.load(html);

  // Sacamos cada h3 y su div hermano (el acordeón). Como el HTML suelto puede
  // venir sin cerrar bien, cheerio igual asocia el div siguiente al h3.
  const secciones: SeccionMinisterio[] = [];
  $("#accordion h3").each((_, h3) => {
    const titulo = $(h3).text().trim();
    const div = $(h3).next("div");
    const textoPlano = div.text();
    const vacia = /No hay Informacion para Enviar/i.test(textoPlano);
    const entradas: EntradaSeccion[] = [];
    if (!vacia) {
      // Cada registro es un <ul> con 3 <li> (Documento, Codigo, Informacion)
      // seguido de un <a> con el XML. Recorremos los <ul>.
      div.find("ul").each((_, ul) => {
        const li = $(ul).find("li");
        const leer = (etiqueta: RegExp) => {
          const l = li
            .filter((_, el) => etiqueta.test($(el).text()))
            .first()
            .text();
          return l.replace(/^[^:]*:/, "").trim();
        };
        const documento = leer(/Documento/i) || null;
        const codigo = leer(/^(?!.*Codigo del Ministerio)Codigo/i) || null;
        const infoCrudo = li
          .filter((_, el) => /Informacion\s*:/i.test($(el).text()))
          .first()
          .text()
          .replace(/^[\s\S]*?Informacion\s*:/i, "");
        const informacion = limpiarInformacion(infoCrudo);
        const xml = extraerXml(
          $(ul)
            .find("a")
            .filter((_, a) =>
              /consumoministerioxml\.php\?xml=/i.test($(a).attr("href") || ""),
            )
            .last()
            .attr("href"),
        );
        entradas.push({
          documento,
          codigo,
          informacion,
          xml,
          codigosError: codigosDeError(informacion),
        });
      });
      // Caso viejo: a veces los <li> no vienen envueltos en <ul>
      if (!entradas.length && /Informacion\s*:/i.test(textoPlano)) {
        const infoCrudo = div
          .find("li")
          .filter((_, el) => /Informacion\s*:/i.test($(el).text()))
          .last()
          .text()
          .replace(/^[\s\S]*?Informacion\s*:/i, "");
        const informacion = limpiarInformacion(infoCrudo);
        const xml = extraerXml(
          div
            .find("a")
            .filter((_, a) =>
              /consumoministerioxml\.php\?xml=/i.test($(a).attr("href") || ""),
            )
            .last()
            .attr("href"),
        );
        entradas.push({
          documento: null,
          codigo: null,
          informacion,
          xml,
          codigosError: codigosDeError(informacion),
        });
      }
    }
    secciones.push({ titulo, entradas, vacia });
  });

  // Compatibilidad con servicio.ts: el "Envío de Manifiesto" es el principal.
  const manifiesto = secciones.find((s) => /Manifiesto/i.test(s.titulo));
  const ultima = manifiesto?.entradas[manifiesto.entradas.length - 1];
  const mensaje = ultima?.informacion ?? "";
  const xml = ultima?.xml ?? null;
  const errorSicetac = /\bMAN045\b/i.test(mensaje);
  const registrado = /REGISTRO INGRESADO/i.test(mensaje);

  return { mensaje, xml, errorSicetac, registrado, secciones };
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
