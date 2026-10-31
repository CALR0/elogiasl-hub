import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { MODULO_FICHAS } from "@/lib/fichas/guardia.ts";
import { GeneradorFichas } from "./generador-fichas";

export const metadata: Metadata = { title: "Generar ficha técnica" };

export default async function FichaTecnicaPage() {
  await requirePermiso(MODULO_FICHAS);
  return (
    <div className="space-y-6">
      <Encabezado
        icono="ficha"
        titulo="Generar ficha técnica"
        descripcion="Consulta placas en Silogtran y descarga las fichas del vehículo y su conductor en PDF o Excel."
      />
      <GeneradorFichas />
    </div>
  );
}
