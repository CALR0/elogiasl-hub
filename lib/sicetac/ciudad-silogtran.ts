/*
 * Parser de la página de Ciudad en Silogtran (Basicos.Ciudad.Home).
 * Se usa para mapear el código interno de ciudad que trae la página del
 * manifiesto (ctl0_MainModule_ciudad_codigo_origen/destino) al DANE
 * del municipio, que es lo que necesita el portal SICETAC y el RNDC.
 *
 * ID verificado en vivo contra la instancia real de Elogia:
 *   ctl0_MainModule_ciudad_codigodane → "25286000" (FUNZA, Cundinamarca)
 */

const PFX = "ctl0_MainModule_";

function valorInput(html: string, id: string): string | null {
  const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
  const v = tag && /\bvalue="([^"]*)"/i.exec(tag[0]);
  return v ? v[1].trim() : null;
}

export interface CiudadSilogtran {
  nombre: string;
  /** DANE del municipio (8 dígitos). */
  dane: string;
}

export function leerCiudadSilogtran(html: string): CiudadSilogtran {
  return {
    nombre: (valorInput(html, `${PFX}ciudad_nombre`) ?? "").trim(),
    dane: (valorInput(html, `${PFX}ciudad_codigodane`) ?? "").trim(),
  };
}
