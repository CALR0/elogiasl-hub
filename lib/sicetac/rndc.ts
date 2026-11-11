/*
 * Web service RNDC del Ministerio de Transporte (SOAP-RPC "AtenderMensajeRNDC").
 * El XML <root> va ESCAPADO dentro del parámetro Request (con CDATA no liga).
 * - Proceso 12 (consulta): número de ejes de un vehículo/remolque → CONFIGURACION
 *   SICETAC. Portado de la extensión autosice (lib/rndc.js).
 * - Proceso 4 (registro): expedir el manifiesto; devuelve el radicado (ingresoid).
 */

/** Endpoint que usa Colombia Software para registrar manifiestos (proceso 4). */
export const RNDC_REGISTRO =
  process.env.RNDC_URL_REGISTRO ||
  "http://rndcws2.mintransporte.gov.co:8080/ws/svr008w.dll/soap/IBPMServices";
/** Endpoint de consultas (proceso 12), el que usa la extensión. */
export const RNDC_CONSULTA =
  process.env.RNDC_URL_CONSULTA ||
  "http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices";

const SOAP_ACTION = "urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC";

export interface AccesoRndc {
  username: string;
  password: string;
  ambiente?: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const desescapar = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const sobre = (interno: string) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
  '<SOAP-ENV:Body><NS1:AtenderMensajeRNDC xmlns:NS1="urn:BPMServicesIntf-IBPMServices" ' +
  'SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
  `<Request xsi:type="xsd:string">${esc(interno)}</Request>` +
  "</NS1:AtenderMensajeRNDC></SOAP-ENV:Body></SOAP-ENV:Envelope>";

export class ErrorRndc extends Error {}

/** Envía un XML <root> al RNDC y devuelve el XML de respuesta (ya desescapado). */
export async function enviarRndc(
  url: string,
  xmlRoot: string,
  esperaMs = 60_000,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: SOAP_ACTION,
    },
    body: sobre(xmlRoot),
    signal: AbortSignal.timeout(esperaMs),
  });
  const texto = await res.text();
  // <return> puede venir con prefijo de espacio de nombres (<NS1:return>)
  const m = /<(?:[\w-]+:)?return\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?return>/i.exec(
    texto,
  );
  if (m) return desescapar(m[1]);
  // Sin <return>: a veces el XML de respuesta viene suelto en el cuerpo
  const suelto = desescapar(texto);
  if (/<ErrorMSG>|<ingresoid>/i.test(suelto)) return suelto;
  const resumen = texto
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  throw new ErrorRndc(
    `El RNDC respondió HTTP ${res.status} sin un resultado legible${resumen ? `: ${resumen}` : " (respuesta vacía)"}.`,
  );
}

export const etiqueta = (xml: string, nombre: string) =>
  new RegExp(`<${nombre}>([\\s\\S]*?)<\\/${nombre}>`, "i")
    .exec(xml)?.[1]
    ?.trim() ?? null;

/** Mensaje de error del RNDC (<ErrorMSG>), o null si no hay error. */
export const errorRndc = (xml: string) => etiqueta(xml, "ErrorMSG");

/** Proceso 12: número de ejes del vehículo o remolque con esa placa. */
export async function ejesPorPlaca(
  acceso: AccesoRndc,
  nit: string,
  placa: string,
) {
  const interno =
    "<?xml version='1.0' encoding='ISO-8859-1' ?><root>" +
    `<acceso><username>${esc(acceso.username)}</username><password>${esc(acceso.password)}</password></acceso>` +
    // Lista mínima: con '*' el RNDC da "Error RNDC027" en algunas placas (ver extensión)
    "<solicitud><tipo>3</tipo><procesoid>12</procesoid></solicitud>" +
    "<variables>INGRESOID, NUMPLACA, NUMEJES</variables>" +
    `<documento><NUMNITEMPRESATRANSPORTE>'${nit}'</NUMNITEMPRESATRANSPORTE>` +
    `<NUMPLACA>'${placa}'</NUMPLACA></documento></root>`;
  const xml = await enviarRndc(RNDC_CONSULTA, interno);
  const error = errorRndc(xml);
  if (error) throw new ErrorRndc(`RNDC (placa ${placa}): ${error}`);
  const ejes = Number.parseInt(etiqueta(xml, "numejes") ?? "", 10);
  if (!ejes)
    throw new ErrorRndc(
      `El RNDC no devolvió el número de ejes de la placa ${placa}.`,
    );
  return ejes;
}

