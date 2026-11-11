import "server-only";
import {
  consultarMinisterio,
  type EstadoMinisterio,
  type SeccionMinisterio,
} from "@/lib/sicetac/ministerio";
import { accesoRndc, consultarRadicado } from "@/lib/sicetac/rndc";

/*
 * Herramienta del chat: dado un número de manifiesto, averigua su estado real
 * en el RNDC y en la página de consumoministerio.php, y arma un bloque de
 * contexto para que la IA correlacione errores.
 *
 * Fuentes:
 *   1. Web service RNDC (proceso 4, tipo 3 → INGRESOID): la verdad sobre si
 *      está RADICADO. La página del ministerio solo muestra intentos
 *      recientes y puede estar en blanco aunque el manifiesto ya haya subido
 *      hace tiempo, por lo que no basta con mirar el acordeón.
 *   2. consumoministerio.php: las 7 secciones del acordeón (clientes,
 *      tercero, remitente, destinatario, vehículo, remesa, manifiesto),
 *      cada una con sus registros, mensajes y XML enviado. Sirve para ver
 *      qué error devolvió el último intento cuando aún no está radicado,
 *      o para ubicar un REMxxx aguas arriba.
 *
 * Ambas se consultan en paralelo. Si el RNDC dice que hay radicado, es
 * la fuente de verdad: el chat debe decirlo aunque la página esté vacía.
 */

/** Longitud máxima del XML que mandamos por entrada (los XML son enormes). */
const MAX_XML = 6_000;

export interface AnalisisManifiesto {
  manifiesto: string;
  /** La página tiene al menos un registro (en cualquier sección). */
  encontrado: boolean;
  /**
   * El RNDC devolvió INGRESOID (proceso 4, tipo 3) → el manifiesto YA está
   * radicado. Es la verdad definitiva: null si el RNDC no lo tiene, o si no
   * se pudo consultar (sin credenciales, red caída…).
   */
  radicadoRndc: string | null;
  /** Hubo un error al consultar el RNDC (lo contamos en el contexto). */
  errorRndc: string | null;
  /** Dice "REGISTRO INGRESADO" en la sección Manifiesto del acordeón. */
  radicadoPagina: boolean;
  errorSicetac: boolean;
  /** Último mensaje de la sección "Envío de Manifiesto" (resumen compacto). */
  mensaje: string;
  /** Las 7 secciones con todos los registros, para que la IA correlacione. */
  secciones: SeccionMinisterio[];
}

/** Extrae el primer número de 5–20 dígitos del texto (número de manifiesto). */
export function detectarManifiesto(texto: string): string | null {
  const m = /\b(\d{5,20})\b/.exec(texto);
  return m ? m[1] : null;
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
  // El acceso al RNDC sale de las variables de entorno. Si no están, no
  // podemos consultar el web service directo.
  const { acceso, nit } = accesoRndc(null);
  if (!acceso) return { radicado: null, error: null };
  try {
    const radicado = await consultarRadicado(acceso, nit, num);
    return { radicado, error: null };
  } catch (e) {
    return {
      radicado: null,
      error: e instanceof Error ? e.message : "No se pudo consultar el RNDC.",
    };
  }
}

export async function analizarManifiesto(
  manifiesto: string,
): Promise<AnalisisManifiesto> {
  const num = manifiesto.replace(/\D/g, "");
  if (!num)
    return {
      manifiesto,
      encontrado: false,
      radicadoRndc: null,
      errorRndc: null,
      radicadoPagina: false,
      errorSicetac: false,
      mensaje: "No se reconoció un número de manifiesto válido.",
      secciones: [],
    };

  // Las dos consultas en paralelo: una no bloquea la otra.
  const [rndc, pagina] = await Promise.all([
    preguntarRadicado(num),
    consultarMinisterio(num).catch((e): EstadoMinisterio | Error =>
      e instanceof Error ? e : new Error(String(e)),
    ),
  ]);

  // Si la página falló y además el RNDC no dio radicado, respondemos con lo
  // poco que tengamos y el mensaje del error.
  if (pagina instanceof Error) {
    return {
      manifiesto: num,
      encontrado: false,
      radicadoRndc: rndc.radicado,
      errorRndc: rndc.error,
      radicadoPagina: false,
      errorSicetac: false,
      mensaje: rndc.radicado
        ? `El RNDC lo tiene radicado bajo ${rndc.radicado}. La página del ministerio no respondió: ${pagina.message}`
        : `No se pudo consultar el ministerio: ${pagina.message}`,
      secciones: [],
    };
  }

  const encontrado = pagina.secciones.some((s) => s.entradas.length > 0);
  const mensajeFallback = rndc.radicado
    ? `El RNDC tiene este manifiesto radicado bajo ${rndc.radicado}. La página del ministerio está vacía (solo guarda intentos recientes).`
    : encontrado
      ? "La sección 'Envío de Manifiesto' está vacía: el manifiesto no se ha intentado enviar al RNDC. Revisa si una sección previa (Tercero, Vehículo, Remesa) está en error."
      : "No se encontró envío de este manifiesto al Ministerio y el RNDC tampoco lo tiene radicado.";

  return {
    manifiesto: num,
    encontrado,
    radicadoRndc: rndc.radicado,
    errorRndc: rndc.error,
    radicadoPagina: pagina.registrado,
    errorSicetac: pagina.errorSicetac,
    mensaje: pagina.mensaje || mensajeFallback,
    secciones: pagina.secciones,
  };
}

