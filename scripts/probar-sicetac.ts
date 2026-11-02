/**
 * Diagnóstico del cálculo SICETAC contra el portal del Ministerio (solo
 * consulta, no envía nada). Por defecto: Manizales → Buenaventura, 3S3,
 * general cargado, 2 + 2 h (caso del manifiesto 0101223914).
 *
 * Uso: npm run probar:sicetac -- [CONFIG] [ORIGEN] [DESTINO] [HORASC] [HORASD]
 */
import { calcularSicetac } from "../lib/sicetac/portal.ts";

const [
  config = "3S3",
  origen = "17001000",
  destino = "76109000",
  hc = "2",
  hd = "2",
] = process.argv.slice(2);

const c = new Date(Date.now() - 5 * 3600_000);
const periodo = c.toISOString().slice(0, 10).replace(/-/g, "");

const t0 = Date.now();
const r = await calcularSicetac({
  CONFIGURACION: config,
  CONDICIONCARGA: "1",
  UNIDADTRANSPORTE: "1",
  TIPOCARGA: "12",
  ORIGEN: origen,
  DESTINO: destino,
  HORASCARGUE: hc,
  HORASDESCARGUE: hd,
  periodo,
});
console.log(
  `SICETAC: $${r.total.toLocaleString("es-CO")} · ruta ${r.ruta} · ${r.distanciaKm} km`,
);
console.log(
  "Rutas ofrecidas:",
  r.rutasDisponibles.map((x) => `${x.valor}=${x.texto}`).join(" | "),
);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
