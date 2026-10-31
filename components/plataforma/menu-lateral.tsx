"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, House, Menu, X } from "lucide-react";
import logo from "@/public/brand/elogia-logo.svg";
import { cerrarSesion } from "@/app/(auth)/login/actions";
import { BotonCerrarSesion } from "@/components/sesion/boton-cerrar-sesion";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import { MenuUsuario } from "@/components/plataforma/menu-usuario";
import { BotonTema } from "@/components/plataforma/tema";
import { esHoja, estadoDe, rutaDe, type NodoModulo } from "@/lib/modulos";
import { cx, iniciales } from "@/lib/utils";

export interface SesionMenu {
  nombre: string;
  rol: string;
}

type Activo = (ruta: string) => boolean;

/** Año del pie (hora de Colombia; se calcula una vez al cargar el módulo). */
const ANIO = new Date(Date.now() - 5 * 3600_000).getUTCFullYear();

function useActivo(): Activo {
  const pathname = usePathname();
  return (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/**
 * Menú de la plataforma: panel lateral fijo en escritorio y cajón deslizable
 * en celular/tablet. Recibe el árbol ya podado según los permisos del rol.
 */
export function MenuLateral({
  arbol,
  sesion,
}: {
  arbol: NodoModulo[];
  sesion: SesionMenu;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  // Cerrar el cajón al navegar (patrón "ajustar estado al cambiar una prop")
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

  return (
    <>
      {/* Panel lateral (escritorio) */}
      <aside className="bg-brand-deep sticky top-0 hidden h-dvh w-72 shrink-0 flex-col text-white lg:flex">
        <ContenidoMenu arbol={arbol} sesion={sesion} />
      </aside>

      {/* Encabezado (celular / tablet): menú a la izquierda, usuario a la derecha */}
      <header className="bg-brand-deep sticky top-0 z-30 flex h-14 items-center justify-between px-3 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          aria-expanded={abierto}
          className="flex size-10 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <MenuUsuario nombre={sesion.nombre} rol={sesion.rol} />
      </header>

      {/* Cajón (celular / tablet) */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="bg-brand-deep absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar menú"
              className="absolute top-4 right-3 flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
            >
              <X className="size-5" aria-hidden />
            </button>
            {/* En celular el usuario está en el encabezado, no al pie del cajón */}
            <ContenidoMenu arbol={arbol} />
          </aside>
        </div>
      )}
    </>
  );
}

function ContenidoMenu({
  arbol,
  sesion,
}: {
  arbol: NodoModulo[];
  /** Tarjeta de usuario al pie (solo escritorio). */
  sesion?: SesionMenu;
}) {
  const activo = useActivo();

  return (
    <>
      <Link href="/inicio" aria-label="Inicio" className="block px-6 pt-6 pb-8">
        <Image
          src={logo}
          alt="Elogia Soluciones Logísticas"
          priority
          className="h-auto w-28 brightness-0 invert"
        />
      </Link>

      <nav
        aria-label="Módulos"
        className="flex-1 [scrollbar-width:thin] space-y-1 overflow-y-auto px-3 pb-4"
      >
        <Link
          href="/inicio"
          aria-current={activo("/inicio") ? "page" : undefined}
          className={cx(
            "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            activo("/inicio")
              ? "bg-white/12 text-white"
              : "text-white/70 hover:bg-white/6 hover:text-white",
          )}
        >
          <House className="size-[18px]" aria-hidden />
          Inicio
        </Link>

        <p className="px-3 pt-5 pb-2 text-[11px] font-medium tracking-[0.2em] text-white/40 uppercase">
          Módulos
        </p>

        {arbol.map((m) => (
          <GrupoModulo key={m.clave} modulo={m} activo={activo} />
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 pt-3 pb-2.5">
        {sesion && (
          <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-white/6 p-3">
            <span className="bg-brand text-brand-deep flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {iniciales(sesion.nombre)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium" title={sesion.nombre}>
                {sesion.nombre}
              </p>
              <p className="truncate text-xs text-white/50">{sesion.rol}</p>
            </div>
            <BotonTema className="size-8 text-white/60 hover:bg-white/10 hover:text-white" />
            <form action={cerrarSesion}>
              <BotonCerrarSesion className="flex size-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60" />
            </form>
          </div>
        )}
        <p className="text-center text-[10px] leading-tight text-white/35">
          © {ANIO} Todos los derechos reservados
        </p>
      </div>
    </>
  );
}

/** Módulo desplegable con sus submódulos (y las funcionalidades de cada uno). */
function GrupoModulo({
  modulo,
  activo,
}: {
  modulo: NodoModulo;
  activo: Activo;
}) {
  const ruta = rutaDe(modulo.clave);
  const contieneActiva = activo(ruta);
  const [desplegado, alternar] = useDesplegable(contieneActiva);
  const idLista = `menu-${modulo.clave}`;

  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={desplegado}
        aria-controls={idLista}
        className={cx(
          "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
          contieneActiva
            ? "text-white"
            : "text-white/70 hover:bg-white/6 hover:text-white",
        )}
      >
        <IconoModulo nombre={modulo.icono} className="size-[18px]" />
        <span className="flex-1 text-left">{modulo.nombre}</span>
        <ChevronDown
          className={cx(
            "size-4 text-white/40 transition-transform",
            desplegado && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {desplegado && (
        <ul
          id={idLista}
          className="mt-0.5 mb-2 ml-[21px] space-y-0.5 border-l border-white/12 pl-3"
        >
          {modulo.hijos?.map((sub) => (
            <li key={sub.clave}>
              {esHoja(sub) ? (
                <EnlaceNodo nodo={sub} activo={activo} />
              ) : (
                <SubmenuNodo nodo={sub} activo={activo} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Estado abierto/cerrado de un grupo del menú. Empieza abierto si contiene la
 * página actual y se despliega solo al entrar a una de sus páginas desde
 * cualquier enlace (patrón "ajustar estado al cambiar una prop").
 */
function useDesplegable(contieneActiva: boolean) {
  const [abierto, setAbierto] = useState(contieneActiva);
  const [activaPrevia, setActivaPrevia] = useState(contieneActiva);
  if (activaPrevia !== contieneActiva) {
    setActivaPrevia(contieneActiva);
    if (contieneActiva) setAbierto(true);
  }
  return [abierto, () => setAbierto((v) => !v)] as const;
}

/**
 * Submódulo con funcionalidades dentro (p. ej. Financiero › Transferencia):
 * se muestra cerrado con una flecha y se despliega para ver su contenido.
 * Funciona a cualquier profundidad.
 */
function SubmenuNodo({ nodo, activo }: { nodo: NodoModulo; activo: Activo }) {
  const contieneActiva = activo(rutaDe(nodo.clave));
  const [desplegado, alternar] = useDesplegable(contieneActiva);
  const idLista = `menu-${nodo.clave}`;

  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={desplegado}
        aria-controls={idLista}
        className={cx(
          "flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          contieneActiva
            ? "font-medium text-white"
            : "text-white/65 hover:bg-white/6 hover:text-white",
        )}
      >
        <span className="flex-1 text-left leading-snug">{nodo.nombre}</span>
        <ChevronRight
          className={cx(
            "size-3.5 text-white/40 transition-transform",
            desplegado && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      {desplegado && (
        <ul
          id={idLista}
          className="mt-0.5 mb-1 ml-2.5 space-y-0.5 border-l border-dashed border-white/15 pl-2.5"
        >
          {nodo.hijos!.map((h) => (
            <li key={h.clave}>
              {esHoja(h) ? (
                <EnlaceNodo nodo={h} activo={activo} pequeno />
              ) : (
                <SubmenuNodo nodo={h} activo={activo} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Enlace a una funcionalidad (o submódulo sin hijos). */
function EnlaceNodo({
  nodo,
  activo,
  pequeno,
}: {
  nodo: NodoModulo;
  activo: Activo;
  pequeno?: boolean;
}) {
  const ruta = rutaDe(nodo.clave);
  const actual = activo(ruta);
  const estado = estadoDe(nodo);

  return (
    <Link
      href={ruta}
      aria-current={actual ? "page" : undefined}
      className={cx(
        "flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
        pequeno ? "text-[13px]" : "text-sm",
        actual
          ? "bg-white/12 font-medium text-white"
          : "text-white/65 hover:bg-white/6 hover:text-white",
      )}
    >
      <span className="flex-1 leading-snug">{nodo.nombre}</span>
      {estado === "construccion" && (
        <span className="rounded px-1.5 text-[10px] font-medium tracking-wide text-white/35 uppercase">
          Pronto
        </span>
      )}
      {estado === "migracion" && (
        <span className="text-brand rounded bg-white/8 px-1.5 text-[10px] font-medium tracking-wide uppercase">
          Migrando
        </span>
      )}
    </Link>
  );
}
