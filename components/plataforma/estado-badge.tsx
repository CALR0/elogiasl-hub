import { CircleCheck, Construction, GitMerge } from "lucide-react";
import type { EstadoModulo } from "@/lib/modulos";
import { cx } from "@/lib/utils";

const ESTADOS: Record<
  EstadoModulo,
  { texto: string; icono: typeof Construction; clases: string }
> = {
  disponible: {
    texto: "Disponible",
    icono: CircleCheck,
    clases: "bg-secondary text-accent-foreground",
  },
  migracion: {
    texto: "En migración",
    icono: GitMerge,
    clases: "bg-migracion-bg text-migracion",
  },
  construccion: {
    texto: "En construcción",
    icono: Construction,
    clases: "bg-construccion-bg text-construccion",
  },
};

/** Estado de un módulo: siempre ícono + texto, nunca solo color. */
export function EstadoBadge({
  estado,
  className,
}: {
  estado: EstadoModulo;
  className?: string;
}) {
  const { texto, icono: Icono, clases } = ESTADOS[estado];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        clases,
        className,
      )}
    >
      <Icono className="size-3" aria-hidden />
      {texto}
    </span>
  );
}
