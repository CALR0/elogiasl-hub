import "server-only";
import { MODO_DEMO } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { almacenDemo } from "./demo";
import type { FiltrosLogs, LogFila, RolFila, UsuarioFila } from "./tipos";

/*
 * Lecturas de Configuración y Auditoría. Llamar SOLO después de
 * requirePermiso(...) en la página: roles y usuarios se leen con la secret key
 * (para contar usuarios por rol aunque quien mira no gestione usuarios); los
 * logs con la sesión del usuario (RLS).
 */

export const LOGS_POR_PAGINA = 10;

export async function listarRoles(): Promise<RolFila[]> {
  if (MODO_DEMO) return structuredClone(almacenDemo().roles);

  const { data, error } = await createAdminClient()
    .from("roles")
    .select(
      "id, nombre, descripcion, es_superadmin, activo, rol_permisos ( modulo_clave ), perfiles ( count )",
    )
    .order("es_superadmin", { ascending: false })
    .order("nombre");
  if (error) throw new Error(error.message);

  return data.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSuperadmin: r.es_superadmin,
    activo: r.activo,
    usuarios:
      (r.perfiles as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    accesos: (r.rol_permisos as { modulo_clave: string }[]).map(
      (p) => p.modulo_clave,
    ),
  }));
}

export async function obtenerRol(id: string): Promise<RolFila | null> {
  const roles = await listarRoles();
  return roles.find((r) => r.id === id) ?? null;
}

export async function listarUsuarios(): Promise<UsuarioFila[]> {
  if (MODO_DEMO) return structuredClone(almacenDemo().usuarios);

  const { data, error } = await createAdminClient()
    .from("perfiles")
    .select(
      "id, email, nombre_completo, rol_id, activo, ultimo_acceso, created_at, roles ( nombre )",
    )
    .order("nombre_completo", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  return data.map((p) => ({
    id: p.id,
    nombre: p.nombre_completo,
    email: p.email,
    rolId: p.rol_id,
    rolNombre:
      (p.roles as unknown as { nombre: string } | null)?.nombre ?? null,
    activo: p.activo,
    ultimoAcceso: p.ultimo_acceso,
    creado: p.created_at,
  }));
}

// ─── Logs ───────────────────────────────────────────────────────────────────

const inicioDia = (d: string) => `${d}T00:00:00-05:00`;
const finDia = (d: string) => `${d}T23:59:59.999-05:00`;

/** Coincide con la clave exacta o con cualquier nodo debajo de ella. */
const enModulo = (modulo: string | null, filtro: string) =>
  modulo === filtro || (modulo?.startsWith(`${filtro}.`) ?? false);

function filtrarDemo(logs: LogFila[], f: FiltrosLogs) {
  const q = f.q?.toLowerCase();
  return logs.filter(
    (l) =>
      (!f.desde || l.fecha >= new Date(inicioDia(f.desde)).toISOString()) &&
      (!f.hasta || l.fecha <= new Date(finDia(f.hasta)).toISOString()) &&
      (!f.usuario || l.actorEmail === f.usuario) &&
      (!f.modulo || enModulo(l.modulo, f.modulo)) &&
      (!f.accion || l.accion === f.accion) &&
      (!f.resultado || l.resultado === f.resultado) &&
      (!q ||
        [l.accion, l.actorEmail, l.actorNombre, l.entidadId, l.modulo]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))),
  );
}

type FilaLog = {
  id: number;
  created_at: string;
  actor_email: string | null;
  modulo: string | null;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  resultado: LogFila["resultado"];
  detalle: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  actor: { nombre_completo: string | null } | null;
};

/**
 * Consulta paginada (o completa, para exportar, con `pagina = null`, hasta
 * `limite` filas). Filtra en la BD.
 */
export async function consultarLogs(
  f: FiltrosLogs,
  pagina: number | null,
  limite = 10_000,
): Promise<{ filas: LogFila[]; total: number }> {
  const desde = pagina ? (pagina - 1) * LOGS_POR_PAGINA : 0;
  const hasta = pagina ? desde + LOGS_POR_PAGINA - 1 : limite - 1;

  if (MODO_DEMO) {
    const todas = filtrarDemo(almacenDemo().logs, f);
    return { filas: todas.slice(desde, hasta + 1), total: todas.length };
  }

  const supabase = await createClient();
  let consulta = supabase
    .from("audit_logs")
    .select(
      "id, created_at, actor_email, modulo, accion, entidad, entidad_id, resultado, detalle, ip, user_agent, actor:perfiles!audit_logs_actor_id_fkey ( nombre_completo )",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(desde, hasta);

  if (f.desde) consulta = consulta.gte("created_at", inicioDia(f.desde));
  if (f.hasta) consulta = consulta.lte("created_at", finDia(f.hasta));
  if (f.usuario) consulta = consulta.eq("actor_email", f.usuario);
  if (f.modulo)
    consulta = consulta.or(`modulo.eq.${f.modulo},modulo.like.${f.modulo}.*`);
  if (f.accion) consulta = consulta.eq("accion", f.accion);
  if (f.resultado) consulta = consulta.eq("resultado", f.resultado);
  if (f.q) {
    // Se quitan los caracteres con significado en la sintaxis de PostgREST
    const q = f.q.replace(/[,()*%\\:"']/g, " ").trim();
    if (q)
      consulta = consulta.or(
        ["accion", "actor_email", "entidad_id", "modulo"]
          .map((c) => `${c}.ilike.*${q}*`)
          .join(","),
      );
  }

  const { data, error, count } = await consulta;
  if (error) throw new Error(error.message);

  return {
    total: count ?? 0,
    filas: (data as unknown as FilaLog[]).map((l) => ({
      id: l.id,
      fecha: l.created_at,
      actorNombre: l.actor?.nombre_completo ?? null,
      actorEmail: l.actor_email,
      modulo: l.modulo,
      accion: l.accion,
      entidad: l.entidad,
      entidadId: l.entidad_id,
      resultado: l.resultado,
      detalle: l.detalle,
      ip: l.ip,
      userAgent: l.user_agent,
    })),
  };
}
