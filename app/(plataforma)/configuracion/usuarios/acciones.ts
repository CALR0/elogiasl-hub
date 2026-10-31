"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { almacenDemo } from "@/lib/gestion/demo";
import { listarRoles, listarUsuarios } from "@/lib/gestion/datos";
import type { Resultado } from "@/lib/gestion/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * Acciones sobre cuentas. Todas: requirePermiso() → validar con Zod →
 * perfil con la sesión del usuario (RLS + triggers que protegen al último
 * administrador y evitan auto-cambios) → Supabase Auth Admin (secret key,
 * solo servidor) para correo, contraseña y bloqueo → auditoría.
 * Las contraseñas nunca se registran ni se devuelven.
 */

const MODULO = "configuracion.usuarios";
const BLOQUEO = "876000h"; // ~100 años: Supabase no tiene "bloqueo indefinido"

const email = z.email("Correo inválido.").trim().toLowerCase();
const clave = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(72, "La contraseña admite máximo 72 caracteres.");
const nombre = z.string().trim().min(3, "Escribe el nombre completo.").max(120);

function mensajeError(codigo: string | undefined, mensaje: string) {
  if (
    codigo === "email_exists" ||
    /already been registered|already exists/i.test(mensaje)
  )
    return "Ya existe un usuario con ese correo.";
  if (codigo === "weak_password") return "La contraseña es demasiado débil.";
  if (/administrador activo/i.test(mensaje))
    return "Debe quedar al menos un administrador activo.";
  if (/propio rol/i.test(mensaje))
    return "No puedes cambiar tu propio rol ni desactivarte.";
  return "No se pudo completar la operación. Intenta de nuevo.";
}

/** El rol debe existir y estar activo para poder asignarse. */
async function rolAsignable(rolId: string) {
  const rol = (await listarRoles()).find((r) => r.id === rolId);
  return rol?.activo ? rol : null;
}

/** En demo: ¿quedaría sin administradores activos? */
function dejariaSinAdmin(
  usuarioId: string,
  rolNuevo: string,
  activoNuevo: boolean,
) {
  const a = almacenDemo();
  const admin = new Set(a.roles.filter((r) => r.esSuperadmin).map((r) => r.id));
  return !a.usuarios.some((u) =>
    u.id === usuarioId
      ? activoNuevo && admin.has(rolNuevo)
      : u.activo && u.rolId && admin.has(u.rolId),
  );
}

export async function crearUsuario(entrada: {
  nombre: string;
  email: string;
  rolId: string;
  clave: string;
}): Promise<Resultado> {
  const yo = await requirePermiso(MODULO);
  const p = z
    .object({ nombre, email, rolId: z.uuid("Elige un rol."), clave })
    .safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const rol = await rolAsignable(p.data.rolId);
  if (!rol) return { ok: false, error: "El rol elegido no está activo." };

  let id: string;
  if (MODO_DEMO) {
    const a = almacenDemo();
    if (a.usuarios.some((u) => u.email === p.data.email))
      return { ok: false, error: mensajeError("email_exists", "") };
    id = crypto.randomUUID();
    a.usuarios.push({
      id,
      nombre: p.data.nombre,
      email: p.data.email,
      rolId: rol.id,
      rolNombre: rol.nombre,
      activo: true,
      ultimoAcceso: null,
      creado: new Date().toISOString(),
    });
  } else {
    // El trigger on_auth_user_created crea el perfil con este nombre y rol
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email: p.data.email,
      password: p.data.clave,
      email_confirm: true,
      user_metadata: { nombre_completo: p.data.nombre },
      app_metadata: { rol_id: rol.id },
    });
    if (error || !data.user)
      return {
        ok: false,
        error: mensajeError(error?.code, error?.message ?? ""),
      };
    id = data.user.id;
  }

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: "usuario.crear",
    entidad: "usuario",
    entidadId: p.data.email,
    detalle: { id, nombre: p.data.nombre, rol: rol.nombre },
  });
  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: `Se creó la cuenta de ${p.data.nombre}.` };
}

