import "server-only";
import { registrarAuditoria } from "@/lib/auditoria";
import { createAdminClient } from "@/lib/supabase/admin";
import { Silogtran, SilogtranError, type Cookies } from "./cliente.ts";
import { abrir, sellar } from "./sello.ts";

/*
 * Sesión de la CUENTA DE SERVICIO de Silogtran (SILOG_USUARIO / SILOG_CLAVE).
 *
 * En Vercel no hay memoria entre peticiones: la sesión (cookies + token de
 * AWS WAF) se guarda cifrada en public.silogtran_sesion y se reutiliza. Solo
 * se vuelve a iniciar sesión cuando Silogtran la da por vencida, y siempre a
 * través de silog_reservar_login() (un login a la vez, pausas tras fallos y
 * topes por hora/día) para que Silogtran no bloquee la cuenta compartida.
 */

export const BASE_URL =
  process.env.SILOG_BASE_URL || "https://construproyec.colombiasoftware.net/";

const SESION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_LOGIN_HORA = Number(process.env.SILOG_LOGIN_MAX_HORA) || 4;
const MAX_LOGIN_DIA = Number(process.env.SILOG_LOGIN_MAX_DIA) || 20;
/** Pausa tras un error de la cuenta (clave, 2FA…) vs. un error pasajero (WAF, red). */
const PAUSA_CUENTA_MIN = 60;
const PAUSA_PASAJERA_MIN = 2;

export interface Actor {
  id: string;
  email: string;
}

// Una operación de Silogtran a la vez por instancia (PRADO guarda estado por sesión)
let cola: Promise<unknown> = Promise.resolve();
function enCola<T>(fn: () => Promise<T>): Promise<T> {
  const p = cola.then(fn, fn);
  cola = p.catch(() => {});
  return p;
}

async function leerFila() {
  const { data, error } = await createAdminClient()
    .from("silogtran_sesion")
    .select("cookies, actualizado_at, pausa_hasta, ultimo_error")
    .eq("id", 1)
    .single();
  if (error) {
    console.error("[silogtran] no se leyó la sesión:", error.message);
    throw new SilogtranError(
      "No se pudo leer la sesión de Silogtran. ¿Se aplicó la migración silogtran_sesion?",
    );
  }
  return data as {
    cookies: string | null;
    actualizado_at: string | null;
    pausa_hasta: string | null;
    ultimo_error: string | null;
  };
}

async function guardarCookies(cli: Silogtran, antes: string) {
  const ahora = JSON.stringify(cli.exportarCookies());
  if (ahora === antes) return;
  const { error } = await createAdminClient()
    .from("silogtran_sesion")
    .update({
      cookies: sellar("silogtran", cli.exportarCookies(), SESION_TTL_MS),
      actualizado_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error)
    console.error("[silogtran] no se guardó la sesión:", error.message);
}

const horaColombia = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
};

/** Inicia sesión con la cuenta de servicio, respetando el candado y las pausas. */
async function iniciarSesion(
  previo: Silogtran | null,
  actor: Actor,
): Promise<Silogtran> {
  const usuario = process.env.SILOG_USUARIO;
  const clave = process.env.SILOG_CLAVE;
  if (!usuario || !clave) {
    throw new SilogtranError(
      "La cuenta de servicio de Silogtran no está configurada (SILOG_USUARIO / SILOG_CLAVE).",
    );
  }

  const admin = createAdminClient();
  const inicio = Date.now();
  const { data: estado, error } = await admin.rpc("silog_reservar_login", {
    p_max_hora: MAX_LOGIN_HORA,
    p_max_dia: MAX_LOGIN_DIA,
    p_duracion_seg: 120,
  });
  if (error)
    throw new SilogtranError(
      "No se pudo coordinar el inicio de sesión en Silogtran.",
    );

  if (estado === "en_curso") {
    // Otra instancia está iniciando sesión: esperar a que guarde la sesión nueva
    while (Date.now() - inicio < 45_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const fila = await leerFila();
      const cookies = abrir<Cookies>("silogtran", fila.cookies);
      if (
        cookies &&
        fila.actualizado_at &&
        new Date(fila.actualizado_at).getTime() > inicio
      )
        return new Silogtran(BASE_URL, cookies);
    }
    throw new SilogtranError(
      "Silogtran está ocupado iniciando sesión. Intente en un momento.",
    );
  }

  if (estado === "pausa") {
    const fila = await leerFila();
    throw new SilogtranError(
      `La conexión con Silogtran está en pausa${fila.pausa_hasta ? ` hasta las ${horaColombia(fila.pausa_hasta)}` : ""} para proteger la cuenta de servicio.${fila.ultimo_error ? ` Motivo: ${fila.ultimo_error}` : ""}`,
    );
  }

  // Se conserva el token del firewall (si había) para no abrir el navegador de nuevo
  const cli = new Silogtran(BASE_URL, previo?.cookiesWaf() ?? null);
  try {
    await cli.login(usuario, clave);
  } catch (e) {
    const msg =
      e instanceof SilogtranError
        ? e.message
        : "No fue posible conectar con Silogtran.";
    const deCuenta = e instanceof SilogtranError && e.deCuenta;
    await admin.rpc("silog_terminar_login", {
      p_ok: false,
      p_cookies: null,
      p_error: msg,
      p_pausa_min: deCuenta ? PAUSA_CUENTA_MIN : PAUSA_PASAJERA_MIN,
    });
    await registrarAuditoria({
      actorId: actor.id,
      actorEmail: actor.email,
      modulo: "maestros.vehiculo.ficha-tecnica",
      accion: "silogtran.sesion",
      resultado: "error",
      detalle: { mensaje: msg },
    });
    if (!(e instanceof SilogtranError)) console.error("[silogtran] login:", e);
    throw e instanceof SilogtranError ? e : new SilogtranError(msg);
  }

  await admin.rpc("silog_terminar_login", {
    p_ok: true,
    p_cookies: sellar("silogtran", cli.exportarCookies(), SESION_TTL_MS),
    p_error: null,
    p_pausa_min: 0,
  });
  await registrarAuditoria({
    actorId: actor.id,
    actorEmail: actor.email,
    modulo: "maestros.vehiculo.ficha-tecnica",
    accion: "silogtran.sesion",
  });
  return cli;
}

/**
 * Ejecuta `fn` con un cliente de Silogtran ya autenticado con la cuenta de
 * servicio. Si Silogtran venció la sesión, inicia sesión una vez y reintenta.
 */
export function conSilogtran<T>(
  actor: Actor,
  fn: (cli: Silogtran) => Promise<T>,
): Promise<T> {
  return enCola(async () => {
    const fila = await leerFila();
    const guardadas = abrir<Cookies>("silogtran", fila.cookies);
    let cli = guardadas
      ? new Silogtran(BASE_URL, guardadas)
      : await iniciarSesion(null, actor);
    let antes = guardadas
      ? JSON.stringify(guardadas)
      : JSON.stringify(cli.exportarCookies());

    try {
      const r = await fn(cli);
      await guardarCookies(cli, antes);
      return r;
    } catch (e) {
      if (!(e instanceof SilogtranError && e.sesionExpirada)) {
        await guardarCookies(cli, antes);
        throw e;
      }
      cli = await iniciarSesion(cli, actor);
      antes = JSON.stringify(cli.exportarCookies());
      const r = await fn(cli);
      await guardarCookies(cli, antes);
      return r;
    }
  });
}
