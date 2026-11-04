import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Crown, Plus, Users } from "lucide-react";
import { Encabezado } from "@/components/plataforma/encabezado";
import { ButtonLink } from "@/components/ui/button";
import { requirePermiso } from "@/lib/auth";
import { listarRoles } from "@/lib/gestion/datos";
import { cx } from "@/lib/utils";
import { BotonEstadoRol } from "./boton-estado-rol";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const yo = await requirePermiso("configuracion.roles");
  const roles = await listarRoles();

  return (
    <div className="space-y-6">
      <Encabezado
        icono="roles"
        titulo="Roles"
        descripcion="Define a qué módulos y submódulos accede cada rol."
      >
        <ButtonLink href="/configuracion/roles/nuevo">
          <Plus className="size-4" aria-hidden />
          Nuevo rol
        </ButtonLink>
      </Encabezado>

      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {roles.map((r) => {
          return (
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
                {!r.esSuperadmin && r.id !== yo.rol.id && (
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
          );
        })}
      </ul>
    </div>
  );
}
