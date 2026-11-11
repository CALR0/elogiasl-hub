import "server-only";
import type { ResultadoConsulta, Vehiculo, ViajeResumen } from "./tipos";

/*
 * Cliente HTTP del servicio Control T (monitoreo de flotas en Colombia).
 *
 * DOS tokens Bearer distintos (mismas credenciales, dos endpoints de login):
 *   • API Public   (/apipublic/*)                 — token "publico".
 *       Login: POST /apipublic/api/login/oauth con body JSON
 *              {username, password}.
 *       Uso:   GET /apipublic/api/Resume          (viajes activos)
 *              GET /apipublic/api/Travel/search   (viajes programados)
 *   • API Hub      (/v1/hub/*)                    — token "hub".
 *       Login: POST /v1/Security/Login con body x-www-form-urlencoded
 *              (username, password, grant_type=password).
 *       Uso:   GET /v1/hub/last/{placa}           (última posición).
 *
 * El token del API Public NO sirve para el API Hub ni viceversa, por eso
 * sesion-servicio.ts guarda y renueva los dos por separado.
 *
 * En el portal no hay proxy ni navegador: todas las llamadas salen del
 * servidor, los tokens viven en memoria del runtime y el cliente nunca los
 * ve.
 */

export const BASE_URL =
  process.env.CONTROLT_BASE_URL || "https://app.controlt.com.co";

const LOGIN_PUBLIC_PATH = "/apipublic/api/login/oauth";
const LOGIN_HUB_PATH = "/v1/Security/Login";
const RESUME_PATH = "/apipublic/api/Resume";
const HUB_LAST_PATH = "/v1/hub/last";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export type ApiToken = "publico" | "hub";

export class ControlTError extends Error {
  /**
   * Si está definido, el token de esa API no sirve y hay que renovarlo.
   * Antes era boolean; ahora identifica cuál de los dos (publico | hub)
   * debe renovarse para no pedir los dos innecesariamente.
   */
  tokenInvalido: ApiToken | null;
  /** Error de credenciales/cuenta: no reintentar seguido. */
  deCuenta: boolean;
  constructor(
    mensaje: string,
    opciones: { tokenInvalido?: ApiToken | null; deCuenta?: boolean } = {},
  ) {
    super(mensaje);
    this.tokenInvalido = opciones.tokenInvalido ?? null;
    this.deCuenta = opciones.deCuenta ?? false;
  }
}

export interface LoginRespuesta {
  token: string;
  /** Marca de tiempo (ms epoch) en que vence el token según el servidor. */
  venceEnMs: number;
}

/**
 * Procesa la respuesta común de los dos logins (misma forma JSON:
 * { access_token, expires_in, ... }). `defaultSegundos` fija un fallback por
 * si el servidor no manda expires_in.
 */
async function procesarLogin(
  res: Response,
  defaultSegundos: number,
): Promise<LoginRespuesta> {
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new ControlTError(
      "Usuario o contraseña de la cuenta de servicio Control T incorrectos.",
      { deCuenta: true },
    );
  }
  if (!res.ok) {
    throw new ControlTError(`Control T respondió HTTP ${res.status} al login.`);
  }

  const datos = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    token?: string;
    expires_in?: number;
  };
  const token = (datos.access_token || datos.token || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    throw new ControlTError("Control T no devolvió un token de acceso.");
  }
  // Margen de 60 s por si el reloj se desfasa.
  const segundos = Math.max(60, Number(datos.expires_in) || defaultSegundos);
  return { token, venceEnMs: Date.now() + segundos * 1000 };
}

/**
 * Token para la API PUBLIC (Resume, Travel/search). Login antiguo:
 * POST /apipublic/api/login/oauth con body JSON {username, password}.
 * expires_in observado ~43200 s (12 h).
 */
export async function iniciarSesionPublic(
  usuario: string,
  clave: string,
): Promise<LoginRespuesta> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${LOGIN_PUBLIC_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": UA,
      },
      body: JSON.stringify({ username: usuario, password: clave }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ControlTError(
      `No se pudo contactar a Control T: ${(e as Error).message}`,
    );
  }
  return procesarLogin(res, 43_200);
}

/**
 * Token para la API HUB (/v1/hub/last/{placa}). Login OAuth2 "password":
 * POST /v1/Security/Login con body x-www-form-urlencoded
 * (username, password, grant_type=password). expires_in ~86400 s (24 h).
 */
