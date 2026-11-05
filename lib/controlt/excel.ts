import type { ResultadoConsulta } from "./tipos.ts";

/**
 * Normaliza placas (mayúsculas, sin espacios ni guiones). Duplicado de
 * `lib/controlt/cliente.ts` para no arrastrar imports server-only al cliente.
 */
function normalizarPlacas(valor: string): string[] {
  return Array.from(
    new Set(
      valor
        .split(/[,\s]+/)
        .map((p) => p.trim().toUpperCase().replace(/[-\s]/g, ""))
        .filter((p) => /^[A-Z0-9]{5,8}$/.test(p)),
    ),
  );
}

/*
 * Excel de monitoreo (Despacho › Tráfico): plantilla para importar placas,
 * lectura de un archivo pegado por el usuario y exportación de resultados.
 * Mismo patrón que SMA: xlsx-js-style cargado al vuelo en el navegador.
 */

const BORDE = { style: "thin", color: { rgb: "FFD0D5DD" } };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
const ESTILO_CABECERA = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "FF517051" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDES,
};
const ESTILO_CELDA = {
  alignment: { vertical: "top", wrapText: true },
  border: BORDES,
};

const COLUMNAS_PLANTILLA = [
  { clave: "placa", ancho: 14, obligatoria: true },
  { clave: "observaciones", ancho: 40, obligatoria: false },
] as const;

/** Descarga una plantilla Excel para llenar con placas. */
export async function descargarPlantilla() {
  const XLSX = await import("xlsx-js-style");
  const cabeceras = COLUMNAS_PLANTILLA.map((c) =>
    c.obligatoria ? `${c.clave} *` : c.clave,
  );
  const matriz = [
    cabeceras,
    ["ABC123", "Ejemplo — borra esta fila antes de usar."],
    ["", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(matriz);
  ws["!cols"] = COLUMNAS_PLANTILLA.map((c) => ({ wch: c.ancho }));
  // Estilos: cabecera verde, celdas con borde
  for (let c = 0; c < cabeceras.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = ESTILO_CABECERA;
  }
  for (let r = 1; r < matriz.length; r++) {
    for (let c = 0; c < cabeceras.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = ESTILO_CELDA;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Placas");
  XLSX.writeFile(wb, "plantilla-monitoreo.xlsx");
}

/**
 * Lee un Excel del usuario y devuelve las placas normalizadas, uniendo todas
 * las columnas por si pegó varias. Solo la columna "placa" es obligatoria.
 */
export async function leerPlacasDeExcel(archivo: File): Promise<string[]> {
  const XLSX = await import("xlsx-js-style");
  const buffer = await archivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
  if (!filas.length) return [];
  // Busca la columna que empiece por "placa" (acepta "placa *", "Placa").
  const claves = Object.keys(filas[0]);
  const clavePlaca =
    claves.find((k) => k.trim().toLowerCase().startsWith("placa")) ??
    claves[0];
  const texto = filas
    .map((f) => String(f[clavePlaca] ?? ""))
    .filter((s) => s.trim() !== "")
    .join(",");
  return normalizarPlacas(texto);
}

/** Exporta los vehículos y viajes consultados a un Excel con columnas completas. */
export async function exportarResultados(datos: ResultadoConsulta) {
  const XLSX = await import("xlsx-js-style");
  const vehiculos = datos.vehiculos;
  const viajes = datos.viajes;
  // Unir por placa (un vehículo puede tener un viaje activo o no, y viceversa)
  const porPlaca = new Map<string, { v?: (typeof vehiculos)[number]; j?: (typeof viajes)[number] }>();
  for (const v of vehiculos) {
    porPlaca.set(v.placa, { ...porPlaca.get(v.placa), v });
  }
  for (const j of viajes) {
    const placa = j.placa ?? "(sin placa)";
    porPlaca.set(placa, { ...porPlaca.get(placa), j });
  }
  const filas = Array.from(porPlaca.entries()).map(([placa, { v, j }]) => ({
    placa,
    estadoViaje: j?.estado ?? "",
    avance: j?.avance != null ? `${j.avance}%` : "",
    manifiesto: j?.manifiesto ?? "",
    numeroOrden: j?.numeroOrden ?? "",
    numeroDespacho: j?.numeroDespacho ?? "",
    numeroViaje: j?.numeroViaje ?? "",
    origen: j?.origen ?? j?.ciudadOrigen ?? "",
    destino: j?.destino ?? j?.ciudadDestino ?? "",
    cliente: j?.cliente ?? "",
    transportador: j?.transportador ?? "",
    empresa: j?.empresa ?? "",
    conductor: j?.conductor ?? "",
    telefonoConductor: j?.telefonoConductor ?? "",
    tipoViaje: j?.tipoViaje ?? "",
    tipoOperacion: j?.tipoOperacion ?? "",
    latitud: v?.latitud ?? j?.latitud ?? "",
    longitud: v?.longitud ?? j?.longitud ?? "",
    direccion: v?.direccion ?? j?.direccionActual ?? "",
    prestadorGps: v?.prestadorGps ?? j?.prestadorGps ?? "",
    ultimoReporteGps: v?.fechaGps ?? j?.ultimoReporteGps ?? "",
    temperatura: v?.temperatura ?? "",
    ultimoEvento: j?.ultimoEvento ?? "",
    ultimaAlarma: j?.ultimaAlarma ?? "",
    novedad: j?.novedad ?? "",
    comentario: j?.comentario ?? "",
    observaciones: j?.observaciones ?? "",
    cumplimientoCita: j?.cumplimientoCita ?? "",
  }));

  const cabeceras = [
    "Placa",
    "Estado viaje",
    "Avance",
    "Manifiesto",
    "N° orden",
    "N° despacho",
    "N° viaje",
    "Origen",
    "Destino",
    "Cliente",
    "Transportador",
    "Empresa",
    "Conductor",
    "Teléfono conductor",
    "Tipo viaje",
    "Tipo operación",
    "Latitud",
    "Longitud",
    "Dirección",
    "Prestador GPS",
    "Último GPS",
    "Temperatura",
    "Último evento",
    "Última alarma",
    "Novedad",
    "Comentario",
    "Observaciones",
    "Cumplimiento cita",
  ];
  const matriz: unknown[][] = [cabeceras];
  for (const f of filas) {
    matriz.push([
      f.placa,
      f.estadoViaje,
      f.avance,
      f.manifiesto,
      f.numeroOrden,
      f.numeroDespacho,
      f.numeroViaje,
      f.origen,
      f.destino,
      f.cliente,
      f.transportador,
      f.empresa,
      f.conductor,
      f.telefonoConductor,
      f.tipoViaje,
      f.tipoOperacion,
      f.latitud,
      f.longitud,
      f.direccion,
      f.prestadorGps,
      f.ultimoReporteGps,
      f.temperatura,
      f.ultimoEvento,
      f.ultimaAlarma,
      f.novedad,
      f.comentario,
      f.observaciones,
      f.cumplimientoCita,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(matriz);
  ws["!cols"] = [
    10, 14, 8, 16, 16, 16, 14, 24, 24, 22, 22, 22, 24, 16, 14, 16, 12, 12, 42,
    16, 18, 12, 22, 22, 22, 28, 28, 18,
  ].map((wch) => ({ wch }));
  for (let c = 0; c < cabeceras.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = ESTILO_CABECERA;
  }
  for (let r = 1; r < matriz.length; r++) {
    for (let c = 0; c < cabeceras.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = ESTILO_CELDA;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monitoreo");
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${hoy.getFullYear()}`;
  XLSX.writeFile(wb, `monitoreo-${fecha}.xlsx`);
}
