"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, House } from "lucide-react";
import { buscarPorSegmentos, rutaDe } from "@/lib/modulos";

/** Migas de pan derivadas de la URL y del árbol de módulos. */
export function Migas() {
  const pathname = usePathname();
  const segmentos = pathname.split("/").filter(Boolean);
  // El nodo más profundo del árbol que coincide con la URL; lo que sobra
  // (p. ej. /configuracion/roles/nuevo o /…/roles/<id>) es una subpágina.
  let n = segmentos[0] === "inicio" ? 0 : segmentos.length;
  while (n > 0 && !buscarPorSegmentos(segmentos.slice(0, n))) n--;
  const hallado = n ? buscarPorSegmentos(segmentos.slice(0, n)) : null;
  const camino: { clave: string; nombre: string }[] = hallado
    ? [...hallado.ancestros, hallado.nodo]
    : [];
  if (hallado && n < segmentos.length) {
    camino.push({
      clave: pathname,
      nombre: segmentos[n] === "nuevo" ? "Nuevo" : "Detalle",
    });
  }

  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <li>
          <Link
            href="/inicio"
            className="hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <House className="size-4" aria-hidden />
            <span className={camino.length ? "sr-only sm:not-sr-only" : ""}>
              Inicio
            </span>
          </Link>
        </li>
        {camino.map((n, i) => {
          const ultimo = i === camino.length - 1;
          return (
            <li key={n.clave} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight
                className="size-3.5 shrink-0 opacity-50"
                aria-hidden
              />
              {ultimo ? (
                <span
                  aria-current="page"
                  className="text-foreground truncate font-medium"
                >
                  {n.nombre}
                </span>
              ) : (
                <Link
                  href={rutaDe(n.clave)}
                  className="hover:text-foreground truncate transition-colors"
                >
                  {n.nombre}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
