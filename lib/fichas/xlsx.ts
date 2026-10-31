import { crearZip } from "./zip.ts";
import type { Par, FichaGuardada } from "./tipos.ts";

/**
 * Libro Excel (.xlsx) mínimo sin dependencias: varias hojas, encabezado en
 * negrilla, primera fila fija y autofiltro. Todas las celdas van como texto
 * para conservar ceros a la izquierda (documentos, RUNT, pólizas).
 * Portado de FVE-C (src/xlsx.js); encabezado con el verde de Elogia.
 */

const xml = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columna(n: number) {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function hojaXml(columnas: string[], filas: string[][]) {
  const anchos = columnas.map((c, i) =>
    Math.min(
      60,
      Math.max(
        10,
        String(c).length + 2,
        ...filas.map((f) => String(f[i] ?? "").length + 2),
      ),
    ),
  );
  const celda = (valor: string, ref: string, estilo: number) =>
    `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
  const filaXml = (valores: string[], r: number, estilo: number) =>
    `<row r="${r}">${valores.map((v, i) => celda(v, `${columna(i)}${r}`, estilo)).join("")}</row>`;
  const ultima = `${columna(Math.max(columnas.length - 1, 0))}${filas.length + 1}`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${filaXml(columnas, 1, 1)}${filas.map((f, i) => filaXml(f, i + 2, 0)).join("")}</sheetData>` +
    (columnas.length ? `<autoFilter ref="A1:${ultima}"/>` : "") +
    "</worksheet>"
  );
}

// Encabezado: texto blanco en negrilla sobre el verde primario de Elogia (#517051)
const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF517051"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: string[][];
}

export function crearXlsx(hojas: Hoja[]) {
  const ct =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    hojas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const libro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${hojas.map((h, i) => `<sheet name="${xml(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    (hojas.some((h) => h.columnas.length)
      ? `<definedNames>${hojas
          .map((h, i) =>
            h.columnas.length
              ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(h.nombre.slice(0, 31))}'!$A$1:$${columna(h.columnas.length - 1)}$${h.filas.length + 1}</definedName>`
              : "",
          )
          .join("")}</definedNames>`
      : "") +
    "</workbook>";
  const libroRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    hojas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";

  const B = (s: string) => Buffer.from(s, "utf8");
  return crearZip([
    { nombre: "[Content_Types].xml", datos: B(ct) },
    { nombre: "_rels/.rels", datos: B(rels) },
    { nombre: "xl/workbook.xml", datos: B(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: B(libroRels) },
    { nombre: "xl/styles.xml", datos: B(ESTILOS) },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: B(hojaXml(h.columnas, h.filas)),
    })),
  ]);
}

/**
 * Une registros [[etiqueta, valor], …] de varias fichas en columnas comunes
 * (en orden de aparición).
 */
export function tabla(registros: Par[][]) {
  const columnas: string[] = [];
  const filas = registros.map((pares) => {
    const fila: Record<string, string> = {};
    for (const [col, valor] of pares) {
      if (!columnas.includes(col)) columnas.push(col);
      fila[col] = valor;
    }
    return fila;
  });
  return { columnas, filas: filas.map((f) => columnas.map((c) => f[c] ?? "")) };
}

/**
 * Aplana encabezado + secciones de una ficha a pares únicos. Etiquetas
 * repetidas se distinguen con el nombre de la sección.
 */
export function aplanar(ficha: FichaGuardada, inicio: Par[] = []) {
  const vistos = new Set(inicio.map(([k]) => k));
  const pares: Par[] = [...inicio];
  const agregar = (k: string, v: string, seccion: string) => {
    let col = k;
    if (vistos.has(col)) col = `${k} (${seccion})`;
    vistos.add(col);
    pares.push([col, v]);
  };
  for (const [k, v] of ficha.encabezadoPares) agregar(k, v, "Encabezado");
  for (const [titulo, campos] of ficha.secciones)
    for (const [k, v] of campos) agregar(k, v, titulo);
  return pares;
}
