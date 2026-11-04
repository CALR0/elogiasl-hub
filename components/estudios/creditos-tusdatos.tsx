import { AlertTriangle, FlaskConical } from "lucide-react";
import { obtenerClienteTusDatos } from "@/lib/estudios/tusdatos";
import { cx } from "@/lib/utils";

/**
 * Chip compacto con los créditos TusDatos: número restante, "de N comprados"
 * y barrita de progreso tintada según el porcentaje consumido. En Suspense
 * para no bloquear la página.
 */
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
  let totalComprado: number | null = null;
  try {
    const respuesta = (await cliente.creditos()) as unknown;
    const planes = Array.isArray(respuesta) ? respuesta : [respuesta];
    const plan = planes[0] as Record<string, unknown> | undefined;
    if (typeof plan?.amount === "number") amount = plan.amount;
    if (typeof plan?.purchase_amount === "number")
      totalComprado = plan.purchase_amount;
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

  const total = totalComprado ?? Math.max(amount, 1);
  const porcentaje = Math.max(0, Math.min(100, (amount / total) * 100));
  const tono: Tono =
    porcentaje < 10 ? "rojo" : porcentaje < 30 ? "ambar" : "verde";

  return (
    <div
      className="bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]"
      title={`${amount.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} créditos (${Math.round(porcentaje)}%)`}
    >
      <span className="text-muted-foreground">Créditos</span>
      <span className="tabular-nums">
        <span className={cx("font-semibold", TEXTO[tono])}>
          {amount.toLocaleString("es-CO")}
        </span>
        {totalComprado !== null && (
          <span className="text-muted-foreground">
            {" / "}
            {totalComprado.toLocaleString("es-CO")}
          </span>
        )}
      </span>
      <div
        className="bg-muted relative h-1 w-12 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(porcentaje)}
        aria-label={`${amount} créditos TusDatos restantes de ${total}`}
      >
        <div
          className={cx("h-full rounded-full transition-all", BARRA[tono])}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <span className={cx("tabular-nums font-medium", TEXTO[tono])}>
        {Math.round(porcentaje)}%
      </span>
    </div>
  );
}

/** Esqueleto mientras se consulta TusDatos. */
export function CreditosTusDatosCargando() {
  return (
    <div className="bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]">
      <span className="text-muted-foreground">Créditos</span>
      <span className="bg-muted inline-block h-3 w-16 animate-pulse rounded" />
      <span className="bg-muted inline-block h-1 w-12 animate-pulse rounded-full" />
      <span className="bg-muted inline-block h-3 w-6 animate-pulse rounded" />
    </div>
  );
}

type Tono = "verde" | "ambar" | "rojo";

const TEXTO: Record<Tono, string> = {
  verde: "text-primary",
  ambar: "text-amber-700",
  rojo: "text-destructive",
};
const BARRA: Record<Tono, string> = {
  verde: "bg-primary",
  ambar: "bg-amber-500",
  rojo: "bg-destructive",
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
