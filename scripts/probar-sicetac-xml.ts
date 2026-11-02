/**
 * Prueba sin conexión de Expedir manifiesto SICETAC: lectura de la página del
 * ministerio (tests/fixtures/muestra_ministerio_man045.html, caso real del
 * manifiesto 0101223914 con credenciales reemplazadas) y ajuste del XML.
 *
 * Uso: npm run test:sicetac
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { leerPaginaMinisterio } from "../lib/sicetac/ministerio.ts";
import {
  ajustarXml,
  leerXmlManifiesto,
  valoresAjustados,
} from "../lib/sicetac/xml.ts";
import { normalizarManifiesto } from "../lib/sicetac/manifiesto.ts";

const html = fs.readFileSync(
  path.join("tests", "fixtures", "muestra_ministerio_man045.html"),
  "utf8",
);
const estado = leerPaginaMinisterio(html);
console.log("Mensaje:", estado.mensaje);
assert.ok(
  estado.mensaje.startsWith(
    "Error MAN045: La Empresa de Transporte únicamente",
  ),
  estado.mensaje,
);
assert.ok(estado.errorSicetac, "debe detectar el MAN045");
assert.ok(!estado.registrado);
assert.ok(
  estado.xml?.includes("<procesoid>4</procesoid>"),
  "trae el XML del manifiesto",
);

const d = leerXmlManifiesto(estado.xml!);
console.log(
  d.manifiesto,
  d.origen,
  "→",
  d.destino,
  d.placa,
  d.remolque,
  "flete",
  d.flete,
  "remesas",
  d.remesas,
);
assert.equal(d.manifiesto, "0101223914");
assert.equal(d.flete, 2100000);
assert.equal(d.retencionFuente, 21000);
assert.equal(d.retencionFopat, 2100);
assert.deepEqual(d.remesas, ["0101224900"]);
assert.equal(d.acceso.username, "USUARIO_PRUEBA");

const v = valoresAjustados(d, 2255448);
assert.deepEqual(v, {
  flete: 2255448,
  retencionFuente: 22554,
  retencionFopat: 2255,
});
const nuevo = ajustarXml(estado.xml!, v);
assert.ok(
  nuevo.includes("<valorFletePactadoViaje>2255448</valorFletePactadoViaje>"),
);
assert.ok(
  nuevo.includes(
    "<retencionFuenteManifiesto>22554</retencionFuenteManifiesto>",
  ),
);
assert.ok(nuevo.includes("<RETENCIONFOPAT>2255</RETENCIONFOPAT>"));
// Nada más cambia
const quitar = (x: string) =>
  x.replace(
    /<(valorFletePactadoViaje|retencionFuenteManifiesto|RETENCIONFOPAT)>[^<]*/g,
    "<$1>",
  );
assert.equal(quitar(nuevo), quitar(estado.xml!));

assert.equal(normalizarManifiesto("101223914"), "0101223914");
assert.equal(normalizarManifiesto("0101223914"), "0101223914");
console.log("\nTodo en orden.");