export async function iniciarSesionHub(
  usuario: string,
  clave: string,
): Promise<LoginRespuesta> {
  const body = new URLSearchParams();
  body.set("username", usuario);
  body.set("password", clave);
  body.set("grant_type", "password");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${LOGIN_HUB_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": UA,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ControlTError(
      `No se pudo contactar a Control T: ${(e as Error).message}`,
    );
  }
  return procesarLogin(res, 86_400);
}

async function pedirResume(
  token: string,
  param: string,
): Promise<Array<Record<string, unknown>>> {
  let res: Response;
  try {
    const url = new URL(`${BASE_URL}${RESUME_PATH}`);
    url.searchParams.set("param", param);
    res = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "user-agent": UA,
      },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ControlTError(
      `No se pudo contactar a Control T: ${(e as Error).message}`,
    );
  }

  if (res.status === 401) {
    throw new ControlTError("Token del API Public rechazado por Control T.", {
      tokenInvalido: "publico",
    });
  }
  // Control T responde 500 cuando no encuentra nada: se trata como lista vacía.
  if (res.status === 500) return [];
  if (!res.ok) {
    throw new ControlTError(
      `Control T respondió HTTP ${res.status} al consultar Resume.`,
    );
  }
  const datos = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(datos) ? (datos as Array<Record<string, unknown>>) : [];
}

/**
 * Travel/search: trae los viajes PROGRAMADOS o en lista de una placa. Sirve
 * de fallback cuando Resume no devuelve nada (el viaje aún no está activo).
 * Campos reducidos: id_monitoring_order, trip_number, license_plate,
 * driver_name, company_customer_name, city_origin, city_destination,
 * origin_address, schedulate_origin.
 */
async function pedirTravelSearch(
  token: string,
  param: string,
): Promise<Array<Record<string, unknown>>> {
  let res: Response;
  try {
    const url = new URL(`${BASE_URL}/apipublic/api/Travel/search`);
    url.searchParams.set("param", param);
    res = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "user-agent": UA,
      },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ControlTError(
      `No se pudo contactar a Control T: ${(e as Error).message}`,
    );
  }
  if (res.status === 401) {
    throw new ControlTError("Token del API Public rechazado por Control T.", {
      tokenInvalido: "publico",
    });
  }
  // 500 o 404: sin resultados → lista vacía
  if (res.status === 500 || res.status === 404) return [];
  if (!res.ok) {
    throw new ControlTError(
      `Control T respondió HTTP ${res.status} al consultar Travel/search.`,
    );
  }
  const datos = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(datos) ? (datos as Array<Record<string, unknown>>) : [];
}

/**
 * Última posición reportada para UNA placa (GET /v1/hub/last/{placa}, Bearer).
 * Respuesta: { Code, Errors, Result: { register: {...} } }. 404 o Result null
 * = la placa no tiene reporte: devolvemos null (no es error).
 */
async function pedirUbicacionHub(
  token: string,
  placa: string,
): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE_URL}${HUB_LAST_PATH}/${encodeURIComponent(placa)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "user-agent": UA,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (e) {
    throw new ControlTError(
      `No se pudo contactar a Control T: ${(e as Error).message}`,
    );
  }
  if (res.status === 401) {
    throw new ControlTError("Token del API Hub rechazado por Control T.", {
      tokenInvalido: "hub",
    });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ControlTError(
      `Control T respondió HTTP ${res.status} al consultar hub/last/${placa}.`,
    );
  }
  const datos = (await res.json().catch(() => null)) as {
    Code?: number;
    Result?: { register?: Record<string, unknown> | null } | null;
  } | null;
  return datos?.Result?.register ?? null;
}

/**
 * Trae la última posición para varias placas (una llamada por placa, en
 * paralelo). El primer 401 interrumpe el lote (se re-hace login y reintenta).
 */
async function pedirCurrentLocation(
  token: string,
  placas: string[],
): Promise<Array<Record<string, unknown>>> {
  if (!placas.length) return [];
  let tokenInvalido: ControlTError | null = null;
  const resultados = await Promise.all(
    placas.map(async (p) => {
      try {
        return await pedirUbicacionHub(token, p);
      } catch (e) {
        if (e instanceof ControlTError && e.tokenInvalido) {
          tokenInvalido = e;
          return null;
        }
        // Otros errores por placa: se ignoran para no tumbar el lote completo
        return null;
      }
    }),
  );
  if (tokenInvalido) throw tokenInvalido;
  return resultados.filter(
    (r): r is Record<string, unknown> => r !== null && r !== undefined,
  );
}

