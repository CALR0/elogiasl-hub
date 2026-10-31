import { ArrowLeft, ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EstadoBadge } from "@/components/plataforma/estado-badge";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import { estadoDe, rutaDe, type NodoModulo } from "@/lib/modulos";

/**
 * Pantalla de una funcionalidad que aún no trabaja en la plataforma:
 * "En construcción" o "En migración" (desde una aplicación existente).
 */
export function AvisoPendiente({
  nodo,
  padre,
}: {
  nodo: NodoModulo;
  padre?: NodoModulo;
}) {
  const estado = estadoDe(nodo);
  const enMigracion = estado === "migracion";

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="bg-brand-deep flex size-12 shrink-0 items-center justify-center rounded-xl text-white">
          <IconoModulo nombre={nodo.icono} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {nodo.nombre}
            </h1>
            <EstadoBadge estado={estado} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {nodo.descripcion}
          </p>
        </div>
      </header>

      <section className="bg-card overflow-hidden rounded-2xl border">
        <div className="grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold tracking-tight">
              {enMigracion
                ? "Esta funcionalidad se está integrando a la plataforma"
                : "Este módulo está en construcción"}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {enMigracion
                ? "Ya funciona como aplicación independiente. La estamos trayendo a este módulo para que use el mismo inicio de sesión, los permisos por rol y quede registrada en Auditoría."
                : "Ya tiene su lugar en el mapa de la plataforma y su acceso se puede asignar desde Roles. Su funcionalidad se desarrollará en una próxima fase."}
            </p>

            {nodo.origen && (
              <a
                href={nodo.origen.repo}
                target="_blank"
                rel="noreferrer"
                className="bg-migracion-bg text-migracion mt-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              >
                Origen: {nodo.origen.nombre}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}

            <div className="mt-8 flex flex-wrap gap-2">
              {padre ? (
                <ButtonLink href={rutaDe(padre.clave)} variante="secundario">
                  <ArrowLeft className="size-4" aria-hidden />
                  Volver a {padre.nombre}
                </ButtonLink>
              ) : null}
              <ButtonLink href="/inicio" variante="fantasma">
                Ir al inicio
              </ButtonLink>
            </div>
          </div>

          <IlustracionObra migracion={enMigracion} />
        </div>
      </section>
    </div>
  );
}

/** Carretera con barrera de obra (construcción) o con un camión en ruta (migración). */
function IlustracionObra({ migracion }: { migracion: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 180"
      className="mx-auto hidden h-44 w-auto md:block"
      fill="none"
    >
      <ellipse cx="120" cy="160" rx="110" ry="14" className="fill-muted" />
      {/* Carretera */}
      <path d="M70 160 L105 40 L135 40 L170 160 Z" className="fill-secondary" />
      <path
        d="M120 150 L120 128 M120 116 L120 98 M120 88 L120 74 M120 66 L120 56 M120 50 L120 44"
        className="stroke-brand"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {migracion ? (
        // Camión
        <g transform="translate(150 96)">
          <rect
            x="0"
            y="10"
            width="46"
            height="28"
            rx="3"
            className="fill-brand-deep"
          />
          <path d="M46 18 h14 l10 10 v10 h-24 z" className="fill-primary" />
          <rect
            x="52"
            y="21"
            width="8"
            height="6"
            rx="1"
            className="fill-card"
          />
          <circle cx="12" cy="40" r="6" className="fill-foreground" />
          <circle cx="58" cy="40" r="6" className="fill-foreground" />
          <circle cx="12" cy="40" r="2.5" className="fill-card" />
          <circle cx="58" cy="40" r="2.5" className="fill-card" />
        </g>
      ) : (
        // Barrera y conos de obra
        <g>
          <rect
            x="60"
            y="92"
            width="120"
            height="14"
            rx="2"
            className="fill-construccion"
          />
          <path
            d="M72 92 l14 14 M96 92 l14 14 M120 92 l14 14 M144 92 l14 14"
            className="stroke-card"
            strokeWidth="6"
          />
          <rect
            x="68"
            y="106"
            width="6"
            height="40"
            className="fill-foreground/70"
          />
          <rect
            x="166"
            y="106"
            width="6"
            height="40"
            className="fill-foreground/70"
          />
          <path d="M40 150 L50 118 L60 150 Z" className="fill-construccion" />
          <rect x="44" y="132" width="12" height="4" className="fill-card" />
          <path
            d="M180 150 L190 118 L200 150 Z"
            className="fill-construccion"
          />
          <rect x="184" y="132" width="12" height="4" className="fill-card" />
        </g>
      )}
    </svg>
  );
}
