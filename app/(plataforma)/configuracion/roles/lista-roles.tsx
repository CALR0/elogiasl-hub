"use client";

import Link from "next/link";
import { ChevronRight, Crown, Users } from "lucide-react";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import type { RolFila } from "@/lib/gestion/tipos";
import { cx } from "@/lib/utils";
import { BotonEstadoRol } from "./boton-estado-rol";

/*
 * Lista paginada de roles (igual patrón que la gestión de usuarios: 10 por
 * página, cliente puro). Toda la lista llega del servidor en una consulta;
 * cuando crezca a cientos conviene paginar en servidor con .range.
 */

export function ListaRoles({
  roles,
  miRolId,
}: {
  roles: RolFila[];
  miRolId: string;
}) {
  const { ancla, visibles, props } = usePaginacion(roles);

  return (
    <div ref={ancla} className="space-y-4">
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {visibles.map((r) => (
          <li
            key={r.id}
            className={cx(
              "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5",
              !r.activo && "bg-muted/40",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/configuracion/roles/${r.id}`}
                  className="hover:text-primary font-medium transition-colors"
                >
                  {r.nombre}
                </Link>
                {r.esSuperadmin && (
                  <span className="bg-brand-deep inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white">
                    <Crown className="size-3" aria-hidden />
                    Acceso total
                  </span>
                )}
                {!r.activo && (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                    Inactivo
                  </span>
                )}
              </div>
              {r.descripcion && (
                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                  {r.descripcion}
                </p>
              )}
            </div>

            <dl className="text-muted-foreground flex shrink-0 gap-6 text-sm">
              <div
                className="flex items-center gap-1.5"
                title="Usuarios con este rol"
              >
                <Users className="size-4" aria-hidden />
                <dt className="sr-only">Usuarios</dt>
                <dd className="tabular-nums">
                  {r.usuarios} {r.usuarios === 1 ? "usuario" : "usuarios"}
                </dd>
              </div>
            </dl>

            <div className="flex shrink-0 items-center gap-1">
              {!r.esSuperadmin && r.id !== miRolId && (
                <BotonEstadoRol
                  id={r.id}
                  nombre={r.nombre}
                  activo={r.activo}
                  usuarios={r.usuarios}
                />
              )}
              <Link
                href={`/configuracion/roles/${r.id}`}
                className="text-primary hover:bg-secondary inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors"
              >
                {r.esSuperadmin ? "Ver" : "Editar"}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Paginacion {...props} etiqueta="roles" singular="rol" />
    </div>
  );
}
