/**
 * Prueba sin conexión de Migración anticipo SAP: el parser del Log de la
 * Interfaz (tests/fixtures/muestra_log_interfaz.html imita su estructura:
 * payload HTML-escapado en un textarea *_hl_parametrosentrada y consolidado en
 * el input *_hl_documento) y el manejo de planillas/duplicados.
 *
 * Uso: npm run test:anticipos
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parsearPayloads } from "../lib/anticipos/parser.ts";
import {
  entradasUnicas,
  normalizarPlanilla,
} from "../lib/anticipos/planilla.ts";

const html = fs.readFileSync(
  path.join("tests", "fixtures", "muestra_log_interfaz.html"),
  "utf8",
);

const porPlanilla = parsearPayloads(html, "planilla", "0101224688");
console.log(
  porPlanilla.map(
    (p) => `${p.planilla} · consolidado ${p.consolidado} · ${p.payload.type}`,
  ),
);
assert.equal(
  porPlanilla.length,
  2,
  "solo create/update; descarta LogById y textareas ajenos",
);
assert.equal(
  porPlanilla[0].consolidado,
  "20126",
  "consolidado sacado del enlace contra_codigo",
);
assert.equal(
  porPlanilla[1].planilla,
  "0101224681",
  "planilla sin 0 inicial se normaliza",
);
assert.equal(
  porPlanilla[0].payload.id,
  "a1b2c3",
  "JSON escapado se decodifica",
);

const porConsolidado = parsearPayloads(html, "consolidado", "20126");
assert.ok(
  porConsolidado.every((p) => p.consolidado === "20126"),
  "por consolidado usa el valor buscado",
);

assert.equal(normalizarPlanilla("101224688"), "0101224688");
assert.equal(normalizarPlanilla("0101224688"), "0101224688");
assert.equal(normalizarPlanilla("ABC"), "ABC");

const { unicas, duplicadas } = entradasUnicas(
  "101224688, 0101224688\n0101219923;0101219923",
  "planilla",
);
assert.deepEqual(unicas, ["101224688", "0101219923"]);
assert.equal(duplicadas, 2);

console.log("\nTodo en orden.");
