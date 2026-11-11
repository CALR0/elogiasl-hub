/*
 * Parser de la página del manifiesto de Silogtran
 * (Despacho.Manifiesto_003.Home_111). IDs verificados en vivo contra la
 * instancia real de Elogia (construproyec):
 *   - ctl0_MainModule_vehiculo_codigo          → placa del cabezote
 *   - ctl0_MainModule_trailer_placa            → placa del remolque ("" o "-")
 *   - ctl0_MainModule_ciudad_codigo_origen     → código INTERNO de ciudad
 *   - ctl0_MainModule_ciudad_codigo_destino    → código INTERNO de ciudad
 *   - ctl0_MainModule_manifiesto_flete         → "4,950,000"
 *   - ctl0_MainModule_manifiesto_impuesto      → retención en la fuente
 *   - Tabla ctl0_MainModule_ItemsManifiesto    → remesas asociadas
 *
 * Los códigos de ciudad son INTERNOS de Silogtran, NO son DANE. Para
 * obtener el DANE se consulta por separado Basicos.Ciudad.Home con ese
 * código (ver ciudad-silogtran.ts).
 */

const PFX = "ctl0_MainModule_";

function valorInput(html: string, id: string): string | null {
  const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
  const v = tag && /\bvalue="([^"]*)"/i.exec(tag[0]);
  return v ? v[1].trim() : null;
}

const numero = (s: string | null) =>
  Number.parseFloat(String(s ?? "").replace(/[^\d]/g, "")) || 0;

export interface ManifiestoSilogtran {
  placa: string;
  remolque: string | null;
  /** Código INTERNO de Silogtran, NO es DANE. Hay que mapearlo con paginaCiudad. */
  codigoCiudadOrigen: string;
  codigoCiudadDestino: string;
  flete: number;
  /** Retención en la fuente (campo "Impuesto" en la vista). */
  retencionFuente: number;
  /** Lista de remesas asociadas (códigos de 10 dígitos). */
  remesas: string[];
}

/** Lee los datos clave del manifiesto desde su página en Silogtran. */
export function leerManifiestoSilogtran(html: string): ManifiestoSilogtran {
  const remolque = (valorInput(html, `${PFX}trailer_placa`) ?? "").trim();
  // La tabla de remesas es ItemsManifiesto (verificado). Cada remesa es un
  // código numérico de 10 dígitos (NUMMANIFIESTOCARGA formato RNDC).
  const tabla =
    new RegExp(
      `<table[^>]*\\bid="${PFX}ItemsManifiesto"[\\s\\S]*?<\\/table>`,
      "i",
    ).exec(html)?.[0] ?? "";
  const remesas = Array.from(
    new Set([...tabla.matchAll(/>\s*(\d{10})\s*</g)].map((m) => m[1])),
  );
  return {
    placa: (valorInput(html, `${PFX}vehiculo_codigo`) ?? "").trim(),
    remolque: remolque && remolque !== "-" ? remolque : null,
    codigoCiudadOrigen:
      (valorInput(html, `${PFX}ciudad_codigo_origen`) ?? "").trim(),
    codigoCiudadDestino:
      (valorInput(html, `${PFX}ciudad_codigo_destino`) ?? "").trim(),
    flete: numero(valorInput(html, `${PFX}manifiesto_flete`)),
    retencionFuente: numero(valorInput(html, `${PFX}manifiesto_impuesto`)),
    remesas,
  };
}
