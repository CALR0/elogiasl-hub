"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODO_DEMO } from "@/lib/demo";
import { almacenDemo } from "@/lib/gestion/demo";
import { obtenerRol } from "@/lib/gestion/datos";
import type { Resultado } from "@/lib/gestion/tipos";
import { hojas } from "@/lib/modulos";
import { createClient } from "@/lib/supabase/server";

/*
 * Acciones sobre roles. Todas: requirePermiso() → validar con Zod → escribir
 * con la sesión del usuario (RLS + función guardar_rol, atómica) → auditoría.
 */

const MODULO = "configuracion.roles";
/** Orden del árbol: los accesos se guardan y se registran en este orden. */
const HOJAS = hojas().map((h) => h.clave);

const esquemaRol = z.object({
  id: z.uuid().optional(),
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(60, "El nombre admite máximo 60 caracteres."),
  descripcion: z.string().trim().max(240, "Máximo 240 caracteres."),
  activo: z.boolean(),
  accesos: z
    .array(z.string())
    .refine((a) => a.every((c) => HOJAS.includes(c)), "Hay módulos inválidos."),
});

function mensajeError(codigo: string | undefined, mensaje: string) {
  if (codigo === "23505") return "Ya existe un rol con ese nombre.";
  if (codigo === "42501") return "No tienes acceso a la gestión de roles.";
  if (/rol al que perteneces/i.test(mensaje))
    return "No puedes modificar el rol al que perteneces.";
  if (/superadministrador/i.test(mensaje))
    return "El rol de administrador no se puede modificar.";
  return "No se pudo guardar el rol. Intenta de nuevo.";
}

export async function guardarRol(
  entrada: z.input<typeof esquemaRol>,
): Promise<Resultado<{ id: string }>> {
  const yo = await requirePermiso(MODULO);
  const p = esquemaRol.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const accesos = HOJAS.filter((c) => p.data.accesos.includes(c));

  const anterior = p.data.id ? await obtenerRol(p.data.id) : null;
  if (p.data.id && !anterior) return { ok: false, error: "El rol no existe." };
  if (anterior?.esSuperadmin)
    return {
      ok: false,
      error: "El rol de administrador no se puede modificar.",
    };
  // Nadie (salvo el superadmin) se da accesos editando su propio rol
  if (anterior && anterior.id === yo.rol.id && !yo.rol.esSuperadmin)
    return {
      ok: false,
      error: "No puedes modificar el rol al que perteneces.",
    };

  let id = p.data.id;
  if (MODO_DEMO) {
    const a = almacenDemo();
    const nombre = p.data.nombre.toLowerCase();
    if (a.roles.some((r) => r.id !== id && r.nombre.toLowerCase() === nombre))
      return { ok: false, error: mensajeError("23505", "") };
    if (id) {
      Object.assign(
        a.roles.find((r) => r.id === id)!,
        {
          nombre: p.data.nombre,
          descripcion: p.data.descripcion || null,
          activo: p.data.activo,
          accesos,
        },
      );
      for (const u of a.usuarios.filter((u) => u.rolId === id))
        u.rolNombre = p.data.nombre;
    } else {
      id = crypto.randomUUID();
      a.roles.push({
        id,
        nombre: p.data.nombre,
        descripcion: p.data.descripcion || null,
        esSuperadmin: false,
        activo: p.data.activo,
        usuarios: 0,
        accesos,
      });
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("guardar_rol", {
      p_id: id ?? null,
      p_nombre: p.data.nombre,
      p_descripcion: p.data.descripcion,
      p_activo: p.data.activo,
      p_accesos: accesos,
    });
    if (error)
      return { ok: false, error: mensajeError(error.code, error.message) };
    id = data as string;
  }

  const antes = anterior?.accesos ?? [];
  const agregados = accesos.filter((c) => !antes.includes(c));
  const quitados = antes.filter((c) => !accesos.includes(c));
  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: anterior ? "rol.editar" : "rol.crear",
    entidad: "rol",
    entidadId: p.data.nombre,
    detalle: {
      ...(anterior &&
        anterior.nombre !== p.data.nombre && {
          nombre_anterior: anterior.nombre,
        }),
      ...(anterior &&
        anterior.activo !== p.data.activo && { activo: p.data.activo }),
      ...(agregados.length && { accesos_agregados: agregados }),
      ...(quitados.length && { accesos_quitados: quitados }),
    },
  });

  revalidatePath("/configuracion/roles");
  return {
    ok: true,
    mensaje: anterior
      ? `Se guardaron los cambios de "${p.data.nombre}".`
      : `Se creó el rol "${p.data.nombre}".`,
    dato: { id: id! },
  };
}

export async function cambiarEstadoRol(
  rolId: string,
  activo: boolean,
): Promise<Resultado> {
  const yo = await requirePermiso(MODULO);
  if (!z.uuid().safeParse(rolId).success)
    return { ok: false, error: "Datos inválidos." };
  const rol = await obtenerRol(rolId);
  if (!rol) return { ok: false, error: "El rol no existe." };
  if (rol.esSuperadmin)
    return {
      ok: false,
      error: "El rol de administrador no se puede inactivar.",
    };
  if (rol.id === yo.rol.id)
    return {
      ok: false,
      error: "No puedes cambiar el estado del rol al que perteneces.",
    };

  if (MODO_DEMO) {
    almacenDemo().roles.find((r) => r.id === rolId)!.activo = activo;
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("roles")
      .update({ activo })
      .eq("id", rolId);
    if (error)
      return { ok: false, error: mensajeError(error.code, error.message) };
  }

  await registrarAuditoria({
    actorId: yo.id,
    actorEmail: yo.email,
    modulo: MODULO,
    accion: activo ? "rol.activar" : "rol.inactivar",
    entidad: "rol",
    entidadId: rol.nombre,
    detalle: activo ? undefined : { usuarios_afectados: rol.usuarios },
  });
  revalidatePath("/configuracion/roles");
  return {
    ok: true,
    mensaje: activo
      ? `El rol "${rol.nombre}" está activo.`
      : `El rol "${rol.nombre}" quedó inactivo.`,
  };
}
