/**
 * Chequeo rápido de permisos (RLS, funciones y triggers) sin tocar la nube ni
 * usar Docker: aplica supabase/migrations/*.sql en un Postgres embebido
 * (PGlite) con stubs mínimos de Supabase y verifica qué puede hacer cada rol.
 *
 * Uso: npm run db:test   (córrelo antes de `npm run db:push`)
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const migrations = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"));

const db = new PGlite();

// ─── Stubs de Supabase ──────────────────────────────────────────────────────
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text,
    raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated, service_role;
`);

for (const sql of migrations) await db.exec(sql);

// ─── Datos de prueba ────────────────────────────────────────────────────────
const ADMIN = "11111111-1111-4111-8111-111111111111";
const GESTOR = "22222222-2222-4222-8222-222222222222"; // gestiona usuarios y ve logs (no roles)
const OPERADOR = "33333333-3333-4333-8333-333333333333"; // solo financiero
const SIN_ROL = "44444444-4444-4444-8444-444444444444";
const ENCARGADO = "55555555-5555-4555-8555-555555555555"; // gestiona roles (no es superadmin)

const {
  rows: [{ id: ROL_ADMIN }],
} = await db.query("select id from public.roles where es_superadmin");
const {
  rows: [{ id: ROL_GESTOR }],
} = await db.query(
  "insert into public.roles (nombre) values ('Gestor') returning id",
);
const {
  rows: [{ id: ROL_OPERADOR }],
} = await db.query(
  "insert into public.roles (nombre) values ('Operador') returning id",
);
const {
  rows: [{ id: ROL_ROLES }],
} = await db.query(
  "insert into public.roles (nombre) values ('Encargado de roles') returning id",
);
await db.exec(`
  insert into public.rol_permisos (rol_id, modulo_clave) values
    ('${ROL_GESTOR}', 'configuracion.usuarios'),
    ('${ROL_GESTOR}', 'auditoria.visor-logs'),
    ('${ROL_OPERADOR}', 'financiero.transferencia.migracion-anticipo-sap'),
    ('${ROL_ROLES}', 'configuracion.roles');
`);

for (const [id, email, rol] of [
  [ADMIN, "admin@elogia.test", ROL_ADMIN],
  [GESTOR, "gestor@elogia.test", ROL_GESTOR],
  [OPERADOR, "operador@elogia.test", ROL_OPERADOR],
  [SIN_ROL, "sinrol@elogia.test", null],
  [ENCARGADO, "encargado@elogia.test", ROL_ROLES],
]) {
  // El trigger on_auth_user_created crea el perfil con nombre y rol
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    values ('${id}', '${email}', '${rol ? JSON.stringify({ rol_id: rol }) : "{}"}', '{"nombre_completo":"${email.split("@")[0]}"}')`);
}
await db.exec(
  `insert into public.audit_logs (actor_id, accion) values ('${OPERADOR}', 'sesion.iniciar')`,
);

async function as(uid, sql) {
  await db.exec(
    `set role ${uid ? "authenticated" : "anon"}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`,
  );
  try {
    return { rows: (await db.query(sql)).rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("reset role;");
  }
}

// ─── Casos ──────────────────────────────────────────────────────────────────
let fallas = 0;
function check(nombre, cumple, detalle) {
  console.log(`${cumple ? "✓" : "✗"} ${nombre}`);
  if (!cumple) {
    fallas++;
    console.log("   ", JSON.stringify(detalle));
  }
}
const ok = (r, n) => !r.error && (n === undefined || r.rows.length === n);
const err = (r) => Boolean(r.error);
const guardar = (id, nombre, accesos) =>
  `select public.guardar_rol(${id ? `'${id}'` : "null"}, '${nombre}', '', true, array[${accesos.map((a) => `'${a}'`).join(",")}]::text[]) as id`;

// Perfiles creados por el trigger
let r = await db.query(
  "select count(*)::int as n from public.perfiles where rol_id is not null",
);
check("trigger crea perfiles con su rol", r.rows[0].n === 4, r.rows);

// Lectura de perfiles
r = await as(OPERADOR, "select id from public.perfiles");
check("operador solo ve su propio perfil", ok(r, 1), r);
r = await as(GESTOR, "select id from public.perfiles");
check("gestor de usuarios ve todos los perfiles", ok(r, 5), r);
r = await as(null, "select id from public.perfiles");
check("anónimo no ve perfiles", err(r) || ok(r, 0), r);

// Helpers
r = await as(
  OPERADOR,
  "select public.tiene_acceso('financiero.transferencia.migracion-anticipo-sap') as a, public.tiene_acceso('configuracion.roles') as b",
);
check(
  "tiene_acceso respeta los accesos del rol",
  r.rows?.[0].a === true && r.rows?.[0].b === false,
  r,
);
r = await as(
  OPERADOR,
  "select public.tiene_acceso('financiero') as m, public.tiene_acceso('financiero.transferencia') as s, public.tiene_acceso('financiero.factura') as f",
);
check(
  "acceso a una funcionalidad abre su módulo y submódulo, no las hermanas",
  r.rows?.[0].m && r.rows?.[0].s && !r.rows?.[0].f,
  r,
);
r = await as(ADMIN, "select public.tiene_acceso('cualquier.cosa') as a");
check("superadmin tiene todo", r.rows?.[0].a === true, r);
r = await as(SIN_ROL, "select public.es_usuario_activo() as a");
check("usuario sin rol no está activo", r.rows?.[0].a === false, r);

// rol_permisos
r = await as(OPERADOR, "select * from public.rol_permisos");
check("operador solo lee los permisos de su rol", ok(r, 1), r);
r = await as(ADMIN, "select * from public.rol_permisos");
check("quien gestiona roles lee todos los accesos", ok(r, 4), r);

// guardar_rol
r = await as(OPERADOR, guardar(null, "Intruso", []));
check("sin permiso no se crea un rol", err(r), r);
r = await as(GESTOR, guardar(null, "Intruso", []));
check(
  "sin acceso a Roles no se crea un rol (aunque gestione usuarios)",
  err(r),
  r,
);
r = await as(ADMIN, guardar(null, "Facturación", ["financiero.factura"]));
check("admin crea rol con accesos", ok(r, 1), r);
const ROL_NUEVO = r.rows?.[0].id;
r = await as(
  ADMIN,
  guardar(ROL_NUEVO, "Facturación", [
    "financiero.factura",
    "despacho.manifiesto.expedir-sicetac",
  ]),
);
r = await db.query(
  `select modulo_clave from public.rol_permisos where rol_id='${ROL_NUEVO}' order by 1`,
);
check("editar reemplaza los accesos", r.rows.length === 2, r.rows);
r = await as(ADMIN, guardar(ROL_NUEVO, "Facturación", ["financiero"]));
check("rechaza acceso directo a un módulo padre", err(r), r);
r = await as(ADMIN, guardar(ROL_NUEVO, "Facturación", ["no.existe"]));
check("rechaza módulos que no existen", err(r), r);
r = await db.query(
  `select count(*)::int as n from public.rol_permisos where rol_id='${ROL_NUEVO}'`,
);
check(
  "un error deja los accesos anteriores intactos",
  r.rows[0].n === 2,
  r.rows,
);
r = await as(ADMIN, guardar(ROL_ADMIN, "Administrador", []));
check("el rol superadmin no se edita", err(r), r);
r = await as(ADMIN, guardar(null, "Gestor", []));
check("nombres de rol únicos", err(r), r);

// Protecciones de roles
r = await as(
  ADMIN,
  `update public.roles set activo=false where id='${ROL_ADMIN}'`,
);
check("el rol superadmin no se desactiva", err(r), r);
r = await as(
  ADMIN,
  `update public.roles set es_superadmin=true where id='${ROL_OPERADOR}'`,
);
check("no se puede escalar un rol a superadmin", err(r), r);

// Perfiles: edición
r = await as(
  OPERADOR,
  `update public.perfiles set nombre_completo='x' where id='${GESTOR}' returning id`,
);
check("operador no edita perfiles ajenos", err(r) || ok(r, 0), r);
r = await as(
  GESTOR,
  `update public.perfiles set rol_id='${ROL_ADMIN}' where id='${GESTOR}'`,
);
check("nadie cambia su propio rol", err(r), r);
r = await as(
  GESTOR,
  `update public.perfiles set rol_id='${ROL_NUEVO}' where id='${OPERADOR}' returning id`,
);
check("gestor cambia el rol de otro usuario", ok(r, 1), r);
r = await as(
  GESTOR,
  `update public.perfiles set email='x@x.co' where id='${OPERADOR}'`,
);
check("el correo no se edita por la API (solo Auth)", err(r), r);
r = await as(
  GESTOR,
  `update public.perfiles set activo=false where id='${ADMIN}'`,
);
check("no se inactiva al último administrador", err(r), r);

// Superadministradores: solo otro superadmin los modifica o asigna ese rol
r = await as(
  GESTOR,
  `update public.perfiles set rol_id='${ROL_ADMIN}' where id='${OPERADOR}'`,
);
check("gestor de usuarios no asigna el rol superadmin", err(r), r);
r = await as(
  GESTOR,
  `update public.perfiles set nombre_completo='x' where id='${ADMIN}'`,
);
check("gestor de usuarios no modifica a un superadmin", err(r), r);
r = await as(
  ADMIN,
  `update public.perfiles set rol_id='${ROL_ADMIN}' where id='${OPERADOR}' returning id`,
);
check("un superadmin sí asigna el rol superadmin", ok(r, 1), r);
r = await as(
  ADMIN,
  `update public.perfiles set rol_id='${ROL_NUEVO}' where id='${OPERADOR}' returning id`,
);
check("un superadmin sí modifica a otro superadmin", ok(r, 1), r);

// El rol propio: quien gestiona roles no se da accesos a sí mismo
r = await as(
  ENCARGADO,
  guardar(ROL_ROLES, "Encargado de roles", [
    "configuracion.roles",
    "configuracion.usuarios",
  ]),
);
check("nadie edita los accesos de su propio rol", err(r), r);
r = await as(
  ENCARGADO,
  `insert into public.rol_permisos (rol_id, modulo_clave) values ('${ROL_ROLES}', 'configuracion.usuarios')`,
);
check("ni insertando directo en rol_permisos", err(r), r);
r = await as(
  ENCARGADO,
  `update public.roles set activo=false where id='${ROL_ROLES}'`,
);
check("nadie desactiva su propio rol", err(r), r);
r = await as(ENCARGADO, guardar(ROL_GESTOR, "Gestor", ["auditoria.visor-logs"]));
check("quien gestiona roles edita los demás roles", ok(r, 1), r);
r = await as(
  ADMIN,
  guardar(ROL_ROLES, "Encargado de roles", ["configuracion.roles"]),
);
check("un superadmin edita cualquier rol", ok(r, 1), r);

// Auditoría
r = await as(OPERADOR, "select * from public.audit_logs");
check("sin permiso no se leen logs", ok(r, 0), r);
r = await as(GESTOR, "select * from public.audit_logs");
check("con permiso del visor se leen logs", ok(r, 1), r);
r = await as(ADMIN, "insert into public.audit_logs (accion) values ('falso')");
check("nadie escribe logs desde el navegador", err(r), r);
r = await as(ADMIN, "delete from public.audit_logs");
check("nadie borra logs", err(r) || ok(r, 0), r);
r = await db.query("select count(*)::int as n from public.audit_logs");
check("los logs siguen intactos", r.rows[0].n === 1, r.rows);

// Sesión de la cuenta de servicio de Silogtran (solo el servidor)
r = await as(ADMIN, "select * from public.silogtran_sesion");
check("nadie lee la sesión de Silogtran desde el navegador", err(r) || ok(r, 0), r);
r = await as(ADMIN, "select public.silog_reservar_login(4, 20)");
check("nadie reserva el login de Silogtran desde el navegador", err(r), r);

async function comoServidor(sql) {
  await db.exec("set role service_role;");
  try {
    return { rows: (await db.query(sql)).rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("reset role;");
  }
}
r = await comoServidor("select public.silog_reservar_login(4, 20) as e");
check("el servidor reserva el login", r.rows?.[0].e === "ok", r);
r = await comoServidor("select public.silog_reservar_login(4, 20) as e");
check("un segundo login simultáneo espera", r.rows?.[0].e === "en_curso", r);
await comoServidor("select public.silog_terminar_login(false, null, 'clave', 30)");
r = await comoServidor("select public.silog_reservar_login(4, 20) as e");
check("tras un fallo queda en pausa", r.rows?.[0].e === "pausa", r);
await db.exec("update public.silogtran_sesion set pausa_hasta = null, logins = array[now(), now()]");
r = await comoServidor("select public.silog_reservar_login(2, 20) as e");
check("el tope por hora pausa los inicios de sesión", r.rows?.[0].e === "pausa", r);
await db.exec("update public.silogtran_sesion set pausa_hasta = null, logins = '{}'");
await comoServidor("select public.silog_reservar_login(4, 20)");
await comoServidor("select public.silog_terminar_login(true, 'sello', null, 0)");
r = await db.query("select cookies, fallos_seguidos, pausa_hasta from public.silogtran_sesion");
check(
  "un login exitoso guarda la sesión y limpia fallos",
  r.rows[0].cookies === "sello" && r.rows[0].fallos_seguidos === 0 && !r.rows[0].pausa_hasta,
  r.rows,
);

// Accesos individuales por usuario: (rol) ∪ (otorgado) ∖ (revocado)
/** Escritura del sistema, sin sesión de usuario (como la secret key). */
async function sinSesion(sql) {
  await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  return db.query(sql);
}
const USUARIOS_G = "66666666-6666-4666-8666-666666666666"; // solo gestiona usuarios
const LECTOR = "77777777-7777-4777-8777-777777777777"; // solo ve logs
const SIN_NADA = "88888888-8888-4888-8888-888888888888"; // rol sin accesos
const OTRO = "99999999-9999-4999-8999-999999999999"; // rol sin accesos
const nuevoRol = async (nombre, accesos) => {
  const {
    rows: [{ id }],
  } = await sinSesion(
    `insert into public.roles (nombre) values ('${nombre}') returning id`,
  );
  for (const a of accesos)
    await sinSesion(
      `insert into public.rol_permisos (rol_id, modulo_clave) values ('${id}', '${a}')`,
    );
  return id;
};
const ROL_USUARIOS = await nuevoRol("Solo usuarios", ["configuracion.usuarios"]);
const ROL_LECTOR = await nuevoRol("Solo logs", ["auditoria.visor-logs"]);
const ROL_VACIO = await nuevoRol("Sin accesos", []);
for (const [id, rol] of [
  [USUARIOS_G, ROL_USUARIOS],
  [LECTOR, ROL_LECTOR],
  [SIN_NADA, ROL_VACIO],
  [OTRO, ROL_VACIO],
])
  await sinSesion(`insert into auth.users (id, email, raw_app_meta_data)
    values ('${id}', '${id.slice(0, 1)}@elogia.test', '${JSON.stringify({ rol_id: rol })}')`);
