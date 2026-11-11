import "server-only";
import {
  consultarMinisterio,
  type EstadoMinisterio,
  type SeccionMinisterio,
} from "@/lib/sicetac/ministerio";

/*
 * Herramienta del chat: dado un número de manifiesto, consulta el estado en
 * ministerio.colombiasoftware.net, extrae TODAS las secciones del acordeón
 * (clientes, tercero, remitente, destinatario, vehículo, remesa, manifiesto)
 * y arma un bloque de contexto para que la IA pueda correlacionar errores.
 *
 * Muchas veces un manifiesto "no sube" no porque falle el envío del
 * manifiesto en sí, sino porque una sección previa (típicamente Remesa)
 * tiene un error — p. ej. REM054 por carga de contenedor vacío. La IA
 * necesita ver esto para dar una respuesta útil.
 */

/** Longitud máxima del XML que mandamos por entrada (los XML son enormes). */
const MAX_XML = 6_000;

export interface AnalisisManifiesto {
  manifiesto: string;
  encontrado: boolean;
  radicado: boolean;
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
      secciones: [],
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
      secciones: [],
    };
  }

  const encontrado = estado.secciones.some((s) => s.entradas.length > 0);
  return {
    manifiesto: num,
    encontrado,
    radicado: estado.registrado,
    errorSicetac: estado.errorSicetac,
    mensaje:
      estado.mensaje ||
      (encontrado
        ? "La sección 'Envío de Manifiesto' está vacía: el manifiesto no se ha intentado enviar al RNDC. Revisa si una sección previa (Tercero, Vehículo, Remesa) está en error."
        : "No se encontró envío de este manifiesto al Ministerio."),
    secciones: estado.secciones,
  };
}

/** ¿La entrada representa un registro ingresado con éxito? */
function esExito(informacion: string) {
  return /REGISTRO INGRESADO/i.test(informacion);
}

/** Bloque legible que se adjunta al prompt de Gemini como contexto. */
export function contextoParaIA(a: AnalisisManifiesto): string {
  const lineas: string[] = [
    `Consulta a ministerio.colombiasoftware.net del manifiesto ${a.manifiesto}:`,
    `- Encontrado en el ministerio: ${a.encontrado ? "sí" : "no"}`,
    `- Sección 'Envío de Manifiesto' con radicado: ${a.radicado ? "sí" : "no"}`,
    `- Error de SICETAC (MAN045, flete bajo): ${a.errorSicetac ? "sí" : "no"}`,
    `- Mensaje del envío del manifiesto: ${a.mensaje}`,
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
