import "server-only";
import { conSilogtran, type Actor } from "@/lib/silogtran/sesion-servicio.ts";
import { procesarPayloads } from "./aws.ts";
import { parsearPayloads } from "./parser.ts";
import { normalizarPlanilla, type TipoBusqueda } from "./planilla.ts";
import type { FilaMigracion } from "./tipos.ts";

/**
 * Migra a SAP los anticipos de UNA planilla o UN consolidado: busca los
 * payloads en el Log de la Interfaz de Silogtran (cuenta de servicio, sesión
 * compartida) y los reenvía a AWS. Portado de SMA (/api/procesar).
 */
export async function migrarValor(
  actor: Actor,
  tipo: TipoBusqueda,
  valor: string,
): Promise<FilaMigracion[]> {
  const html = await conSilogtran(actor, (cli) =>
    cli.buscarLogInterfaz(tipo, valor),
  );
  const payloads = parsearPayloads(html, tipo, valor);
  if (!payloads.length) {
    return [
      {
        consolidado: tipo === "consolidado" ? valor : null,
        planilla: tipo === "planilla" ? normalizarPlanilla(valor) : "—",
        estado: "Error",
        httpStatus: null,
        mensaje: `No se encontró ningún anticipo en Silogtran para ${tipo === "planilla" ? "la planilla" : "el consolidado"} ${valor}.`,
        info: null,
        entrada: null,
        simulado: false,
        enviado: false,
      },
    ];
  }
  return procesarPayloads(payloads);
}
