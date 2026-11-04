import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { forbidden } from "next/navigation";
import { Encabezado } from "@/components/plataforma/encabezado";
import { puede, requireUsuario } from "@/lib/auth";
import { obtenerEstudio } from "@/lib/estudios/datos";
import { DetalleEstudio } from "./detalle-estudio";

export const metadata: Metadata = { title: "Detalle del estudio" };

type Params = { numero: string };

export default async function DetallePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const usuario = await requireUsuario();
  if (
    !puede(usuario, "estudios.verificar") &&
    !puede(usuario, "estudios.historial")
  ) {
    forbidden();
  }
  const soloLectura = !puede(usuario, "estudios.verificar");
  const { numero } = await params;
  const n = Number(numero);
  if (!Number.isFinite(n) || n <= 0) notFound();
  const estudio = await obtenerEstudio(n);
  if (!estudio) notFound();
  return (
    <div className="space-y-6">
      <Link
        href="/estudios/verificar"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a la bandeja
      </Link>
      <Encabezado
        icono="verificar"
        titulo={`SOL-${String(estudio.numero).padStart(6, "0")}`}
        descripcion={`${estudio.modulo === "vehiculo" ? "Vehículo" : "Documento"} · ${estudio.descripcion}`}
      />
      <DetalleEstudio estudio={estudio} soloLectura={soloLectura} />
    </div>
  );
}
