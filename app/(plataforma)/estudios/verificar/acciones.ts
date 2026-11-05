"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { requirePermiso } from "@/lib/auth";
import { MODO_DEMO } from "@/lib/demo";
import { almacenEstudios } from "@/lib/estudios/demo";
import { createAdminClient } from "@/lib/supabase/admin";

const MODULO = "estudios.verificar";

export type Resultado = { ok: true } | { ok: false; error: string };

const Decision = z.object({
  numero: z.number().int().positive(),
  comentario: z.string().trim().max(500).optional(),
});

async function decidir(
  entrada: unknown,
  decision: "aprobado" | "rechazado",
): Promise<Resultado> {
  const usuario = await requirePermiso(MODULO);
  const parse = Decision.safeParse(entrada);
  if (!parse.success) {
    return { ok: false, error: "Datos inválidos." };
  }
  const { numero, comentario } = parse.data;

  if (MODO_DEMO) {
    const almacen = almacenEstudios();
    const estudio = almacen.solicitudes.find((s) => s.numero === numero);
    if (!estudio) return { ok: false, error: "Estudio no encontrado." };
    if (estudio.decision !== "pendiente") {
      return { ok: false, error: "El estudio ya fue decidido." };
    }
    if (estudio.estado !== "finalizada") {
      return { ok: false, error: "El estudio aún no está listo para decidir." };
    }
    estudio.decision = decision;
    estudio.comentario = comentario ?? null;
    estudio.estado = decision;
  } else {
    // El admin client ignora RLS; solo se llega aquí tras requirePermiso().
    const admin = createAdminClient();
    const { data: solicitud, error: errSol } = await admin
      .from("estudio_solicitudes")
      .select("id, decision, estado")
      .eq("numero", numero)
      .maybeSingle();
    if (errSol || !solicitud) {
      return { ok: false, error: "Estudio no encontrado." };
    }
    if (solicitud.decision !== "pendiente") {
      return { ok: false, error: "El estudio ya fue decidido." };
    }
    if (solicitud.estado !== "finalizada") {
      return { ok: false, error: "El estudio aún no está listo para decidir." };
    }
    // Actualizar resultados → el trigger copia decisión/comentario/estado a la solicitud.
    const { error } = await admin
      .from("estudio_resultados")
      .update({
        decision,
        comentario: comentario ?? null,
        decidida_por: usuario.id,
        decidida_at: new Date().toISOString(),
      })
      .eq("solicitud_id", solicitud.id);
    if (error) {
      return {
        ok: false,
        error: "No se pudo registrar la decisión.",
      };
    }
    await admin.from("estudio_eventos").insert({
      solicitud_id: solicitud.id,
      tipo: decision === "aprobado" ? "ok" : "info",
      texto:
        decision === "aprobado"
          ? "Estudio aprobado por el analista."
          : "Estudio rechazado por el analista.",
    });
  }

  await registrarAuditoria({
    actorId: usuario.id,
    actorEmail: usuario.email,
    modulo: MODULO,
    accion: decision === "aprobado" ? "estudio.aprobar" : "estudio.rechazar",
    entidad: "estudio",
    entidadId: String(numero),
    resultado: "ok",
    detalle: comentario ? { comentario } : undefined,
  });

  revalidatePath("/estudios/verificar");
  revalidatePath("/estudios/historial");
  revalidatePath(`/estudios/verificar/${numero}`);
  revalidatePath("/estudios/mis-solicitudes");
  return { ok: true };
}

export async function aprobar(entrada: unknown): Promise<Resultado> {
  return decidir(entrada, "aprobado");
}

export async function rechazar(entrada: unknown): Promise<Resultado> {
  return decidir(entrada, "rechazado");
}
