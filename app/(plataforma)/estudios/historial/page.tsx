import type { Metadata } from "next";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { listarHistorial } from "@/lib/estudios/datos";
import { ListaHistorial } from "./lista-historial";

export const metadata: Metadata = { title: "Historial de estudios" };

export default async function HistorialPage() {
  await requirePermiso("estudios.historial");
  const items = await listarHistorial();
  return (
    <div className="space-y-6">
      <Encabezado
        icono="historial"
        titulo="Historial de estudios"
        descripcion="Estudios decididos: quién, cuándo, decisión y comentario."
      />
      <ListaHistorial items={items} />
    </div>
  );
}
