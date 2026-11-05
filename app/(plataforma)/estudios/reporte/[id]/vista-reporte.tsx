"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reporte HTML de TusDatos a pantalla completa, en iframe same-origin con
 * `sandbox="allow-same-origin"` (sin `allow-scripts`: no ejecuta JS). El CSP
 * del endpoint además bloquea todo lo que no sean estilos, fuentes e imágenes.
 *
 * Al ser same-origin, el botón "Imprimir / Guardar como PDF" puede disparar
 * `contentWindow.print()` del iframe y el navegador abre su propio diálogo —
 * desde ahí "Guardar como PDF" sin pasar por TusDatos.
 */
export function VistaReporte({
  consultaId,
  rol,
}: {
  consultaId: string;
  rol: string;
}) {
  const [cargando, setCargando] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = `/api/estudios/reporte/${consultaId}?formato=html`;

  function imprimir() {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try {
      w.focus();
      w.print();
    } catch {
      // Si por cualquier motivo el navegador lo bloqueara, abrimos el
      // reporte en una pestaña aparte para que el usuario use Ctrl+P.
      window.open(src, "_blank", "noopener");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variante="secundario" onClick={imprimir}>
          <Printer className="size-4" aria-hidden />
          Imprimir o guardar como PDF
        </Button>
      </div>
      <div className="bg-card relative rounded-xl border p-1 sm:p-2">
        {cargando && (
          <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Cargando reporte…
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          sandbox="allow-same-origin"
          title={`Reporte de ${rol}`}
          className="h-[calc(100vh-16rem)] w-full rounded-lg bg-white"
          onLoad={() => setCargando(false)}
        />
      </div>
    </div>
  );
}
