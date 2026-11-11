/*
 * Parser de la página del manifiesto de Silogtran
 * (Despacho.Manifiesto_003.Home_111). Mismo patrón que leerRemesa: todos los
 * inputs del PRADO form tienen el prefijo `ctl0_MainModule_` + nombre
 * similar al del XML del RNDC. Se usa como fallback del cálculo informativo
 * del SICETAC cuando la página del Ministerio ya no guarda el XML.
 */

const PFX = "ctl0_MainModule_";

function valorInput(html: string, id: string): string | null {
  const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
  const v = tag && /\bvalue="([^"]*)"/i.exec(tag[0]);
  return v ? v[1].trim() : null;
}

function valorSelect(html: string, id: string): string | null {
  const bloque = new RegExp(
    `<select[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/select>`,
    "i",
  ).exec(html);
  if (!bloque) return null;
  const sel = /<option[^>]*selected[^>]*value="([^"]*)"/i.exec(bloque[0]);
  return sel ? sel[1].trim() : null;
}

/** Busca el valor del input, y si no, el del select con el mismo id. */
function valorCampo(html: string, id: string): string | null {
  return valorInput(html, id) ?? valorSelect(html, id);
}

const numero = (s: string | null) =>
  Number.parseFloat(String(s ?? "").replace(/[^\d]/g, "")) || 0;

export interface ManifiestoSilogtran {
  placa: string;
  remolque: string | null;
  /** DANE del municipio origen (puede traer ceros iniciales). */
  origen: string;
  destino: string;
  flete: number;
  retencionFuente: number;
  retencionFopat: number;
  /** Lista de remesas asociadas al manifiesto. */
  remesas: string[];
}

/** Lee los datos clave del manifiesto desde su página en Silogtran. */
export function leerManifiestoSilogtran(html: string): ManifiestoSilogtran {
  const remolque =
    (valorCampo(html, `${PFX}numPlacaRemolque`) ?? "").trim() || null;
  // La tabla de remesas de un manifiesto suele llamarse ItemsRemesa /
  // ItemsRemesas en el form del PRADO. Extraemos los códigos (números largos).
  const tabla =
    new RegExp(
      `<table[^>]*\\bid="${PFX}(?:ItemsRemesa|ItemsRemesas|GridRemesas)"[\\s\\S]*?<\\/table>`,
      "i",
    ).exec(html)?.[0] ?? "";
  const remesas = Array.from(
    new Set(
      [...tabla.matchAll(/>\s*(\d{6,20})\s*</g)].map((m) => m[1]),
    ),
  );
  return {
    placa: (valorCampo(html, `${PFX}numPlaca`) ?? "").trim(),
    remolque: remolque === "-" ? null : remolque,
    origen: (valorCampo(html, `${PFX}codMunicipioOrigenManifiesto`) ?? "").trim(),
    destino: (valorCampo(html, `${PFX}codMunicipioDestinoManifiesto`) ?? "").trim(),
    flete: numero(valorCampo(html, `${PFX}valorFletePactadoViaje`)),
    retencionFuente: numero(
      valorCampo(html, `${PFX}retencionFuenteManifiesto`),
    ),
    retencionFopat: numero(valorCampo(html, `${PFX}RETENCIONFOPAT`)),
    remesas,
  };
}
