import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { FormularioDocumento } from "./formulario-documento";

export const metadata: Metadata = { title: "Consulta por documento" };

export default async function SolicitarDocumentoPage() {
  await requirePermiso("estudios.solicitar");
  return (
    <div className="space-y-6">
      <Link
        href="/estudios/solicitar"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </Link>
      <Encabezado
        icono="solicitar"
        titulo="Consulta por documento"
        descripcion="Antecedentes de una persona o empresa. Según el tipo, puede pedir fecha de expedición o nombre."
      />
      <FormularioDocumento />
    </div>
  );
}
