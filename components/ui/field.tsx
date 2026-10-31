import type { ComponentProps, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "@/lib/utils";

/** Campo con etiqueta, ayuda opcional y mensaje de error accesible. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="text-destructive flex items-center gap-1.5 text-xs"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

export const inputClasses =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary aria-invalid:border-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClasses, className)} {...props} />;
}

export const selectClasses =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-primary aria-invalid:border-destructive";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(selectClasses, className)} {...props} />;
}

/** Interruptor accesible (checkbox con apariencia de switch). */
export function Interruptor({
  checked,
  onChange,
  etiqueta,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  etiqueta: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        "inline-flex items-center gap-3 text-sm font-medium",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="bg-input peer-checked:bg-primary peer-focus-visible:ring-ring relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
      {etiqueta}
    </label>
  );
}
