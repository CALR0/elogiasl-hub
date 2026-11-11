import "server-only";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";
import { conSilogtran, type Actor } from "@/lib/silogtran/sesion-servicio.ts";
import { consultarMinisterio } from "./ministerio.ts";
import { calcularSicetac } from "./portal.ts";
import { leerRemesa, tipoCargaSicetac } from "./remesa.ts";
import { leerManifiestoSilogtran } from "./manifiesto-silogtran.ts";
import {
  accesoRndc,
  configuracionVehiculo,
  consultarRadicado,
  expedirManifiestoRndc,
} from "./rndc.ts";
import {
  ajustarXml,
  type DatosManifiestoXml,
  leerXmlManifiesto,
  valoresAjustados,
} from "./xml.ts";

/*
 * Expedir manifiesto SICETAC (Despacho › Manifiesto). procesar() hace todo en
 * un paso para un manifiesto que el Ministerio rechazó con MAN045 (flete por
 * debajo del SICETAC):
 *   1. toma el XML del último intento (página de Colombia Software), calcula
 *      el SICETAC vigente del viaje y arma el XML con el flete corregido y sus
 *      retenciones;
 *   2. lo envía al RNDC (proceso 4) y, si sale con radicado, vuelve a
 *      consultar el manifiesto en Colombia Software (como se hace a mano).
 */

export type EstadoCalculo = "listo" | "cumple" | "registrado" | "error";

export interface ResultadoCalculo {
  manifiesto: string;
  estado: EstadoCalculo;
  mensaje: string;
  flete: number | null;
  sicetac: number | null;
  nuevo: {
    flete: number;
    retencionFuente: number;
    retencionFopat: number;
  } | null;
  detalle: {
    ruta: string;
    configuracion: string;
    vehiculo: string;
    carga: string;
    horasCargue: number;
    horasDescargue: number;
  } | null;
  /** Resultado del envío al Ministerio (solo si se envió). */
  envio: { ok: boolean; mensaje: string; radicado: string | null } | null;
}

/** Lo que va a Auditoría además del resultado (nunca se envía al navegador). */
export interface TrazaProceso {
  xmlOriginal: string | null;
  xmlEnviado: string | null;
  respuestaRndc: string | null;
  consultaPosterior: string | null;
}

// El SICETAC es fijo todo el mes para (configuración, ruta, carga, horas): se
// guarda por instancia para no volver a recorrer el portal en el mismo mes.
const cache = new Map<string, { total: number; ruta: string }>();

