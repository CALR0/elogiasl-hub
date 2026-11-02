import "server-only";
import {
  type AccesoRndc,
  accesoRndc,
  consultarCumplidoRemesa,
  consultarFletePactado,
  consultarRadicadoCumplido,
  type IntentoRndc,
  registrarRndc,
} from "@/lib/sicetac/rndc.ts";
import { type Actor, conSilogtran } from "@/lib/silogtran/sesion-servicio";
import { buscarLogRndc, tokenVisorVigente } from "./log-rndc.ts";
import { consultarCumplido, type RemesaSilogtran } from "./pagina.ts";
import {
  ajustarCumplido,
  correcciones,
  ERRORES_PROCESABLES,
  retencionesDelXml,
} from "./xml.ts";

/*
 * Migración cumplido RNDC (Despacho › Cumplido manifiesto). procesar() hace
 * todo en un paso para un cumplido que el Ministerio rechazó por retenciones
 * (CMA273 FOPAT, CMA262 retención en la fuente):
 *   0. si el RNDC ya tiene el cumplido (proceso 6, consulta) no se envía nada:
 *      se muestra el radicado y se consulta la página para marcarlo;
 *   1. toma el XML del último intento (página de Colombia Software) y las
 *      remesas del manifiesto;
 *   2. cumple cada remesa que el RNDC no tenga cumplida (proceso 5): Silogtran
 *      no la reenvía si guardó un radicado aunque en el RNDC la hayan anulado,
 *      así que el XML se toma del último intento en su Visor Log Interfaz RNDC.
 *      Sin el cumplido de la remesa el del manifiesto da CMA110;
 *   3. consulta en el RNDC el flete pactado del manifiesto y recalcula las
 *      retenciones que pide el error;
 *   4. envía el cumplido corregido (proceso 6) y, si sale con radicado,
 *      vuelve a consultar la página para que quede marcado en Silogtran.
 * Todo queda en una sola traza (un evento de Auditoría por manifiesto).
 */

export type EstadoCumplido =
  "migrado" | "rechazado" | "registrado" | "no-aplica" | "error";

/** Cómo quedó cada remesa del manifiesto antes de enviar su cumplido. */
export interface ResultadoRemesa {
  remesa: string;
  /** ya-cumplida: el RNDC ya la tenía; cumplida: se radicó ahora. */
  estado: "ya-cumplida" | "cumplida" | "error";
  radicado: string | null;
  mensaje: string;
}

export interface ResultadoCumplido {
  manifiesto: string;
  remesas: ResultadoRemesa[];
  estado: EstadoCumplido;
  mensaje: string;
  errores: string[];
  /** Flete pactado del manifiesto según el RNDC. */
  flete: number | null;
  originales: { fopat: number | null; fuente: number | null } | null;
  enviadas: { fopat?: number; fuente?: number } | null;
  radicado: string | null;
}

export interface TrazaCumplido {
  xmlOriginal: string | null;
  xmlEnviado: string | null;
  respuestaRndc: string | null;
  consultaPosterior: string | null;
  /** Milisegundos por paso, para ver en Auditoría dónde se va el tiempo. */
  tiempos: Record<string, number>;
  /** Intentos de envío al RNDC (servidor, duración, resultado). */
  intentos: IntentoRndc[];
  remesas: TrazaRemesa[];
}

export interface TrazaRemesa {
  remesa: string;
  /** Estado y radicado que muestra Silogtran. */
  silogtran: Omit<RemesaSilogtran, "remesa">;
  /** Fecha y hora del intento del Visor Log Interfaz RNDC que se reenvió. */
  fechaLog: string | null;
  xmlEnviado: string | null;
  respuestaRndc: string | null;
  intentos: IntentoRndc[];
}

