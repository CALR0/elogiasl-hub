"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | null;

const credenciales = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

const DESACTIVADA = "Tu cuenta está desactivada. Contacta al administrador.";

/** Solo redirige dentro de la plataforma (evita redirecciones abiertas). */
function destinoSeguro(next: FormDataEntryValue | null) {
  return typeof next === "string" && /^\/(?!\/)[\w\-/]*$/.test(next)
    ? next
    : "/inicio";
}

/** Inicio de sesión con Supabase Auth. */
export async function iniciarSesion(
  _previo: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const destino = destinoSeguro(formData.get("next"));
  if (MODO_DEMO) redirect(destino);

  const p = credenciales.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!p.success) return { error: "Escribe tu correo y contraseña." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(p.data);

  if (error || !data.user) {
    // Mensaje genérico: no revelar si el correo existe
    await registrarAuditoria({
      actorId: null,
      actorEmail: p.data.email,
      modulo: "sesion",
      accion: "sesion.fallida",
      resultado: "error",
    });
    return {
      error:
        error?.code === "user_banned"
          ? DESACTIVADA
          : "Correo o contraseña incorrectos.",
    };
  }

  // El perfil se lee con la sesión recién creada (RLS: cada quien ve el suyo)
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo, roles ( activo )")
    .eq("id", data.user.id)
    .single();
  const rol = perfil?.roles as unknown as { activo: boolean } | null;

  if (!perfil?.activo || !rol?.activo) {
    await supabase.auth.signOut();
    await registrarAuditoria({
      actorId: data.user.id,
      actorEmail: p.data.email,
      modulo: "sesion",
      accion: "sesion.denegada",
      resultado: "denegado",
      detalle: {
        motivo: !perfil
          ? "sin perfil"
          : !perfil.activo
            ? "usuario inactivo"
            : "rol inactivo o sin rol",
      },
    });
    return {
      error: !perfil
        ? "Tu cuenta no tiene perfil asignado. Contacta al administrador."
        : !perfil.activo
          ? DESACTIVADA
          : "Tu cuenta no tiene un rol activo. Contacta al administrador.",
    };
  }

  await createAdminClient()
    .from("perfiles")
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq("id", data.user.id);
  await registrarAuditoria({
    actorId: data.user.id,
    actorEmail: p.data.email,
    modulo: "sesion",
    accion: "sesion.iniciar",
  });
  redirect(destino);
}

/** Cierra la sesión y vuelve al login. */
export async function cerrarSesion() {
  if (MODO_DEMO) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    await registrarAuditoria({
      actorId: data.claims.sub,
      actorEmail: (data.claims.email as string | undefined) ?? null,
      modulo: "sesion",
      accion: "sesion.cerrar",
    });
  }
  await supabase.auth.signOut();
  redirect("/login");
}
