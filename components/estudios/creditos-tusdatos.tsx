import { AlertTriangle, CircleCheck, Coins, FlaskConical } from "lucide-react";
import { obtenerClienteTusDatos } from "@/lib/estudios/tusdatos";
import { cx } from "@/lib/utils";

/**
 * Tarjeta con los créditos disponibles en TusDatos. Si no hay credenciales,
 * avisa que se está en modo simulado. Se renderiza en servidor; mete en
 * Suspense para que no bloquee la página mientras consulta a TusDatos.
 */
export async function CreditosTusDatos() {
  const cliente = obtenerClienteTusDatos();
  if (!cliente) {
    return (
      <Tarjeta
        tono="ambar"
        icono={<FlaskConical className="size-5" aria-hidden />}
        titulo="Modo simulado"
        descripcion="Sin credenciales de TusDatos. Las consultas no gastan créditos."
      />
    );
  }

  let amount: number | null = null;
  try {
    const plan = (await cliente.creditos()) as unknown as Record<
      string,
      unknown
    >;
    // TusDatos devuelve { amount, purchase_amount, ... } (ver PlansOut en el
    // OpenAPI). Si la respuesta cambió o viene envuelta, buscamos variantes.
    const posible =
      (plan.amount as number | undefined) ??
      (plan.consultas_restantes as number | undefined) ??
      ((plan.data as Record<string, unknown> | undefined)?.amount as
        | number
        | undefined);
    if (typeof posible === "number") amount = posible;
    else console.error("[tusdatos.creditos] respuesta inesperada:", plan);
  } catch (e) {
    console.error("[tusdatos.creditos]", e);
  }
  if (typeof amount !== "number") {
    return (
      <Tarjeta
        tono="rojo"
        icono={<AlertTriangle className="size-5" aria-hidden />}
        titulo="TusDatos no responde"
        descripcion="No se pudo consultar los créditos. Revisa las credenciales o intenta más tarde."
      />
    );
  }
  const bajo = amount < 50;
  return (
    <Tarjeta
      tono={bajo ? "rojo" : "verde"}
      icono={
        bajo ? (
          <AlertTriangle className="size-5" aria-hidden />
        ) : (
          <CircleCheck className="size-5" aria-hidden />
        )
      }
      titulo={
        <>
          <span className="tabular-nums">
            {amount.toLocaleString("es-CO")}
          </span>{" "}
          <span className="text-xs font-normal">créditos</span>
        </>
      }
      descripcion={
        bajo
          ? "Quedan pocos créditos. Avisa al administrador de TusDatos."
          : "Créditos disponibles para consultar antecedentes."
      }
    />
  );
}

/** Esqueleto mientras se consultan los créditos. */
export function CreditosTusDatosCargando() {
  return (
    <Tarjeta
      tono="gris"
      icono={<Coins className="size-5" aria-hidden />}
      titulo={<span className="bg-muted inline-block h-5 w-20 animate-pulse rounded" />}
      descripcion={<span className="bg-muted inline-block h-3 w-40 animate-pulse rounded" />}
    />
  );
}

function Tarjeta({
  tono,
  icono,
  titulo,
  descripcion,
}: {
  tono: "verde" | "ambar" | "rojo" | "gris";
  icono: React.ReactNode;
  titulo: React.ReactNode;
  descripcion: React.ReactNode;
}) {
  const clases: Record<typeof tono, string> = {
    verde: "border-primary/25 bg-primary/5 text-primary",
    ambar: "border-amber-500/25 bg-amber-500/5 text-amber-700",
    rojo: "border-destructive/30 bg-destructive/5 text-destructive",
    gris: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <aside
      className={cx(
        "flex items-start gap-3 rounded-xl border p-4",
        clases[tono],
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/60">
        {icono}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-tight">{titulo}</p>
        <p className="text-foreground/70 mt-0.5 text-xs leading-relaxed">
          {descripcion}
        </p>
      </div>
    </aside>
  );
}
