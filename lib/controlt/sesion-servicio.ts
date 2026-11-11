import "server-only";
import {
  type ApiToken,
  consultarManifiesto,
  consultarPlaca,
  ControlTError,
  iniciarSesionHub,
  iniciarSesionPublic,
  type Tokens,
} from "./cliente";
import type { ResultadoConsulta } from "./tipos";

/*
 * Sesión de la CUENTA DE SERVICIO de Control T (CONTROLT_USUARIO /
 * CONTROLT_CLAVE).
 *
 * Mantiene DOS tokens Bearer en memoria del runtime, uno por cada API:
 *   • "publico" — para /apipublic/api/Resume y /apipublic/api/Travel/search.
 *                 Login antiguo JSON, vive ~12 h.
 *   • "hub"     — para /v1/hub/last/{placa}.
 *                 Login nuevo x-www-form-urlencoded, vive ~24 h.
 *
 * El token de una API NO sirve en la otra (así lo confirmó el usuario), por
 * eso hay dos cachés y dos candados independientes. Si Control T devuelve
 * 401, el ControlTError dice cuál de los dos (tokenInvalido = "publico" |
 * "hub") hay que renovar y se reintenta UNA vez la operación.
 *
 * En Vercel cada instancia mantiene sus propios tokens.
 */

const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

interface Sesion {
  token: string;
  venceEnMs: number;
}

// Un objeto por runtime (sobrevive a la recarga de next dev con globalThis)
const g = globalThis as unknown as {
  __controltSesionPublic?: Sesion | null;
  __controltSesionHub?: Sesion | null;
  __controltLoginPublic?: Promise<Sesion> | null;
  __controltLoginHub?: Promise<Sesion> | null;
};

function configurada(): boolean {
  return !!(process.env.CONTROLT_USUARIO && process.env.CONTROLT_CLAVE);
}

function credenciales(): [string, string] {
  const usuario = process.env.CONTROLT_USUARIO;
  const clave = process.env.CONTROLT_CLAVE;
  if (!usuario || !clave) {
    throw new ControlTError(
      "La cuenta de servicio de Control T no está configurada (CONTROLT_USUARIO / CONTROLT_CLAVE).",
    );
  }
  return [usuario, clave];
}

async function obtenerTokenPublic(forzar = false): Promise<string> {
  const ahora = Date.now();
  const actual = g.__controltSesionPublic;
  if (!forzar && actual && actual.venceEnMs - MARGEN_RENOVACION_MS > ahora) {
    return actual.token;
  }
  if (!g.__controltLoginPublic) {
    g.__controltLoginPublic = (async () => {
      try {
        const [u, c] = credenciales();
        const nueva = await iniciarSesionPublic(u, c);
        g.__controltSesionPublic = nueva;
        return nueva;
      } finally {
        g.__controltLoginPublic = null;
      }
    })();
  }
  const nueva = await g.__controltLoginPublic;
  return nueva.token;
}

async function obtenerTokenHub(forzar = false): Promise<string> {
  const ahora = Date.now();
  const actual = g.__controltSesionHub;
  if (!forzar && actual && actual.venceEnMs - MARGEN_RENOVACION_MS > ahora) {
    return actual.token;
  }
  if (!g.__controltLoginHub) {
    g.__controltLoginHub = (async () => {
      try {
        const [u, c] = credenciales();
        const nueva = await iniciarSesionHub(u, c);
        g.__controltSesionHub = nueva;
        return nueva;
      } finally {
        g.__controltLoginHub = null;
      }
    })();
  }
  const nueva = await g.__controltLoginHub;
  return nueva.token;
}

async function renovar(cual: ApiToken): Promise<Tokens> {
  if (cual === "publico") {
    const [publico, hub] = await Promise.all([
      obtenerTokenPublic(true),
      obtenerTokenHub(),
    ]);
    return { publico, hub };
  }
  const [publico, hub] = await Promise.all([
    obtenerTokenPublic(),
    obtenerTokenHub(true),
  ]);
  return { publico, hub };
}

/**
 * Entrega ambos tokens válidos, corre la operación y, si Control T devuelve
 * 401 en uno de los dos, renueva SOLO ese y reintenta una vez.
 */
async function conTokens<T>(
  fn: (tokens: Tokens) => Promise<T>,
): Promise<T> {
  const [publico, hub] = await Promise.all([
    obtenerTokenPublic(),
    obtenerTokenHub(),
  ]);
  try {
    return await fn({ publico, hub });
  } catch (e) {
    if (!(e instanceof ControlTError) || !e.tokenInvalido) throw e;
    const tokens = await renovar(e.tokenInvalido);
    return fn(tokens);
  }
}

export function controltConfigurado(): boolean {
  return configurada();
}

export function consultarPorPlaca(
  placas: string[],
): Promise<ResultadoConsulta> {
  return conTokens((t) => consultarPlaca(t, placas));
}

export function consultarPorManifiesto(
  numero: string,
): Promise<ResultadoConsulta> {
  return conTokens((t) => consultarManifiesto(t, numero));
}