/**
 * CONFIGURACION SICETAC: con remolque "<ejes tracto>S<ejes remolque>" (2S2,
 * 3S3…); sin remolque, camión rígido "2" o "3".
 */
export async function configuracionVehiculo(
  acceso: AccesoRndc,
  nit: string,
  placa: string,
  remolque: string | null,
) {
  const ejes = await ejesPorPlaca(acceso, nit, placa);
  if (!remolque)
    return {
      configuracion: String(ejes),
      detalle: `Camión rígido de ${ejes} ejes`,
    };
  const ejesRem = await ejesPorPlaca(acceso, nit, remolque);
  return {
    configuracion: `${ejes}S${ejesRem}`,
    detalle: `Tractocamión ${ejes} ejes + semirremolque ${ejesRem} ejes`,
  };
}

/** Quita usuario y clave del XML (para guardarlo en Auditoría sin credenciales). */
export const sinCredenciales = (xml: string) =>
  xml.replace(/<acceso>[\s\S]*?<\/acceso>/i, "<acceso>(oculto)</acceso>");

/**
 * Proceso 4: expide (registra) el manifiesto en el RNDC. Devuelve el radicado
 * (ingresoid) o el mensaje de error del Ministerio.
 */
export async function expedirManifiestoRndc(
  xmlManifiesto: string,
  yaRadicado?: () => Promise<string | null>,
) {
  return registrarRndc(xmlManifiesto, yaRadicado);
}

/** "RNDC12 … No se puede atender la solicitud": el servidor no la procesó. */
const noAtendida = (error: string) => /RNDC12|No se puede atender/i.test(error);

/** Un intento de registro: servidor, duración y cómo terminó (para Auditoría). */
export interface IntentoRndc {
  servidor: string;
  ms: number;
  resultado: string;
}

/** Espera máxima de un envío: más allá de esto se pasa al otro servidor. */
const ESPERA_REGISTRO_MS = 25_000;

/**
 * Registro (tipo 1) de cualquier proceso en el RNDC. Si un servidor no atiende
 * la solicitud (RNDC12, respuesta ilegible o más de 25 s) se consulta antes si
 * el documento ya quedó radicado (`yaRadicado`) y, si no, se reintenta en el
 * otro servidor. `servidores` fija el orden (por defecto rndcws, el de las consultas, que
 * responde rápido; rndcws2 de respaldo).
 */
export async function registrarRndc(
  xmlRoot: string,
  yaRadicado?: () => Promise<string | null>,
  servidores: string[] = [RNDC_CONSULTA, RNDC_REGISTRO],
) {
  const intentos: IntentoRndc[] = [];
  let fallo = "No se pudo conectar con el RNDC.";
  let respuesta = "";
  const listo = (radicado: string, xml: string) => ({
    ok: true as const,
    radicado,
    respuesta: xml,
    intentos,
  });
  for (const [i, url] of [...new Set(servidores)].entries()) {
    if (i > 0 && yaRadicado) {
      const radicado = await yaRadicado().catch(() => null);
      if (radicado) return listo(radicado, respuesta);
    }
    const servidor = new URL(url).hostname;
    const inicio = Date.now();
    let xml: string;
    try {
      xml = await enviarRndc(url, xmlRoot, ESPERA_REGISTRO_MS);
    } catch (e) {
      fallo =
        e instanceof Error && e.name === "TimeoutError"
          ? `El RNDC (${servidor}) no respondió en ${ESPERA_REGISTRO_MS / 1000} s.`
          : e instanceof Error
            ? e.message
            : fallo;
      intentos.push({ servidor, ms: Date.now() - inicio, resultado: fallo });
      continue;
    }
    respuesta = xml;
    const error = errorRndc(xml);
    intentos.push({
      servidor,
      ms: Date.now() - inicio,
      resultado: error || "radicado",
    });
    if (error && noAtendida(error)) {
      fallo = error;
      continue;
    }
    if (error)
      return { ok: false as const, mensaje: error, respuesta: xml, intentos };
    const radicado = etiqueta(xml, "ingresoid");
    if (!radicado)
      return {
        ok: false as const,
        mensaje: "El RNDC no devolvió número de radicado.",
        respuesta: xml,
        intentos,
      };
    return listo(radicado, xml);
  }
  if (yaRadicado) {
    const radicado = await yaRadicado().catch(() => null);
    if (radicado) return listo(radicado, respuesta);
  }
  return { ok: false as const, mensaje: fallo, respuesta, intentos };
}

