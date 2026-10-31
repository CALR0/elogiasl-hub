"use client";

import { createPortal } from "react-dom";
import Image from "next/image";
import logo from "@/public/brand/elogia-logo.svg";

/**
 * Pantalla de carga a pantalla completa (iniciar / cerrar sesión).
 *
 * - Se monta con un portal directo en <body>: ningún contenedor del menú o del
 *   formulario (overflow, sticky, cajón móvil) la puede recortar.
 * - Animación calmada: fundido de entrada y una barra que recorre lento.
 *   Solo opacidad y transform (CSS puro, sin JS ni desenfoques): fluida
 *   incluso en equipos lentos. Respeta "reducir movimiento" (globals.css).
 * - Fondo sólido de marca: no deja ver la pantalla anterior a medio cambiar.
 */
export function PantallaCarga({ texto }: { texto: string }) {
  // Solo se muestra tras una acción del usuario (ya en el navegador)
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="bg-brand-deep animate-aparecer fixed inset-0 z-[100] flex items-center justify-center px-6 text-white"
    >
      {/* El contenido sube y aparece suave; el logo queda quieto (sin latidos) */}
      <div className="animate-entrar flex flex-col items-center gap-7">
        <Image
          src={logo}
          alt=""
          priority
          className="h-auto w-36 brightness-0 invert"
        />
        <div
          aria-hidden
          className="h-0.5 w-40 overflow-hidden rounded-full bg-white/12"
        >
          <div className="animate-progreso h-full w-1/3 rounded-full bg-white/70" />
        </div>
        <p className="text-sm text-white/70">{texto}</p>
      </div>
    </div>,
    document.body,
  );
}