/** ¿La entrada representa un registro ingresado con éxito? */
function esExito(informacion: string) {
  return /REGISTRO INGRESADO/i.test(informacion);
}

/** Bloque legible que se adjunta al prompt de Gemini como contexto. */
export function contextoParaIA(a: AnalisisManifiesto): string {
  const lineas: string[] = [
    `Datos del manifiesto ${a.manifiesto}:`,
    "",
    "1. CONSULTA AL WEB SERVICE DEL RNDC (fuente de verdad del Ministerio):",
    a.radicadoRndc
      ? `   - Manifiesto YA RADICADO en el RNDC bajo el número ${a.radicadoRndc}.`
      : a.errorRndc
        ? `   - No se pudo consultar el RNDC: ${a.errorRndc}`
        : "   - El RNDC no tiene este manifiesto registrado (aún no se ha radicado).",
    "",
    "2. PÁGINA ministerio.colombiasoftware.net (acordeón con los últimos intentos):",
    `   - Encontrado en la página: ${a.encontrado ? "sí" : "no"}`,
    `   - Sección 'Envío de Manifiesto' marca REGISTRO INGRESADO: ${a.radicadoPagina ? "sí" : "no"}`,
    `   - Error de SICETAC (MAN045, flete bajo): ${a.errorSicetac ? "sí" : "no"}`,
    `   - Mensaje del envío del manifiesto: ${a.mensaje}`,
    "",
    "Secciones del acordeón (en orden de dependencia):",
  ];

  // Recorremos todas las secciones aunque estén vacías: la IA debe saberlo
  // para distinguir "no se intentó" de "se intentó y salió bien/mal".
  for (const s of a.secciones) {
    if (s.vacia) {
      lineas.push(`\n• ${s.titulo}: sin registros.`);
      continue;
    }
    const conError = s.entradas.filter((e) => e.codigosError.length > 0);
    const resumen = conError.length
      ? `${s.entradas.length} registro(s), ${conError.length} con error`
      : `${s.entradas.length} registro(s), todos ingresados`;
    lineas.push(`\n• ${s.titulo} — ${resumen}:`);
    for (const e of s.entradas) {
      const estado = esExito(e.informacion)
        ? "OK"
        : e.codigosError.length
          ? `ERROR ${e.codigosError.join(", ")}`
          : "SIN CONFIRMAR";
      const doc = e.documento ? ` doc=${e.documento}` : "";
      const cod = e.codigo ? ` cod=${e.codigo}` : "";
      lineas.push(`  - [${estado}]${doc}${cod} ${e.informacion}`);
    }
  }

  // Solo adjuntamos los XML de las entradas CON ERROR (lo útil para analizar)
  // y uno del manifiesto si está, para que la IA pueda apuntar al dato malo.
  const xmlsRelevantes: { titulo: string; documento: string | null; xml: string }[] = [];
  for (const s of a.secciones) {
    for (const e of s.entradas) {
      if (!e.xml) continue;
      const enError = e.codigosError.length > 0 && !esExito(e.informacion);
      if (enError)
        xmlsRelevantes.push({ titulo: s.titulo, documento: e.documento, xml: e.xml });
    }
  }
  if (xmlsRelevantes.length) {
    lineas.push("", "XML del/los envíos con error (recortados):");
    for (const x of xmlsRelevantes.slice(0, 3)) {
      lineas.push(
        "",
        `--- ${x.titulo}${x.documento ? ` (${x.documento})` : ""} ---`,
        "```xml",
        recortarXml(x.xml) ?? "",
        "```",
      );
    }
  }

  return lineas.join("\n");
}
