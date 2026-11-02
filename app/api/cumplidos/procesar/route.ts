import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar, cuerpoJson, json } from "@/lib/api/guardia.ts";
import { procesar } from "@/lib/cumplidos/servicio.ts";
import { normalizarManifiesto } from "@/lib/sicetac/manifiesto.ts";
import { sinCredenciales } from "@/lib/sicetac/rndc.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODULO = "despacho.cumplido-manifiesto.migracion-rndc";

/**
 * Procesa el cumplido de UN manifiesto: corrige las retenciones con el flete
 * del RNDC y lo radica. Deja un único evento en Auditoría.
 */
export async function POST(req: Request) {
  const usuario = await autorizar(req, MODULO, "Migración cumplido RNDC");
  if (usuario instanceof Response) return usuario;

  const manifiesto = normalizarManifiesto((await cuerpoJson(req))?.manifiesto);
  if (!/^\d{6,12}$/.test(manifiesto))
    return json({ error: "Número de manifiesto no válido." }, 400);

  const base = {
    actorId: usuario.id,
    actorEmail: usuario.email,
    modulo: MODULO,
    accion: "cumplido.migrar",
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
      resultado:
        r.estado === "migrado" || r.estado === "registrado" ? "ok" : "error",
      detalle: {
        estado: r.estado,
        mensaje: r.mensaje,
        ...(r.radicado && { radicado: r.radicado }),
        ...(r.errores.length && { errores: r.errores }),
        // Cumplido de remesas (antes del manifiesto), en el mismo evento
        ...(traza.remesas.length && {
          remesas: traza.remesas.map((t) => {
            const res = r.remesas.find((x) => x.remesa === t.remesa);
            return {
              remesa: t.remesa,
              estado: res?.estado ?? "sin-procesar",
              mensaje: res?.mensaje ?? null,
              radicado: res?.radicado ?? null,
              silogtran: t.silogtran,
              ...(t.fechaLog && { intento_log_silogtran: t.fechaLog }),
              ...(t.xmlEnviado && {
                xml_enviado: sinCredenciales(t.xmlEnviado),
              }),
              ...(t.respuestaRndc && { respuesta_rndc: t.respuestaRndc }),
              ...(t.intentos.length && { intentos_envio: t.intentos }),
            };
          }),
        }),
        flete_rndc: r.flete,
        ...(r.originales && {
          retencion_fopat_original: r.originales.fopat,
          retencion_fuente_original: r.originales.fuente,
        }),
        ...(r.enviadas?.fopat != null && {
          retencion_fopat_enviada: r.enviadas.fopat,
        }),
        ...(r.enviadas?.fuente != null && {
          retencion_fuente_enviada: r.enviadas.fuente,
        }),
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
        tiempos_ms: traza.tiempos,
        ...(traza.intentos.length && { intentos_envio: traza.intentos }),
      },
    });
    return json(r);
  } catch (e) {
    console.error("[cumplidos/procesar]", e);
    const mensaje =
      e instanceof Error ? e.message : "No se pudo procesar el cumplido.";
    await registrarAuditoria({
      ...base,
      resultado: "error",
      detalle: { mensaje },
    });
    return json({ error: mensaje }, 502);
  }
}
