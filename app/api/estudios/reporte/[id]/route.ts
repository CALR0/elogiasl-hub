import { json } from "@/lib/api/guardia.ts";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, puede } from "@/lib/auth";
import { MODO_DEMO } from "@/lib/demo";
import { rutaReporte } from "@/lib/estudios/resultado.ts";
import { obtenerClienteTusDatos } from "@/lib/estudios/tusdatos.ts";
import type { RolConsulta } from "@/lib/estudios/tipos";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODULO = "estudios.verificar";

/**
 * El HTML viene de un tercero: se aísla con `default-src 'none'` para que no
 * ejecute scripts ni cargue XHR, websockets, popups ni nada más que no
 * declaremos. Dejamos solo estilos, fuentes e imágenes. No ponemos `sandbox`
 * en la CSP para que el iframe quede same-origin y el padre pueda disparar
 * el diálogo de impresión del navegador sobre el reporte (ver `vista-reporte.tsx`).
 */
const CSP_REPORTE =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; frame-ancestors 'self'";

/**
 * Reporte de TusDatos de una consulta: ?formato=html para verlo en el portal o
 * ?formato=pdf para descargarlo. Solo quien verifica o ve el historial; la
 * consulta se lee con la sesión del usuario (RLS) y no se reciben rutas externas.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    return json({ error: "No tienes acceso a este reporte." }, 403);
  }

  const { id } = await params;
  const formato = new URL(req.url).searchParams.get("formato");
  if (!/^[0-9a-f-]{36}$/i.test(id) || (formato !== "html" && formato !== "pdf"))
    return json({ error: "Solicitud no válida." }, 400);

  const cliente = obtenerClienteTusDatos();
  if (MODO_DEMO || !cliente)
    return json({ error: "Las consultas simuladas no tienen reporte." }, 404);

  const supabase = await createClient();
  const { data } = await supabase
    .from("estudio_consultas")
    .select("rol, placa, tipo_doc, report_id, estudio_solicitudes ( numero )")
    .eq("id", id)
    .maybeSingle();
  const consulta = data as unknown as {
    rol: RolConsulta;
    placa: string | null;
    tipo_doc: string;
    report_id: string | null;
    estudio_solicitudes: { numero: number } | null;
  } | null;
  if (!consulta?.report_id)
    return json({ error: "Esta consulta no tiene reporte." }, 404);

  const numero = String(consulta.estudio_solicitudes?.numero ?? 0).padStart(
    6,
    "0",
  );
  const ref = `SOL-${numero}/${consulta.rol}`;
  const ruta = rutaReporte(
    consulta.rol,
    consulta.tipo_doc,
    formato,
    consulta.report_id,
  );
  const auditar = (resultado: "ok" | "error", estado?: number) =>
    registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.reporte",
      entidad: "estudio",
      entidadId: String(consulta.estudio_solicitudes?.numero ?? ""),
      resultado,
      detalle: {
        rol: consulta.rol,
        placa: consulta.placa,
        formato,
        ...(estado && { respuesta_tusdatos: estado }),
      },
    });

  try {
    const res = await cliente.descargar(ruta, ref);

    if (formato === "pdf") {
      // 202: TusDatos aún construye el PDF; el navegador vuelve a intentar
      if (res.status === 202)
        return json(
          {
            pendiente: true,
            reintentarEn: Number(res.headers.get("retry-after")) || 10,
          },
          202,
        );
      const tipo = res.headers.get("content-type") ?? "";
      if (!res.ok || !res.body || !tipo.includes("pdf")) {
        await auditar("error", res.status);
        return json({ error: "TusDatos no entregó el PDF." }, 502);
      }
      await auditar("ok");
      const nombre = `SOL-${numero}_${consulta.rol}${consulta.placa ? `_${consulta.placa}` : ""}.pdf`;
      return new Response(res.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${nombre.replace(/[^\w.-]/g, "")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (!res.ok) {
      await auditar("error", res.status);
      return json({ error: "TusDatos no entregó el reporte." }, 502);
    }
    // La especificación lo declara como JSON: puede llegar como texto entre comillas
    let html = await res.text();
    if ((res.headers.get("content-type") ?? "").includes("json")) {
      try {
        const v: unknown = JSON.parse(html);
        if (typeof v === "string") html = v;
      } catch {
        // Se muestra tal cual
      }
    }
    await auditar("ok");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CSP_REPORTE,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[estudios/reporte]", e);
    await auditar("error");
    return json({ error: "No se pudo obtener el reporte." }, 502);
  }
}
