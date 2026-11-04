import "server-only";
import {
  consultarManifiesto,
  consultarPlaca,
  ControlTError,
  iniciarSesion,
} from "./cliente";
import type { ResultadoConsulta } from "./tipos";

/*
 * Sesión de la CUENTA DE SERVICIO de Control T (CONTROLT_USUARIO / CONTROLT_CLAVE).
 *
 * El token Bearer se guarda en memoria del runtime y se reusa hasta que vence
 * (~12 h). Si Control T devuelve 401, se pide uno nuevo y se reintenta la
 * operación una vez. En Vercel cada instancia mantiene su propio token; no
 * importa, Control T devuelve el mismo hasta que caduca.
 *
 * Renovación con 5 min de margen; una sola operación de login en curso.
 */

const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

interface Sesion {
  token: string;
  venceEnMs: number;
}

// Un objeto por runtime (sobrevive a la recarga de next dev con globalThis)
const g = globalThis as unknown as {
  __controltSesion?: Sesion | null;
  __controltLogin?: Promise<Sesion> | null;
};

function configurada(): boolean {
  return !!(process.env.CONTROLT_USUARIO && process.env.CONTROLT_CLAVE);
}

async function loginNuevo(): Promise<Sesion> {
  const usuario = process.env.CONTROLT_USUARIO;
  const clave = process.env.CONTROLT_CLAVE;
  if (!usuario || !clave) {
    throw new ControlTError(
      "La cuenta de servicio de Control T no está configurada (CONTROLT_USUARIO / CONTROLT_CLAVE).",
    );
  }
  const { token, venceEnMs } = await iniciarSesion(usuario, clave);
  return { token, venceEnMs };
}

async function obtenerToken(forzar = false): Promise<string> {
  const ahora = Date.now();
  const actual = g.__controltSesion;
  if (
    !forzar &&
    actual &&
    actual.venceEnMs - MARGEN_RENOVACION_MS > ahora
  ) {
    return actual.token;
  }
  // Un solo login a la vez: si ya hay uno en curso, esperamos su resultado
  if (!g.__controltLogin) {
    g.__controltLogin = (async () => {
      try {
        const nueva = await loginNuevo();
        g.__controltSesion = nueva;
        return nueva;
      } finally {
        g.__controltLogin = null;
      }
    })();
  }
  const nueva = await g.__controltLogin;
  return nueva.token;
}

async function conToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await obtenerToken();
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof ControlTError && e.tokenInvalido)) throw e;
    const nuevo = await obtenerToken(true);
    return fn(nuevo);
  }
}

export function controltConfigurado(): boolean {
  return configurada();
}

export function consultarPorPlaca(placas: string[]): Promise<ResultadoConsulta> {
  return conToken((t) => consultarPlaca(t, placas));
}

export function consultarPorManifiesto(
  numero: string,
): Promise<ResultadoConsulta> {
  return conToken((t) => consultarManifiesto(t, numero));
}
