import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/lib/utils";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
type Tamano = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-60";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secundario: "border bg-card text-foreground hover:bg-secondary",
  fantasma: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  peligro: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const TAMANOS: Record<Tamano, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
};

export function buttonClasses(
  variante: Variante = "primario",
  tamano: Tamano = "md",
  className?: string,
) {
  return cx(BASE, VARIANTES[variante], TAMANOS[tamano], className);
}

export function Button({
  variante,
  tamano,
  className,
  ...props
}: ComponentProps<"button"> & { variante?: Variante; tamano?: Tamano }) {
  return (
    <button className={buttonClasses(variante, tamano, className)} {...props} />
  );
}

export function ButtonLink({
  variante,
  tamano,
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return (
    <Link className={buttonClasses(variante, tamano, className)} {...props} />
  );
}
