import { getUsuarioActual, puede } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { consultarLogs } from "@/lib/gestion/datos";
import { etiquetaAccion, etiquetaModulo } from "@/lib/gestion/etiquetas";
import { leerFiltros } from "@/lib/gestion/filtros-logs";
import { fechaHora } from "@/lib/utils";

const MODULO = "auditoria.visor-logs";
const LIMITE = 10_000;

/**
 * Celda CSV segura: entre comillas y, si empieza por = + - @ (fórmula en
 * Excel), con un apóstrofo delante para que no se ejecute.
 */
function celda(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

/** Descarga los logs filtrados en CSV (separador ";" para Excel en español). */
export async function GET(request: Request) {
  const yo = await getUsuarioActual();
  if (!yo) return new Response("No autenticado", { status: 401 });
  if (!puede(yo, MODULO)) {
    await registrarAuditoria({
      actorId: yo.id,
      actorEmail: yo.email,
      modulo: MODULO,
      accion: "acceso.denegado",
      resultado: "denegado",
    });
    return new Response("Sin acceso al visor de logs", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filtros = leerFiltros(Object.fromEntries(searchParams));
  delete (filtros as { pagina?: number }).pagina;
  const { filas, total } = await consultarLogs(filtros, null, LIMITE);

  const encabezado = [
    "Fecha y hora (Colombia)",
    "Usuario",
    "Correo",
    "Módulo",
    "Acción",
    "Código",
    "Objeto",
    "Resultado",
    "IP",
    "Detalle",
  ];
  const lineas = filas.map((l) =>
    [
      fechaHora(l.fecha),
      l.actorNombre,
      l.actorEmail,
      etiquetaModulo(l.modulo),
      etiquetaAccion(l.accion),
      l.accion,
      l.entidad ? `${l.entidad}: ${l.entidadId ?? ""}` : "",
      l.resultado,
      l.ip,
      l.detalle ? JSON.stringify(l.detalle) : "",
    ]
      .map(celda)
      .join(";"),
  );

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: "auditoria.exportar",
    detalle: { filtros, filas: filas.length, total },
  });

  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  // BOM: Excel abre el archivo como UTF-8 (tildes y ñ correctas)
  const csv = "﻿" + [encabezado.map(celda).join(";"), ...lineas].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="logs_${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
