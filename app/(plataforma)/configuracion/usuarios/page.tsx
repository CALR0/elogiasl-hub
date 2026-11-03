import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import {
  listarOverrides,
  listarRoles,
  listarUsuarios,
} from "@/lib/gestion/datos";
import { GestionUsuarios } from "./gestion-usuarios";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const yo = await requirePermiso("configuracion.usuarios");
  const [usuarios, roles, overrides] = await Promise.all([
    listarUsuarios(),
    listarRoles(),
    listarOverrides(),
  ]);

  return (
    <div className="space-y-6">
      <Encabezado
        icono="usuarios"
        titulo="Usuarios"
        descripcion="Crea cuentas, asígnales un rol y actívalas o inactívalas."
      />
      <GestionUsuarios
        usuarios={usuarios}
        // El rol de superadministrador solo lo asigna otro superadministrador
        roles={roles
          .filter((r) => yo.rol.esSuperadmin || !r.esSuperadmin)
          .map((r) => ({
            id: r.id,
            nombre: r.nombre,
            activo: r.activo,
            esSuperadmin: r.esSuperadmin,
            accesos: r.accesos,
          }))}
        overrides={overrides}
        miId={yo.id}
      />
    </div>
  );
}
