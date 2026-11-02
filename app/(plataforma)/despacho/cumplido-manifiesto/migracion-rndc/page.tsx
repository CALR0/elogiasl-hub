import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { MigradorCumplidos } from "./migrador-cumplidos";

export const metadata: Metadata = { title: "Migración cumplido RNDC" };

export default async function MigracionCumplidoPage() {
  await requirePermiso("despacho.cumplido-manifiesto.migracion-rndc");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="subir"
        titulo="Migración cumplido RNDC"
        descripcion="Para cumplidos rechazados por retenciones (CMA273, CMA262) o por remesas sin cumplir (CMA110)."
      />
      <MigradorCumplidos />
    </div>
  );
}
