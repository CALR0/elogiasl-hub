import { etiqueta } from "../sicetac/rndc.ts";

/*
 * XML del cumplido de manifiesto (proceso 6 del RNDC) tal como lo arma
 * Colombia Software. Solo se corrigen las retenciones que pide el error:
 *   - CMA273 (RETENCIONFOPAT sin decimales / redondeada): FOPAT y retención
 *     en la fuente, calculadas sobre el flete pactado que tiene el RNDC.
 *   - CMA262 (falta la retención en la fuente): solo la retención en la fuente.
 * FOPAT = 0,1 % y retención en la fuente = 1 % del flete, al peso más próximo.
 */

export const ERRORES_CORREGIBLES = ["CMA273", "CMA262"] as const;
/**
 * Errores con los que se procesa el cumplido: los de retenciones y CMA110 (el
 * manifiesto no tiene remesas cumplidas): las remesas se cumplen primero y, sin
 * error de retenciones, el XML del manifiesto se reenvía tal cual.
 */
export const ERRORES_PROCESABLES = [...ERRORES_CORREGIBLES, "CMA110"] as const;

const entero = (s: string | null) =>
  s == null || s.trim() === ""
    ? null
    : Number.parseInt(s.replace(/[^\d]/g, ""), 10);

export function retencionesDelXml(xml: string) {
  return {
    fopat: entero(etiqueta(xml, "RETENCIONFOPAT")),
    fuente: entero(etiqueta(xml, "RETENCIONFUENTEMANIFIESTO")),
  };
}

/** Qué retenciones corregir según los errores del último intento. */
export function correcciones(errores: string[], flete: number) {
  const fopat = errores.includes("CMA273");
  const fuente = fopat || errores.includes("CMA262");
  return {
    ...(fopat && { fopat: Math.round(flete * 0.001) }),
    ...(fuente && { fuente: Math.round(flete * 0.01) }),
  } as { fopat?: number; fuente?: number };
}

/** Reemplaza la etiqueta o, si no viene, la agrega al final de <variables>. */
function fijar(xml: string, nombre: string, valor: number) {
  const re = new RegExp(`(<${nombre}>)[^<]*(<\\/${nombre}>)`, "i");
  if (re.test(xml)) return xml.replace(re, `$1${valor}$2`);
  if (!/<\/variables>/i.test(xml))
    throw new Error("El XML del cumplido no trae la sección <variables>.");
  return xml.replace(
    /<\/variables>/i,
    `<${nombre}>${valor}</${nombre}></variables>`,
  );
}

export function ajustarCumplido(
  xml: string,
  c: ReturnType<typeof correcciones>,
) {
  let x = xml;
  if (c.fopat != null) x = fijar(x, "RETENCIONFOPAT", c.fopat);
  if (c.fuente != null) x = fijar(x, "RETENCIONFUENTEMANIFIESTO", c.fuente);
  return x;
}
