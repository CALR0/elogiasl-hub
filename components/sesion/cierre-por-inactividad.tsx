"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { cerrarPorInactividad } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

/*
 * Cierra la sesión cuando el usuario deja la pantalla inactiva mucho tiempo.
 *
 * Patrón: se guarda la última marca de actividad en localStorage (compartida
 * entre pestañas). Un temporizador se reprograma con cada interacción (click,
 * teclado, puntero, scroll, touch). Un minuto antes de vencer se muestra un
 * aviso con "Seguir conectado"; si el usuario no responde, se llama la server
 * action `cerrarPorInactividad` y se redirige a /login?motivo=inactividad.
 *
 * Al volver a la pestaña después de un rato (visibilitychange), si ya se
 * pasó del límite se cierra la sesión sin aviso.
 */

const CLAVE_LS = "elogiahub.ultimaActividad";
const AVISO_SEG = 60; // tiempo del aviso previo

function ahora() {
  return Date.now();
}

function guardarActividad() {
  try {
    localStorage.setItem(CLAVE_LS, String(ahora()));
  } catch {
    // Modo privado: no se puede escribir
  }
}

function leerActividad(): number {
  try {
    const v = Number(localStorage.getItem(CLAVE_LS));
    return Number.isFinite(v) && v > 0 ? v : ahora();
  } catch {
    return ahora();
  }
}

export function CierrePorInactividad({ minutos }: { minutos: number }) {
  const [restanteSeg, setRestanteSeg] = useState<number | null>(null);
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCierre = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const limiteMs = minutos * 60 * 1000;
    const avisoMs = AVISO_SEG * 1000;

    // Normaliza el estado al montar
    const marcaInicial = leerActividad();
    if (!localStorage.getItem(CLAVE_LS)) guardarActividad();
    if (ahora() - marcaInicial >= limiteMs) {
      void cerrarPorInactividad();
      return;
    }

    function limpiarTimers() {
      if (timerAviso.current) clearTimeout(timerAviso.current);
      if (timerCierre.current) clearInterval(timerCierre.current);
      timerAviso.current = null;
      timerCierre.current = null;
    }

    function programar() {
      limpiarTimers();
      setRestanteSeg(null);
      const transcurrido = ahora() - leerActividad();
      const faltaParaAviso = Math.max(0, limiteMs - avisoMs - transcurrido);
      timerAviso.current = setTimeout(mostrarAviso, faltaParaAviso);
    }

    function mostrarAviso() {
      const faltaParaCierre = Math.max(
        0,
        minutos * 60 * 1000 - (ahora() - leerActividad()),
      );
      setRestanteSeg(Math.ceil(faltaParaCierre / 1000));
      timerCierre.current = setInterval(() => {
        const falta = minutos * 60 * 1000 - (ahora() - leerActividad());
        if (falta <= 0) {
          limpiarTimers();
          setRestanteSeg(null);
          void cerrarPorInactividad();
          return;
        }
        // Si otra pestaña registró actividad, oculta el aviso
        if (falta > avisoMs + 1000) {
          limpiarTimers();
          setRestanteSeg(null);
          programar();
          return;
        }
        setRestanteSeg(Math.ceil(falta / 1000));
      }, 1000);
    }

    function registrarActividad() {
      // Si está mostrando el aviso, no se auto-renueva: el usuario debe confirmar
      if (restanteSeg !== null) return;
      guardarActividad();
      programar();
    }

    // Throttle: una escritura cada 5 s basta para los eventos continuos
    let ultimoTick = 0;
    function enEvento() {
      const t = ahora();
      if (t - ultimoTick < 5000) return;
      ultimoTick = t;
      registrarActividad();
    }

    function alVisibilizar() {
      if (document.visibilityState !== "visible") return;
      const transcurrido = ahora() - leerActividad();
      if (transcurrido >= limiteMs) {
        void cerrarPorInactividad();
        return;
      }
      programar();
    }

    function alCambiarStorage(e: StorageEvent) {
      if (e.key !== CLAVE_LS) return;
      // Otra pestaña actualizó: reprograma con la nueva marca
      if (restanteSeg === null) programar();
    }

    const eventos = [
      "mousedown",
      "keydown",
      "touchstart",
      "pointerdown",
      "scroll",
      "mousemove",
    ] as const;
    eventos.forEach((ev) =>
      window.addEventListener(ev, enEvento, { passive: true }),
    );
    document.addEventListener("visibilitychange", alVisibilizar);
    window.addEventListener("storage", alCambiarStorage);

    programar();

    return () => {
      limpiarTimers();
      eventos.forEach((ev) => window.removeEventListener(ev, enEvento));
      document.removeEventListener("visibilitychange", alVisibilizar);
      window.removeEventListener("storage", alCambiarStorage);
    };
    // Depender solo de `minutos` (los refs no disparan rerender); restanteSeg
    // se lee dentro de los closures y es correcto para la lógica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutos]);

  if (restanteSeg === null) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="inact-titulo"
      className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md sm:right-4 sm:left-auto sm:mx-0"
    >
      <div className="bg-card flex items-start gap-3 rounded-xl border p-4 shadow-xl">
        <CircleAlert
          className="text-destructive mt-0.5 size-5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p id="inact-titulo" className="text-sm font-semibold">
            Tu sesión está por cerrarse
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Por inactividad se cerrará en{" "}
            <span className="text-foreground font-medium tabular-nums">
              {restanteSeg}
            </span>{" "}
            s.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                guardarActividad();
                setRestanteSeg(null);
              }}
            >
              Seguir conectado
            </Button>
            <Button
              variante="secundario"
              onClick={() => void cerrarPorInactividad()}
            >
              Cerrar ahora
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
