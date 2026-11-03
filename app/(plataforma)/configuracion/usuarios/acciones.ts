"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso, type UsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { almacenDemo } from "@/lib/gestion/demo";
import {
  listarRoles,
  listarUsuarios,
  overridesDelUsuario,
} from "@/lib/gestion/datos";
import type { OverridePermiso, Resultado } from "@/lib/gestion/tipos";
import { hojas } from "@/lib/modulos";
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
/** Hojas válidas del árbol: los overrides solo aplican a funcionalidades. */
const HOJAS = hojas().map((h) => h.clave);

const email = z.email("Correo inválido.").trim().toLowerCase();
const clave = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(72, "La contraseña admite máximo 72 caracteres.");
const nombre = z
  .string()
  .trim()
  .min(3, "Escribe el nombre completo.")
  .max(120)
  .regex(
    /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/,
    "El nombre solo admite letras, espacios, guiones y apóstrofos.",
  );

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
  if (/superadministrador/i.test(mensaje)) return SOLO_SUPERADMIN;
  return "No se pudo completar la operación. Intenta de nuevo.";
}

const SOLO_SUPERADMIN =
  "Solo un superadministrador puede gestionar cuentas de superadministrador.";

/**
 * El rol debe existir y estar activo para poder asignarse; el de
 * superadministrador solo lo asigna otro superadministrador.
 */
async function rolAsignable(rolId: string, yo: UsuarioActual) {
  const rol = (await listarRoles()).find((r) => r.id === rolId);
  if (!rol?.activo)
    return { rol: null, error: "El rol elegido no está activo." };
  if (rol.esSuperadmin && !yo.rol.esSuperadmin)
    return { rol: null, error: SOLO_SUPERADMIN };
  return { rol, error: "" };
}

/**
 * ¿La cuenta es de un superadministrador? Entonces solo otro superadmin la
 * toca: correo y contraseña van por la API de administración (sin RLS), y
 * cambiarlos sería tomar control de la cuenta.
 */
