import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { simulaCreacion } from "@/lib/anticipos/aws.ts";
import { requirePermiso } from "@/lib/auth";
import { MigradorAnticipos } from "./migrador-anticipos";

export const metadata: Metadata = { title: "Migración anticipo SAP" };

export default async function MigracionAnticipoPage() {
  await requirePermiso("financiero.transferencia.migracion-anticipo-sap");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="anticipo"
        titulo="Migración anticipo SAP"
        descripcion="Reenvía a SAP los anticipos de flota de terceros que no se migraron, por planilla o por consolidado de transferencia."
      />
      <MigradorAnticipos simulado={simulaCreacion()} />
    </div>
  );
}
