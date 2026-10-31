import "server-only";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, puede, type UsuarioActual } from "@/lib/auth";

export const json = (cuerpo: unknown, status = 200) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Puerta de las rutas API de las funcionalidades: la petición debe venir de
 * la propia página (mismo origen + cabecera x-portal), con sesión del portal
 * y acceso al módulo. Devuelve el usuario o una respuesta de error.
 */
export async function autorizar(
  req: Request,
  modulo: string,
  nombre: string,
): Promise<UsuarioActual | Response> {
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
  if (!puede(usuario, modulo)) {
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo,
      accion: "acceso.denegado",
      resultado: "denegado",
    });
    return json({ error: `No tienes acceso a ${nombre}.` }, 403);
  }
  return usuario;
}

/** Lee el cuerpo JSON (máx. ~4 MB); null si no es válido. */
export async function cuerpoJson(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const largo = Number(req.headers.get("content-length") || 0);
  if (largo > 4 * 1024 * 1024) return null;
  try {
    const d = await req.json();
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}
