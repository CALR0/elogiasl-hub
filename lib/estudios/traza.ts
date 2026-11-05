/*
 * Trazabilidad de Estudios en los logs del servidor (Vercel → Logs, buscar
 * "[estudios]"): una línea JSON por cada acción. Nunca lleva credenciales.
 *
 * Las respuestas de TusDatos traen datos personales, así que por defecto solo
 * se registra un resumen y el documento enmascarado. Con
 * TUSDATOS_LOG_COMPLETO=true (para una prueba puntual) se registra todo.
 */

const MAX_TEXTO = 20_000;
/** Campos de las respuestas de TusDatos que no identifican a la persona. */
const CAMPOS_RESUMEN = [
  "estado",
  "id",
  "jobid",
  "hallazgo",
  "hallazgos",
  "error",
  "errores",
  "time",
  "typedoc",
  "validado",
  "percentage",
  "placa",
  "detail",
];

export const logCompleto = () => process.env.TUSDATOS_LOG_COMPLETO === "true";

/** "1234567890" → "••••••7890". */
export function enmascarar(doc: unknown) {
  const s = String(doc ?? "");
  return s.length > 4 ? `${"•".repeat(s.length - 4)}${s.slice(-4)}` : "••••";
}

/** Lo que se envía a TusDatos: el documento enmascarado salvo en modo completo. */
export function trazaEnvio(cuerpo: Record<string, unknown> | undefined) {
  if (!cuerpo || logCompleto()) return cuerpo;
  const { doc, name, nombre, ...resto } = cuerpo;
  return {
    ...resto,
    ...(doc !== undefined && { doc: enmascarar(doc) }),
    ...(name !== undefined && { name: "(oculto)" }),
    ...(nombre !== undefined && { nombre: "(oculto)" }),
  };
}

/** Lo que responde TusDatos: resumen salvo en modo completo. */
export function trazaRespuesta(cuerpo: unknown) {
  if (logCompleto()) {
    const texto = JSON.stringify(cuerpo) ?? "";
    return texto.length > MAX_TEXTO
      ? `${texto.slice(0, MAX_TEXTO)}… (recortado, ${texto.length} caracteres)`
      : cuerpo;
  }
  if (cuerpo === null || cuerpo === undefined) return null;
  if (typeof cuerpo !== "object" || Array.isArray(cuerpo))
    return "(sin resumen)";
  const c = cuerpo as Record<string, unknown>;
  const resumen: Record<string, unknown> = {};
  for (const k of CAMPOS_RESUMEN) if (c[k] !== undefined) resumen[k] = c[k];
  if (c.results && typeof c.results === "object")
    resumen.fuentes = Object.keys(c.results).length;
  return resumen;
}

/** Escribe una línea en el log del servidor. */
export function trazar(evento: string, datos: Record<string, unknown> = {}) {
  console.log(
    `[estudios] ${JSON.stringify({ evento, fecha: new Date().toISOString(), ...datos })}`,
  );
}
