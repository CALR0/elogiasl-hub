"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, LoaderCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import { BotonDescargarEstudio } from "@/components/estudios/boton-descargar-estudio";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import type { FilaBandeja } from "@/lib/estudios/datos";
import { fechaHora } from "@/lib/utils";

/** Bandeja del verificador: pendientes paginados y filtrables. */
export function BandejaVerificar({ items }: { items: FilaBandeja[] }) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return items;
    return items.filter(
      (s) =>
        s.descripcion.toLowerCase().includes(texto) ||
        (s.nombreConsultado?.toLowerCase().includes(texto) ?? false) ||
        s.solicitante.toLowerCase().includes(texto) ||
        String(s.numero).includes(texto),
    );
  }, [q, items]);
  const { ancla, visibles, props } = usePaginacion(
    filtrados,
    undefined,
    "estudios.verificar",
  );

  if (!items.length) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center text-sm">
        No hay estudios pendientes.
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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número, descripción o solicitante"
          className="pl-9"
        />
      </div>

      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {visibles.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
          >
            {s.estado === "procesando" ? (
              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs font-medium">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                En proceso
              </span>
            ) : (
              <PastillaNivel nivel={s.nivel} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground font-mono">
                  SOL-{String(s.numero).padStart(6, "0")}
                </span>
                <span className="text-muted-foreground">
                  · {s.modulo === "vehiculo" ? "Vehículo" : "Documento"}
                </span>
                {s.simulada && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700">
                    Simulada
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm font-medium">
                {s.descripcion}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {s.nombreConsultado && `${s.nombreConsultado} · `}
                {s.solicitante} · {fechaHora(s.fecha)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {s.estado === "finalizada" && !s.simulada && (
                <BotonDescargarEstudio numero={s.numero} />
              )}
              <Link
                href={`/estudios/verificar/${s.numero}`}
                className="text-primary hover:bg-secondary inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors"
              >
                Revisar
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Paginacion {...props} etiqueta="estudios" singular="estudio" />
    </div>
  );
}
