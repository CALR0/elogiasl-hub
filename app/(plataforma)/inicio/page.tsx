import type { Metadata } from "next";
import { TarjetaNodo } from "@/components/plataforma/tarjeta-nodo";
import { puede, requireUsuario } from "@/lib/auth";
import { APP } from "@/lib/config";
import { filtrarArbol } from "@/lib/modulos";

export const metadata: Metadata = { title: "Inicio" };

function saludo() {
  // Hora de Colombia (UTC−5, sin horario de verano)
  const h = (new Date().getUTCHours() + 19) % 24;
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function InicioPage() {
  const usuario = await requireUsuario();
  const arbol = filtrarArbol((clave) => puede(usuario, clave));
  const primerNombre = (usuario.nombre || usuario.email).split(/[\s@]/)[0];

  return (
    <div className="space-y-8">
      <header className="bg-brand-deep relative overflow-hidden rounded-2xl px-6 py-8 text-white sm:px-8">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M-20 170 C 160 110, 300 200, 460 130 S 700 60, 820 100"
            stroke="#95A495"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="8 12"
          />
        </svg>
        <p className="text-brand relative text-xs font-medium tracking-[0.2em] uppercase">
          {APP.nombre}
        </p>
        <h1 className="relative mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {saludo()}, {primerNombre}
        </h1>
        <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-white/75">
          Bienvenido al portal de soporte de Elogia. Elige un módulo para
          empezar: aquí tienes a la mano las herramientas de tu día a día.
        </p>
      </header>

      <section aria-labelledby="titulo-modulos">
        <h2
          id="titulo-modulos"
          className="mb-4 text-lg font-semibold tracking-tight"
        >
          Módulos
        </h2>
        {arbol.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {arbol.map((m) => (
              <TarjetaNodo key={m.clave} nodo={m} />
            ))}
          </div>
        ) : (
          <p className="bg-card text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            Tu rol aún no tiene módulos asignados. Pide al administrador que te
            habilite los permisos.
          </p>
        )}
      </section>
    </div>
  );
}
