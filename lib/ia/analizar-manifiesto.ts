import "server-only";
import { consultarMinisterio, type EstadoMinisterio } from "@/lib/sicetac/ministerio";

/*
 * Herramienta del chat: dado un número de manifiesto, consulta el estado en
 * ministerio.colombiasoftware.net y arma un bloque de contexto que la IA
 * puede leer para explicar al usuario qué pasó.
 *
 * - Si está REGISTRO INGRESADO: devuelve el mensaje con el radicado.
 * - Si tiene error: devuelve mensaje + un recorte del XML enviado (acotado
 *   para no gastar tokens) para que la IA pueda apuntar al dato equivocado.
 */

/** Longitud máxima del XML que mandamos al prompt (los XML suelen ser enormes). */
const MAX_XML = 8_000;

export interface AnalisisManifiesto {
  manifiesto: string;
  encontrado: boolean;
  radicado: boolean;
  errorSicetac: boolean;
  mensaje: string;
  xmlRecortado: string | null;
}

/** Extrae el primer número de 5–20 dígitos del texto (número de manifiesto). */
export function detectarManifiesto(texto: string): string | null {
  const m = /\b(\d{5,20})\b/.exec(texto);
  return m ? m[1] : null;
}

function recortarXml(xml: string | null) {
  if (!xml) return null;
  if (xml.length <= MAX_XML) return xml;
  // Deja el inicio (cabecera) y el final (remesas finales) con un corte visible
  const mitad = Math.floor(MAX_XML / 2) - 40;
  return `${xml.slice(0, mitad)}\n\n/* … ${xml.length - MAX_XML} caracteres omitidos … */\n\n${xml.slice(-mitad)}`;
}

export async function analizarManifiesto(
  manifiesto: string,
): Promise<AnalisisManifiesto> {
  const num = manifiesto.replace(/\D/g, "");
  if (!num)
    return {
      manifiesto,
      encontrado: false,
      radicado: false,
      errorSicetac: false,
      mensaje: "No se reconoció un número de manifiesto válido.",
      xmlRecortado: null,
    };

  let estado: EstadoMinisterio;
  try {
    estado = await consultarMinisterio(num);
  } catch (e) {
    return {
      manifiesto: num,
      encontrado: false,
      radicado: false,
      errorSicetac: false,
      mensaje:
        e instanceof Error
          ? `No se pudo consultar el ministerio: ${e.message}`
          : "No se pudo consultar el ministerio.",
      xmlRecortado: null,
    };
  }

  const encontrado = Boolean(estado.mensaje || estado.xml);
  return {
    manifiesto: num,
    encontrado,
    radicado: estado.registrado,
    errorSicetac: estado.errorSicetac,
    mensaje:
      estado.mensaje ||
      (encontrado
        ? "(el ministerio no devolvió texto del último envío)"
        : "No se encontró envío de este manifiesto al ministerio."),
    xmlRecortado: recortarXml(estado.xml),
  };
}

/** Bloque legible que se adjunta al prompt de Gemini como contexto. */
export function contextoParaIA(a: AnalisisManifiesto): string {
  const lineas = [
    `Consulta a ministerio.colombiasoftware.net del manifiesto ${a.manifiesto}:`,
    `- Encontrado: ${a.encontrado ? "sí" : "no"}`,
    `- Ya radicado: ${a.radicado ? "sí" : "no"}`,
    `- Error de SICETAC (MAN045, flete bajo): ${a.errorSicetac ? "sí" : "no"}`,
    `- Último mensaje del ministerio: ${a.mensaje}`,
  ];
  if (a.xmlRecortado) {
    lineas.push(
      "",
      "XML del último envío (puede estar recortado):",
      "```xml",
      a.xmlRecortado,
      "```",
    );
  }
  return lineas.join("\n");
}
