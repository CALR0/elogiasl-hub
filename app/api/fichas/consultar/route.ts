import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizar,
  cuerpoJson,
  json,
  MODULO_FICHAS,
} from "@/lib/fichas/guardia.ts";
import { consultarPlaca, normalizarPlaca } from "@/lib/fichas/servicio.ts";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";

export const runtime = "nodejs";
// El primer inicio de sesión puede abrir el navegador del firewall de Silogtran
export const maxDuration = 60;

/** Consulta UNA placa (el navegador las envía en serie, como en FVE-C). */
export async function POST(req: Request) {
  const usuario = await autorizar(req);
  if (usuario instanceof Response) return usuario;

  const placa = normalizarPlaca((await cuerpoJson(req))?.placa);
  if (placa.length < 4 || placa.length > 8)
    return json({ placa, error: "Placa no válida." }, 400);

  const actor = { id: usuario.id, email: usuario.email };
  try {
    const r = await consultarPlaca(actor, placa);
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO_FICHAS,
      accion: "ficha.consultar",
      entidad: "placa",
      entidadId: r.placa,
      detalle: { conductor: r.conductor ?? r.conductorError },
    });
    return json(r);
  } catch (e) {
    const conocido = e instanceof SilogtranError;
    if (!conocido) console.error("[fichas/consultar]", e);
    const error = conocido ? e.message : "Error consultando Silogtran.";
    const noExiste = /no existe/i.test(error);
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO_FICHAS,
      accion: "ficha.consultar",
      entidad: "placa",
      entidadId: placa,
      resultado: "error",
      detalle: { mensaje: error },
    });
    return json({ placa, error }, noExiste ? 404 : 502);
  }
}
