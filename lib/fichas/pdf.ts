import PDFDocument from "pdfkit";
import type { FichaGuardada, FichaVista, Par } from "./tipos.ts";

/*
 * Fichas PDF (vehículo y conductor) con PDFKit. Portado de FVE-C (src/pdf.js):
 * misma estructura (foto + destacados, secciones con barra y rejilla
 * etiqueta/valor de 2 columnas), con la paleta salvia del portal.
 */

const VERDE = "#517051"; // primario
const VERDE_OSC = "#364E36"; // marca oscura
const ACENTO = "#95A495"; // salvia del logo
const GRIS_ETIQUETA = "#ECF1EC";
const BORDE = "#D6E0D6";
const TEXTO_ETIQUETA = "#2F4A3A";
const TEXTO_SUAVE = "#5F7266";
const SIN_INFO = "(Sin información)";
const M = 42; // ~1.5 cm
const PAD = 4;

type Doc = PDFKit.PDFDocument;
interface Celda {
  texto: string;
  fuente: string;
  tam: number;
  color?: string;
  fondo?: string | null;
}

function altoCelda(
  doc: Doc,
  texto: string,
  fuente: string,
  tam: number,
  ancho: number,
) {
  doc.font(fuente).fontSize(tam);
  return doc.heightOfString(texto, { width: ancho - PAD * 2 }) + PAD * 2;
}

function celdas([etq, val]: Par): Celda[] {
  const vacio = !(val || "").trim();
  return [
    {
      texto: etq,
      fuente: "Helvetica-Bold",
      tam: 7.5,
      color: TEXTO_ETIQUETA,
      fondo: GRIS_ETIQUETA,
    },
    {
      texto: vacio ? SIN_INFO : val.trim(),
      fuente: vacio ? "Helvetica-Oblique" : "Helvetica",
      tam: 8.5,
      color: vacio ? TEXTO_SUAVE : "#111111",
    },
  ];
}

function filasRejilla(pares: Par[], columnas: number) {
  const filas: Celda[][] = [];
  for (let i = 0; i < pares.length; i += columnas) {
    const fila = pares.slice(i, i + columnas).flatMap(celdas);
    while (fila.length < columnas * 2)
      fila.push({
        texto: "",
        fuente: "Helvetica",
        tam: 8.5,
        fondo: fila.length % 2 === 0 ? GRIS_ETIQUETA : null,
      });
    filas.push(fila);
  }
  return filas;
}

function medir(doc: Doc, filas: Celda[][], anchos: number[]) {
  return filas.map((f) =>
    Math.max(
      14,
      ...f.map((c, i) =>
        altoCelda(doc, c.texto || " ", c.fuente, c.tam, anchos[i]),
      ),
    ),
  );
}

function dibujarRejilla(
  doc: Doc,
  filas: Celda[][],
  alturas: number[],
  x: number,
  y: number,
  anchos: number[],
) {
  const fondo = doc.page.height - M;
  filas.forEach((fila, r) => {
    const h = alturas[r];
    if (y + h > fondo) {
      doc.addPage();
      y = M;
    }
    let cx = x;
    fila.forEach((c, i) => {
      const w = anchos[i];
      if (c.fondo) doc.rect(cx, y, w, h).fill(c.fondo);
      doc.rect(cx, y, w, h).lineWidth(0.5).strokeColor(BORDE).stroke();
      if (c.texto) {
        doc
          .font(c.fuente)
          .fontSize(c.tam)
          .fillColor(c.color || "#111111");
        const th = doc.heightOfString(c.texto, { width: w - PAD * 2 });
        doc.text(c.texto, cx + PAD, y + (h - th) / 2, { width: w - PAD * 2 });
      }
      cx += w;
    });
    y += h;
  });
  return y;
}