// ─── Normalizadores ─────────────────────────────────────────────────────────

const asNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const asStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const limpiarInicio = (v: unknown): string | null => {
  const s = asStr(v);
  return s ? s.replace(/^,\s*/, "") : s;
};

function normalizarVehiculo(raw: Record<string, unknown>): Vehiculo | null {
  const placa = asStr(raw.licensePlate);
  const lat = asNum(raw.Latitude);
  const lng = asNum(raw.Longitude);
  if (!placa || lat === null || lng === null) return null;
  // /v1/hub/last trae DateGPS como "DD/MM/YYYY HH:MM:SS AM/PM" (ya es fecha +
  // hora). El viejo CurrentLocation traía FullDateGPSFormat con el mismo
  // propósito. Description_Address solo venía en el viejo: null si no está.
  return {
    placa: placa.toUpperCase(),
    latitud: lat,
    longitud: lng,
    fechaGps: asStr(raw.FullDateGPSFormat) ?? asStr(raw.DateGPS),
    prestadorGps: asStr(raw.username),
    direccion: asStr(raw.Description_Address),
    temperatura: asNum(raw.Temperature1),
  };
}

/**
 * Travel/search trae un viaje programado (sin posición, estado ni avance).
 * Se rellena lo que hay y el resto queda en null, para no inventar datos.
 */
function normalizarTravel(raw: Record<string, unknown>): ViajeResumen {
  return {
    idMonitoreo: asStr(raw.id_monitoring_order) ?? "",
    numeroViaje: asStr(raw.trip_number),
    manifiesto: asStr(raw.trip_number),
    numeroDespacho: null,
    numeroOrden: null,
    placa: asStr(raw.license_plate)?.toUpperCase() ?? null,
    latitud: null,
    longitud: null,
    estado: "Programado",
    avance: null,
    novedad: null,
    empresa: null,
    transportador: null,
    cliente: asStr(raw.company_customer_name),
    conductor: asStr(raw.driver_name),
    telefonoConductor: null,
    origen: asStr(raw.origin_address),
    ciudadOrigen: asStr(raw.city_origin),
    destino: null,
    ciudadDestino: asStr(raw.city_destination),
    ruta: null,
    tipoOperacion: null,
    tipoViaje: null,
    direccionActual: null,
    ultimoReporteGps: null,
    prestadorGps: null,
    ultimoEvento: null,
    ultimaAlarma: null,
    comentario: null,
    observaciones: asStr(raw.schedulate_origin)
      ? `Programado para: ${asStr(raw.schedulate_origin)}`
      : null,
    cumplimientoCita: null,
  };
}

function normalizarViaje(raw: Record<string, unknown>): ViajeResumen {
  return {
    idMonitoreo: asStr(raw.id_monitoring_order) ?? "",
    numeroViaje: asStr(raw.trip_number),
    manifiesto: asStr(raw.trip_number),
    numeroDespacho: limpiarInicio(raw.shipment_number),
    numeroOrden: asStr(raw.number_order),
    placa: asStr(raw.license_plate)?.toUpperCase() ?? null,
    latitud: asNum(raw.latitude),
    longitud: asNum(raw.longitude),
    estado: asStr(raw.state_travel),
    avance: asNum(raw.percentage_travel),
    novedad: asStr(raw.novelty),
    empresa: asStr(raw.company_name),
    transportador: asStr(raw.company_transporter_name),
    cliente: asStr(raw.company_customer_name),
    conductor: asStr(raw.driver_name),
    telefonoConductor: asStr(raw.driver_phone),
    origen: asStr(raw.origin_location_name),
    ciudadOrigen: asStr(raw.origin_city_name),
    destino: asStr(raw.destiny_location_name),
    ciudadDestino: asStr(raw.destiny_city_name),
    ruta: asStr(raw.description_route),
    tipoOperacion: asStr(raw.type_operation),
    tipoViaje: asStr(raw.description_type_trip),
    direccionActual: asStr(raw.current_address_location),
    ultimoReporteGps: asStr(raw.latest_gps_report),
    prestadorGps: asStr(raw.username),
    ultimoEvento: asStr(raw.last_event),
    ultimaAlarma: asStr(raw.last_alarm_name),
    comentario: asStr(raw.last_alarm_comment),
    observaciones: asStr(raw.observations),
    cumplimientoCita: asStr(raw.appointment_fulfillment),
  };
}

