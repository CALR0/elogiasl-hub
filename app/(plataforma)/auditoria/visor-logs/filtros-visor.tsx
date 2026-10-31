"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FilterX, LoaderCircle, Search } from "lucide-react";
import { inputClasses, selectClasses } from "@/components/ui/field";
import { ACCIONES_AUDITORIA, OPCIONES_MODULO } from "@/lib/gestion/etiquetas";
import type { FiltrosLogs } from "@/lib/gestion/tipos";
import { cx } from "@/lib/utils";

const RESULTADOS = [
  ["ok", "Correcto"],
  ["error", "Error"],
  ["denegado", "Denegado"],
] as const;

const CAMPOS = [
  "desde",
  "hasta",
  "usuario",
  "modulo",
  "accion",
  "resultado",
  "q",
] as const;

/** Querystring de los filtros, en orden fijo (sirve también para compararlos). */
function query(f: FiltrosLogs) {
  const p = new URLSearchParams();
  for (const k of CAMPOS) if (f[k]) p.set(k, String(f[k]));
  return p.toString();
}

/** Espera tras dejar de escribir en "Buscar" antes de filtrar. */
const ESPERA_TEXTO_MS = 450;

type Usuario = { email: string; nombre: string | null };

/**
 * Filtros del visor sin recargar la página: los selectores y fechas filtran al
 * cambiar y el texto tras una pausa. Los filtros siguen viviendo en la URL
 * (se puede compartir el enlace y "atrás" funciona), pero la navegación es
 * del cliente: el menú queda quieto y la lista se atenúa mientras llega.
 */
export function VisorFiltrado({
  filtros,
  usuarios,
  children,
}: {
  filtros: FiltrosLogs;
  usuarios: Usuario[];
  children: ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, iniciar] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Si la URL llega con lo que esta página acaba de pedir, no se toca lo que
  // el usuario sigue escribiendo; si llega distinta (atrás, un enlace), el
  // formulario se sincroniza con ella.
  const clave = query(filtros);
  const [valores, setValores] = useState<FiltrosLogs>(filtros);
  const [aplicado, setAplicado] = useState(clave);
  const [clavePrevia, setClavePrevia] = useState(clave);
  if (clave !== clavePrevia) {
    setClavePrevia(clave);
    if (clave !== aplicado) {
      setAplicado(clave);
      setValores(filtros);
    }
  }

  function aplicar(nuevos: FiltrosLogs) {
    clearTimeout(espera.current);
    const q = query(nuevos);
    setAplicado(q);
    // Cambiar un filtro vuelve a la página 1 (no se envía "pagina")
    iniciar(() => router.push(q ? `${ruta}?${q}` : ruta, { scroll: false }));
  }

  function cambiar<K extends keyof FiltrosLogs>(
    campo: K,
    valor: FiltrosLogs[K],
  ) {
    const nuevos = { ...valores, [campo]: valor || undefined };
    setValores(nuevos);
    clearTimeout(espera.current);
    if (campo === "q")
      espera.current = setTimeout(() => aplicar(nuevos), ESPERA_TEXTO_MS);
    else aplicar(nuevos);
  }

  return (
    <>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(valores);
        }}
        className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="space-y-1 text-xs font-medium">
          Desde
          <input
            type="date"
            value={valores.desde ?? ""}
            max={valores.hasta}
            onChange={(e) => cambiar("desde", e.target.value)}
            className={inputClasses}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Hasta
          <input
            type="date"
            value={valores.hasta ?? ""}
            min={valores.desde}
            onChange={(e) => cambiar("hasta", e.target.value)}
            className={inputClasses}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Usuario
          <select
            value={valores.usuario ?? ""}
            onChange={(e) => cambiar("usuario", e.target.value)}
            className={selectClasses}
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.email} value={u.email}>
                {u.nombre ?? u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Módulo
          <select
            value={valores.modulo ?? ""}
            onChange={(e) => cambiar("modulo", e.target.value)}
            className={selectClasses}
          >
            <option value="">Todos</option>
            {OPCIONES_MODULO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Acción
          <select
            value={valores.accion ?? ""}
            onChange={(e) => cambiar("accion", e.target.value)}
            className={selectClasses}
          >
            <option value="">Todas</option>
            {Object.entries(ACCIONES_AUDITORIA).map(([codigo, texto]) => (
              <option key={codigo} value={codigo}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Resultado
          <select
            value={valores.resultado ?? ""}
            onChange={(e) =>
              cambiar(
                "resultado",
                (e.target.value || undefined) as FiltrosLogs["resultado"],
              )
            }
            className={selectClasses}
          >
            <option value="">Todos</option>
            {RESULTADOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium sm:col-span-2">
          Buscar
          <span className="relative block">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              type="search"
              value={valores.q ?? ""}
              maxLength={80}
              onChange={(e) => cambiar("q", e.target.value)}
              placeholder="Correo, código, objeto…"
              className={cx(inputClasses, "pr-10 pl-10")}
            />
            {pendiente && (
              <LoaderCircle
                className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                aria-label="Filtrando"
              />
            )}
          </span>
        </label>
        {clave !== "" && (
          <div className="flex items-end sm:col-span-2 lg:col-span-4 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                setValores({});
                aplicar({});
              }}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors"
            >
              <FilterX className="size-4" aria-hidden />
              Limpiar filtros
            </button>
          </div>
        )}
      </form>

      <div
        aria-busy={pendiente}
        className={cx(
          "space-y-6 transition-opacity duration-200",
          pendiente && "opacity-60",
        )}
      >
        {children}
      </div>
    </>
  );
}