export async function procesar(
  actor: Actor,
  manifiesto: string,
): Promise<{ resultado: ResultadoCumplido; traza: TrazaCumplido }> {
  const traza: TrazaCumplido = {
    xmlOriginal: null,
    xmlEnviado: null,
    respuestaRndc: null,
    consultaPosterior: null,
    tiempos: {},
    intentos: [],
    remesas: [],
  };
  const inicio = Date.now();
  const medir = async <T>(paso: string, fn: () => Promise<T>) => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      traza.tiempos[paso] = Date.now() - t;
    }
  };
  const base: ResultadoCumplido = {
    manifiesto,
    remesas: [],
    estado: "error",
    mensaje: "",
    errores: [],
    flete: null,
    originales: null,
    enviadas: null,
    radicado: null,
  };
  const fin = (r: Partial<ResultadoCumplido>) => {
    traza.tiempos.total = Date.now() - inicio;
    return { resultado: { ...base, ...r }, traza };
  };

  /** Consulta la página otra vez para que quede marcado en Silogtran. */
  const marcar = async () => {
    try {
      traza.consultaPosterior =
        (await medir("marcar_silogtran", () => consultarCumplido(manifiesto)))
          .mensaje || "(sin mensaje)";
    } catch (e) {
      traza.consultaPosterior = `No se pudo consultar: ${e instanceof Error ? e.message : "error"}`;
    }
  };

  // ¿El RNDC ya tiene el cumplido? Entonces no se reenvía, solo se marca
  const inicial = accesoRndc(null);
  const yaRadicado = inicial.acceso
    ? () => consultarRadicadoCumplido(inicial.acceso!, inicial.nit, manifiesto)
    : undefined;
  const previo = yaRadicado
    ? await medir("consulta_radicado", yaRadicado)
    : null;
  if (previo) {
    await marcar();
    return fin({
      estado: "registrado",
      radicado: previo,
      mensaje: `El cumplido del manifiesto ${manifiesto} ya estaba radicado bajo el número ${previo}.`,
    });
  }

  const pagina = await medir("pagina_cumplido", () =>
    consultarCumplido(manifiesto),
  );
  base.errores = pagina.errores;
  traza.xmlOriginal = pagina.xml;
  if (pagina.registrado)
    return fin({
      estado: "registrado",
      mensaje: `El cumplido ya está registrado. ${pagina.mensaje}`,
    });
  if (!pagina.xml)
    return fin({
      mensaje:
        pagina.mensaje ||
        "No se encontró el envío del cumplido de este manifiesto.",
    });
  if (
    !pagina.errores.some((e) =>
      (ERRORES_PROCESABLES as readonly string[]).includes(e),
    )
  )
    return fin({
      estado: "no-aplica",
      mensaje: `El último envío no falló por retenciones ni por remesas sin cumplir, así que no se ajusta. Respuesta del Ministerio: ${pagina.mensaje || "(sin mensaje)"}`,
    });

  const { acceso, nit } = accesoRndc(pagina.xml);
  if (!acceso)
    return fin({
      mensaje: "Falta el acceso al RNDC: configura RNDC_USUARIO y RNDC_CLAVE.",
    });

  // Primero las remesas: sin su cumplido en el RNDC el del manifiesto da CMA110
  base.remesas = await cumplirRemesas(
    actor,
    acceso,
    nit,
    pagina.remesas,
    traza,
    medir,
  );
  const fallida = base.remesas.find((x) => x.estado === "error");
  if (fallida)
    return fin({
      estado: "rechazado",
      mensaje: `No se envió el cumplido del manifiesto porque la remesa ${fallida.remesa} no quedó cumplida: ${fallida.mensaje}`,
    });
  const flete = await medir("consulta_flete", () =>
    consultarFletePactado(acceso, nit, manifiesto),
  );
  if (flete == null)
    return fin({
      mensaje: `El RNDC no tiene flete pactado para el manifiesto ${manifiesto}.`,
    });

  const enviadas = correcciones(pagina.errores, flete);
  const xml = ajustarCumplido(pagina.xml, enviadas);
  traza.xmlEnviado = xml;
  const datos = { flete, originales: retencionesDelXml(pagina.xml), enviadas };

  let r: Awaited<ReturnType<typeof registrarRndc>>;
  try {
    r = await medir("envio_rndc", () =>
      registrarRndc(xml, () =>
        consultarRadicadoCumplido(acceso, nit, manifiesto),
      ),
    );
  } catch (e) {
    return fin({
      ...datos,
      estado: "rechazado",
      mensaje:
        e instanceof Error ? e.message : "No se pudo conectar con el RNDC.",
    });
  }
  traza.respuestaRndc = r.respuesta || null;
  traza.intentos = r.intentos;
  if (!r.ok) return fin({ ...datos, estado: "rechazado", mensaje: r.mensaje });

  // Con radicado: se vuelve a consultar la página para que quede marcado en Silogtran
  await marcar();
  return fin({
    ...datos,
    estado: "migrado",
    radicado: r.radicado,
    mensaje: `Cumplido del manifiesto ${manifiesto} radicado con éxito bajo el número ${r.radicado}.`,
  });
}

