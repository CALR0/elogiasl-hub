import { CircleAlert, CircleCheck } from "lucide-react";
import { cx } from "@/lib/utils";

/** Mensaje de resultado de una acción (éxito o error), anunciado a lectores de pantalla. */
export function Aviso({
  tipo,
  children,
  className,
}: {
  tipo: "ok" | "error";
  children: React.ReactNode;
  className?: string;
}) {
  const Icono = tipo === "ok" ? CircleCheck : CircleAlert;
  return (
    <p
      role={tipo === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tipo === "ok"
          ? "border-primary/25 bg-secondary text-accent-foreground"
          : "border-destructive/30 bg-destructive/5 text-destructive",
        className,
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
