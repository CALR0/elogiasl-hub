"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/app/(auth)/login/actions";
import { FilaTema } from "@/components/plataforma/tema";
import { BotonCerrarSesion } from "@/components/sesion/boton-cerrar-sesion";
import { cx, iniciales } from "@/lib/utils";

/**
 * Usuario en el encabezado (celular / tablet): al tocarlo despliega un menú
 * con su nombre y rol, "Cambiar tema" y "Cerrar sesión". Se cierra al tocar
 * fuera, con Esc o al navegar.
 */
export function MenuUsuario({ nombre, rol }: { nombre: string; rol: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Menú de ${nombre}`}
        className="flex size-10 items-center justify-center rounded-full"
      >
        {/*
         * Avatar en tono salvia claro (salvia-100 / salvia-800), igual en el
         * encabezado y en el menú, y fijo en modo claro y oscuro.
         */}
        <span
          className={cx(
            "flex size-9 items-center justify-center rounded-full bg-[#e2e9e2] text-xs font-semibold text-[#364e36] transition-shadow",
            abierto && "ring-2 ring-white/40",
          )}
        >
          {iniciales(nombre)}
        </span>
      </button>

      {abierto && (
        <div
          role="menu"
          className="bg-card text-foreground animate-aparecer absolute top-12 right-0 w-64 rounded-xl border p-1.5 shadow-xl"
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e2e9e2] text-xs font-semibold text-[#364e36]">
              {iniciales(nombre)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{nombre}</p>
              <p className="text-muted-foreground truncate text-xs">{rol}</p>
            </div>
          </div>
          <div className="my-1 border-t" />
          <FilaTema className="hover:bg-secondary" />
          <form action={cerrarSesion}>
            <BotonCerrarSesion
              conTexto
              className="text-destructive hover:bg-destructive/8 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            />
          </form>
        </div>
      )}
    </div>
  );
}