type Medir = <T>(paso: string, fn: () => Promise<T>) => Promise<T>;

/**
 * Verifica en el RNDC el cumplido de cada remesa (proceso 5) y radica el de las
 * que no lo tengan con el XML del último intento del Visor Log Interfaz RNDC.
 */
async function cumplirRemesas(
  actor: Actor,
  acceso: AccesoRndc,
  nit: string,
  remesas: RemesaSilogtran[],
  traza: TrazaCumplido,
  medir: Medir,
): Promise<ResultadoRemesa[]> {
  const resultados: ResultadoRemesa[] = [];
  let token: string | null = null;
  const vistas = new Set<string>();
  for (const { remesa, ...silogtran } of remesas) {
    if (vistas.has(remesa)) continue;
    vistas.add(remesa);
    const t: TrazaRemesa = {
      remesa,
      silogtran,
      fechaLog: null,
      xmlEnviado: null,
      respuestaRndc: null,
      intentos: [],
    };
    traza.remesas.push(t);
    const yaCumplida = () => consultarCumplidoRemesa(acceso, nit, remesa);
    let r: ResultadoRemesa;
    try {
      r = await cumplirRemesa(remesa, t, yaCumplida, medir, async () => {
        token ??= await medir("token_visor_rndc", () =>
          tokenVisorVigente(() =>
            conSilogtran(actor, (cli) => cli.tokenVisorRndc()),
          ),
        );
        return token;
      });
    } catch (e) {
      r = {
        remesa,
        estado: "error",
        radicado: null,
        mensaje:
          e instanceof Error
            ? e.message
            : `No se pudo cumplir la remesa ${remesa}.`,
      };
    }
    resultados.push(r);
    // Una remesa que no se pudo cumplir detiene el proceso
    if (r.estado === "error") break;
  }
  return resultados;
}

async function cumplirRemesa(
  remesa: string,
  t: TrazaRemesa,
  yaCumplida: () => Promise<string | null>,
  medir: Medir,
  token: () => Promise<string>,
): Promise<ResultadoRemesa> {
  const previo = await medir(`remesa_${remesa}_consulta`, yaCumplida);
  if (previo)
    return {
      remesa,
      estado: "ya-cumplida",
      radicado: previo,
      mensaje: `La remesa ${remesa} ya tiene cumplido en el RNDC (radicado ${previo}).`,
    };

  // Sin cumplido en el RNDC: último intento guardado en el log de Silogtran
  const clave = await token();
  const envios = await medir(`remesa_${remesa}_log`, () =>
    buscarLogRndc(clave, "CUMPLIDOREMESA", remesa),
  );
  const ultimo = envios[0];
  if (!ultimo)
    return {
      remesa,
      estado: "error",
      radicado: null,
      mensaje: `La remesa ${remesa} no tiene cumplido en el RNDC ni un envío en el Visor Log Interfaz RNDC de Silogtran.`,
    };
  t.fechaLog = ultimo.fecha;
  t.xmlEnviado = ultimo.request;
  const r = await medir(`remesa_${remesa}_envio`, () =>
    registrarRndc(ultimo.request, yaCumplida),
  );
  t.respuestaRndc = r.respuesta || null;
  t.intentos = r.intentos;
  return r.ok
    ? {
        remesa,
        estado: "cumplida",
        radicado: r.radicado,
        mensaje: `Cumplido de la remesa ${remesa} radicado con éxito bajo el número ${r.radicado}.`,
      }
    : { remesa, estado: "error", radicado: null, mensaje: r.mensaje };
}
