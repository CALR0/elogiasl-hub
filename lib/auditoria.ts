import "server-only";
import { headers } from "next/headers";
import { MODO_DEMO } from "@/lib/demo";
import { almacenDemo } from "@/lib/gestion/demo";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EventoAuditable {
  actorId: string | null;
  actorEmail?: string | null;
  /** Clave del módulo ('financiero.transferencia.migracion-anticipo-sap') o 'sesion'. */
  modulo?: string;
  /** Código estable: "sesion.iniciar", "usuario.crear", "anticipo.migrar"… */
  accion: string;
  entidad?: string;
  entidadId?: string;
  resultado?: "ok" | "error" | "denegado";
  /** Contexto legible. NUNCA contraseñas, tokens ni llaves. */
  detalle?: Record<string, unknown>;
}

/**
 * Escribe en `audit_logs` (solo el servidor puede: los usuarios no tienen
 * permiso de inserción). Nunca rompe la acción principal: si falla, lo deja
 * en el log del servidor.
 */
export async function registrarAuditoria(evento: EventoAuditable) {
  if (MODO_DEMO) {
    const a = almacenDemo();
    const actor = a.usuarios.find((u) => u.id === evento.actorId);
    a.logs.unshift({
      id: a.siguienteLog++,
      fecha: new Date().toISOString(),
      actorNombre: actor?.nombre ?? null,
      actorEmail: evento.actorEmail ?? actor?.email ?? null,
      modulo: evento.modulo ?? null,
      accion: evento.accion,
      entidad: evento.entidad ?? null,
      entidadId: evento.entidadId ?? null,
      resultado: evento.resultado ?? "ok",
      detalle: evento.detalle ?? null,
      ip: "127.0.0.1",
      userAgent: (await headers()).get("user-agent"),
    });
    return;
  }
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const { error } = await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_id: evento.actorId,
        actor_email: evento.actorEmail ?? null,
        modulo: evento.modulo ?? null,
        accion: evento.accion,
        entidad: evento.entidad ?? null,
        entidad_id: evento.entidadId ?? null,
        resultado: evento.resultado ?? "ok",
        detalle: evento.detalle ?? null,
        ip: ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null,
        user_agent: h.get("user-agent"),
      });
    if (error) console.error("[auditoria]", error.message);
  } catch (e) {
    console.error("[auditoria]", e);
  }
}
