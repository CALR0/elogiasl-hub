import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import { puede, requireUsuario } from "@/lib/auth";
import { obtenerConsultaParaReporte } from "@/lib/estudios/datos";
import type { RolConsulta } from "@/lib/estudios/tipos";
import { VistaReporte } from "./vista-reporte";

export const metadata: Metadata = { title: "Reporte de consulta" };

const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
  propietario: "Propietario",
  tenedor: "Tenedor",
  conductor: "Conductor",
  prop_remolque: "Propietario del remolque",
};

export default async function ReporteConsultaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await requireUsuario();
  if (
    !puede(usuario, "estudios.verificar") &&
    !puede(usuario, "estudios.historial")
  )
    forbidden();

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const datos = await obtenerConsultaParaReporte(id);
  if (!datos) notFound();
  const { numero, consulta: c } = datos;

  return (
    <div className="space-y-4">
      <Link
        href={`/estudios/verificar/${numero}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al estudio
      </Link>

      <header className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono">
              SOL-{String(numero).padStart(6, "0")}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">{NOMBRE_ROL[c.rol]}</span>
            {c.placa && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono">{c.placa}</span>
              </>
            )}
            {c.tipoDoc && c.documento && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>
                  {c.tipoDoc} {c.documento}
                </span>
              </>
            )}
          </div>
          {c.nombreConsultado && (
            <p className="mt-0.5 text-sm font-medium">{c.nombreConsultado}</p>
          )}
        </div>
        <PastillaNivel nivel={c.nivel ?? "sin_hallazgo"} />
      </header>

      {!c.tieneReporte ? (
        <div className="bg-card text-muted-foreground flex items-center gap-2 rounded-xl border p-6 text-sm">
          <AlertTriangle className="size-4" aria-hidden />
          Esta consulta no tiene reporte disponible.
        </div>
      ) : (
        <VistaReporte consultaId={c.id} rol={NOMBRE_ROL[c.rol]} />
      )}
    </div>
  );
}
