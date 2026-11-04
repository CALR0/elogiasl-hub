import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { listarMisSolicitudes } from "@/lib/estudios/datos";
import { MisSolicitudes } from "./mis-solicitudes";

export const metadata: Metadata = { title: "Mis solicitudes" };

export default async function MisSolicitudesPage() {
  await requirePermiso("estudios.mis-solicitudes");
  const solicitudes = await listarMisSolicitudes();
  return (
    <div className="space-y-6">
      <Encabezado
        icono="solicitudes"
        titulo="Mis solicitudes"
        descripcion="Estado y decisión del verificador para las solicitudes que enviaste."
      />
      <MisSolicitudes items={solicitudes} />
    </div>
  );
}
