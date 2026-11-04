import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CarFront, IdCard } from "lucide-react";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";

export const metadata: Metadata = { title: "Solicitar estudios" };

const MODULOS = [
  {
    href: "/estudios/solicitar/documento",
    icono: IdCard,
    titulo: "Consulta por documento",
    texto:
      "Antecedentes de una persona o empresa con su cédula, PPT, pasaporte o NIT.",
    etiqueta: "CC · CE · PPT · PP · NIT",
  },
  {
    href: "/estudios/solicitar/vehiculo",
    icono: CarFront,
    titulo: "Consulta por vehículo",
    texto:
      "Placa del vehículo y documento del propietario: RUNT, SOAT, multas y más.",
    etiqueta: "Placa + propietario",
  },
];

export default async function SolicitarEstudiosPage() {
  await requirePermiso("estudios.solicitar");
  return (
    <div className="space-y-8">
      <Encabezado
        icono="solicitar"
        titulo="Solicitar estudios"
        descripcion="Elige el tipo de consulta. El verificador revisará los hallazgos y decidirá."
      />
      <section className="grid gap-4 sm:grid-cols-2">
        {MODULOS.map(({ href, icono: Icono, titulo, texto, etiqueta }) => (
          <Link
            key={href}
            href={href}
            className="group bg-card hover:border-primary/50 relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-colors sm:p-7"
          >
            <span className="bg-brand-deep flex size-12 items-center justify-center rounded-xl text-white">
              <Icono className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">
              {titulo}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {texto}
            </p>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                {etiqueta}
              </span>
              <span className="text-primary inline-flex items-center gap-1 text-sm font-medium transition-transform group-hover:translate-x-0.5">
                Comenzar
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