async function esCuentaSuperadmin(rolId: string | null) {
  if (!rolId) return false;
  return Boolean(
    (await listarRoles()).find((r) => r.id === rolId)?.esSuperadmin,
  );
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
  const asignable = await rolAsignable(p.data.rolId, yo);
  if (!asignable.rol) return { ok: false, error: asignable.error };
  const { rol } = asignable;

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
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
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
    // Supabase Auth puede fijar app_metadata DESPUÉS del INSERT en auth.users,
    // así que el trigger a veces ve rol_id nulo. Lo forzamos aquí.
    const { error: errorPerfil } = await admin
      .from("perfiles")
      .update({ nombre_completo: p.data.nombre, rol_id: rol.id })
      .eq("id", id);
    if (errorPerfil) {
      console.error("[usuarios] no se fijó el rol al crear:", errorPerfil.message);
      return {
        ok: false,
        error: "La cuenta se creó pero no se pudo asignar el rol. Edítala para asignarlo.",
      };
    }
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
  if (!yo.rol.esSuperadmin && (await esCuentaSuperadmin(actual.rolId)))
    return { ok: false, error: SOLO_SUPERADMIN };

  const cambiaNombre = actual.nombre !== p.data.nombre;
  const cambiaRol = actual.rolId !== p.data.rolId;
  const cambiaCorreo = actual.email !== p.data.email;
  const cambiaClave = p.data.clave !== "";
  if (!cambiaNombre && !cambiaRol && !cambiaCorreo && !cambiaClave)
    return { ok: true, mensaje: "No hubo cambios." };

  if (cambiaRol && p.data.id === yo.id)
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  const asignable = cambiaRol ? await rolAsignable(p.data.rolId, yo) : null;
  if (asignable && !asignable.rol) return { ok: false, error: asignable.error };
  const rol = asignable?.rol ?? null;

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
  if (!yo.rol.esSuperadmin && (await esCuentaSuperadmin(actual.rolId)))
    return { ok: false, error: SOLO_SUPERADMIN };

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

const esquemaAccesos = z.object({
  usuarioId: z.uuid(),
  /** Hojas con acceso EFECTIVO que debe quedar el usuario. */
  accesos: z
    .array(z.string())
    .refine((a) => a.every((c) => HOJAS.includes(c)), "Hay módulos inválidos."),
});

/**
 * Fija los accesos efectivos del usuario a partir de un conjunto marcado en la
 * UI. Compara contra el rol base y persiste solo las diferencias como
 * overrides (otorgar lo que el rol no trae, revocar lo que trae y no está
 * marcado). Al cambiar de rol en el futuro, los overrides se conservan.
 */
export async function guardarAccesosUsuario(entrada: {
  usuarioId: string;
  accesos: string[];
}): Promise<Resultado> {
  const yo = await requirePermiso(MODULO);
  const p = esquemaAccesos.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const actual = (await listarUsuarios()).find((u) => u.id === p.data.usuarioId);
  if (!actual) return { ok: false, error: "El usuario no existe." };
  if (p.data.usuarioId === yo.id)
    return {
      ok: false,
      error: "No puedes editar tus propios accesos individuales.",
    };
  const rol = actual.rolId
    ? (await listarRoles()).find((r) => r.id === actual.rolId)
    : null;
  if (!rol)
    return {
      ok: false,
      error: "El usuario no tiene rol asignado. Asígnalo primero.",
    };
  if (rol.esSuperadmin)
    return {
      ok: false,
      error:
        "El administrador tiene acceso total; no admite overrides individuales.",
    };
  if (!yo.rol.esSuperadmin && rol.esSuperadmin)
    return { ok: false, error: SOLO_SUPERADMIN };

  const efectivos = new Set(HOJAS.filter((c) => p.data.accesos.includes(c)));
  const base = new Set(rol.accesos.filter((c) => HOJAS.includes(c)));
  // Diferencias contra el rol → overrides a persistir
  const nuevos: OverridePermiso[] = [];
  for (const c of HOJAS) {
    if (efectivos.has(c) && !base.has(c))
      nuevos.push({ modulo: c, tipo: "otorgar" });
    else if (!efectivos.has(c) && base.has(c))
      nuevos.push({ modulo: c, tipo: "revocar" });
  }

  const previos = await overridesDelUsuario(p.data.usuarioId);
  const sinCambios =
    previos.length === nuevos.length &&
    previos.every((o) =>
      nuevos.find((n) => n.modulo === o.modulo && n.tipo === o.tipo),
    );
  if (sinCambios) return { ok: true, mensaje: "No hubo cambios." };

  if (MODO_DEMO) {
    almacenDemo().overrides[p.data.usuarioId] = structuredClone(nuevos);
  } else {
    const admin = createAdminClient();
    const { error: errorBorrar } = await admin
      .from("usuario_permisos")
      .delete()
      .eq("usuario_id", p.data.usuarioId);
    if (errorBorrar)
      return { ok: false, error: mensajeError(errorBorrar.code, errorBorrar.message) };
    if (nuevos.length) {
      const { error: errorInsertar } = await admin
        .from("usuario_permisos")
        .insert(
          nuevos.map((o) => ({
            usuario_id: p.data.usuarioId,
            modulo_clave: o.modulo,
            tipo: o.tipo,
          })),
        );
      if (errorInsertar)
        return {
          ok: false,
          error: mensajeError(errorInsertar.code, errorInsertar.message),
        };
    }
  }

  const antesOtorgar = previos.filter((o) => o.tipo === "otorgar").map((o) => o.modulo);
  const antesRevocar = previos.filter((o) => o.tipo === "revocar").map((o) => o.modulo);
  const hoyOtorgar = nuevos.filter((o) => o.tipo === "otorgar").map((o) => o.modulo);
  const hoyRevocar = nuevos.filter((o) => o.tipo === "revocar").map((o) => o.modulo);
  const otorgadosNuevos = hoyOtorgar.filter((c) => !antesOtorgar.includes(c));
  const otorgadosQuitados = antesOtorgar.filter((c) => !hoyOtorgar.includes(c));
  const revocadosNuevos = hoyRevocar.filter((c) => !antesRevocar.includes(c));
  const revocadosQuitados = antesRevocar.filter((c) => !hoyRevocar.includes(c));

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: "usuario.accesos",
    entidad: "usuario",
    entidadId: actual.email,
    detalle: {
      ...(otorgadosNuevos.length && { otorgados: otorgadosNuevos }),
      ...(revocadosNuevos.length && { revocados: revocadosNuevos }),
      ...(otorgadosQuitados.length && { otorgados_removidos: otorgadosQuitados }),
      ...(revocadosQuitados.length && { revocados_removidos: revocadosQuitados }),
    },
  });
  revalidatePath("/configuracion/usuarios");
  return {
    ok: true,
    mensaje: `Se actualizaron los accesos de ${actual.nombre ?? actual.email}.`,
  };
}
