import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Download,
  ScrollText,
  ShieldX,
} from "lucide-react";
import { Encabezado } from "@/components/plataforma/encabezado";
import { RefrescoEnVivo } from "@/components/sesion/refresco-en-vivo";
import { requirePermiso } from "@/lib/auth";
import {
  consultarLogs,
  listarUsuarios,
  LOGS_POR_PAGINA,
} from "@/lib/gestion/datos";
import { etiquetaAccion, etiquetaModulo } from "@/lib/gestion/etiquetas";
import { aQuery, leerFiltros } from "@/lib/gestion/filtros-logs";
import type { LogFila } from "@/lib/gestion/tipos";
import { cx, fechaHora, rango } from "@/lib/utils";
import { VisorFiltrado } from "./filtros-visor";

export const metadata: Metadata = { title: "Visor de logs" };

const RESULTADOS = {
  ok: {
    texto: "Correcto",
    icono: CircleCheck,
    clases: "text-accent-foreground bg-secondary",
  },
  error: {
    texto: "Error",
    icono: CircleAlert,
    clases: "text-destructive bg-destructive/8",
  },
  denegado: {
    texto: "Denegado",
    icono: ShieldX,
    clases: "text-construccion bg-construccion-bg",
  },
} as const;

export default async function VisorLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermiso("auditoria.visor-logs");
  const { pagina, ...filtros } = leerFiltros(await searchParams);
  const [{ filas, total }, usuarios] = await Promise.all([
    consultarLogs(filtros, pagina),
    listarUsuarios(),
  ]);
  const paginas = Math.max(1, Math.ceil(total / LOGS_POR_PAGINA));
  const hayFiltros = Object.values(filtros).some(Boolean);
  const desde = total ? (pagina - 1) * LOGS_POR_PAGINA + 1 : 0;
  const hasta = Math.min(pagina * LOGS_POR_PAGINA, total);

  return (
    <div className="space-y-6">
      {/* Solo en la primera página: los eventos nuevos llegan arriba */}
      {pagina === 1 && <RefrescoEnVivo tablas={["audit_logs"]} />}

      <Encabezado
        icono="logs"
        titulo="Visor de logs"
        descripcion="Todo lo que ocurre en la plataforma: sesiones, accesos y acciones en los módulos."
      >
        {total > 0 && (
          // Enlace normal (no prefetch): el Route Handler devuelve un archivo
          <a
            href={`/api/auditoria/exportar${aQuery(filtros)}`}
            className="bg-card hover:bg-secondary inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            <Download className="size-4" aria-hidden />
            Exportar CSV
          </a>
        )}
      </Encabezado>

      <VisorFiltrado
        filtros={filtros}
        usuarios={usuarios.map((u) => ({ email: u.email, nombre: u.nombre }))}
      >
        <section
          aria-label="Registros"
          className="bg-card overflow-hidden rounded-xl border"
        >
          <div className="bg-muted/50 text-muted-foreground hidden grid-cols-[11rem_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_1.5rem] gap-4 px-5 py-2.5 text-xs font-medium lg:grid">
            <span>Fecha y hora</span>
            <span>Usuario</span>
            <span>Módulo</span>
            <span>Acción</span>
            <span>Resultado</span>
            <span />
          </div>
          {filas.length ? (
            <ul className="divide-y">
              {filas.map((l) => (
                <FilaLogItem key={l.id} log={l} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
              <ScrollText className="size-6" aria-hidden />
              {hayFiltros
                ? "No hay registros con estos filtros."
                : "Aún no hay registros."}
            </p>
          )}
        </section>

        {total > 0 && (
          <nav
            aria-label="Paginación"
            className="flex flex-col items-center justify-between gap-3 sm:flex-row"
          >
            <p className="text-muted-foreground text-xs tabular-nums">
              Mostrando{" "}
              <span className="text-foreground font-medium">
                {desde}–{hasta}
              </span>{" "}
              de <span className="text-foreground font-medium">{total}</span>{" "}
              registros
            </p>
            {paginas > 1 && (
              <div className="flex items-center gap-1 text-sm">
                <EnlacePagina
                  href={
                    pagina > 1
                      ? `/auditoria/visor-logs${aQuery(filtros, pagina - 1)}`
                      : null
                  }
                  etiqueta="Página anterior"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </EnlacePagina>
                {rango(pagina, paginas).map((n, i) =>
                  n === "…" ? (
                    <span
                      key={`e${i}`}
                      className="text-muted-foreground w-6 text-center"
                    >
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={`/auditoria/visor-logs${aQuery(filtros, n)}`}
                      aria-label={`Página ${n}`}
                      aria-current={n === pagina ? "page" : undefined}
                      className={cx(
                        "flex size-9 items-center justify-center rounded-lg font-medium tabular-nums transition-colors",
                        n === pagina
                          ? "bg-brand-deep text-white"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {n}
                    </Link>
                  ),
                )}
                <EnlacePagina
                  href={
                    pagina < paginas
                      ? `/auditoria/visor-logs${aQuery(filtros, pagina + 1)}`
                      : null
                  }
                  etiqueta="Página siguiente"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </EnlacePagina>
              </div>
            )}
          </nav>
        )}
      </VisorFiltrado>
    </div>
  );
}

function EnlacePagina({
  href,
  etiqueta,
  children,
}: {
  href: string | null;
  etiqueta: string;
  children: React.ReactNode;
}) {
  const clases =
    "bg-card flex size-9 items-center justify-center rounded-lg border transition-colors";
  return href ? (
    <Link
      href={href}
      aria-label={etiqueta}
      className={cx(clases, "hover:bg-secondary")}
    >
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cx(clases, "opacity-40")}>
      {children}
    </span>
  );
}

/** Un registro: fila resumida que se despliega con el detalle completo. */
function FilaLogItem({ log: l }: { log: LogFila }) {
  const r = RESULTADOS[l.resultado];
  const Icono = r.icono;
  const actor = l.actorNombre ?? l.actorEmail ?? "Sistema";
  const modulo = etiquetaModulo(l.modulo);
  const accion = etiquetaAccion(l.accion);

  return (
    <li>
      <details className="group">
        <summary className="hover:bg-muted/30 grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[11rem_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_1.5rem] lg:items-center lg:px-5 [&::-webkit-details-marker]:hidden">
          <time
            dateTime={l.fecha}
            className="text-muted-foreground text-xs tabular-nums lg:text-sm"
          >
            {fechaHora(l.fecha)}
          </time>
          <span className="order-first col-span-2 min-w-0 lg:order-none lg:col-span-1">
            <span className="block truncate font-medium">{actor}</span>
            {l.actorNombre && l.actorEmail && (
              <span className="text-muted-foreground block truncate text-xs">
                {l.actorEmail}
              </span>
            )}
          </span>
          {/* En la fila, solo el módulo usado (la ruta completa va en el detalle) */}
          <span
            title={modulo}
            className="text-muted-foreground col-span-2 truncate text-xs lg:col-span-1 lg:text-sm"
          >
            {modulo.split(" › ").at(-1)}
          </span>
          <span title={accion} className="min-w-0 truncate">
            {accion}
            {l.entidadId && (
              <span className="text-muted-foreground"> · {l.entidadId}</span>
            )}
          </span>
          <span
            className={cx(
              "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              r.clases,
            )}
          >
            <Icono className="size-3" aria-hidden />
            {r.texto}
          </span>
          <ChevronDown
            className="text-muted-foreground hidden size-4 transition-transform group-open:rotate-180 lg:block"
            aria-hidden
          />
        </summary>

        <dl className="bg-muted/30 grid gap-x-6 gap-y-3 border-t px-4 py-4 text-xs sm:grid-cols-2 lg:grid-cols-4 lg:px-5">
          <Dato titulo="Módulo" valor={modulo} className="sm:col-span-2" />
          <Dato titulo="Acción" valor={accion} className="sm:col-span-2" />
          <Dato titulo="Código de acción" valor={<code>{l.accion}</code>} />
          <Dato
            titulo="Objeto"
            valor={l.entidad ? `${l.entidad}: ${l.entidadId ?? "—"}` : "—"}
          />
          <Dato titulo="Dirección IP" valor={l.ip ?? "—"} />
          <Dato titulo="Registro" valor={`#${l.id}`} />
          <Dato
            titulo="Navegador"
            valor={<span className="break-all">{l.userAgent ?? "—"}</span>}
            className="sm:col-span-2 lg:col-span-4"
          />
          {bloquesDetalle(l.detalle).map(([titulo, valor]) => (
            <Dato
              key={titulo}
              titulo={titulo}
              className="sm:col-span-2 lg:col-span-4"
              valor={
                <pre className="bg-card max-h-96 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {typeof valor === "string"
                    ? valor
                    : JSON.stringify(valor, null, 2)}
                </pre>
              }
            />
          ))}
        </dl>
      </details>
    </li>
  );
}

/**
 * El detalle de un registro en bloques: el payload y la respuesta (p. ej. de
 * SAP en la migración de anticipos) van aparte del resto. El título del
 * payload dice si de verdad se envió (detalle.enviado_a_sap).
 */
function bloquesDetalle(detalle: Record<string, unknown> | null) {
  if (!detalle) return [];
  const {
    payload,
    respuesta,
    xml_original,
    xml_enviado,
    respuesta_rndc,
    remesas,
    ...resto
  } = detalle;
  // Migración cumplido RNDC: cumplido de cada remesa (antes del manifiesto),
  // con su XML y la respuesta en bloques propios
  const listaRemesas = Array.isArray(remesas)
    ? (remesas as Record<string, unknown>[])
    : [];
  const bloquesRemesas: [string, unknown][] = [];
  const resumenRemesas = listaRemesas.map((r) => {
    const { xml_enviado: xml, respuesta_rndc: resp, ...datos } = r;
    if (xml != null)
      bloquesRemesas.push([`Remesa ${r.remesa}: XML de cumplido enviado`, xml]);
    if (resp != null)
      bloquesRemesas.push([
        `Remesa ${r.remesa}: respuesta del Ministerio`,
        resp,
      ]);
    return datos;
  });
  if (resumenRemesas.length) resto.remesas = resumenRemesas;
  const tituloPayload =
    resto.enviado_a_sap === true
      ? "Payload enviado a SAP"
      : resto.enviado_a_sap === false
        ? "Payload (no se envió a SAP)"
        : "Payload";
  const bloques: [string, unknown][] = [];
  if (Object.keys(resto).length) bloques.push(["Detalle", resto]);
  if (payload != null) bloques.push([tituloPayload, payload]);
  if (respuesta != null) bloques.push(["Respuesta de SAP", respuesta]);
  bloques.push(...bloquesRemesas);
  // Expedir manifiesto SICETAC: XML original, XML enviado al RNDC (ambos sin
  // credenciales) y su respuesta
  if (xml_original != null) bloques.push(["XML original", xml_original]);
  if (xml_enviado != null)
    bloques.push(["XML enviado al Ministerio", xml_enviado]);
  if (respuesta_rndc != null)
    bloques.push(["Respuesta del Ministerio", respuesta_rndc]);
  return bloques;
}

function Dato({
  titulo,
  valor,
  className,
}: {
  titulo: string;
  valor: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground mb-0.5 font-medium">{titulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
