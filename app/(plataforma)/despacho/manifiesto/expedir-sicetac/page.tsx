import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { ExpedidorSicetac } from "./expedidor-sicetac";

export const metadata: Metadata = { title: "Expedir manifiesto SICETAC" };

export default async function ExpedirSicetacPage() {
  await requirePermiso("despacho.manifiesto.expedir-sicetac");
  return (
    <div className="space-y-6">
      <Encabezado
        icono="expedir"
        titulo="Expedir manifiesto SICETAC"
        descripcion="Para manifiestos rechazados por el Ministerio con MAN045: calcula el SICETAC vigente, ajusta el flete y sus retenciones, y expide."
      />
      <ExpedidorSicetac />
    </div>
  );
}