const override = (usuario, modulo, tipo) =>
  `insert into public.usuario_permisos (usuario_id, modulo_clave, tipo) values ('${usuario}', '${modulo}', '${tipo}')`;
const limpiarOverrides = () => sinSesion("delete from public.usuario_permisos");
const ANTICIPOS = "financiero.transferencia.migracion-anticipo-sap";

// Autootorgamiento
r = await as(USUARIOS_G, override(USUARIOS_G, ANTICIPOS, "otorgar"));
check("gestor de usuarios no se otorga accesos a sí mismo", err(r), r);
await sinSesion(override(USUARIOS_G, ANTICIPOS, "revocar"));
r = await as(
  USUARIOS_G,
  `delete from public.usuario_permisos where usuario_id='${USUARIOS_G}'`,
);
check("ni se borra una revocación propia", err(r), r);
r = await as(
  USUARIOS_G,
  `update public.usuario_permisos set tipo='otorgar' where usuario_id='${USUARIOS_G}'`,
);
check("ni convierte una revocación propia en otorgamiento", err(r), r);
await limpiarOverrides();
r = await as(USUARIOS_G, override(OTRO, ANTICIPOS, "otorgar"));
check("gestor de usuarios otorga accesos a otro usuario", !r.error, r);
r = await as(
  USUARIOS_G,
  `update public.usuario_permisos set usuario_id='${USUARIOS_G}' where usuario_id='${OTRO}'`,
);
check("ni moviéndose el acceso de otro usuario", err(r), r);
await limpiarOverrides();
r = await as(SIN_NADA, override(OTRO, ANTICIPOS, "otorgar"));
check("sin gestionar usuarios no se otorgan accesos", err(r), r);
r = await as(USUARIOS_G, override(ADMIN, "financiero.factura", "otorgar"));
check("no se dan accesos individuales a un superadmin", err(r), r);
r = await as(USUARIOS_G, override(OTRO, "financiero", "otorgar"));
check("solo a funcionalidades, no a un módulo padre", err(r), r);
await sinSesion(override(OTRO, ANTICIPOS, "otorgar"));
check("el servidor (sin sesión) sí escribe accesos individuales", true);
await limpiarOverrides();

