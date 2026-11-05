import { zipSync, strToU8 } from "fflate";
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
const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
};

interface ConsultaFila {
  id: string;
  rol: RolConsulta;
  placa: string | null;
  tipo_doc: string;
  documento: string | null;
  report_id: string | null;
}

/**
 * Descarga el reporte PDF de un estudio desde la bandeja. Si hay varias
 * consultas, las empaqueta en un ZIP con el nombre "PLACA XXX dd-mm-yyyy.zip";
 * si solo hay una, entrega el PDF directo. Cada consulta la pide a TusDatos
 * con la cuenta de Elogia (Basic Auth); el navegador nunca toca sus endpoints.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
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

  const { numero: numeroStr } = await params;
  const numero = Number(numeroStr);
  if (!Number.isInteger(numero) || numero <= 0)
    return json({ error: "Solicitud no válida." }, 400);

  if (MODO_DEMO)
    return json(
      { error: "Las consultas simuladas no tienen reporte." },
      404,
    );
  const cliente = obtenerClienteTusDatos();
  if (!cliente)
    return json({ error: "TusDatos no está configurado." }, 503);

  const supabase = await createClient();
  const { data: solicitud } = await supabase
    .from("estudio_solicitudes")
    .select(
      "id, numero, placa, documento, created_at, estudio_consultas ( id, rol, placa, tipo_doc, documento, report_id )",
    )
    .eq("numero", numero)
    .maybeSingle();
  if (!solicitud) return json({ error: "Estudio no encontrado." }, 404);

  const consultas = (
    (solicitud as unknown as {
      estudio_consultas: ConsultaFila[];
    }).estudio_consultas ?? []
  ).filter((c) => c.report_id) as ConsultaFila[];
  if (consultas.length === 0)
    return json({ error: "El estudio no tiene reportes disponibles." }, 404);

  const ref = `SOL-${String(numero).padStart(6, "0")}`;
  const auditar = (
    resultado: "ok" | "error",
    detalle?: Record<string, unknown>,
  ) =>
    registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.reporte",
      entidad: "estudio",
      entidadId: String(numero),
      resultado,
      detalle: { formato: consultas.length > 1 ? "zip" : "pdf", ...detalle },
    });

  // Trae los PDF en paralelo. Si cualquiera aún no está listo (202), se corta
  // y se le dice al cliente que reintente en Retry-After segundos.
  const descargas = await Promise.all(
    consultas.map(async (c) => {
      const ruta = rutaReporte(c.rol, c.tipo_doc, "pdf", c.report_id!);
      const res = await cliente.descargar(ruta, `${ref}/${c.rol}`);
      return { consulta: c, res };
    }),
  );

  const pendiente = descargas.find((d) => d.res.status === 202);
  if (pendiente) {
    const retry = Number(pendiente.res.headers.get("retry-after")) || 10;
    for (const d of descargas) await d.res.body?.cancel();
    return json({ pendiente: true, reintentarEn: retry }, 202);
  }

  const archivos: { nombre: string; datos: Uint8Array }[] = [];
  for (const { consulta: c, res } of descargas) {
    const tipo = res.headers.get("content-type") ?? "";
    if (!res.ok || !res.body || !tipo.includes("pdf")) {
      for (const d of descargas) await d.res.body?.cancel().catch(() => {});
      await auditar("error", { rol: c.rol, status: res.status });
      return json(
        { error: `TusDatos no entregó el PDF de ${NOMBRE_ROL[c.rol]}.` },
        502,
      );
    }
    archivos.push({
      nombre: nombrePdf(c, numero),
      datos: new Uint8Array(await res.arrayBuffer()),
    });
  }

  const fecha = fechaCortaIso(
    (solicitud as unknown as { created_at: string }).created_at,
  );
  const etiqueta = etiquetaEstudio(solicitud as never);

  const nombreBase = sanear(`${etiqueta} ${fecha}`);

  // Una sola consulta → PDF directo; varias → ZIP con los PDF adentro.
  if (archivos.length === 1) {
    await auditar("ok", { consultas: 1 });
    return new Response(new Blob([archivos[0].datos.buffer as ArrayBuffer]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const zip = zipSync(
    {
      ...Object.fromEntries(archivos.map((a) => [a.nombre, a.datos])),
      "contenido.txt": strToU8(
        archivos.map((a) => a.nombre).join("\n") + "\n",
      ),
    },
    { mtime: new Date() },
  );
  await auditar("ok", { consultas: archivos.length });
  return new Response(new Blob([zip.buffer as ArrayBuffer]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nombreBase}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

/** "PLACA ABC123" para placas, "CC 123456789" para documentos. */
function etiquetaEstudio(s: {
  placa: string | null;
  documento: string | null;
}) {
  if (s.placa) return `PLACA ${s.placa}`;
  if (s.documento) return `DOC ${s.documento}`;
  return "estudio";
}

/** YYYY-MM-DD → DD-MM-YYYY. */
function fechaCortaIso(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/** Nombre de cada PDF dentro del ZIP. */
function nombrePdf(c: ConsultaFila, numero: number) {
  const partes = [
    `SOL-${String(numero).padStart(6, "0")}`,
    NOMBRE_ROL[c.rol].toLowerCase(),
  ];
  if (c.placa) partes.push(c.placa);
  else if (c.documento) partes.push(c.documento);
  return sanear(partes.join(" ")) + ".pdf";
}

/** Quita caracteres que molestan en un nombre de archivo. */
function sanear(nombre: string) {
  return nombre.replace(/[^\w .-]/g, "_").slice(0, 120);
}
