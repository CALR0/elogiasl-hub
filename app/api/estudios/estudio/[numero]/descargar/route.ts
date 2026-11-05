import { json } from "@/lib/api/guardia.ts";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, puede } from "@/lib/auth";
import { obtenerEstudio } from "@/lib/estudios/datos";
import type { RolConsulta } from "@/lib/estudios/tipos";

export const runtime = "nodejs";

const MODULO = "estudios.verificar";
const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
};

/**
 * Metadatos para descargar el reporte desde la bandeja: etiqueta, fecha y
 * las consultas con reporte. El HTML de cada consulta se pide después a
 * /api/estudios/reporte/{id}?formato=html (la misma ruta que usa el visor).
 * Aquí no mandamos el HTML, solo los ids. Solo verificar o historial.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  // Autenticación manual: el acceso cuenta con verificar O historial.
  const origen = req.headers.get("origin");
  const host = req.headers.get("host");
  let mismoOrigen = true;
  if (origen) {
    try {
      mismoOrigen = new URL(origen).host === host;
    } catch {
      mismoOrigen = false;
    }
  }
  if (req.headers.get("x-portal") !== "1" || !mismoOrigen)
    return json({ error: "Solicitud no permitida." }, 403);

  const usuario = await getUsuarioActual();
  if (!usuario)
    return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);
  if (!puede(usuario, MODULO) && !puede(usuario, "estudios.historial")) {
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "acceso.denegado",
      resultado: "denegado",
    });
    return json({ error: "No tienes acceso al reporte." }, 403);
  }

  const { numero: numeroStr } = await params;
  const numero = Number(numeroStr);
  if (!Number.isInteger(numero) || numero <= 0)
    return json({ error: "Solicitud no válida." }, 400);

  const estudio = await obtenerEstudio(numero);
  if (!estudio) return json({ error: "Estudio no encontrado." }, 404);
  if (estudio.simulada)
    return json({ error: "Las consultas simuladas no tienen reporte." }, 404);

  const consultas = estudio.consultas
    .filter((c) => c.tieneReporte)
    .map((c) => {
      const partes = [NOMBRE_ROL[c.rol].toLowerCase()];
      if (c.placa) partes.push(c.placa);
      else if (c.tipoDoc && c.documento)
        partes.push(`${c.tipoDoc} ${c.documento}`);
      return {
        id: c.id,
        titulo: `${NOMBRE_ROL[c.rol]}${c.placa ? ` · ${c.placa}` : ""}`,
        archivo: partes.join(" "),
      };
    });

  if (consultas.length === 0)
    return json({ error: "El estudio no tiene reportes disponibles." }, 404);

  return json({
    etiqueta: estudio.descripcion,
    fecha: fechaCortaIso(estudio.fecha),
    consultas,
  });
}

function fechaCortaIso(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}
