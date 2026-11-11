import "server-only";
import {
  consultarCumplido,
  type EstadoCumplido,
  type RemesaSilogtran,
} from "@/lib/cumplidos/pagina";
import { accesoRndc, consultarRadicadoCumplido } from "@/lib/sicetac/rndc";

/*
 * Herramienta del chat: dado el número de un manifiesto, averigua el estado
 * del CUMPLIDO en el RNDC y en la página del ministerio. Mismo patrón que
 * analizar-manifiesto.ts, pero para el proceso 6 (cumplido) y la página
 * consumoministeriocumplido.php.
 *
 * Fuentes:
 *   1. Web service RNDC (proceso 6, tipo 3 → INGRESOID): la verdad sobre si
 *      el cumplido YA está radicado. La página solo guarda intentos
 *      recientes y puede estar vacía aunque el cumplido haya subido.
 *   2. consumoministeriocumplido.php: el último mensaje del envío del
 *      cumplido del manifiesto, el XML enviado y la lista de remesas con
 *      su estado y radicado (importante porque sin cumplido en remesa el
 *      cumplido del manifiesto da CMA110).
 */

const MAX_XML = 6_000;

export interface AnalisisCumplido {
  manifiesto: string;
  encontrado: boolean;
  /** INGRESOID del cumplido en el RNDC, o null si no está radicado. */
  radicadoRndc: string | null;
  errorRndc: string | null;
  radicadoPagina: boolean;
  mensaje: string;
  /** Códigos (CMA110, CMA262, CMA273…) del último intento. */
  errores: string[];
  remesas: RemesaSilogtran[];
  xmlRecortado: string | null;
}

function recortarXml(xml: string | null) {
  if (!xml) return null;
  if (xml.length <= MAX_XML) return xml;
  const mitad = Math.floor(MAX_XML / 2) - 40;
  return `${xml.slice(0, mitad)}\n\n/* … ${xml.length - MAX_XML} caracteres omitidos … */\n\n${xml.slice(-mitad)}`;
}

async function preguntarRadicado(num: string): Promise<{
  radicado: string | null;
  error: string | null;
}> {
  const { acceso, nit } = accesoRndc(null);
  if (!acceso) return { radicado: null, error: null };
  try {
    const radicado = await consultarRadicadoCumplido(acceso, nit, num);
    return { radicado, error: null };
  } catch (e) {
    return {
      radicado: null,
      error: e instanceof Error ? e.message : "No se pudo consultar el RNDC.",
    };
  }
}

export async function analizarCumplido(
  manifiesto: string,
): Promise<AnalisisCumplido> {
  const num = manifiesto.replace(/\D/g, "");
  if (!num)
    return {
      manifiesto,
      encontrado: false,
      radicadoRndc: null,
      errorRndc: null,
      radicadoPagina: false,
      mensaje: "No se reconoció un número de manifiesto válido.",
      errores: [],
      remesas: [],
      xmlRecortado: null,
    };

  const [rndc, pagina] = await Promise.all([
    preguntarRadicado(num),
    consultarCumplido(num).catch((e): EstadoCumplido | Error =>
      e instanceof Error ? e : new Error(String(e)),
    ),
  ]);

  if (pagina instanceof Error) {
    return {
      manifiesto: num,
      encontrado: false,
      radicadoRndc: rndc.radicado,
      errorRndc: rndc.error,
      radicadoPagina: false,
      mensaje: rndc.radicado
        ? `El RNDC lo tiene radicado bajo ${rndc.radicado}. La página del cumplido no respondió: ${pagina.message}`
        : `No se pudo consultar la página del cumplido: ${pagina.message}`,
      errores: [],
      remesas: [],
      xmlRecortado: null,
    };
  }

  const encontrado = Boolean(
    pagina.remesas.length || pagina.mensaje || pagina.xml,
  );
  const mensajeFallback = rndc.radicado
    ? `El RNDC tiene el cumplido radicado bajo ${rndc.radicado}. La página está vacía (solo guarda intentos recientes).`
    : encontrado
      ? "La sección del cumplido no tiene último mensaje. Revisa si las remesas ya tienen radicado RNDC."
      : "No hay envíos de cumplido para este manifiesto y el RNDC tampoco lo tiene radicado.";

  return {
    manifiesto: num,
    encontrado,
    radicadoRndc: rndc.radicado,
    errorRndc: rndc.error,
    radicadoPagina: pagina.registrado,
    mensaje: pagina.mensaje || mensajeFallback,
    errores: pagina.errores,
    remesas: pagina.remesas,
    xmlRecortado: recortarXml(pagina.xml),
  };
}

/** Bloque legible que se adjunta al prompt como contexto del cumplido. */
export function contextoCumplidoParaIA(a: AnalisisCumplido): string {
  const lineas: string[] = [
    `Cumplido del manifiesto ${a.manifiesto}:`,
    "",
    "1. CONSULTA AL WEB SERVICE DEL RNDC (proceso 6, tipo 3):",
    a.radicadoRndc
      ? `   - Cumplido YA RADICADO en el RNDC bajo el número ${a.radicadoRndc}.`
      : a.errorRndc
        ? `   - No se pudo consultar el RNDC: ${a.errorRndc}`
        : "   - El RNDC no tiene el cumplido de este manifiesto.",
    "",
    "2. PÁGINA consumoministeriocumplido.php:",
    `   - Marca REGISTRO INGRESADO: ${a.radicadoPagina ? "sí" : "no"}`,
    `   - Códigos de error del último intento: ${a.errores.length ? a.errores.join(", ") : "(ninguno)"}`,
    `   - Último mensaje: ${a.mensaje}`,
  ];

  if (a.remesas.length) {
    lineas.push("", "Remesas del manifiesto (según Silogtran):");
    for (const r of a.remesas) {
      const rad = r.radicado ? ` · radicado RNDC: ${r.radicado}` : " · sin radicado RNDC";
      lineas.push(`   - ${r.remesa} — estado: ${r.estado || "(sin estado)"}${rad}`);
    }
  } else {
    lineas.push("", "No se listaron remesas del manifiesto.");
  }

  if (a.xmlRecortado) {
    lineas.push(
      "",
      "XML enviado del cumplido (recortado):",
      "```xml",
      a.xmlRecortado,
      "```",
    );
  }

  return lineas.join("\n");
}
