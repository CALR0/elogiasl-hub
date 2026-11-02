/**
 * Prueba sin conexión de Migración cumplido RNDC: lectura de la página de
 * cumplidos (tests/fixtures/muestra_cumplido_cma273.html, caso real del
 * manifiesto 0101224880 con credenciales reemplazadas) y ajuste del XML.
 *
 * Uso: npm run test:cumplidos
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { leerPaginaCumplido } from "../lib/cumplidos/pagina.ts";
import {
  ajustarCumplido,
  correcciones,
  retencionesDelXml,
} from "../lib/cumplidos/xml.ts";

const html = fs.readFileSync(
  path.join("tests", "fixtures", "muestra_cumplido_cma273.html"),
  "utf8",
);
const e = leerPaginaCumplido(html);
console.log("Mensaje:", e.mensaje);
assert.deepEqual(e.errores, ["CMA273"]);
assert.deepEqual(e.remesas, [
  { remesa: "0101225872", estado: "CUMPLIDA", radicado: "145290477" },
]);
assert.ok(!e.registrado);
assert.ok(
  e.xml?.includes("<procesoid>6</procesoid>"),
  "trae el XML del cumplido",
);
assert.ok(
  e.xml?.includes("<username>USUARIO_PRUEBA</username>"),
  "XML decodificado (URL + HTML)",
);
assert.deepEqual(retencionesDelXml(e.xml!), { fopat: 4950, fuente: 49500 });

// Flete pactado en el RNDC: 5.300.000 → FOPAT 5.300 y retención en la fuente 53.000
const c = correcciones(e.errores, 5_300_000);
assert.deepEqual(c, { fopat: 5300, fuente: 53000 });
const nuevo = ajustarCumplido(e.xml!, c);
assert.ok(nuevo.includes("<RETENCIONFOPAT>5300</RETENCIONFOPAT>"));
assert.ok(
  nuevo.includes(
    "<RETENCIONFUENTEMANIFIESTO>53000</RETENCIONFUENTEMANIFIESTO>",
  ),
);
const sinRet = (x: string) =>
  x.replace(/<(RETENCIONFOPAT|RETENCIONFUENTEMANIFIESTO)>[^<]*/g, "<$1>");
assert.equal(sinRet(nuevo), sinRet(e.xml!), "nada más cambia");

// CMA262: solo la retención en la fuente; si falta la etiqueta, se agrega
assert.deepEqual(correcciones(["CMA262"], 1_000_000), { fuente: 10000 });
const sinFuente = e.xml!.replace(
  /<RETENCIONFUENTEMANIFIESTO>[^<]*<\/RETENCIONFUENTEMANIFIESTO>/,
  "",
);
const agregado = ajustarCumplido(sinFuente, { fuente: 10000 });
assert.ok(
  agregado.includes(
    "<RETENCIONFUENTEMANIFIESTO>10000</RETENCIONFUENTEMANIFIESTO></variables>",
  ),
);
assert.ok(
  agregado.includes("<RETENCIONFOPAT>4950</RETENCIONFOPAT>"),
  "FOPAT no se toca con CMA262",
);

console.log("\nTodo en orden.");
