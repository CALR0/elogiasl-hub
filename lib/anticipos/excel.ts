import type { FilaMigracion } from "./tipos.ts";

/*
 * Excel de resultados de la migración, armado en el navegador con
 * xlsx-js-style (como en SMA): encabezado fijo, columnas Entrada (payload
 * enviado a SAP) y Respuesta (mensaje + bloque Info), estado en color.
 * La librería se carga solo al exportar.
 */

/** Texto de "Respuesta": mensaje + bloque Info de AWS. */
export function textoRespuesta(f: FilaMigracion) {
  if (!f.info) return f.mensaje || "";
  const { createdAt, data, entity, id } = f.info;
  return `${f.mensaje}\n\nInfo:\n${JSON.stringify({ createdAt, data, entity, id }, null, 4)}`;
}

const BORDE = { style: "thin", color: { rgb: "FFD0D5DD" } };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
const ESTILO_CABECERA = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "FF517051" } }, // verde primario de Elogia
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDES,
};
const COLOR_ESTADO: Record<FilaMigracion["estado"], string> = {
  Exitoso: "FF15803D",
  Duplicado: "FFB45309",
  Error: "FFB91C1C",
};

export async function exportarExcel(filas: FilaMigracion[]) {
  const XLSX = await import("xlsx-js-style");
  const matriz = [
    [
      "Consolidado transferencia",
      "Número de planilla",
      "Estado migración",
      "Estado HTTP",
      "Entrada",
      "Respuesta",
    ],
    ...filas.map((f) => [
      f.consolidado || "-",
      f.planilla || "-",
      f.simulado ? `${f.estado} (simulado)` : f.estado,
      f.httpStatus ?? "-",
      f.entrada ? JSON.stringify(f.entrada, null, 4) : "",
      textoRespuesta(f),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(matriz);
  ws["!cols"] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 60 },
    { wch: 82 },
  ];
  ws["!rows"] = matriz.map((_, i) => ({ hpt: i === 0 ? 24 : 92 }));
  const rango = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = rango.s.r; r <= rango.e.r; r += 1) {
    for (let c = rango.s.c; c <= rango.e.c; c += 1) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (!celda) continue;
      if (r === 0) {
        celda.s = ESTILO_CABECERA;
        continue;
      }
      const largo = c === 4 || c === 5; // Entrada y Respuesta
      celda.s = {
        alignment: {
          horizontal: largo ? "left" : "center",
          vertical: largo ? "top" : "center",
          wrapText: true,
        },
        border: BORDES,
        font:
          c === 2
            ? {
                sz: 10,
                bold: true,
                color: { rgb: COLOR_ESTADO[filas[r - 1].estado] },
              }
            : { sz: 10 },
      };
    }
  }

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, ws, "Migración");
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  XLSX.writeFile(
    libro,
    `migracion_anticipos_${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}.xlsx`,
  );
}
