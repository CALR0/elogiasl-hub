import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { AvisoPendiente } from "@/components/plataforma/aviso-pendiente";
import { EstadoBadge } from "@/components/plataforma/estado-badge";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import { TarjetaNodo } from "@/components/plataforma/tarjeta-nodo";
import { puede, requireUsuario } from "@/lib/auth";
import {
  buscarPorSegmentos,
  esHoja,
  estadoDe,
  filtrarArbol,
} from "@/lib/modulos";

/*
 * Página genérica de cualquier nodo del árbol de módulos:
 * - módulo o submódulo → tarjetas de sus hijos visibles para el rol;
 * - funcionalidad sin desarrollar → aviso "En construcción" / "En migración".
 *
 * Cuando una funcionalidad se implemente, se crea su carpeta propia (p. ej.
 * app/(plataforma)/financiero/transferencia/migracion-anticipo-sap/page.tsx):
 * las rutas específicas tienen prioridad sobre esta.
 */

type Props = { params: Promise<{ ruta: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ruta } = await params;
  return { title: buscarPorSegmentos(ruta)?.nodo.nombre ?? "No encontrado" };
}

export default async function NodoPage({ params }: Props) {
  const { ruta } = await params;
  const hallado = buscarPorSegmentos(ruta);
  if (!hallado) notFound();
  const { nodo, ancestros } = hallado;

  const usuario = await requireUsuario();
  if (!puede(usuario, nodo.clave)) forbidden();

  if (esHoja(nodo)) {
    return <AvisoPendiente nodo={nodo} padre={ancestros.at(-1)} />;
  }

  const hijos = filtrarArbol((clave) => puede(usuario, clave), nodo.hijos);

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <span className="bg-brand-deep flex size-12 shrink-0 items-center justify-center rounded-xl text-white">
          <IconoModulo nombre={nodo.icono} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {nodo.nombre}
            </h1>
            <EstadoBadge estado={estadoDe(nodo)} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {nodo.descripcion}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {hijos.map((h) => (
          <TarjetaNodo key={h.clave} nodo={h} />
        ))}
      </div>
    </div>
  );
}
