/**
 * Prueba sin conexión de Generar ficha técnica: parsea las fichas de muestra
 * (tests/fixtures, tomadas de Silogtran) y genera los PDF y el Excel en una
 * carpeta temporal. No se conecta a Silogtran.
 *
 * Uso: npm run test:fichas
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parsearConductor, parsearVehiculo } from "../lib/fichas/parser.ts";
import {
  fichaConductor,
  fichaVehiculo,
  formatoFecha,
  generarPdf,
} from "../lib/fichas/pdf.ts";
import { aplanar, crearXlsx, tabla } from "../lib/fichas/xlsx.ts";

const BASE = "https://construproyec.colombiasoftware.net/";
const leer = (f: string) =>
  fs.readFileSync(path.join("tests", "fixtures", f), "utf8");

const v = parsearVehiculo(leer("muestra_vehiculo.html"), BASE);
const ev = Object.fromEntries(v.ficha.encabezadoPares);
console.log("Vehículo", ev["Placa"], "· conductor =", v.conductorCodigo);
for (const [t, p] of v.ficha.secciones)
  console.log(`  ${t}: ${p.length} campos`);
assert.ok(ev["Placa"], "la placa debe leerse");
assert.ok(v.conductorCodigo, "debe traer el código del conductor");
assert.equal(v.ficha.secciones.length, 4);
assert.ok(
  v.ficha.secciones.every(([, p]) => p.length > 0),
  "todas las secciones con datos",
);

const c = parsearConductor(leer("muestra_conductor.html"), BASE);
const ec = Object.fromEntries(c.encabezadoPares);
console.log("Conductor", c.nombre, "· documento =", ec["Documento"]);
for (const [t, p] of c.secciones) console.log(`  ${t}: ${p.length} campos`);
assert.ok(c.nombre, "el nombre del conductor debe armarse");
assert.ok(ec["Documento"], "el documento debe leerse");

const salida = fs.mkdtempSync(path.join(os.tmpdir(), "fichas-"));
const consultado = formatoFecha();
const pdfV = await generarPdf([
  { ficha: fichaVehiculo(v.ficha, consultado), foto: null },
]);
const pdfC = await generarPdf([
  { ficha: fichaConductor(c, ev["Placa"], consultado), foto: null },
]);
assert.equal(pdfV.subarray(0, 5).toString(), "%PDF-");
assert.equal(pdfC.subarray(0, 5).toString(), "%PDF-");

const xlsx = crearXlsx([
  {
    nombre: "Vehículos",
    ...tabla([aplanar(v.ficha, [["Fecha consultada", consultado]])]),
  },
  {
    nombre: "Conductores",
    ...tabla([
      aplanar(c, [
        ["Placa vehículo", ev["Placa"]],
        ["Nombre completo", c.nombre!],
      ]),
    ]),
  },
]);
assert.equal(xlsx.subarray(0, 2).toString(), "PK");

fs.writeFileSync(path.join(salida, "ficha_vehiculo.pdf"), pdfV);
fs.writeFileSync(path.join(salida, "ficha_conductor.pdf"), pdfC);
fs.writeFileSync(path.join(salida, "fichas.xlsx"), xlsx);
console.log(
  `\nTodo en orden. PDF: ${pdfV.length} y ${pdfC.length} bytes · Excel: ${xlsx.length} bytes`,
);
console.log("Archivos en:", salida);
