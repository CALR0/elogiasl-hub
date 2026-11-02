"use client";

import { useRef, useState } from "react";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx, rango } from "@/lib/utils";

export const POR_PAGINA = 10;

/**
 * Paginación en el cliente (volúmenes bajos). Si una lista crece, la página se pide
 * al servidor (`.range(desde, hasta)` + `count: "exact"`) y el número de
 * página viaja en la URL (?pagina=2); el componente <Paginacion> se reutiliza.
 */
export function usePaginacion<T>(
  items: T[],
  porPagina = POR_PAGINA,
  /** Si se da, la página elegida se recuerda al cambiar de módulo y volver. */
  clave?: string,
) {
  const [paginaLocal, setPaginaLocal] = useState(1);
  const [paginaSesion, setPaginaSesion] = useEstadoSesion(
    `paginacion.${clave ?? "-"}`,
    1,
  );
  const paginaElegida = clave ? paginaSesion : paginaLocal;
  const setPagina = clave ? setPaginaSesion : setPaginaLocal;
  const ancla = useRef<HTMLDivElement>(null);
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));
  // Si un filtro reduce la lista, no quedarse en una página que ya no existe
  const pagina = Math.min(paginaElegida, paginas);
  const visibles = items.slice((pagina - 1) * porPagina, pagina * porPagina);

  function irA(n: number) {
    setPagina(n);
    // Al cambiar de página, volver al inicio de la lista (útil en celular)
    ancla.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return {
    ancla,
    visibles,
    reiniciar: () => setPagina(1),
    props: { pagina, paginas, total: items.length, porPagina, onCambiar: irA },
  };
}

export function Paginacion({
  pagina,
  paginas,
  total,
  porPagina,
  onCambiar,
  etiqueta = "resultados",
  singular = "resultado",
}: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
  etiqueta?: string;
  singular?: string;
}) {
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  const flecha =
    "flex size-9 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col items-center justify-between gap-3 pt-1 sm:flex-row"
    >
      <p className="text-muted-foreground text-xs tabular-nums">
        Mostrando{" "}
        <span className="text-foreground font-medium">
          {desde}–{hasta}
        </span>{" "}
        de <span className="text-foreground font-medium">{total}</span>{" "}
        {total === 1 ? singular : etiqueta}
      </p>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCambiar(pagina - 1)}
            disabled={pagina === 1}
            aria-label="Página anterior"
            className={flecha}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          {rango(pagina, paginas).map((n, i) =>
            n === "…" ? (
              <span
                key={`e${i}`}
                className="text-muted-foreground w-6 text-center text-sm"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onCambiar(n)}
                aria-current={n === pagina ? "page" : undefined}
                className={cx(
                  "size-9 rounded-lg text-sm font-medium tabular-nums transition-colors",
                  n === pagina
                    ? "bg-brand-deep text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {n}
              </button>
            ),
          )}
          <button
            onClick={() => onCambiar(pagina + 1)}
            disabled={pagina === paginas}
            aria-label="Página siguiente"
            className={flecha}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}
