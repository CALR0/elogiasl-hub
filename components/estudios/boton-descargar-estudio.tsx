"use client";

import { useRef, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * Descarga el reporte del estudio. Una sola consulta baja el PDF directo;
 * varias llegan en un ZIP con los PDF adentro. TusDatos puede tardar varios
 * minutos en construir el PDF del vehículo (RUNT, SOAT, comparendos…), así
 * que se reintenta en loop largo (hasta ~6 min) hasta que entregue 200.
 */
const MAX_INTENTOS = 24;
const ESPERA_DEFECTO_S = 15;

type Estado =
  | { fase: "idle" }
  | { fase: "descargando" }
  | { fase: "esperando"; intento: number; total: number }
  | { fase: "error"; mensaje: string };

export function BotonDescargarEstudio({ numero }: { numero: number }) {
  const [estado, setEstado] = useState<Estado>({ fase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function descargar() {
    const abort = new AbortController();
    abortRef.current = abort;
    setEstado({ fase: "descargando" });
    try {
      for (let i = 1; i <= MAX_INTENTOS; i++) {
        if (abort.signal.aborted) return;
        const res = await fetch(`/api/estudios/estudio/${numero}/pdf`, {
          headers: { "x-portal": "1" },
          signal: abort.signal,
        });
        if (res.status === 202) {
          const d = (await res.json().catch(() => ({}))) as {
            reintentarEn?: number;
          };
          if (i >= MAX_INTENTOS) break;
          setEstado({ fase: "esperando", intento: i, total: MAX_INTENTOS });
          await esperar((d.reintentarEn ?? ESPERA_DEFECTO_S) * 1000, abort);
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
        setEstado({ fase: "idle" });
        return;
      }
      throw new Error(
        "TusDatos sigue armando el PDF después de varios minutos. Intenta más tarde.",
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setEstado({ fase: "idle" });
        return;
      }
      setEstado({ fase: "error", mensaje: (e as Error).message });
    } finally {
      abortRef.current = null;
    }
  }

  function cancelar() {
    abortRef.current?.abort();
  }

  const trabajando = estado.fase === "descargando" || estado.fase === "esperando";
  const titulo =
    estado.fase === "esperando"
      ? `TusDatos está armando el PDF (intento ${estado.intento}/${estado.total}). Puede tardar varios minutos.`
      : estado.fase === "descargando"
        ? "Pidiendo el reporte…"
        : "Descargar reporte";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={descargar}
          disabled={trabajando}
          className={cx(
            "text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors",
            "disabled:cursor-wait disabled:opacity-60",
          )}
          title={titulo}
        >
          {trabajando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {estado.fase === "esperando"
            ? `Armando… ${estado.intento}/${estado.total}`
            : "Descargar"}
        </button>
        {trabajando && (
          <button
            type="button"
            onClick={cancelar}
            className="text-muted-foreground hover:text-destructive inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
            title="Cancelar"
            aria-label="Cancelar descarga"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {estado.fase === "error" && (
        <p className="text-destructive max-w-xs text-right text-[11px]">
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}

function esperar(ms: number, abort: AbortController) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    abort.signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
