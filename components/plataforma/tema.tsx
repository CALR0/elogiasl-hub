"use client";

import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/utils";

const CLAVE = "portal-tema";

/**
 * Se ejecuta en <head> antes de pintar: aplica el tema guardado o, si no hay,
 * el del sistema operativo.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CLAVE}");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** Cambia entre claro y oscuro y lo recuerda. Lee el estado del DOM. */
function alternarTema() {
  const oscuro = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem(CLAVE, oscuro ? "dark" : "light");
  } catch {
    // Navegación privada: el cambio vale solo para esta pestaña
  }
}

/** Botón de ícono claro / oscuro. No necesita estado de React. */
export function BotonTema({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={alternarTema}
      aria-label="Cambiar entre modo claro y oscuro"
      title="Modo claro / oscuro"
      className={cx(
        "flex size-9 items-center justify-center rounded-lg transition-colors",
        className,
      )}
    >
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}

/**
 * Fila "Cambiar tema" con interruptor deslizable (sol / luna en la perilla).
 * La posición sale de la clase .dark de <html> (variante dark:), así que
 * siempre refleja el tema real sin estado de React.
 */
export function FilaTema({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={alternarTema}
      className={cx(
        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        className,
      )}
    >
      Cambiar tema
      <span
        aria-hidden
        className="bg-input dark:bg-primary relative h-6 w-11 shrink-0 rounded-full transition-colors"
      >
        <span className="text-accent-foreground absolute top-0.5 left-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow transition-transform dark:translate-x-5">
          <Sun className="size-3 dark:hidden" />
          <Moon className="hidden size-3 dark:block" />
        </span>
      </span>
    </button>
  );
}
