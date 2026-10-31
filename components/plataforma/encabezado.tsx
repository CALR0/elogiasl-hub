import type { ReactNode } from "react";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import type { IconoModulo as NombreIcono } from "@/lib/modulos";

/** Encabezado de una pantalla de módulo: ícono, título, descripción y acciones. */
export function Encabezado({
  icono,
  titulo,
  descripcion,
  extra,
  children,
}: {
  icono: NombreIcono;
  titulo: string;
  descripcion: string;
  /** Junto al título (p. ej. una pastilla de estado). */
  extra?: ReactNode;
  /** Botones a la derecha. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="bg-brand-deep flex size-12 shrink-0 items-center justify-center rounded-xl text-white">
          <IconoModulo nombre={icono} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {titulo}
            </h1>
            {extra}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{descripcion}</p>
        </div>
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
      )}
    </header>
  );
}