// Otorgado: las políticas lo reconocen
await sinSesion(override(SIN_NADA, "auditoria.visor-logs", "otorgar"));
await sinSesion(override(SIN_NADA, "configuracion.usuarios", "otorgar"));
await sinSesion(override(SIN_NADA, "configuracion.roles", "otorgar"));
r = await as(
  SIN_NADA,
  "select public.tiene_acceso('auditoria.visor-logs') as h, public.tiene_acceso('auditoria') as m, public.tiene_permiso('auditoria.visor-logs') as p, public.tiene_acceso('financiero') as f",
);
check(
  "otorgado: abre la funcionalidad y su módulo, no otros",
  r.rows?.[0].h && r.rows?.[0].m && r.rows?.[0].p && !r.rows?.[0].f,
  r,
);
r = await as(SIN_NADA, "select * from public.audit_logs");
check("otorgado el visor: lee los logs", ok(r, 1), r);
r = await as(SIN_NADA, "select id from public.perfiles");
check("otorgado usuarios: ve todos los perfiles", ok(r) && r.rows.length > 1, r);
r = await as(
  SIN_NADA,
  `update public.perfiles set nombre_completo='z' where id='${OTRO}' returning id`,
);
check("otorgado usuarios: edita otro perfil", ok(r, 1), r);
r = await as(SIN_NADA, guardar(null, "Rol de otorgado", []));
check("otorgado roles: guarda un rol", ok(r, 1), r);
r = await as(SIN_NADA, guardar(ROL_VACIO, "Sin accesos", []));
check("otorgado roles: tampoco edita el rol al que pertenece", err(r), r);
await limpiarOverrides();

