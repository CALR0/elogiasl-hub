/*
 * Datos de la remesa de Silogtran que pide el SICETAC: horas pactadas de
 * cargue/descargue y tipo de carga. Portado de la extensión autosice
 * (lib/silogtran.js › leerRemesa y lib/resolver.js › tipoCargaSicetac).
 */

const PFX = "ctl0_MainModule_";

function valorInput(html: string, id: string) {
  const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
  const v = tag && /\bvalue="([^"]*)"/i.exec(tag[0]);
  return v ? v[1].trim() : null;
}

/** "2 h 30 min" → 2.5 */
function horas(s: string | null) {
  if (!s) return 0;
  const h = /(\d+)\s*h/i.exec(s)?.[1];
  const m = /(\d+)\s*min/i.exec(s)?.[1];
  return Number.parseInt(h || "0", 10) + Number.parseInt(m || "0", 10) / 60;
}

export interface DatosRemesa {
  horasCargue: number;
  horasDescargue: number;
  /** 1 general, 2 contenedor cargado, 3 contenedor vacío */
  tipoRemesaRndc: string;
  cargado: boolean;
}

export function leerRemesa(html: string): DatosRemesa {
  const tipo =
    new RegExp(
      `<select[^>]*id="${PFX}tipremrndc_codigo"[^>]*>[\\s\\S]*?<option[^>]*selected[^>]*value="([^"]*)"`,
      "i",
    ).exec(html)?.[1] ?? "";
  const items = (
    new RegExp(
      `<table[^>]*id="${PFX}ItemsRemesa"[\\s\\S]*?<\\/table>`,
      "i",
    ).exec(html)?.[0] ?? ""
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  return {
    horasCargue: horas(valorInput(html, `${PFX}tiempoCarguePactado`)),
    horasDescargue: horas(valorInput(html, `${PFX}tiempoDescarguePactado`)),
    tipoRemesaRndc: tipo.trim(),
    cargado: !/CONTENEDOR VACIO|SIN CARGA/.test(items),
  };
}

/** CONDICIONCARGA y TIPOCARGA del formulario SICETAC. */
export function tipoCargaSicetac(r: DatosRemesa) {
  if (r.tipoRemesaRndc === "3")
    return { condicion: "1", tipocarga: "16", etiqueta: "Contenedor vacío" };
  if (r.tipoRemesaRndc === "2")
    return { condicion: "1", tipocarga: "13", etiqueta: "Contenedor cargado" };
  if (!r.cargado)
    return { condicion: "2", tipocarga: "15", etiqueta: "Vacío / sin carga" };
  return { condicion: "1", tipocarga: "12", etiqueta: "General (cargado)" };
}
