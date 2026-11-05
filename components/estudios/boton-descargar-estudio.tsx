"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { cx } from "@/lib/utils";

const MAX_INTENTOS = 12;

/**
 * Descarga el reporte del estudio. Una sola consulta baja el PDF directo;
 * varias llegan en un ZIP con los PDF adentro. Si TusDatos aún está armando
 * algún PDF (202) reintenta cada ~10 s hasta MAX_INTENTOS.
 */
export function BotonDescargarEstudio({ numero }: { numero: number }) {
  const [estado, setEstado] = useState<
    "idle" | "descargando" | "esperando" | "error"
  >("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function descargar() {
    setEstado("descargando");
    setMensaje(null);
    try {
      for (let i = 0; i < MAX_INTENTOS; i++) {
        const res = await fetch(`/api/estudios/estudio/${numero}/pdf`, {
          headers: { "x-portal": "1" },
        });
        if (res.status === 202) {
          const d = (await res.json().catch(() => ({}))) as {
            reintentarEn?: number;
          };
          setEstado("esperando");
          await new Promise((r) =>
            setTimeout(r, (d.reintentarEn ?? 10) * 1000),
          );
          continue;
        }
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error || "No se pudo descargar el reporte.");
        }
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(await res.blob());
        enlace.download =
          /filename="([^"]+)"/.exec(
            res.headers.get("content-disposition") ?? "",
          )?.[1] ?? `estudio-${numero}.pdf`;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(enlace.href), 30_000);
        setEstado("idle");
        return;
      }
      throw new Error(
        "TusDatos sigue construyendo los PDF. Intenta de nuevo en un minuto.",
      );
    } catch (e) {
      setEstado("error");
      setMensaje((e as Error).message);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={descargar}
        disabled={estado === "descargando" || estado === "esperando"}
        className={cx(
          "text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors",
          "disabled:cursor-wait disabled:opacity-60",
        )}
        title={
          estado === "esperando"
            ? "TusDatos está armando el PDF…"
            : "Descargar reporte"
        }
      >
        {estado === "descargando" || estado === "esperando" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        Descargar
      </button>
      {mensaje && (
        <p className="text-destructive max-w-xs text-right text-[11px]">
          {mensaje}
        </p>
      )}
    </div>
  );
}
