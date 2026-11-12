/**
 * Prueba sin conexión de Estudios: interpretación de respuestas de TusDatos,
 * plan de consultas (cabezote y remolque), trazas y cliente HTTP contra un
 * servidor falso que responde como dice docs.tusdatos.co. No gasta créditos.
 *
 * Uso: npm run test:estudios
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type EntradaConsulta,
  hallazgosDelReporte,
  interpretarResultado,
  nivelMasGrave,
  normalizarNivel,
  planDeConsultas,
  rutaReporte,
} from "../lib/estudios/resultado.ts";
import {
  enmascarar,
  trazaEnvio,
  trazaRespuesta,
} from "../lib/estudios/traza.ts";
import {
  clienteTusDatos,
  esReintentable,
  TusDatosError,
} from "../lib/estudios/tusdatos.ts";

// ─── Niveles: el ejemplo oficial trae "Alto" con mayúscula ───────────────────
assert.equal(normalizarNivel("Alto"), "alto");
assert.equal(normalizarNivel("medio"), "medio");
assert.equal(normalizarNivel(""), "sin_hallazgo");
assert.equal(normalizarNivel(undefined), "sin_hallazgo");
assert.equal(nivelMasGrave(["info", "alto", "bajo"]), "alto");
assert.equal(nivelMasGrave([]), "sin_hallazgo");

// ─── Resultado finalizado (ejemplo de la documentación) ──────────────────────
const finalizado = {
  estado: "finalizado",
  id: "651c2ede72476080772781f5",
  nombre: "MIGUEL FERNANDO PEREZ GOMEZ",
  hallazgo: true,
  hallazgos: "Alto",
  error: true,
  errores: ["Fuente caida"],
  results: {
    Procuraduria: true,
    "Policia Nacional": false,
    Registraduria: "Error",
  },
};
const sinDetalle = interpretarResultado(finalizado);
assert.equal(
  sinDetalle.nivel,
  "alto",
  "Alto no puede quedar como sin hallazgo",
);
assert.equal(sinDetalle.reportId, finalizado.id);
assert.deepEqual(sinDetalle.fuentes, {
  Procuraduria: "hallazgo",
  "Policia Nacional": "ok",
  Registraduria: "error",
  "Fuente caida": "error",
});
assert.equal(sinDetalle.hallazgos.length, 1, "sin reporte: uno por fuente");
assert.equal(sinDetalle.hallazgos[0].codigo, "sin_detalle");

// Con /api/report_json: los hallazgos reales, con su nivel y código estable
const reporte = {
  dict_hallazgos: {
    altos: [
      {
        codigo: "policia",
        fuente: "Policia",
        hallazgo: "Antecedentes",
        descripcion: "Detalle",
      },
    ],
    medios: [],
    bajos: [{ codigo: "sisben", fuente: "Sisben", hallazgo: "Registro" }],
  },
};
assert.equal(hallazgosDelReporte(reporte).length, 2);
const conDetalle = interpretarResultado(finalizado, reporte);
assert.equal(conDetalle.hallazgos[0].codigo, "policia");
assert.equal(conDetalle.hallazgos[1].descripcion, "Registro");
// Si el detalle es más grave que el resumen, manda el detalle
assert.equal(
  interpretarResultado({ ...finalizado, hallazgos: "" }, reporte).nivel,
  "alto",
);
assert.equal(
  interpretarResultado({ estado: "finalizado", hallazgos: "", results: {} })
    .hallazgos.length,
  0,
);

// ─── Plan de consultas ───────────────────────────────────────────────────────
const vacio: Omit<EntradaConsulta, "tipoDocumento"> = {
  documento: null,
  nombre: null,
  fechaExpedicion: null,
  placa: null,
  tipoDocPropietario: null,
  placaRemolque: null,
  tipoDocPropietarioRemolque: null,
  documentoPropietarioRemolque: null,
  tipoDocTenedor: null,
  documentoTenedor: null,
  fechaExpedicionTenedor: null,
  tipoDocConductor: null,
  documentoConductor: null,
  fechaExpedicionConductor: null,
  incluirAntecedentes: false,
};
const documento = planDeConsultas({
  ...vacio,
  tipoDocumento: "CC",
  documento: "111",
});
assert.equal(documento.length, 1);
assert.equal(documento[0].rol, "documento");

const soloCabezote = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
});
assert.deepEqual(
  soloCabezote.map((c) => c.rol),
  ["cabezote"],
);

const mismoDueno = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
  placaRemolque: "R12345",
  incluirAntecedentes: true,
});
assert.equal(mismoDueno.length, 3);
assert.equal(mismoDueno[1].rol, "remolque");
assert.equal(mismoDueno[1].placa, "R12345");
assert.equal(mismoDueno[1].documento, "111", "mismo propietario del cabezote");
assert.equal(mismoDueno[1].tipoDoc, "CC");

const otroDueno = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
  placaRemolque: "S54321",
  tipoDocPropietarioRemolque: "NIT",
  documentoPropietarioRemolque: "900123",
  incluirAntecedentes: true,
});
assert.equal(otroDueno[1].documento, "900123");
assert.equal(otroDueno[1].tipoDoc, "NIT");

// Sin la casilla de antecedentes: solo el cabezote, aunque escriban el resto
const comboSinAntecedentes = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
  placaRemolque: "S54321",
  tipoDocPropietarioRemolque: "NIT",
  documentoPropietarioRemolque: "900123",
  tipoDocTenedor: "CC",
  documentoTenedor: "222",
  tipoDocConductor: "CC",
  documentoConductor: "333",
});
assert.deepEqual(
  comboSinAntecedentes.map((c) => c.rol),
  ["cabezote"],
);
assert.equal(comboSinAntecedentes[0].documento, "111");

// Con la casilla: placas + todas las personas diligenciadas
const comboCompleto = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
  placaRemolque: "S54321",
  tipoDocPropietarioRemolque: "NIT",
  documentoPropietarioRemolque: "900123",
  tipoDocTenedor: "CC",
  documentoTenedor: "222",
  tipoDocConductor: "CE",
  documentoConductor: "333",
  fechaExpedicionConductor: "2001-04-19",
  incluirAntecedentes: true,
});
assert.deepEqual(
  comboCompleto.map((c) => c.rol),
  ["cabezote", "remolque", "propietario", "prop_remolque", "tenedor", "conductor"],
);
assert.equal(comboCompleto[3].documento, "900123");
assert.equal(comboCompleto[5].fechaExpedicion, "2001-04-19");

// Remolque del mismo dueño: el propietario se consulta una sola vez
const comboMismoDueno = planDeConsultas({
  ...vacio,
  tipoDocumento: "PLACA",
  documento: "111",
  placa: "ABC123",
  tipoDocPropietario: "CC",
  placaRemolque: "R12345",
  incluirAntecedentes: true,
});
assert.deepEqual(
  comboMismoDueno.map((c) => c.rol),
  ["cabezote", "remolque", "propietario"],
);

// ─── Rutas del reporte ───────────────────────────────────────────────────────
assert.equal(rutaReporte("documento", "CC", "html", "x"), "/api/v2/report/x");
assert.equal(
  rutaReporte("documento", "NIT", "pdf", "x"),
  "/api/v2/report_nit_pdf/x?async=true",
);
assert.equal(
  rutaReporte("remolque", "CC", "html", "x"),
  "/api/v2/report_car/x",
);
assert.equal(
  rutaReporte("cabezote", "CC", "pdf", "x"),
  "/api/v2/report_car_pdf/x?async=true",
);

// ─── Trazas: sin datos personales por defecto ────────────────────────────────
assert.equal(enmascarar("1234567890"), "••••••7890");
assert.deepEqual(trazaEnvio({ placa: "ABC123", tdoc: "CC", doc: 1234567890 }), {
  placa: "ABC123",
  tdoc: "CC",
  doc: "••••••7890",
});
const resumen = trazaRespuesta(finalizado) as Record<string, unknown>;
assert.equal(resumen.nombre, undefined, "el resumen no lleva el nombre");
assert.equal(resumen.results, undefined, "ni las fuentes por nombre");
assert.equal(resumen.fuentes, 3);
assert.equal(resumen.hallazgos, "Alto");

process.env.TUSDATOS_LOG_COMPLETO = "true";
assert.equal(
  (trazaEnvio({ doc: 123456 }) as { doc: number }).doc,
  123456,
  "en modo completo va todo",
);
delete process.env.TUSDATOS_LOG_COMPLETO;

// ─── Cliente contra un servidor falso ────────────────────────────────────────
const recibidos: {
  metodo: string;
  url: string;
  auth?: string;
  cuerpo: unknown;
}[] = [];
const servidor = createServer((req, res) => {
  let texto = "";
  req.on("data", (d) => (texto += d));
  req.on("end", () => {
    recibidos.push({
      metodo: req.method ?? "",
      url: req.url ?? "",
      auth: req.headers.authorization,
      cuerpo: texto ? JSON.parse(texto) : null,
    });
    const responder = (status: number, cuerpo: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cuerpo));
    };
    if (req.url === "/api/launch/car") {
      const placa = (JSON.parse(texto) as { placa: string }).placa;
      if (placa === "R00000")
        return responder(422, { detail: "Placa no válida" });
      // Caso real (SOL-000005): 200 con error y SIN jobid
      if (placa === "R41538")
        return responder(200, {
          error:
            "Se presentó una falla iniciando la consulta, realice la consulta nuevamente.",
        });
      // No responde a tiempo
      if (placa === "LEN700") return;
      return responder(200, {
        jobid: `job-${placa}`,
        vehiculo: { marca: "KENWORTH" },
        soat: {},
        revision: {},
      });
    }
    if (req.url === "/api/launch") return responder(200, { jobid: "job-doc" });
    if (req.url === "/api/results/en-proceso")
      return responder(207, { estado: "procesando", percentage: 65 });
    if (req.url === "/api/results/listo") return responder(200, finalizado);
    if (req.url === "/api/results/vencido")
      return responder(404, { estado: "error, tarea no valida" });
    if (req.url === "/api/results/fallido")
      return responder(500, { estado: "error, consulta fallida" });
    if (req.url === "/api/results/sin-permiso")
      return responder(401, { detail: "No autenticado" });
    return responder(404, { detail: "no existe" });
  });
});
await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
const { port } = servidor.address() as AddressInfo;
const cliente = clienteTusDatos({
  usuario: "usuario",
  clave: "clave",
  baseUrl: `http://127.0.0.1:${port}`,
});

// Cabezote y remolque: dos consultas por aparte, con doc numérico (LaunchCarIn)
const cabezote = await cliente.lanzarVehiculo({
  placa: "ABC123",
  tdoc: "CC",
  doc: 111222,
});
assert.equal(cabezote.jobid, "job-ABC123");
assert.deepEqual(cabezote.vehiculo, { marca: "KENWORTH" });
const remolque = await cliente.lanzarVehiculo({
  placa: "R12345",
  tdoc: "NIT",
  doc: 900123,
});
assert.equal(remolque.jobid, "job-R12345");
const enviados = recibidos.filter((r) => r.url === "/api/launch/car");
assert.deepEqual(enviados[0].cuerpo, {
  placa: "ABC123",
  tdoc: "CC",
  doc: 111222,
});
assert.deepEqual(enviados[1].cuerpo, {
  placa: "R12345",
  tdoc: "NIT",
  doc: 900123,
});
assert.equal(
  enviados[0].auth,
  `Basic ${Buffer.from("usuario:clave").toString("base64")}`,
);

await assert.rejects(
  cliente.lanzarVehiculo({ placa: "R00000", tdoc: "CC", doc: 1 }),
  /422.*Placa no válida/,
  "un rechazo llega con el mensaje de TusDatos",
);

const rechazo = await cliente
  .lanzarVehiculo({ placa: "R00000", tdoc: "CC", doc: 1 })
  .catch((e: unknown) => e);
assert.equal(esReintentable(rechazo), false, "un 422 es definitivo");

const sinJob = await cliente
  .lanzarVehiculo({ placa: "R41538", tdoc: "CC", doc: 1 })
  .catch((e: unknown) => e);
assert.ok(
  sinJob instanceof TusDatosError,
  "un 200 sin jobid NO es una consulta lanzada",
);
assert.match(sinJob.message, /realice la consulta nuevamente/);
assert.equal(esReintentable(sinJob), true, "200 sin jobid: se relanza");

const impaciente = clienteTusDatos({
  usuario: "usuario",
  clave: "clave",
  baseUrl: `http://127.0.0.1:${port}`,
  timeoutLanzarMs: 300,
});
const lento = await impaciente
  .lanzarVehiculo({ placa: "LEN700", tdoc: "CC", doc: 1 })
  .catch((e: unknown) => e);
assert.ok(lento instanceof Error);
assert.match(lento.message, /TusDatos no respondió/);
assert.equal(esReintentable(lento), true, "tiempo agotado: se relanza");

assert.equal((await cliente.estado("en-proceso")).fase, "procesando");
const listo = await cliente.estado("listo");
assert.equal(listo.fase, "finalizado");
const vencido = await cliente.estado("vencido");
assert.deepEqual(vencido, { fase: "error", mensaje: "error, tarea no valida" });
const fallido = await cliente.estado("fallido");
assert.deepEqual(fallido, {
  fase: "error",
  mensaje: "error, consulta fallida",
});
await assert.rejects(
  cliente.estado("sin-permiso"),
  /401/,
  "credenciales malas: no se marca la consulta como fallida, se reintenta",
);

servidor.closeAllConnections();
await new Promise((ok) => servidor.close(ok));
console.log("\nTodo en orden.");
