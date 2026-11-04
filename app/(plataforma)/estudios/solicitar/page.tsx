import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { SolicitarEstudio } from "./solicitar-estudio";

export const metadata: Metadata = { title: "Solicitar estudios" };

export default async function SolicitarEstudiosPage() {
  await requirePermiso("estudios.solicitar");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="solicitar"
        titulo="Solicitar estudios"
        descripcion="Envía los datos de un conductor o vehículo. El verificador revisará los hallazgos."
      />
      <SolicitarEstudio />
    </div>
  );
}
