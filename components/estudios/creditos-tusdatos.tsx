import { AlertTriangle, Coins, FlaskConical } from "lucide-react";
import { obtenerClienteTusDatos } from "@/lib/estudios/tusdatos";
import { cx } from "@/lib/utils";

/**
 * Chip compacto con los créditos TusDatos restantes. Es un contador que va
 * bajando hacia 0 conforme se consulten estudios. El color cambia según los
 * umbrales de la cuenta (verde ≥ 100, ámbar 50–99, rojo < 50).
 */
const UMBRAL_AMBAR = 100;
const UMBRAL_ROJO = 50;

export async function CreditosTusDatos() {
  const cliente = obtenerClienteTusDatos();
  if (!cliente) {
    return (
      <Chip
        tono="ambar"
        icono={<FlaskConical className="size-3.5" aria-hidden />}
        label="Modo simulado"
        valor="sin créditos"
      />
    );
  }

  let amount: number | null = null;
  try {
    const respuesta = (await cliente.creditos()) as unknown;
    const planes = Array.isArray(respuesta) ? respuesta : [respuesta];
    const plan = planes[0] as Record<string, unknown> | undefined;
    if (typeof plan?.amount === "number") amount = plan.amount;
    if (amount === null)
      console.error("[tusdatos.creditos] respuesta inesperada:", respuesta);
  } catch (e) {
    console.error("[tusdatos.creditos]", e);
  }

  if (typeof amount !== "number") {
    return (
      <Chip
        tono="rojo"
        icono={<AlertTriangle className="size-3.5" aria-hidden />}
        label="TusDatos"
        valor="no responde"
      />
    );
  }

  const tono: Tono =
    amount < UMBRAL_ROJO ? "rojo" : amount < UMBRAL_AMBAR ? "ambar" : "verde";

  return (
    <div
      className="bg-card inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]"
      title={`Créditos TusDatos restantes: ${amount.toLocaleString("es-CO")}`}
    >
      <Coins
        className={cx("size-3.5", TEXTO[tono])}
        aria-hidden
      />
      <span className="text-muted-foreground">Créditos</span>
      <span className={cx("font-semibold tabular-nums", TEXTO[tono])}>
        {amount.toLocaleString("es-CO")}
      </span>
    </div>
  );
}

/** Esqueleto mientras se consulta TusDatos. */
export function CreditosTusDatosCargando() {
  return (
    <div className="bg-card inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]">
      <Coins className="text-muted-foreground size-3.5" aria-hidden />
      <span className="text-muted-foreground">Créditos</span>
      <span className="bg-muted inline-block h-3 w-10 animate-pulse rounded" />
    </div>
  );
}

type Tono = "verde" | "ambar" | "rojo";

const TEXTO: Record<Tono, string> = {
  verde: "text-primary",
  ambar: "text-amber-700",
  rojo: "text-destructive",
};

function Chip({
  tono,
  icono,
  label,
  valor,
}: {
  tono: "ambar" | "rojo";
  icono: React.ReactNode;
  label: string;
  valor: string;
}) {
  const clases =
    tono === "ambar"
      ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
      : "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        clases,
      )}
      title={`${label} · ${valor}`}
    >
      {icono}
      <span>
        {label} · {valor}
      </span>
    </span>
  );
}