export async function editarUsuario(entrada: {
  id: string;
  nombre: string;
  email: string;
  rolId: string;
  clave: string;
}): Promise<Resultado> {
  const yo = await requirePermiso(MODULO);
  const p = z
    .object({
      id: z.uuid(),
      nombre,
      email,
      rolId: z.uuid("Elige un rol."),
      clave: z.union([z.literal(""), clave]),
    })
    .safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const actual = (await listarUsuarios()).find((u) => u.id === p.data.id);
  if (!actual) return { ok: false, error: "El usuario no existe." };

  const cambiaNombre = actual.nombre !== p.data.nombre;
  const cambiaRol = actual.rolId !== p.data.rolId;
  const cambiaCorreo = actual.email !== p.data.email;
  const cambiaClave = p.data.clave !== "";
  if (!cambiaNombre && !cambiaRol && !cambiaCorreo && !cambiaClave)
    return { ok: true, mensaje: "No hubo cambios." };

  if (cambiaRol && p.data.id === yo.id)
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  const rol = cambiaRol ? await rolAsignable(p.data.rolId) : null;
  if (cambiaRol && !rol)
    return { ok: false, error: "El rol elegido no está activo." };

  if (MODO_DEMO) {
    const a = almacenDemo();
    if (cambiaCorreo && a.usuarios.some((u) => u.email === p.data.email))
      return { ok: false, error: mensajeError("email_exists", "") };
    if (cambiaRol && dejariaSinAdmin(actual.id, p.data.rolId, actual.activo))
      return {
        ok: false,
        error: mensajeError(undefined, "administrador activo"),
      };
    Object.assign(
      a.usuarios.find((u) => u.id === actual.id)!,
      {
        nombre: p.data.nombre,
        email: p.data.email,
        ...(rol && { rolId: rol.id, rolNombre: rol.nombre }),
      },
    );
  } else {
    if (cambiaNombre || cambiaRol) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("perfiles")
        .update({ nombre_completo: p.data.nombre, rol_id: p.data.rolId })
        .eq("id", actual.id)
        .select("id");
      if (error)
        return { ok: false, error: mensajeError(error.code, error.message) };
      if (!data.length)
        return {
          ok: false,
          error: "No tienes permiso para editar este usuario.",
        };
    }
    if (cambiaCorreo || cambiaClave) {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(actual.id, {
        ...(cambiaCorreo && { email: p.data.email, email_confirm: true }),
        ...(cambiaClave && { password: p.data.clave }),
      });
      if (error)
        return { ok: false, error: mensajeError(error.code, error.message) };
      if (cambiaCorreo)
        await admin
          .from("perfiles")
          .update({ email: p.data.email })
          .eq("id", actual.id);
    }
  }

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: "usuario.editar",
    entidad: "usuario",
    entidadId: p.data.email,
    detalle: {
      ...(cambiaNombre && {
        nombre: `${actual.nombre ?? "—"} → ${p.data.nombre}`,
      }),
      ...(rol && { rol: `${actual.rolNombre ?? "—"} → ${rol.nombre}` }),
      ...(cambiaCorreo && { correo: `${actual.email} → ${p.data.email}` }),
      ...(cambiaClave && { contrasena: "restablecida" }),
    },
  });
  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: `Se guardaron los cambios de ${p.data.nombre}.` };
}

/**
 * Inactivar: `perfiles.activo = false` (lib/auth y RLS le cortan todo acceso)
 * y bloqueo en Supabase Auth (no puede volver a iniciar ni renovar sesión).
 */
export async function cambiarEstadoUsuario(
  usuarioId: string,
  activo: boolean,
): Promise<Resultado> {
  const yo = await requirePermiso(MODULO);
  if (!z.uuid().safeParse(usuarioId).success)
    return { ok: false, error: "Datos inválidos." };
  if (usuarioId === yo.id)
    return {
      ok: false,
      error: "No puedes cambiar el estado de tu propia cuenta.",
    };
  const actual = (await listarUsuarios()).find((u) => u.id === usuarioId);
  if (!actual) return { ok: false, error: "El usuario no existe." };

  if (MODO_DEMO) {
    if (!activo && dejariaSinAdmin(actual.id, actual.rolId ?? "", false))
      return {
        ok: false,
        error: mensajeError(undefined, "administrador activo"),
      };
    almacenDemo().usuarios.find((u) => u.id === usuarioId)!.activo = activo;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("perfiles")
      .update({ activo })
      .eq("id", usuarioId)
      .select("id");
    if (error)
      return { ok: false, error: mensajeError(error.code, error.message) };
    if (!data.length)
      return {
        ok: false,
        error: "No tienes permiso para editar este usuario.",
      };
    const bloqueo = await createAdminClient().auth.admin.updateUserById(
      usuarioId,
      {
        ban_duration: activo ? "none" : BLOQUEO,
      },
    );
    if (bloqueo.error)
      console.error("[usuarios] bloqueo", bloqueo.error.message);
  }

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: activo ? "usuario.activar" : "usuario.inactivar",
    entidad: "usuario",
    entidadId: actual.email,
  });
  revalidatePath("/configuracion/usuarios");
  return {
    ok: true,
    mensaje: activo
      ? `La cuenta de ${actual.nombre ?? actual.email} está activa.`
      : `La cuenta de ${actual.nombre ?? actual.email} quedó inactiva.`,
  };
}
