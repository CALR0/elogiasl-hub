import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string | null;
  rol: { id: string; nombre: string; esSuperadmin: boolean };
  /** Claves de las funcionalidades (hojas) con acceso. Vacío si es superadmin. */
  accesos: readonly string[];
}

/** Usuario de ejemplo para ver la interfaz sin Supabase (solo en desarrollo). */
const USUARIO_DEMO: UsuarioActual = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@elogia.com.co",
  nombre: "Usuario de demostración",
  rol: { id: "demo", nombre: "Administrador", esSuperadmin: true },
  accesos: [],
};

/**
 * Data Access Layer: única puerta para leer la sesión. Verifica el JWT y carga
 * perfil, rol y accesos. Devuelve null si no hay sesión, o si el usuario o su
 * rol están inactivos.
 */
export const getUsuarioActual = cache(
  async (): Promise<UsuarioActual | null> => {
    if (MODO_DEMO) return USUARIO_DEMO;

    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return null;

    const { data: perfil } = await supabase
      .from("perfiles")
      .select(
        "id, email, nombre_completo, activo, roles ( id, nombre, es_superadmin, activo, rol_permisos ( modulo_clave ) )",
      )
      .eq("id", userId)
      .single();

    const rol = perfil?.roles as unknown as {
      id: string;
      nombre: string;
      es_superadmin: boolean;
      activo: boolean;
      rol_permisos: { modulo_clave: string }[];
    } | null;

    if (!perfil?.activo || !rol?.activo) return null;

    return {
      id: perfil.id,
      email: perfil.email,
      nombre: perfil.nombre_completo,
      rol: { id: rol.id, nombre: rol.nombre, esSuperadmin: rol.es_superadmin },
      accesos: rol.rol_permisos.map((p) => p.modulo_clave),
    };
  },
);

/**
 * ¿Tiene el usuario acceso al nodo `clave`? Para un módulo o submódulo basta
 * con tener acceso a alguna funcionalidad debajo (espejo de public.tiene_acceso).
 */
export function puede(
  usuario: Pick<UsuarioActual, "rol" | "accesos">,
  clave: string,
) {
  return (
    usuario.rol.esSuperadmin ||
    usuario.accesos.some((a) => a === clave || a.startsWith(`${clave}.`))
  );
}

/** Exige sesión. Úsalo al inicio de cada página, Server Function y Route Handler protegidos. */
export async function requireUsuario(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

/**
 * Exige sesión y acceso a un módulo; si no lo tiene, lo registra en Auditoría
 * y muestra la página 403.
 */
export async function requirePermiso(clave: string): Promise<UsuarioActual> {
  const usuario = await requireUsuario();
  if (!puede(usuario, clave)) {
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: clave,
      accion: "acceso.denegado",
      resultado: "denegado",
    });
    forbidden();
  }
  return usuario;
}
