"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import type { FilaBandeja } from "@/lib/estudios/datos";
import { fechaHora } from "@/lib/utils";

type FiltroDecision = "todas" | "aprobado" | "rechazado";

export function ListaHistorial({ items }: { items: FilaBandeja[] }) {
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState<FiltroDecision>("todas");

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return items.filter((s) => {
      if (decision !== "todas" && s.decision !== decision) return false;
      if (!texto) return true;
      return (
        s.descripcion.toLowerCase().includes(texto) ||
        (s.nombreConsultado?.toLowerCase().includes(texto) ?? false) ||
        s.solicitante.toLowerCase().includes(texto) ||
        String(s.numero).includes(texto)
      );
    });
  }, [q, decision, items]);

  const { ancla, visibles, props } = usePaginacion(
    filtrados,
    undefined,
    "estudios.historial",
  );

  if (!items.length) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center text-sm">
        Aún no hay estudios decididos.
      </div>
    );
  }

  return (
    <div ref={ancla} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
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
        <Select
          value={decision}
          onChange={(e) => setDecision(e.target.value as FiltroDecision)}
          className="sm:w-48"
        >
          <option value="todas">Todas las decisiones</option>
          <option value="aprobado">Aprobados</option>
          <option value="rechazado">Rechazados</option>
        </Select>
      </div>

      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {visibles.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
          >
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                s.decision === "aprobado"
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-destructive/25 bg-destructive/10 text-destructive"
              }`}
            >
              {s.decision === "aprobado" ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {s.decision === "aprobado" ? "Aprobado" : "Rechazado"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  SOL-{String(s.numero).padStart(6, "0")}
                </span>
                <span className="text-muted-foreground">
                  · {s.modulo === "vehiculo" ? "Vehículo" : "Documento"}
                </span>
                <PastillaNivel nivel={s.nivel} tamaño="sm" />
              </div>
              <p className="mt-0.5 truncate text-sm font-medium">
                {s.descripcion}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {s.nombreConsultado && `${s.nombreConsultado} · `}
                {s.solicitante} · {fechaHora(s.fecha)}
              </p>
            </div>
            <Link
              href={`/estudios/verificar/${s.numero}`}
              className="text-primary hover:bg-secondary inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors"
            >
              Ver
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <Paginacion {...props} etiqueta="estudios" singular="estudio" />
    </div>
  );
}
