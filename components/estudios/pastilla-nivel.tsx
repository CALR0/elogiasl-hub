import {
  AlertOctagon,
  AlertTriangle,
  CircleCheck,
  Info,
  TriangleAlert,
} from "lucide-react";
import { NIVELES, type NivelHallazgo } from "@/lib/estudios/tipos";
import { cx } from "@/lib/utils";

/** Semáforo de riesgo: icono + texto, nunca solo color. */
export function PastillaNivel({
  nivel,
  tamaño = "md",
}: {
  nivel: NivelHallazgo;
  tamaño?: "sm" | "md";
}) {
  const { etiqueta, tono } = NIVELES[nivel];
  const Icono = ICONOS[nivel];
  const clases = {
    verde: "bg-primary/10 text-primary border-primary/25",
    amarillo: "bg-amber-500/10 text-amber-700 border-amber-500/25",
    naranja: "bg-orange-500/10 text-orange-700 border-orange-500/25",
    rojo: "bg-destructive/10 text-destructive border-destructive/25",
    azul: "bg-sky-500/10 text-sky-700 border-sky-500/25",
  }[tono];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        tamaño === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        clases,
      )}
    >
      <Icono className={tamaño === "sm" ? "size-3" : "size-4"} aria-hidden />
      {etiqueta}
    </span>
  );
}

const ICONOS: Record<NivelHallazgo, typeof AlertOctagon> = {
  alto: AlertOctagon,
  medio: AlertTriangle,
  bajo: TriangleAlert,
  info: Info,
  sin_hallazgo: CircleCheck,
};
