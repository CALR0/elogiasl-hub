import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EstadoBadge } from "@/components/plataforma/estado-badge";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import { estadoDe, hojas, rutaDe, type NodoModulo } from "@/lib/modulos";

/** Tarjeta de un módulo / submódulo / funcionalidad con enlace a su página. */
export function TarjetaNodo({ nodo }: { nodo: NodoModulo }) {
  const funcionalidades = nodo.hijos ? hojas(nodo.hijos) : [];

  return (
    <Link
      href={rutaDe(nodo.clave)}
      className="group bg-card hover:border-primary/40 flex flex-col rounded-xl border p-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="bg-secondary text-accent-foreground group-hover:bg-brand-deep flex size-11 items-center justify-center rounded-xl transition-colors group-hover:text-white">
          <IconoModulo nombre={nodo.icono} className="size-5" />
        </span>
        <EstadoBadge estado={estadoDe(nodo)} />
      </div>

      <h3 className="mt-4 font-semibold tracking-tight">{nodo.nombre}</h3>
      <p className="text-muted-foreground mt-1 flex-1 text-sm leading-relaxed">
        {nodo.descripcion}
      </p>

      {funcionalidades.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {funcionalidades.map((f) => (
            <li
              key={f.clave}
              className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs"
            >
              {f.nombre}
            </li>
          ))}
        </ul>
      )}

      <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
        Entrar
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
