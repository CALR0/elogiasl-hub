import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar, cuerpoJson, json } from "@/lib/api/guardia.ts";
import { normalizarManifiesto } from "@/lib/sicetac/manifiesto.ts";
import { sinCredenciales } from "@/lib/sicetac/rndc.ts";
import { procesar } from "@/lib/sicetac/servicio.ts";

export const runtime = "nodejs";
// Ministerio + Silogtran (posible inicio de sesión) + RNDC + portal SICETAC + envío
export const maxDuration = 60;

const MODULO = "despacho.manifiesto.expedir-sicetac";

/**
 * Procesa UN manifiesto: calcula el SICETAC y, si el flete está por debajo,
 * lo expide ante el Ministerio. Deja un único evento en Auditoría.
 */
export async function POST(req: Request) {
  const usuario = await autorizar(req, MODULO, "Expedir manifiesto SICETAC");
  if (usuario instanceof Response) return usuario;

  const manifiesto = normalizarManifiesto((await cuerpoJson(req))?.manifiesto);
  if (!/^\d{6,12}$/.test(manifiesto))
    return json({ error: "Número de manifiesto no válido." }, 400);

  const base = {
    actorId: usuario.id,
    actorEmail: usuario.email,
    modulo: MODULO,
    accion: "manifiesto.expedir",
    entidad: "manifiesto",
    entidadId: manifiesto,
  };

  try {
    const { resultado: r, traza } = await procesar(
      { id: usuario.id, email: usuario.email },
      manifiesto,
    );
    await registrarAuditoria({
      ...base,
      // Correcto si quedó expedido (o ya lo estaba); lo demás, error
      resultado: r.envio?.ok || r.estado === "registrado" ? "ok" : "error",
      detalle: {
        estado: r.envio ? (r.envio.ok ? "expedido" : "rechazado") : r.estado,
        mensaje: r.envio?.mensaje ?? r.mensaje,
        ...(r.envio?.radicado && { radicado: r.envio.radicado }),
        flete_original: r.flete,
        flete_sicetac: r.sicetac,
        ...(r.nuevo && {
          flete_enviado: r.nuevo.flete,
          retencion_fuente: r.nuevo.retencionFuente,
          retencion_fopat: r.nuevo.retencionFopat,
        }),
        ...r.detalle,
        ...(traza.consultaPosterior && {
          consulta_posterior: traza.consultaPosterior,
        }),
        // Sin usuario ni clave del RNDC
        xml_original: traza.xmlOriginal
          ? sinCredenciales(traza.xmlOriginal)
          : null,
        xml_enviado: traza.xmlEnviado
          ? sinCredenciales(traza.xmlEnviado)
          : null,
        respuesta_rndc: traza.respuestaRndc,
      },
    });
    return json(r);
  } catch (e) {
    console.error("[sicetac/procesar]", e);
    const mensaje =
      e instanceof Error ? e.message : "No se pudo procesar el manifiesto.";
    await registrarAuditoria({
      ...base,
      resultado: "error",
      detalle: { mensaje },
    });
    return json({ error: mensaje }, 502);
  }
}
