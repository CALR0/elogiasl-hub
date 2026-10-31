/**
 * Las planillas son como "0101222750"; si las escriben sin el 0 inicial
 * ("101222750") se antepone para mostrarlas y para detectar duplicados. Si ya
 * trae 0 o no es numérica, queda igual. No afecta el envío a SAP, que usa el
 * payload de Silogtran tal cual. (Portado de SMA.)
 */
export function normalizarPlanilla(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[1-9]\d*$/.test(s) ? "0" + s : s;
}

export type TipoBusqueda = "planilla" | "consolidado";

/** Separa lo pegado (coma, espacio, punto y coma o salto de línea) y quita duplicados. */
export function entradasUnicas(texto: string, tipo: TipoBusqueda) {
  const vistos = new Set<string>();
  const unicas: string[] = [];
  let total = 0;
  for (const v of texto
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)) {
    total++;
    const clave = tipo === "planilla" ? normalizarPlanilla(v) : v;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicas.push(v);
  }
  return { unicas, duplicadas: total - unicas.length };
}
