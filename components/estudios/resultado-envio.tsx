import Link from "next/link";
import { CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

/** Pantalla tras un envío exitoso. Nunca muestra resultados ni hallazgos. */
export function EnvioExitoso({
  referencia,
  onNueva,
}: {
  referencia: string;
  onNueva: () => void;
}) {
  return (
    <div className="bg-card rounded-2xl border px-6 py-10 text-center sm:px-10">
      <span className="bg-primary/10 text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <CircleCheck className="size-8" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold">Solicitud enviada</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
        La consulta quedó registrada y se está procesando. Puedes seguir su
        estado en Mis solicitudes.
      </p>
      <p className="bg-secondary mx-auto mt-6 inline-flex flex-col rounded-xl px-6 py-3">
        <span className="text-muted-foreground text-xs">Referencia</span>
        <span className="text-accent-foreground font-mono text-lg font-semibold tracking-wider">
          {referencia}
        </span>
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variante="secundario" tamano="lg" onClick={onNueva}>
          Nueva consulta
        </Button>
        <ButtonLink href="/estudios/mis-solicitudes" tamano="lg">
          Ver mis solicitudes
        </ButtonLink>
      </div>
    </div>
  );
}

/** Error al enviar. Los datos se conservan para reintentar. */
export function EnvioError({
  mensaje,
  onReintentar,
  pendiente,
}: {
  mensaje: string;
  onReintentar: () => void;
  pendiente?: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl border px-6 py-10 text-center sm:px-10">
      <span className="bg-destructive/10 text-destructive mx-auto flex size-16 items-center justify-center rounded-full">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold">No se pudo enviar</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
        {mensaje}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button tamano="lg" onClick={onReintentar} disabled={pendiente}>
          <RotateCcw
            className={pendiente ? "size-4 animate-spin" : "size-4"}
            aria-hidden
          />
          {pendiente ? "Reintentando…" : "Intentar de nuevo"}
        </Button>
        <Link
          href="/estudios/solicitar"
          className="text-muted-foreground hover:text-foreground inline-flex h-12 items-center justify-center text-sm font-medium"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}
