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

const MAX_CUERPO = 4 * 1024 * 1024;

/**
 * Lee el cuerpo JSON (máx. 4 MB); null si no es válido. Cuenta los bytes que
 * llegan: un cuerpo por partes (sin content-length) no se salta el límite.
 */
export async function cuerpoJson(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const largo = Number(req.headers.get("content-length") || 0);
  if (largo > MAX_CUERPO || !req.body) return null;
  try {
    const lector = req.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CUERPO) {
        await lector.cancel();
        return null;
      }
      partes.push(value);
    }
    const d = JSON.parse(Buffer.concat(partes).toString("utf8"));
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}
