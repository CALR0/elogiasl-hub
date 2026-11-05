import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { puede, requireUsuario } from "@/lib/auth";
import { obtenerEstudio } from "@/lib/estudios/datos";
import type { RolConsulta } from "@/lib/estudios/tipos";
import { VistaDescargar } from "./vista-descargar";

const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ numero: string }>;
}): Promise<Metadata> {
  const { numero } = await params;
  return { title: `Descargar SOL-${numero.padStart(6, "0")}` };
}

/**
 * Página "para imprimir": muestra apilados los HTML oficiales de TusDatos de
 * todas las consultas del estudio y dispara el diálogo de impresión del
 * navegador. El usuario elige "Guardar como PDF" y se lleva un solo archivo
 * con todo. No espera a TusDatos a construir PDF.
 */
export default async function DescargarEstudioPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const usuario = await requireUsuario();
  if (
    !puede(usuario, "estudios.verificar") &&
    !puede(usuario, "estudios.historial")
  )
    forbidden();

  const { numero: numeroStr } = await params;
  const numero = Number(numeroStr);
  if (!Number.isInteger(numero) || numero <= 0) notFound();
  const estudio = await obtenerEstudio(numero);
  if (!estudio) notFound();

  const consultas = estudio.consultas
    .filter((c) => c.tieneReporte)
    .map((c) => ({
      id: c.id,
      titulo: `${NOMBRE_ROL[c.rol]}${c.placa ? ` · ${c.placa}` : ""}`,
      subtitulo:
        c.nombreConsultado ??
        (c.tipoDoc && c.documento ? `${c.tipoDoc} ${c.documento}` : ""),
    }));

  const etiqueta = estudio.descripcion;
  const numeroStr2 = `SOL-${String(numero).padStart(6, "0")}`;
  const fechaCorta = fechaCortaIso(estudio.fecha);
  const titulo = `${numeroStr2} ${etiqueta} ${fechaCorta}`;

  return (
    <VistaDescargar
      titulo={titulo}
      consultas={consultas}
      numero={numero}
      etiqueta={etiqueta}
      fecha={fechaCorta}
    />
  );
}

function fechaCortaIso(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}