function dibujarFicha(doc: Doc, ficha: FichaVista, foto: Buffer | null) {
  const ancho = doc.page.width - M * 2;
  let y = M;

  if (ficha.consultado) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(TEXTO_SUAVE)
      .text(`Fecha consultada: ${ficha.consultado}`, M, M - 18, {
        width: ancho,
        align: "right",
        lineBreak: false,
      });
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(VERDE_OSC)
    .text(ficha.titulo, M, y, { width: ancho });
  y = doc.y + 4;
  // Línea tipo carretera bajo el título
  [VERDE, ACENTO, VERDE, ACENTO].forEach((c, i) =>
    doc.rect(M + i * 18, y, 13, 3).fill(c),
  );
  y += 12;

  // Foto + datos principales
  const anchoFoto = 198;
  const altoFoto = 156;
  let finFoto = y;
  if (foto) {
    try {
      doc.image(foto, M, y, { fit: [anchoFoto, altoFoto], align: "center" });
      finFoto = y + altoFoto;
    } catch {
      foto = null;
    }
  }
  if (!foto) {
    doc.rect(M, y, anchoFoto, altoFoto).fill("#F1F5F1");
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(TEXTO_SUAVE)
      .text(ficha.textoSinFoto, M, y + altoFoto / 2 - 5, {
        width: anchoFoto,
        align: "center",
      });
    finFoto = y + altoFoto;
  }
  const xEnc = M + anchoFoto + 14;
  const wEnc = ancho - anchoFoto - 14;
  const anchosEnc = [wEnc * 0.35, wEnc * 0.65];
  const filasEnc = filasRejilla(ficha.destacados, 1);
  const finEnc = dibujarRejilla(
    doc,
    filasEnc,
    medir(doc, filasEnc, anchosEnc),
    xEnc,
    y,
    anchosEnc,
  );
  y = Math.max(finFoto, finEnc) + 16;

  // Secciones (capas del formulario)
  const anchos = [ancho * 0.18, ancho * 0.32, ancho * 0.18, ancho * 0.32];
  const altoBarra = 22;
  for (const [titulo, pares] of ficha.secciones) {
    if (!pares.length) continue;
    const filas = filasRejilla(pares, 2);
    const alturas = medir(doc, filas, anchos);
    const total = altoBarra + alturas.reduce((a, b) => a + b, 0);
    const disponible = doc.page.height - M - y;
    if (
      total > disponible &&
      (total <= doc.page.height - M * 2 || disponible < altoBarra + alturas[0])
    ) {
      doc.addPage();
      y = M;
    }
    doc.rect(M, y, ancho, altoBarra).fill(VERDE);
    doc.rect(M, y, 4, altoBarra).fill(ACENTO);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#FFFFFF")
      .text(titulo, M + 8, y + 6, { width: ancho - 16 });
    y = dibujarRejilla(doc, filas, alturas, M, y + altoBarra, anchos) + 12;
  }
}

/** "AAAA-MM-DD HH:MM:SS" en hora de Colombia (UTC−5; el servidor corre en UTC). */
export function formatoFecha(d = new Date()) {
  const c = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${c.getUTCFullYear()}-${dos(c.getUTCMonth() + 1)}-${dos(c.getUTCDate())} ${dos(c.getUTCHours())}:${dos(c.getUTCMinutes())}:${dos(c.getUTCSeconds())}`;
}

const DESTACADOS_VEHICULO = [
  "Código",
  "Placa",
  "Ciudad Placa",
  "Propietario",
  "Poseedor",
  "Tipo Afiliado",
  "Conductor",
  "Estado",
];

export function fichaVehiculo(
  datos: FichaGuardada,
  consultado: string,
): FichaVista {
  const e = Object.fromEntries(datos.encabezadoPares);
  return {
    consultado,
    titulo: `Ficha de Vehículo ${e["Placa"] || ""}`,
    destacados: DESTACADOS_VEHICULO.map((k) => [k, e[k] || ""]),
    secciones: datos.secciones,
    textoSinFoto: "Sin foto del vehículo",
  };
}

const DESTACADOS_CONDUCTOR = [
  "Código",
  "Tipo Documento",
  "Documento",
  "Ciudad Expedición Documento",
  "Tipo Tercero",
  "Estado",
];
const NOMBRES = [
  "Primer Nombre",
  "Segundo Nombre",
  "Primer Apellido",
  "Segundo Apellido",
];

export function fichaConductor(
  datos: FichaGuardada,
  placa: string | undefined,
  consultado: string,
): FichaVista {
  const e = Object.fromEntries(datos.encabezadoPares);
  const destacados: Par[] = [
    ...DESTACADOS_CONDUCTOR.slice(0, 3).map((k): Par => [k, e[k] || ""]),
    ["Nombre", datos.nombre || ""],
    ...DESTACADOS_CONDUCTOR.slice(3).map((k): Par => [k, e[k] || ""]),
  ];
  if (placa) destacados.push(["Vehículo (placa)", placa]);
  const yaMostrados = new Set([...DESTACADOS_CONDUCTOR, ...NOMBRES]);
  return {
    consultado,
    titulo: `Ficha de Conductor ${datos.nombre || e["Documento"] || ""}`,
    destacados,
    secciones: [
      [
        "Información General",
        datos.encabezadoPares.filter(([k]) => !yaMostrados.has(k)),
      ],
      ...datos.secciones,
    ],
    textoSinFoto: "Sin foto del conductor",
  };
}

/** Genera el PDF de una o varias fichas (cada una en página nueva). */
export function generarPdf(
  fichas: { ficha: FichaVista; foto: Buffer | null }[],
) {
  const doc = new PDFDocument({
    size: "LETTER",
    margin: M,
    autoFirstPage: false,
    info: { Title: fichas.length === 1 ? fichas[0].ficha.titulo : "Fichas" },
  });
  for (const { ficha, foto } of fichas) {
    doc.addPage();
    dibujarFicha(doc, ficha, foto);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const partes: Buffer[] = [];
    doc.on("data", (c: Buffer) => partes.push(c));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    doc.end();
  });
}
