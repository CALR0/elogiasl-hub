import "server-only";
import { calcular, type ResultadoCalculo } from "@/lib/sicetac/servicio";

/*
 * Herramienta del chat: dado un número de manifiesto, calcula el SICETAC
 * usando la MISMA lógica del módulo "Expedir manifiesto SICETAC" (ministerio
 * → Silogtran para horas + tipo de carga → RNDC proceso 12 para la
 * configuración del vehículo → portal SICETAC con sus postbacks).
 *
 * No envía nada al RNDC: solo devuelve el resultado para que Elia lo cuente.
 *
 * Solo se corre si el usuario pregunta explícitamente por SICETAC, porque
 * el cálculo tarda ~5-10 s (una vuelta por Silogtran, RNDC y el portal).
 */

export interface AnalisisSicetac {
  manifiesto: string;
  estado: ResultadoCalculo["estado"];
  mensaje: string;
  /** Flete pactado actual (el que trae el XML del Ministerio). */
  flete: number | null;
  /** SICETAC vigente para el viaje. */
  sicetac: number | null;
  diferencia: number | null;
  nuevo: ResultadoCalculo["nuevo"];
  detalle: ResultadoCalculo["detalle"];
}

export async function analizarSicetac(
  actor: { id: string; email: string },
  manifiesto: string,
): Promise<AnalisisSicetac> {
  const num = manifiesto.replace(/\D/g, "");
  if (!num)
    return {
      manifiesto,
      estado: "error",
      mensaje: "No se reconoció un número de manifiesto válido.",
      flete: null,
      sicetac: null,
      diferencia: null,
      nuevo: null,
      detalle: null,
    };

  try {
    const { resultado } = await calcular(actor, num);
    const diferencia =
      resultado.flete !== null && resultado.sicetac !== null
        ? resultado.sicetac - resultado.flete
        : null;
    return {
      manifiesto: num,
      estado: resultado.estado,
      mensaje: resultado.mensaje,
      flete: resultado.flete,
      sicetac: resultado.sicetac,
      diferencia,
      nuevo: resultado.nuevo,
      detalle: resultado.detalle,
    };
  } catch (e) {
    return {
      manifiesto: num,
      estado: "error",
      mensaje:
        e instanceof Error
          ? `No se pudo calcular el SICETAC: ${e.message}`
          : "No se pudo calcular el SICETAC.",
      flete: null,
      sicetac: null,
      diferencia: null,
      nuevo: null,
      detalle: null,
    };
  }
}

const peso = (n: number | null) =>
  n === null ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`;

/** Bloque legible que se adjunta al prompt como contexto del SICETAC. */
export function contextoSicetacParaIA(a: AnalisisSicetac): string {
  const lineas: string[] = [
    `Cálculo del SICETAC del manifiesto ${a.manifiesto} (misma lógica del módulo "Expedir manifiesto SICETAC"):`,
    "",
    `- Estado del cálculo: ${a.estado}`,
    `- Mensaje: ${a.mensaje}`,
    `- Flete pactado actual: ${peso(a.flete)}`,
    `- SICETAC vigente del viaje: ${peso(a.sicetac)}`,
  ];
  if (a.diferencia !== null) {
    if (a.diferencia > 0)
      lineas.push(`- Diferencia: el flete está ${peso(a.diferencia)} POR DEBAJO del SICETAC.`);
    else if (a.diferencia < 0)
      lineas.push(`- Diferencia: el flete está ${peso(-a.diferencia)} por encima del SICETAC (cumple).`);
    else lineas.push("- Diferencia: el flete coincide exactamente con el SICETAC.");
  }
  if (a.detalle) {
    lineas.push(
      "",
      "Datos usados en el cálculo:",
      `- Ruta: ${a.detalle.ruta}`,
      `- Configuración del vehículo: ${a.detalle.configuracion} — ${a.detalle.vehiculo}`,
      `- Carga: ${a.detalle.carga}`,
      `- Horas de cargue: ${a.detalle.horasCargue}`,
      `- Horas de descargue: ${a.detalle.horasDescargue}`,
    );
  }
  if (a.nuevo) {
    lineas.push(
      "",
      "Retenciones que quedarían con el flete ajustado:",
      `- Flete nuevo: ${peso(a.nuevo.flete)}`,
      `- Retención en la fuente (1 %): ${peso(a.nuevo.retencionFuente)}`,
      `- FOPAT (0,1 %): ${peso(a.nuevo.retencionFopat)}`,
    );
  }
  return lineas.join("\n");
}

/** ¿El último mensaje pide un cálculo SICETAC? */
export function pideSicetac(texto: string): boolean {
  return /\bsicetac\b|\bflete\s+(m[ií]nimo|vigente|del?\s+viaje)|cu[aá]nto\s+(deber[ií]a|es)\s+el\s+(flete|sicetac)|cu[aá]l\s+es\s+el\s+(flete|sicetac)|calcul[ae]r?.*sicetac/i.test(
    texto,
  );
}
