/**
 * Los manifiestos son como "0101223914"; si los escriben sin el 0 inicial
 * ("101223914") se antepone. Si ya trae 0 o no es numérico, queda igual.
 */
export function normalizarManifiesto(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[1-9]\d*$/.test(s) ? "0" + s : s;
}

/** Separa lo pegado (coma, espacio, punto y coma o salto de línea) y quita duplicados. */
export function manifiestosUnicos(texto: string) {
  const vistos = new Set<string>();
  let total = 0;
  for (const v of texto
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)) {
    total++;
    vistos.add(normalizarManifiesto(v));
  }
  return { unicos: [...vistos], duplicados: total - vistos.size };
}
