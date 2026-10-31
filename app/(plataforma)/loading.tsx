/**
 * Mientras llega una pantalla: el menú y las migas siguen visibles y el
 * contenido muestra un esqueleto liviano (solo CSS, sin JS), con la forma
 * general de las páginas (encabezado + tarjetas). Aparece con un pequeño
 * retraso: si la página llega rápido, no se alcanza a ver (sin destellos).
 */
export default function Cargando() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="animate-esqueleto space-y-6"
    >
      <div className="flex items-start gap-4">
        <span className="bg-muted animate-respirar size-12 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <span className="bg-muted animate-respirar block h-6 w-48 rounded-md" />
          <span className="bg-muted animate-respirar block h-4 w-72 max-w-full rounded-md" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-card space-y-3 rounded-xl border p-5">
            <span className="bg-muted animate-respirar block size-11 rounded-xl" />
            <span className="bg-muted animate-respirar block h-4 w-1/2 rounded-md" />
            <span className="bg-muted animate-respirar block h-3 w-4/5 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
