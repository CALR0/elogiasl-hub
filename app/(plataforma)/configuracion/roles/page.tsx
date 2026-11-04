import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Encabezado } from "@/components/plataforma/encabezado";
import { ButtonLink } from "@/components/ui/button";
import { requirePermiso } from "@/lib/auth";
import { listarRoles } from "@/lib/gestion/datos";
import { ListaRoles } from "./lista-roles";

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

      <ListaRoles roles={roles} miRolId={yo.rol.id} />
    </div>
  );
}
