"use client";

import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

/*
 * Memoria de los módulos mientras dure la pestaña: lo escrito y los resultados
 * siguen ahí al cambiar de módulo y volver, y se pierden al recargar (vive
 * solo en la memoria de JavaScript, nunca en localStorage).
 *
 * - Va atada al usuario: si en la misma pestaña entra otro (cerrar sesión no
 *   recarga la página), se borra todo antes de mostrar nada.
 * - Es un almacén externo (useSyncExternalStore): un proceso que sigue
 *   corriendo después de salir del módulo (p. ej. un lote de manifiestos)
 *   sigue guardando su avance y al volver se ve al día.
 */

const valores = new Map<string, unknown>();
const oyentes = new Map<string, Set<() => void>>();
let dueno: string | null = null;

function avisar(clave: string) {
  oyentes.get(clave)?.forEach((fn) => fn());
}

/** Borra la memoria si cambió el usuario de la pestaña. */
function asegurarDueno(usuarioId: string) {
  if (dueno === usuarioId) return;
  dueno = usuarioId;
  const claves = [...valores.keys()];
  valores.clear();
  claves.forEach(avisar);
}

/** Al llegar al login (cerró sesión o venció): no queda nada del usuario anterior. */
export function limpiarMemoriaSesion() {
  dueno = null;
  const claves = [...valores.keys()];
  valores.clear();
  claves.forEach(avisar);
}

const UsuarioMemoria = createContext<string | null>(null);

/** Envuelve las pantallas con sesión (layout de la plataforma). */
export function MemoriaSesion({
  usuarioId,
  children,
}: {
  usuarioId: string;
  children: React.ReactNode;
}) {
  // En el render, antes que los hijos lean: idempotente para el mismo usuario
  asegurarDueno(usuarioId);
  return (
    <UsuarioMemoria.Provider value={usuarioId}>
      {children}
    </UsuarioMemoria.Provider>
  );
}

/**
 * Como useState, pero el valor sobrevive a la navegación entre módulos.
 * `clave` debe ser única por dato (p. ej. "cumplidos.filas").
 */
export function useEstadoSesion<T>(
  clave: string,
  inicial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const usuario = useContext(UsuarioMemoria);
  // Valor inicial estable (un [] literal sería nuevo en cada render)
  const [base] = useState(inicial);
  const k = `${usuario ?? "-"}:${clave}`;

  const suscribir = useCallback(
    (fn: () => void) => {
      let set = oyentes.get(k);
      if (!set) oyentes.set(k, (set = new Set()));
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    [k],
  );
  const leer = () => (valores.has(k) ? (valores.get(k) as T) : base);
  const valor = useSyncExternalStore(suscribir, leer, () => base);

  const fijar = useCallback<Dispatch<SetStateAction<T>>>(
    (v) => {
      const actual = valores.has(k) ? (valores.get(k) as T) : base;
      const nuevo = typeof v === "function" ? (v as (prev: T) => T)(actual) : v;
      if (Object.is(nuevo, actual)) return;
      valores.set(k, nuevo);
      avisar(k);
    },
    [k, base],
  );

  return [valor, fijar];
}
