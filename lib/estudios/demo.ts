import "server-only";
import type { Estudio, SolicitudResumen } from "./tipos";

/**
 * Almacén en memoria para MODO DEMO. Se guarda en globalThis para sobrevivir
 * a la recarga en caliente de `next dev`. Nunca se usa con Supabase.
 */

interface AlmacenEstudios {
  solicitudes: Estudio[];
  siguienteNumero: number;
}

const CLAVE = Symbol.for("elogiahub.estudios.demo");

function crear(): AlmacenEstudios {
  return { solicitudes: [], siguienteNumero: 1 };
}

export function almacenEstudios(): AlmacenEstudios {
  const g = globalThis as unknown as Record<symbol, AlmacenEstudios>;
  if (!g[CLAVE]) g[CLAVE] = crear();
  return g[CLAVE];
}

/** Proyecta Estudio → fila de "Mis solicitudes" (sin resultados). */
export function aResumen(e: Estudio): SolicitudResumen {
  return {
    id: e.id,
    numero: e.numero,
    modulo: e.modulo,
    descripcion: e.descripcion,
    estado: e.estado,
    fecha: e.fecha,
    decision: e.decision,
    comentario: e.comentario,
    decididaAt: null,
  };
}
