import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { listarPendientes } from "@/lib/estudios/datos";
import { BandejaVerificar } from "./bandeja-verificar";

export const metadata: Metadata = { title: "Verificar estudios" };

export default async function VerificarEstudiosPage() {
  await requirePermiso("estudios.verificar");
  const pendientes = await listarPendientes();
  return (
    <div className="space-y-6">
      <Encabezado
        icono="verificar"
        titulo="Verificar estudios"
        descripcion="Pendientes de decisión, ordenados por nivel de riesgo. Entra al detalle para aprobar o rechazar."
      />
      <BandejaVerificar items={pendientes} />
    </div>
  );
}
