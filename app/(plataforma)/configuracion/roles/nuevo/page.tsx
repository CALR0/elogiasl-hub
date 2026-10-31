import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { EditorRol } from "../editor-rol";

export const metadata: Metadata = { title: "Nuevo rol" };

export default async function NuevoRolPage() {
  await requirePermiso("configuracion.roles");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="roles"
        titulo="Nuevo rol"
        descripcion="Ponle un nombre y marca los módulos a los que tendrá acceso."
      />
      <EditorRol rol={null} />
    </div>
  );
}