/**
 * Proceso 4, consulta (tipo 3): radicado (INGRESOID) de un manifiesto ya
 * expedido, o null si el RNDC no lo tiene registrado.
 */
export function consultarRadicado(
  acceso: AccesoRndc,
  nit: string,
  manifiesto: string,
) {
  return consultarIngreso(4, acceso, nit, manifiesto);
}

/**
 * Proceso 6, consulta (tipo 3): radicado (INGRESOID) del cumplido de un
 * manifiesto, o null si todavía no tiene cumplido.
 */
export function consultarRadicadoCumplido(
  acceso: AccesoRndc,
  nit: string,
  manifiesto: string,
) {
  return consultarIngreso(6, acceso, nit, manifiesto);
}

/**
 * Proceso 5, consulta (tipo 3): radicado (INGRESOID) del cumplido de una
 * remesa, o null si no tiene (nunca se cumplió o el cumplido fue anulado).
 */
export function consultarCumplidoRemesa(
  acceso: AccesoRndc,
  nit: string,
  remesa: string,
) {
  return consultarIngreso(5, acceso, nit, remesa);
}

const DOCUMENTO = {
  4: ["NUMMANIFIESTOCARGA", "del manifiesto"],
  5: ["CONSECUTIVOREMESA", "del cumplido de la remesa"],
  6: ["NUMMANIFIESTOCARGA", "del cumplido"],
} as const;

async function consultarIngreso(
  proceso: 4 | 5 | 6,
  acceso: AccesoRndc,
  nit: string,
  documento: string,
) {
  const [campo, que] = DOCUMENTO[proceso];
  // La remesa es alfanumérica para el RNDC: sin comillas sencillas da RNDC027
  const q = proceso === 5 ? "'" : "";
  const interno =
    "<?xml version='1.0' encoding='ISO-8859-1' ?><root>" +
    `<acceso><username>${esc(acceso.username)}</username><password>${esc(acceso.password)}</password></acceso>` +
    `<solicitud><tipo>3</tipo><procesoid>${proceso}</procesoid></solicitud>` +
    "<variables>INGRESOID</variables>" +
    `<documento><NUMNITEMPRESATRANSPORTE>${q}${esc(nit)}${q}</NUMNITEMPRESATRANSPORTE>` +
    `<${campo}>${q}${esc(documento)}${q}</${campo}></documento></root>`;
  const xml = await enviarRndc(RNDC_CONSULTA, interno);
  const error = errorRndc(xml);
  // "Error RNDC11: Documento no encontrado" = todavía no está radicado
  if (error && /RNDC11|no encontrado/i.test(error)) return null;
  if (error)
    throw new ErrorRndc(`RNDC (consulta ${que} ${documento}): ${error}`);
  return etiqueta(xml, "ingresoid") || null;
}

/**
 * Proceso 4, consulta (tipo 3): valor del flete pactado registrado en el RNDC
 * para un manifiesto, o null si no está.
 */
export async function consultarFletePactado(
  acceso: AccesoRndc,
  nit: string,
  manifiesto: string,
) {
  const interno =
    "<?xml version='1.0' encoding='ISO-8859-1' ?><root>" +
    `<acceso><username>${esc(acceso.username)}</username><password>${esc(acceso.password)}</password></acceso>` +
    "<solicitud><tipo>3</tipo><procesoid>4</procesoid></solicitud>" +
    "<variables>VALORFLETEPACTADOVIAJE</variables>" +
    `<documento><NUMNITEMPRESATRANSPORTE>${esc(nit)}</NUMNITEMPRESATRANSPORTE>` +
    `<NUMMANIFIESTOCARGA>${esc(manifiesto)}</NUMMANIFIESTOCARGA></documento></root>`;
  const xml = await enviarRndc(RNDC_CONSULTA, interno);
  const error = errorRndc(xml);
  if (error && /RNDC11|no encontrado/i.test(error)) return null;
  if (error)
    throw new ErrorRndc(`RNDC (flete del manifiesto ${manifiesto}): ${error}`);
  const valor = Number.parseFloat(
    etiqueta(xml, "valorfletepactadoviaje") ?? "",
  );
  return Number.isFinite(valor) ? valor : null;
}