// Revocado: las políticas también lo niegan
await sinSesion(override(LECTOR, "auditoria.visor-logs", "revocar"));
await sinSesion(override(USUARIOS_G, "configuracion.usuarios", "revocar"));
r = await as(
  LECTOR,
  "select public.tiene_acceso('auditoria.visor-logs') as h, public.tiene_acceso('auditoria') as m, public.tiene_permiso('auditoria.visor-logs') as p",
);
check(
  "revocado: sin la funcionalidad ni su módulo",
  r.rows?.[0].h === false && r.rows?.[0].m === false && r.rows?.[0].p === false,
  r,
);
r = await as(LECTOR, "select * from public.audit_logs");
check("revocado el visor: no lee logs por la API", ok(r, 0), r);
r = await as(USUARIOS_G, "select id from public.perfiles");
check("revocado usuarios: solo ve su perfil", ok(r, 1), r);
r = await as(
  USUARIOS_G,
  `update public.perfiles set nombre_completo='y' where id='${OTRO}' returning id`,
);
check("revocado usuarios: no edita otros perfiles", err(r) || ok(r, 0), r);
await limpiarOverrides();

// Inactivos y superadmin
await sinSesion(override(SIN_NADA, ANTICIPOS, "otorgar"));
await sinSesion(`update public.perfiles set activo=false where id='${SIN_NADA}'`);
r = await as(SIN_NADA, `select public.tiene_acceso('${ANTICIPOS}') as a`);
check("usuario inactivo: lo otorgado no vale", r.rows?.[0].a === false, r);
await sinSesion(`update public.perfiles set activo=true where id='${SIN_NADA}'`);
await sinSesion(`update public.roles set activo=false where id='${ROL_VACIO}'`);
r = await as(SIN_NADA, `select public.tiene_acceso('${ANTICIPOS}') as a`);
check("rol inactivo: lo otorgado no vale", r.rows?.[0].a === false, r);
await sinSesion(`update public.roles set activo=true where id='${ROL_VACIO}'`);
await limpiarOverrides();
r = await as(ADMIN, `select public.tiene_acceso('${ANTICIPOS}') as a`);
check("superadmin sigue con acceso total", r.rows?.[0].a === true, r);

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodo en orden");
process.exit(fallas ? 1 : 0);
