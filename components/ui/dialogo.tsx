"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * Ventana modal sobre el <dialog> nativo: trae foco atrapado, Esc y fondo
 * inerte sin librerías. Se monta solo mientras `abierto` es true.
 */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  ancho = "md",
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  ancho?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (abierto && d && !d.open) d.showModal();
  }, [abierto]);

  if (!abierto) return null;

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        // Clic en el fondo (fuera de la caja) cierra
        if (e.target === e.currentTarget) onCerrar();
      }}
      aria-labelledby="dialogo-titulo"
      className={cx(
        "bg-card text-foreground m-auto w-[calc(100%-2rem)] rounded-2xl border p-0 shadow-2xl backdrop:bg-black/50",
        ancho === "sm" ? "max-w-sm" : ancho === "lg" ? "max-w-4xl" : "max-w-lg",
      )}
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="dialogo-titulo"
              className="text-lg font-semibold tracking-tight"
            >
              {titulo}
            </h2>
            {descripcion && (
              <p className="text-muted-foreground mt-1 text-sm">
                {descripcion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-muted-foreground hover:bg-secondary hover:text-foreground -mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
