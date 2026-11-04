import { MenuLateral } from "@/components/plataforma/menu-lateral";
import { CierrePorInactividad } from "@/components/sesion/cierre-por-inactividad";
import { MemoriaSesion } from "@/components/sesion/memoria-sesion";
import { Migas } from "@/components/plataforma/migas";
import { puede, requireUsuario } from "@/lib/auth";
import { filtrarArbol } from "@/lib/modulos";

// Minutos de inactividad antes de cerrar la sesión. Puede sobreescribirse con
// la variable NEXT_PUBLIC_INACTIVIDAD_MINUTOS (número entre 1 y 240).
const MINUTOS_INACTIVIDAD = (() => {
  const v = Number(process.env.NEXT_PUBLIC_INACTIVIDAD_MINUTOS);
  return Number.isFinite(v) && v >= 1 && v <= 240 ? v : 30;
})();

/**
 * Estructura de todas las pantallas con sesión: menú de módulos (podado según
 * los permisos del rol), migas de pan y contenido. Exige sesión.
 */
export default async function PlataformaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await requireUsuario();
  const arbol = filtrarArbol((clave) => puede(usuario, clave));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <MenuLateral
        arbol={arbol}
        sesion={{
          nombre: usuario.nombre || usuario.email,
          rol: usuario.rol.nombre,
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-background/95 sticky top-14 z-20 flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6 lg:top-0 lg:px-10">
          <Migas />
        </div>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-8">
          <MemoriaSesion usuarioId={usuario.id}>{children}</MemoriaSesion>
        </main>
      </div>

      <CierrePorInactividad minutos={MINUTOS_INACTIVIDAD} />
    </div>
  );
}
