import { CircleAlert } from "lucide-react";
import { cx } from "@/lib/utils";

/** Campo de placa con aspecto de placa colombiana (amarilla, letras negras). */
export function PlacaInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  ayuda,
  error,
  pequena,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ayuda: string;
  error?: string;
  pequena?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={cx(
          "mx-auto mt-2 w-full rounded-xl border-[3px] border-[#1c1c1c] bg-[#f6c624] px-3 pt-2 pb-1.5 shadow-[inset_0_0_0_2px_#f6c624,inset_0_0_0_4px_#1c1c1c]",
          pequena ? "max-w-60" : "max-w-72",
          error && "ring-destructive ring-2 ring-offset-2",
        )}
      >
        <input
          id={id}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6),
            )
          }
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          className={cx(
            "w-full bg-transparent text-center font-mono font-bold tracking-[0.18em] text-[#1c1c1c] outline-none placeholder:text-[#1c1c1c]/25",
            pequena ? "text-3xl" : "text-4xl",
          )}
        />
        <p className="text-center text-[10px] font-semibold tracking-[0.35em] text-[#1c1c1c]/70">
          COLOMBIA
        </p>
      </div>
      {error ? (
        <p className="text-destructive mt-2 flex items-center justify-center gap-1.5 text-xs">
          <CircleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground mt-2 text-center text-xs">
          {ayuda}
        </p>
      )}
    </div>
  );
}