// ─── Operaciones de alto nivel ──────────────────────────────────────────────

/** Los dos tokens que necesita el cliente (ver el comentario de cabecera). */
export interface Tokens {
  /** Login JSON antiguo /apipublic/api/login/oauth — Resume y Travel/search. */
  publico: string;
  /** Login nuevo /v1/Security/Login — /v1/hub/last/{placa}. */
  hub: string;
}

/** Normaliza las placas: mayúsculas, sin espacios ni guiones, separadas por coma. */
export function normalizarPlacas(valor: string): string[] {
  return Array.from(
    new Set(
      valor
        .split(/[,\s]+/)
        .map((p) => p.trim().toUpperCase().replace(/[-\s]/g, ""))
        .filter((p) => /^[A-Z0-9]{5,8}$/.test(p)),
    ),
  );
}

export async function consultarPlaca(
  tokens: Tokens,
  placas: string[],
): Promise<ResultadoConsulta> {
  if (!placas.length) return { vehiculos: [], viajes: [] };
  const crudos = await pedirCurrentLocation(tokens.hub, placas);
  const vehiculos = crudos
    .map((r) => normalizarVehiculo(r))
    .filter((v): v is Vehiculo => v !== null);

  // Para cada placa (máx. 5) trae su viaje activo desde Resume; si Resume no
  // trae nada, se consulta Travel/search (viajes programados).
  const viajes: ViajeResumen[] = [];
  for (const placa of placas.slice(0, 5)) {
    try {
      const resumen = await pedirResume(tokens.publico, placa);
      const dePlaca = resumen
        .map((r) => normalizarViaje(r))
        .filter((v) => v.placa && v.placa.toUpperCase() === placa);
      if (dePlaca.length) {
        viajes.push(...dePlaca);
        continue;
      }
      // Fallback: viajes programados que no aparecen en Resume
      const programados = await pedirTravelSearch(tokens.publico, placa);
      for (const r of programados) {
        const v = normalizarTravel(r);
        if (v.placa && v.placa.toUpperCase() === placa) viajes.push(v);
      }
    } catch (e) {
      if (e instanceof ControlTError && e.tokenInvalido) throw e;
      // Error puntual por placa: se ignora para no tumbar la consulta de las demás
    }
  }

  return {
    vehiculos,
    viajes,
    aviso: vehiculos.length
      ? undefined
      : "Control T no encontró vehículos con esas placas.",
  };
}

export async function consultarManifiesto(
  tokens: Tokens,
  numero: string,
): Promise<ResultadoConsulta> {
  const crudos = await pedirResume(tokens.publico, numero.trim());
  const viajes = crudos.map((r) => normalizarViaje(r));
  if (!viajes.length) {
    return {
      vehiculos: [],
      viajes: [],
      aviso: "Sin viaje encontrado para ese manifiesto u orden.",
    };
  }
  // Ubicaciones actuales de las placas asociadas
  const placas = Array.from(
    new Set(viajes.map((v) => v.placa).filter((p): p is string => !!p)),
  );
  let vehiculos: Vehiculo[] = [];
  if (placas.length) {
    try {
      const crudosV = await pedirCurrentLocation(tokens.hub, placas);
      vehiculos = crudosV
        .map((r) => normalizarVehiculo(r))
        .filter((v): v is Vehiculo => v !== null);
    } catch (e) {
      // Token hub inválido: propagar para que la capa superior lo renueve.
      if (e instanceof ControlTError && e.tokenInvalido) throw e;
      // Otros fallos: se muestra el viaje con lat/lng del Resume.
    }
  }
  // Si no hubo ubicación, usa la posición del viaje como vehículo.
  if (!vehiculos.length) {
    vehiculos = viajes
      .filter(
        (v) =>
          v.placa !== null && v.latitud !== null && v.longitud !== null,
      )
      .map((v) => ({
        placa: v.placa!,
        latitud: v.latitud!,
        longitud: v.longitud!,
        fechaGps: v.ultimoReporteGps,
        prestadorGps: v.prestadorGps,
        direccion: v.direccionActual,
        temperatura: null,
      }));
  }
  return { vehiculos, viajes };
}
