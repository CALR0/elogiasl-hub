import type { Metadata } from "next";
import { ActualizadorEstudios } from "@/components/estudios/actualizador-estudios";
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
        descripcion="Estado y decisión del analista para las solicitudes que enviaste."
      />
      {solicitudes.some((s) => s.estado === "procesando") && (
        <ActualizadorEstudios />
      )}
      <MisSolicitudes items={solicitudes} />
    </div>
  );
}
