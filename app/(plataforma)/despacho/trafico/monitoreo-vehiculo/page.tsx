import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { MonitoreoVehiculo } from "./monitoreo-vehiculo";

export const metadata: Metadata = { title: "Monitoreo vehículo" };

export default async function MonitoreoVehiculoPage() {
  await requirePermiso("despacho.trafico.monitoreo-vehiculo");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="monitoreo"
        titulo="Monitoreo vehículo"
        descripcion="Localiza vehículos en el mapa y consulta el viaje activo por placa o manifiesto en Control T."
      />
      <MonitoreoVehiculo />
    </div>
  );
}
