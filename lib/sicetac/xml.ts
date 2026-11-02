import { etiqueta } from "./rndc.ts";

/*
 * El XML del manifiesto (proceso 4 del RNDC) tal como lo arma Colombia
 * Software. Solo se cambian tres etiquetas: el flete pactado y las dos
 * retenciones que dependen de él; todo lo demás se envía igual.
 */

export interface DatosManifiestoXml {
  manifiesto: string;
  nit: string;
  origen: string;
  destino: string;
  placa: string;
  remolque: string | null;
  flete: number;
  retencionFuente: number;
  retencionFopat: number;
  remesas: string[];
  acceso: { username: string; password: string; ambiente?: string };
}

const entero = (s: string | null) =>
  Number.parseInt(String(s ?? "").replace(/[^\d]/g, ""), 10) || 0;

export function leerXmlManifiesto(xml: string): DatosManifiestoXml {
  const remolque = (etiqueta(xml, "numPlacaRemolque") ?? "").trim();
  return {
    manifiesto: etiqueta(xml, "numManifiestoCarga") ?? "",
    nit: etiqueta(xml, "NUMNITEMPRESATRANSPORTE") ?? "",
    origen: etiqueta(xml, "codMunicipioOrigenManifiesto") ?? "",
    destino: etiqueta(xml, "codMunicipioDestinoManifiesto") ?? "",
    placa: etiqueta(xml, "numPlaca") ?? "",
    remolque: remolque && remolque !== "-" ? remolque : null,
    flete: entero(etiqueta(xml, "valorFletePactadoViaje")),
    retencionFuente: entero(etiqueta(xml, "retencionFuenteManifiesto")),
    retencionFopat: entero(etiqueta(xml, "RETENCIONFOPAT")),
    remesas: [
      ...xml.matchAll(/<consecutivoRemesa>([^<]+)<\/consecutivoRemesa>/gi),
    ].map((m) => m[1].trim()),
    acceso: {
      username: etiqueta(xml, "username") ?? "",
      password: etiqueta(xml, "password") ?? "",
      ambiente: etiqueta(xml, "ambiente") ?? undefined,
    },
  };
}

/**
 * Valores nuevos con el flete corregido. Las retenciones conservan la misma
 * proporción que tenían sobre el flete original (hoy 1 % retención en la
 * fuente y 0,1 % FOPAT); si una venía en 0, sigue en 0.
 */
export function valoresAjustados(d: DatosManifiestoXml, nuevoFlete: number) {
  const proporcion = (valor: number, porDefecto: number) =>
    d.flete > 0 ? valor / d.flete : porDefecto;
  return {
    flete: nuevoFlete,
    retencionFuente: Math.round(
      nuevoFlete * proporcion(d.retencionFuente, 0.01),
    ),
    retencionFopat: Math.round(
      nuevoFlete * proporcion(d.retencionFopat, 0.001),
    ),
  };
}

function reemplazar(xml: string, nombre: string, valor: number) {
  const re = new RegExp(`(<${nombre}>)[^<]*(<\\/${nombre}>)`, "i");
  if (!re.test(xml))
    throw new Error(`El XML del manifiesto no trae la etiqueta ${nombre}.`);
  return xml.replace(re, `$1${valor}$2`);
}

/** XML listo para enviar: mismo contenido, con flete y retenciones corregidos. */
export function ajustarXml(
  xml: string,
  v: ReturnType<typeof valoresAjustados>,
) {
  let x = reemplazar(xml, "valorFletePactadoViaje", v.flete);
  x = reemplazar(x, "retencionFuenteManifiesto", v.retencionFuente);
  x = reemplazar(x, "RETENCIONFOPAT", v.retencionFopat);
  return x;
}