export interface DatosManifiestoRndc {
  placa: string;
  remolque: string | null;
  origen: string;
  destino: string;
  flete: number;
  retencionFuente: number;
  retencionFopat: number;
  /** Primera remesa asociada al manifiesto, para luego leerla en Silogtran. */
  remesa: string | null;
}

/**
 * Proceso 4, consulta (tipo 3): recupera los datos clave del manifiesto que
 * sirven para recalcular el SICETAC (placa, remolque, DANE origen/destino,
 * flete, retenciones y una remesa asociada). Útil cuando la página del
 * ministerio ya no guarda el XML original (manifiestos radicados hace
 * tiempo).
 */
export async function consultarDatosManifiesto(
  acceso: AccesoRndc,
  nit: string,
  manifiesto: string,
): Promise<DatosManifiestoRndc | null> {
  const variables = [
    "NUMPLACA",
    "NUMPLACAREMOLQUE",
    "CODMUNICIPIOORIGENMANIFIESTO",
    "CODMUNICIPIODESTINOMANIFIESTO",
    "VALORFLETEPACTADOVIAJE",
    "RETENCIONFUENTEMANIFIESTO",
    "RETENCIONFOPAT",
    "CONSECUTIVOREMESA",
  ].join(",");
  const interno =
    "<?xml version='1.0' encoding='ISO-8859-1' ?><root>" +
    `<acceso><username>${esc(acceso.username)}</username><password>${esc(acceso.password)}</password></acceso>` +
    "<solicitud><tipo>3</tipo><procesoid>4</procesoid></solicitud>" +
    `<variables>${variables}</variables>` +
    `<documento><NUMNITEMPRESATRANSPORTE>${esc(nit)}</NUMNITEMPRESATRANSPORTE>` +
    `<NUMMANIFIESTOCARGA>${esc(manifiesto)}</NUMMANIFIESTOCARGA></documento></root>`;
  const xml = await enviarRndc(RNDC_CONSULTA, interno);
  const error = errorRndc(xml);
  if (error && /RNDC11|no encontrado/i.test(error)) return null;
  if (error)
    throw new ErrorRndc(`RNDC (datos del manifiesto ${manifiesto}): ${error}`);

  const num = (nombre: string) =>
    Number.parseFloat(
      String(etiqueta(xml, nombre) ?? "").replace(/[^\d]/g, ""),
    ) || 0;
  const str = (nombre: string) => (etiqueta(xml, nombre) ?? "").trim();
  const remolque = str("numplacaremolque");
  return {
    placa: str("numplaca"),
    remolque: remolque && remolque !== "-" ? remolque : null,
    origen: str("codmunicipioorigenmanifiesto"),
    destino: str("codmunicipiodestinomanifiesto"),
    flete: num("valorfletepactadoviaje"),
    retencionFuente: num("retencionfuentemanifiesto"),
    retencionFopat: num("retencionfopat"),
    remesa: str("consecutivoremesa") || null,
  };
}

/**
 * Acceso al web service RNDC: el de las variables de entorno (RNDC_USUARIO /
 * RNDC_CLAVE / RNDC_NIT) o, si no están, el que trae el XML que armó Colombia
 * Software (manifiesto o cumplido).
 */
export function accesoRndc(xml: string | null): {
  acceso: AccesoRndc | null;
  nit: string;
} {
  const nit =
    process.env.RNDC_NIT ||
    (xml && etiqueta(xml, "NUMNITEMPRESATRANSPORTE")) ||
    "8190041165";
  if (process.env.RNDC_USUARIO && process.env.RNDC_CLAVE)
    return {
      acceso: {
        username: process.env.RNDC_USUARIO,
        password: process.env.RNDC_CLAVE,
      },
      nit,
    };
  const username = xml ? etiqueta(xml, "username") : null;
  const password = xml ? etiqueta(xml, "password") : null;
  return { acceso: username && password ? { username, password } : null, nit };
}
