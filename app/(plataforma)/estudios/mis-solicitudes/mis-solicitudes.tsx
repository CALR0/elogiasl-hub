"use client";

import {
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Hourglass,
  Layers,
  LoaderCircle,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/field";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import { ESTADOS, type SolicitudResumen } from "@/lib/estudios/tipos";
import { cx, fechaHora } from "@/lib/utils";

/** Lista paginada de "Mis solicitudes" (sin resultados ni hallazgos). */
export function MisSolicitudes({ items }: { items: SolicitudResumen[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
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
        {visibles.map((s) => {
          const abiertoAhora = abierta === s.id;
          return (
            <li key={s.id} className="transition-colors">
              <button
                type="button"
                onClick={() => setAbierta(abiertoAhora ? null : s.id)}
                className={cx(
                  "hover:bg-muted/30 flex w-full items-center gap-3 p-4 text-left sm:gap-6 sm:px-5",
                  abiertoAhora && "bg-muted/30",
                )}
                aria-expanded={abiertoAhora}
                aria-controls={`detalle-${s.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      SOL-{String(s.numero).padStart(6, "0")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      · {s.modulo === "vehiculo" ? "Vehículo" : "Documento"}
                    </span>
                    <PastillaTipo tipo={s.tipo} />
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {s.descripcion}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {fechaHora(s.fecha)}
                  </p>
                  {s.comentario && (
                    <p className="border-primary/40 bg-muted/40 mt-2 rounded-md border-l-2 px-2 py-1 text-xs italic">
                      {s.comentario}
                    </p>
                  )}
                </div>
                <PastillaEstado resumen={s} />
                <ChevronDown
                  className={cx(
                    "text-muted-foreground size-4 shrink-0 transition-transform",
                    abiertoAhora && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {abiertoAhora && (
                <Detalle id={`detalle-${s.id}`} resumen={s} />
              )}
            </li>
          );
        })}
      </ul>

      <Paginacion {...props} etiqueta="solicitudes" singular="solicitud" />
    </div>
  );
}

function PastillaTipo({ tipo }: { tipo: SolicitudResumen["tipo"] }) {
  const clases =
    tipo === "combo"
      ? "border-primary/25 bg-primary/5 text-primary"
      : "border-border bg-muted text-muted-foreground";
  const icono =
    tipo === "combo" ? (
      <Layers className="size-3" aria-hidden />
    ) : (
      <User className="size-3" aria-hidden />
    );
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        clases,
      )}
    >
      {icono}
      {tipo === "combo" ? "Combo" : "Individual"}
    </span>
  );
}

function Detalle({
  id,
  resumen,
}: {
  id: string;
  resumen: SolicitudResumen;
}) {
  const { entrada } = resumen;
  const filas: { etiqueta: string; valor: string }[] = [];
  if (entrada.placa) filas.push({ etiqueta: "Placa", valor: entrada.placa });
  if (entrada.tipoDocPropietario && entrada.documentoPropietario)
    filas.push({
      etiqueta: entrada.placa ? "Propietario" : "Documento",
      valor: `${entrada.tipoDocPropietario} ${entrada.documentoPropietario}`,
    });
  if (entrada.tipoDocTenedor && entrada.documentoTenedor)
    filas.push({
      etiqueta: "Tenedor",
      valor: `${entrada.tipoDocTenedor} ${entrada.documentoTenedor}`,
    });
  if (entrada.tipoDocConductor && entrada.documentoConductor)
    filas.push({
      etiqueta: "Conductor",
      valor: `${entrada.tipoDocConductor} ${entrada.documentoConductor}`,
    });
  if (entrada.placaRemolque) {
    filas.push({
      etiqueta: "Remolque",
      valor: entrada.placaRemolque,
    });
    if (
      entrada.tipoDocPropietarioRemolque &&
      entrada.documentoPropietarioRemolque
    )
      filas.push({
        etiqueta: "Propietario del remolque",
        valor: `${entrada.tipoDocPropietarioRemolque} ${entrada.documentoPropietarioRemolque}`,
      });
  }
  return (
    <div
      id={id}
      className="bg-muted/15 border-t px-4 py-4 text-sm sm:px-5"
    >
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex gap-2 min-w-0">
            <dt className="text-muted-foreground w-36 shrink-0 text-xs font-medium">
              {f.etiqueta}
            </dt>
            <dd className="min-w-0 break-words font-mono text-xs">{f.valor}</dd>
          </div>
        ))}
      </dl>
      {entrada.incluirAntecedentes && (
        <p className="text-muted-foreground mt-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
          <ShieldCheck className="size-3.5" aria-hidden />
          Incluye consulta de antecedentes de las personas.
        </p>
      )}
    </div>
  );
}

function PastillaEstado({ resumen }: { resumen: SolicitudResumen }) {
  const { estado, decision } = resumen;
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
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        clases[tono],
      )}
    >
      {icono}
      {titulo}
    </span>
  );
}
