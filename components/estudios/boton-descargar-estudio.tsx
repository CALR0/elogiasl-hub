import Link from "next/link";
import { Download } from "lucide-react";

/**
 * Enlace "Descargar" de la bandeja y del historial. Abre
 * /estudios/descargar/{numero} en otra pestaña: esa página apila los HTML de
 * TusDatos y dispara el diálogo de impresión para que el usuario guarde un
 * solo PDF con todo. No pasa por los PDF asíncronos de TusDatos.
 */
export function BotonDescargarEstudio({ numero }: { numero: number }) {
  return (
    <Link
      href={`/estudios/descargar/${numero}`}
      target="_blank"
      rel="noopener"
      className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors"
      title="Abre el reporte listo para guardar como PDF"
    >
      <Download className="size-4" aria-hidden />
      Descargar
    </Link>
  );
}