function periodoColombia() {
  return new Date(Date.now() - 5 * 3600_000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
}

/**
 * El RNDC usa DANE de municipio con 8 dígitos (los dos primeros son el código
 * de departamento con cero inicial si hace falta: Antioquia 05, Atlántico 08).
 * SICETAC usa el mismo DANE pero como número — sin ceros a la izquierda:
 * Medellín 5001000, Barranquilla 8001000, Bogotá 11001000. Si se envía con
 * el cero, el portal responde "El portal SICETAC no ofrece DESTINO = 05001000".
 */
function normalizarDane(dane: string) {
  const n = Number.parseInt(String(dane ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : dane;
}

const vacio = (
  manifiesto: string,
  estado: EstadoCalculo,
  mensaje: string,
): ResultadoCalculo => ({
  manifiesto,
  estado,
  mensaje,
  flete: null,
  sicetac: null,
  nuevo: null,
  detalle: null,
  envio: null,
});

interface Calculo {
  resultado: ResultadoCalculo;
  xmlOriginal: string | null;
  xmlCorregido: string | null;
}

const sinXml = (
  resultado: ResultadoCalculo,
  xmlOriginal: string | null = null,
): Calculo => ({
  resultado,
  xmlOriginal,
  xmlCorregido: null,
});

export type { Calculo };

/**
 * Hace el cálculo completo del SICETAC para un manifiesto SIN enviar nada al
 * RNDC: consulta el ministerio, lee la remesa en Silogtran, pregunta la
 * configuración del vehículo al RNDC y pasa por el portal SICETAC. Devuelve
 * el ResultadoCalculo (flete, SICETAC, nuevo con retenciones, detalle de
 * ruta/vehículo/carga/horas) y los XML para que la capa superior decida qué
 * hacer con ellos. Lo usa `procesar()` para expedir, y lo usa el chat IA
 * (lib/ia/analizar-sicetac.ts) para solo responder al usuario.
 */
export async function calcular(
  actor: Actor,
  manifiesto: string,
  opciones: {
    /**
     * Modo informativo (chat IA): se saltan los atajos de "ya radicado" y
     * "el último envío no es MAN045", porque el usuario pregunta por el
     * valor del SICETAC y le sirve conocerlo igual. Nunca devuelve
     * "registrado" en este modo.
     */
    soloInformativo?: boolean;
  } = {},
): Promise<Calculo> {
  const ministerio = await consultarMinisterio(manifiesto);

  // Antes de nada: si el RNDC ya tiene radicado para este manifiesto, no se toca
  // (cubre los que se expidieron antes y evita radicar dos veces)
  const { acceso, nit } = accesoRndc(ministerio.xml);
  if (!opciones.soloInformativo && acceso) {
    let radicado: string | null;
    try {
      radicado = await consultarRadicado(acceso, nit, manifiesto);
    } catch (e) {
      return sinXml(
        vacio(
          manifiesto,
          "error",
          `No se pudo verificar en el RNDC si el manifiesto ya está expedido. ${e instanceof Error ? e.message : ""}`.trim(),
        ),
        ministerio.xml,
      );
    }
    if (radicado)
      return sinXml(
        vacio(
          manifiesto,
          "registrado",
          `El manifiesto ${manifiesto} ya está expedido bajo el número ${radicado}.`,
        ),
        ministerio.xml,
      );
  }

  if (!opciones.soloInformativo && ministerio.registrado)
    return sinXml(
      vacio(
        manifiesto,
        "registrado",
        `El manifiesto ya está expedido. ${ministerio.mensaje}`,
      ),
    );
  // Fallback para el chat IA: si la página del Ministerio ya no guarda el
  // XML (manifiestos radicados hace tiempo, la página puede estar vacía),
  // leemos los datos del manifiesto directamente de Silogtran (la misma
  // vista Despacho › Manifiesto que abre la persona). Esto SOLO en modo
  // informativo: procesar() exige el XML real del último intento para
  // ajustarlo y reenviarlo.
  let d: DatosManifiestoXml;
  let original: string | null = ministerio.xml;

  if (opciones.soloInformativo && !ministerio.xml) {
    let m;
    try {
      m = leerManifiestoSilogtran(
        await conSilogtran(actor, (cli) => cli.paginaManifiesto(manifiesto)),
      );
    } catch (e) {
      if (e instanceof SilogtranError)
        return sinXml(vacio(manifiesto, "error", e.message), null);
      throw e;
    }
    if (!m.placa || !m.origen || !m.destino || !m.remesas.length || !m.flete)
      return sinXml(
        vacio(
          manifiesto,
          "error",
          `No se pudieron leer todos los datos del manifiesto ${manifiesto} en Silogtran.`,
        ),
      );
    // Acceso para el proceso 12 (configuración del vehículo): el del env o
    // el que ya extrajimos de la página del Ministerio (acá no hay XML).
    const accesoRndcDisp = acceso ?? null;
    if (!accesoRndcDisp)
      return sinXml(
        vacio(
          manifiesto,
          "error",
          "Para consultar la configuración del vehículo en el RNDC se necesitan RNDC_USUARIO y RNDC_CLAVE.",
        ),
      );
    d = {
      manifiesto,
      nit,
      origen: m.origen,
      destino: m.destino,
      placa: m.placa,
      remolque: m.remolque,
      flete: m.flete,
      retencionFuente: m.retencionFuente,
      retencionFopat: m.retencionFopat,
      remesas: m.remesas,
      acceso: accesoRndcDisp,
    };
  } else {
    if (!ministerio.xml)
      return sinXml(
        vacio(
          manifiesto,
          "error",
          ministerio.mensaje ||
            (acceso
              ? "No se encontró el envío de este manifiesto al Ministerio."
              : "No se encontró el envío de este manifiesto al Ministerio y no se pudo consultar su radicado: configura RNDC_USUARIO y RNDC_CLAVE."),
        ),
      );
    original = ministerio.xml;
    if (!opciones.soloInformativo && !ministerio.errorSicetac)
      return sinXml(
        vacio(
          manifiesto,
          "error",
          `El último envío no falló por SICETAC, así que no se ajusta. Respuesta del Ministerio: ${ministerio.mensaje || "(sin mensaje)"}`,
        ),
        original,
      );
    d = leerXmlManifiesto(original);
  }
  if (!d.remesas.length)
    return sinXml(
      vacio(manifiesto, "error", "El XML del manifiesto no trae remesas."),
      original,
    );

  // Horas pactadas y tipo de carga: de la (primera) remesa en Silogtran
  let remesa;
  try {
    remesa = leerRemesa(
      await conSilogtran(actor, (cli) => cli.paginaRemesa(d.remesas[0])),
    );
  } catch (e) {
    if (e instanceof SilogtranError)
      return sinXml(vacio(manifiesto, "error", e.message), original);
    throw e;
  }
  const carga = tipoCargaSicetac(remesa);
  const horasCargue = Math.max(0, Math.round(remesa.horasCargue));
  const horasDescargue = Math.max(0, Math.round(remesa.horasDescargue));

  // Configuración del vehículo por el RNDC (proceso 12), con el acceso del propio XML
  const cfg = await configuracionVehiculo(d.acceso, d.nit, d.placa, d.remolque);

  // El RNDC trae el DANE con ceros iniciales (ej. 05001000 = Medellín), pero
  // SICETAC usa el mismo DANE SIN ceros a la izquierda (5001000). Si lo
  // enviamos "crudo" el portal responde "El portal SICETAC no ofrece
  // DESTINO = 05001000".
  const origen = normalizarDane(d.origen);
  const destino = normalizarDane(d.destino);

  const periodo = periodoColombia();
  const clave = [
    periodo.slice(0, 6),
    cfg.configuracion,
    origen,
    destino,
    carga.tipocarga,
    carga.condicion,
    horasCargue,
    horasDescargue,
  ].join("|");
  let calculo = cache.get(clave);
  if (!calculo) {
    const r = await calcularSicetac({
      CONFIGURACION: cfg.configuracion,
      CONDICIONCARGA: carga.condicion,
      UNIDADTRANSPORTE: "1",
      TIPOCARGA: carga.tipocarga,
      ORIGEN: origen,
      DESTINO: destino,
      HORASCARGUE: String(horasCargue),
      HORASDESCARGUE: String(horasDescargue),
      periodo,
    });
    calculo = {
      total: r.total,
      ruta: r.rutasDisponibles.find((x) => x.valor === r.ruta)?.texto ?? r.ruta,
    };
    cache.set(clave, calculo);
  }

  // El flete debe quedar igual o por encima del SICETAC: se redondea hacia arriba
  const sicetac = Math.ceil(calculo.total);
  const detalle = {
    ruta: calculo.ruta.replace(/\s*_\s*/g, " → "),
    configuracion: cfg.configuracion,
    vehiculo: `${cfg.detalle} (${d.placa}${d.remolque ? ` + ${d.remolque}` : ""})`,
    carga: carga.etiqueta,
    horasCargue,
    horasDescargue,
  };
  if (d.flete >= sicetac)
    return sinXml(
      {
        ...vacio(
          manifiesto,
          "cumple",
          "El flete pactado ya cumple el SICETAC calculado; revisa el manifiesto antes de reenviarlo.",
        ),
        flete: d.flete,
        sicetac,
        detalle,
      },
      original,
    );

  const nuevo = valoresAjustados(d, sicetac);
  return {
    resultado: {
      manifiesto,
      estado: "listo",
      mensaje: `Flete por debajo del SICETAC en $${(sicetac - d.flete).toLocaleString("es-CO")}.`,
      flete: d.flete,
      sicetac,
      nuevo,
      detalle,
      envio: null,
    },
    xmlOriginal: original,
    // Sin XML original (fallback RNDC del chat informativo) no se ajusta
    // nada: procesar() exige el XML del último intento y nunca llega aquí
    // sin él.
    xmlCorregido: original ? ajustarXml(original, nuevo) : null,
  };
}

/** Consulta de nuevo el manifiesto en Colombia Software; nunca rompe la expedición. */
async function reconsultarMinisterio(manifiesto: string) {
  try {
    return (await consultarMinisterio(manifiesto)).mensaje || "(sin mensaje)";
  } catch (e) {
    return `No se pudo consultar: ${e instanceof Error ? e.message : "error"}`;
  }
}

/** Calcula el SICETAC y, si el flete está por debajo, expide el manifiesto. */
export async function procesar(
  actor: Actor,
  manifiesto: string,
): Promise<{ resultado: ResultadoCalculo; traza: TrazaProceso }> {
  const c = await calcular(actor, manifiesto);
  const traza: TrazaProceso = {
    xmlOriginal: c.xmlOriginal,
    xmlEnviado: null,
    respuestaRndc: null,
    consultaPosterior: null,
  };
  if (!c.xmlCorregido) return { resultado: c.resultado, traza };

  traza.xmlEnviado = c.xmlCorregido;
  let envio: NonNullable<ResultadoCalculo["envio"]>;
  try {
    // Si un servidor no atiende, antes de reintentar se verifica que no haya quedado radicado
    const { acceso, nit } = accesoRndc(c.xmlOriginal);
    const r = await expedirManifiestoRndc(
      c.xmlCorregido,
      acceso ? () => consultarRadicado(acceso, nit, manifiesto) : undefined,
    );
    traza.respuestaRndc = r.respuesta || null;
    envio = r.ok
      ? {
          ok: true,
          radicado: r.radicado,
          mensaje: `Manifiesto ${manifiesto} expedido con éxito bajo el número ${r.radicado}.`,
        }
      : { ok: false, radicado: null, mensaje: r.mensaje };
  } catch (e) {
    envio = {
      ok: false,
      radicado: null,
      mensaje:
        e instanceof Error ? e.message : "No se pudo conectar con el RNDC.",
    };
  }
  if (envio.ok)
    traza.consultaPosterior = await reconsultarMinisterio(manifiesto);
  return { resultado: { ...c.resultado, envio }, traza };
}
