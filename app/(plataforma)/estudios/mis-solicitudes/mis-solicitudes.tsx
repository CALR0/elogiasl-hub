"use client";

import {
  Check,
  CircleAlert,
  Clock,
  Hourglass,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/field";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import { ESTADOS, type SolicitudResumen } from "@/lib/estudios/tipos";
import { fechaHora } from "@/lib/utils";

/** Lista paginada de "Mis solicitudes" (sin resultados ni hallazgos). */
export function MisSolicitudes({ items }: { items: SolicitudResumen[] }) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.descripcion.toLowerCase().includes(q) ||
        String(s.numero).includes(q),
    );
  }, [busqueda, items]);
  const { ancla, visibles, props } = usePaginacion(
    filtrados,
    undefined,
    "estudios.mis-solicitudes",
  );

  if (!items.length) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center text-sm">
        No has enviado solicitudes todavía.
      </div>
    );
  }

  return (
    <div ref={ancla} className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número o descripción"
          className="pl-9"
        />
      </div>

      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {visibles.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  SOL-{String(s.numero).padStart(6, "0")}
                </span>
                <span className="text-muted-foreground text-xs">
                  · {s.modulo === "vehiculo" ? "Vehículo" : "Documento"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium">
                {s.descripcion}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {fechaHora(s.fecha)}
              </p>
              {s.comentario && (
                <p className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-xs italic">
                  {s.comentario}
                </p>
              )}
            </div>

            <PastillaEstado resumen={s} />
          </li>
        ))}
      </ul>

      <Paginacion {...props} etiqueta="solicitudes" singular="solicitud" />
    </div>
  );
}

function PastillaEstado({ resumen }: { resumen: SolicitudResumen }) {
  const { estado, decision } = resumen;
  // Muestra la decisión si existe, sino el estado del flujo
  if (decision === "aprobado") {
    return (
      <Pastilla
        icono={<Check className="size-4" aria-hidden />}
        tono="verde"
        titulo="Aprobado"
      />
    );
  }
  if (decision === "rechazado") {
    return (
      <Pastilla
        icono={<X className="size-4" aria-hidden />}
        tono="rojo"
        titulo="Rechazado"
      />
    );
  }
  const base = ESTADOS[estado];
  const Icono = iconoEstado[estado];
  return (
    <Pastilla
      icono={<Icono className="size-4" aria-hidden />}
      tono={tonoEstado[estado]}
      titulo={base.etiqueta}
    />
  );
}

const iconoEstado = {
  enviada: Hourglass,
  procesando: LoaderCircle,
  finalizada: Clock,
  aprobado: Check,
  rechazado: X,
  error: CircleAlert,
} as const;

const tonoEstado: Record<
  SolicitudResumen["estado"],
  "gris" | "azul" | "ambar" | "verde" | "rojo"
> = {
  enviada: "gris",
  procesando: "azul",
  finalizada: "ambar",
  aprobado: "verde",
  rechazado: "rojo",
  error: "rojo",
};

function Pastilla({
  icono,
  tono,
  titulo,
}: {
  icono: React.ReactNode;
  tono: "verde" | "rojo" | "gris" | "azul" | "ambar";
  titulo: string;
}) {
  const clases: Record<typeof tono, string> = {
    verde: "bg-primary/10 text-primary border-primary/20",
    rojo: "bg-destructive/10 text-destructive border-destructive/25",
    gris: "bg-muted text-muted-foreground border-border",
    azul: "bg-sky-500/10 text-sky-700 border-sky-500/20",
    ambar: "bg-amber-500/10 text-amber-700 border-amber-500/25",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${clases[tono]}`}
    >
      {icono}
      {titulo}
    </span>
  );
}
