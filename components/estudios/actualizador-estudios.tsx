"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

const CADA_MS = 10_000;

/**
 * Mientras haya consultas en proceso, pregunta cada 10 s al servidor (que
 * pregunta a TusDatos) y refresca la pantalla cuando algo cambia.
 */
export function ActualizadorEstudios() {
  const router = useRouter();

  useEffect(() => {
    let activo = true;
    async function revisar() {
      try {
        const res = await fetch("/api/estudios/sincronizar", {
          method: "POST",
          headers: { "x-portal": "1" },
        });
        const data = (await res.json().catch(() => null)) as {
          cambios?: number;
          pendientes?: number;
        } | null;
        // También sin pendientes: otra pantalla pudo haberlas terminado
        if (activo && (data?.cambios || data?.pendientes === 0))
          router.refresh();
      } catch {
        // Sin conexión: se reintenta en la siguiente vuelta
      }
    }
    void revisar();
    const intervalo = setInterval(revisar, CADA_MS);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [router]);

  return (
    <p
      role="status"
      className="text-muted-foreground inline-flex items-center gap-2 text-sm"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Hay consultas en proceso. Esta pantalla se actualiza sola.
    </p>
  );
}
