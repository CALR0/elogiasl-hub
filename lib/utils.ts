/** Une clases condicionales: cx("a", cond && "b") → "a b". */
export function cx(...clases: Array<string | false | null | undefined>) {
  return clases.filter(Boolean).join(" ");
}

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * "26 oct, 9:42 a. m." en hora de Colombia (UTC−5, sin horario de verano).
 * Se formatea a mano y no con Intl: Node y el navegador traen datos de idioma
 * distintos (p. ej. espacios especiales) y eso rompe la hidratación de React.
 */
export function fechaCorta(iso: string) {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  const h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${h % 12 || 12}:${min} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "26 oct 2026 · 09:42:18" en hora de Colombia (para registros de auditoría). */
export function fechaHora(iso: string) {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
}

/** Iniciales para el avatar: "Ana María Ruiz" → "AM", "ana@x.co" → "AX". */
export function iniciales(nombre: string) {
  return nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Páginas a mostrar en una paginación: 1 … 4 5 6 … 12 */
export function rango(pagina: number, paginas: number): Array<number | "…"> {
  if (paginas <= 5) return Array.from({ length: paginas }, (_, i) => i + 1);
  const centro = [pagina - 1, pagina, pagina + 1].filter(
    (n) => n > 1 && n < paginas,
  );
  return [
    1,
    ...(centro[0] > 2 ? (["…"] as const) : []),
    ...centro,
    ...(centro[centro.length - 1] < paginas - 1 ? (["…"] as const) : []),
    paginas,
  ];
}
