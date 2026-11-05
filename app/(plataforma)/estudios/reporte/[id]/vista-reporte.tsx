"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

/**
 * Reporte HTML de TusDatos a pantalla completa, en iframe aislado (sin scripts
 * ni acceso al portal). El HTML de TusDatos ya trae todo el detalle: el hub
 * no duplica fuentes ni hallazgos acá.
 */
export function VistaReporte({
  consultaId,
  rol,
}: {
  consultaId: string;
  rol: string;
}) {
  const [cargando, setCargando] = useState(true);
  return (
    <div className="bg-card relative rounded-xl border p-1 sm:p-2">
      {cargando && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Cargando reporte…
        </div>
      )}
      <iframe
        src={`/api/estudios/reporte/${consultaId}?formato=html`}
        sandbox=""
        title={`Reporte de ${rol}`}
        className="h-[calc(100vh-13rem)] w-full rounded-lg bg-white"
        onLoad={() => setCargando(false)}
      />
    </div>
  );
}
