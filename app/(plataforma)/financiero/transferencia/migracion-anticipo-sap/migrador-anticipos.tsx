"use client";

import { useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  Layers,
  ListChecks,
  LoaderCircle,
  Play,
  ReceiptText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import {
  entradasUnicas,
  normalizarPlanilla,
  type TipoBusqueda,
} from "@/lib/anticipos/planilla";
import type { FilaMigracion } from "@/lib/anticipos/tipos";
import { cx } from "@/lib/utils";

/*
 * Migración anticipo SAP (Financiero › Transferencia), migrado de SMA: se
 * pegan planillas o consolidados, cada uno se procesa en serie (Silogtran →
 * AWS → confirmación en SAP) y se puede exportar el resultado a Excel.
 */

const POR_PAGINA = 10;
const CABECERAS = { "content-type": "application/json", "x-portal": "1" };

class SesionVencida extends Error {}

async function procesar(
  tipo: TipoBusqueda,
  valor: string,
): Promise<FilaMigracion[]> {
  const res = await fetch("/api/anticipos/procesar", {
    method: "POST",
    headers: CABECERAS,
    body: JSON.stringify({ tipo, valor }),
  });
  if (res.status === 401) {
    // Carga completa (no navegación del cliente): limpia el estado de la página vencida
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", window.location.pathname);
    window.location.assign(login.href);
    throw new SesionVencida();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error inesperado.");
  return data.filas ?? [];
}

const filaError = (
  tipo: TipoBusqueda,
  valor: string,
  mensaje: string,
): FilaMigracion => ({
  consolidado: tipo === "consolidado" ? valor : null,
  planilla: tipo === "planilla" ? normalizarPlanilla(valor) : "—",
  estado: "Error",
  httpStatus: null,
  mensaje,
  info: null,
  entrada: null,
  simulado: false,
  enviado: false,
});

export function MigradorAnticipos({ simulado }: { simulado: boolean }) {
  const [tipo, setTipo] = useState<TipoBusqueda>("planilla");
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<FilaMigracion[]>([]);
  const [progreso, setProgreso] = useState<{
    hecho: number;
    total: number;
  } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string>();
  const { ancla, visibles, reiniciar, props } = usePaginacion(
    filas,
    POR_PAGINA,
  );

  const { unicas, duplicadas } = entradasUnicas(texto, tipo);
  const procesando = progreso !== null;
  const etiqueta = tipo === "planilla" ? "planilla" : "consolidado";
  const exitosos = filas.filter((f) => f.estado === "Exitoso").length;
  const errores = filas.filter((f) => f.estado === "Error").length;

  async function iniciar() {
    if (!unicas.length || procesando) return;
    setError(undefined);
    setFilas([]);
    reiniciar();
    setProgreso({ hecho: 0, total: unicas.length });
    const acumuladas: FilaMigracion[] = [];
    // En serie, un valor por petición (Silogtran guarda estado por sesión)
    for (let i = 0; i < unicas.length; i++) {
      try {
        acumuladas.push(...(await procesar(tipo, unicas[i])));
      } catch (e) {
        if (e instanceof SesionVencida) return;
        acumuladas.push(filaError(tipo, unicas[i], (e as Error).message));
      }
      setFilas([...acumuladas]);
      setProgreso({ hecho: i + 1, total: unicas.length });
    }
    setProgreso(null);
  }

  async function excel() {
    setExportando(true);
    try {
      const { exportarExcel } = await import("@/lib/anticipos/excel");
      await exportarExcel(filas);
    } catch {
      setError("No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  function limpiar() {
    setTexto("");
    setFilas([]);
    setError(undefined);
  }

  const pct = progreso?.total
    ? Math.round((progreso.hecho / progreso.total) * 100)
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,360px)_1fr] lg:items-start">
      {/* Controles */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <section className="bg-card rounded-xl border p-5">
          <div
            role="tablist"
            aria-label="Buscar por"
            className="bg-muted inline-flex rounded-lg p-1"
          >
            {(
              [
                ["planilla", "Por planilla", ReceiptText],
                ["consolidado", "Por consolidado", Layers],
              ] as const
            ).map(([valor, texto, Icono]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={tipo === valor}
                disabled={procesando}
                onClick={() => setTipo(valor)}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-60",
                  tipo === valor
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="size-4" aria-hidden />
                {texto}
              </button>
            ))}
          </div>

          <label htmlFor="valores" className="mt-4 block text-sm font-medium">
            {tipo === "planilla"
              ? "Listado de planillas"
              : "Listado de consolidados"}
          </label>
          <textarea
            id="valores"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={procesando}
            rows={6}
            spellCheck={false}
            placeholder={
              tipo === "planilla"
                ? "Ej.: 0101224688, 0101224681\n0101219923"
                : "Ej.: 20126, 20127"
            }
            className="border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-primary mt-1.5 w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-sm transition-colors outline-none"
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            Separa con coma, espacio o salto de línea ·{" "}
            <span className="text-foreground font-medium">{unicas.length}</span>{" "}
            {etiqueta}
            {unicas.length === 1 ? "" : "s"}
            {duplicadas > 0 ? " únicas" : ""}
          </p>

          {duplicadas > 0 && (
            <p className="bg-construccion-bg text-construccion mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              Se ignora{duplicadas === 1 ? "" : "n"} {duplicadas} repetida
              {duplicadas === 1 ? "" : "s"}: cada {etiqueta} se procesa una sola
              vez.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void iniciar()}
              disabled={procesando || !unicas.length}
            >
              {procesando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              {procesando ? "Procesando…" : "Procesar"}
            </Button>
            <Button
              variante="secundario"
              onClick={limpiar}
              disabled={procesando}
              aria-label="Limpiar"
              title="Limpiar"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>

          {progreso && (
            <div className="mt-4" role="status">
              <div className="text-muted-foreground mb-1 flex justify-between text-xs tabular-nums">
                <span>
                  Procesando {progreso.hecho} de {progreso.total}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <Aviso tipo="error" className="mt-3">
              {error}
            </Aviso>
          )}

          {simulado && (
            <p className="text-muted-foreground mt-4 border-t pt-3 text-xs leading-relaxed">
              Envío a SAP en modo simulado: falta la llave del API de AWS
              (X_API_KEY), así que se consulta Silogtran pero no se crean
              anticipos.
            </p>
          )}
        </section>

        {filas.length > 0 && (
          <dl className="grid grid-cols-3 gap-3">
            {[
              {
                texto: "Total",
                valor: filas.length,
                icono: ListChecks,
                clases: "text-accent-foreground",
              },
              {
                texto: "Exitosos",
                valor: exitosos,
                icono: CircleCheck,
                clases: "text-primary",
              },
              {
                texto: "Errores",
                valor: errores,
                icono: CircleAlert,
                clases: "text-destructive",
              },
            ].map(({ texto, valor, icono: Icono, clases }) => (
              <div key={texto} className="bg-card rounded-xl border px-3 py-3">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Icono className={cx("size-3.5", clases)} aria-hidden />
                  {texto}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Resultados */}
      <section aria-labelledby="titulo-resultados" className="min-w-0">
        {filas.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="titulo-resultados"
                className="font-semibold tracking-tight"
              >
                Resultados
              </h2>
              <Button
                variante="secundario"
                onClick={() => void excel()}
                disabled={procesando || exportando}
              >
                {exportando ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="size-4" aria-hidden />
                )}
                Excel
              </Button>
            </div>

            <div
              ref={ancla}
              className="bg-card overflow-hidden rounded-xl border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Consolidado
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Planilla
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Estado
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        HTTP
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Respuesta
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibles.map((f) => {
                      const i = filas.indexOf(f);
                      return (
                        <tr key={i} className="align-top">
                          <td className="px-4 py-3 font-mono">
                            {f.consolidado || "—"}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium">
                            {f.planilla}
                          </td>
                          <td className="px-4 py-3">
                            <EstadoMigracion fila={f} />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {f.httpStatus ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="max-w-md px-4 py-3">
                            <p className="break-words">{f.mensaje}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <Paginacion {...props} etiqueta="resultados" singular="resultado" />
          </div>
        ) : (
          <div className="bg-card text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm">
            <ReceiptText className="size-6" aria-hidden />
            <p className="text-foreground font-medium">Aún no hay resultados</p>
            <p>
              Ingresa planillas o consolidados y pulsa{" "}
              <span className="font-medium">Procesar</span>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function EstadoMigracion({ fila }: { fila: FilaMigracion }) {
  const estilos = {
    Exitoso: {
      clases: "bg-secondary text-accent-foreground",
      icono: CircleCheck,
    },
    Duplicado: {
      clases: "bg-construccion-bg text-construccion",
      icono: TriangleAlert,
    },
    Error: { clases: "bg-destructive/8 text-destructive", icono: CircleAlert },
  }[fila.estado];
  const Icono = estilos.icono;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
          estilos.clases,
        )}
      >
        <Icono className="size-3" aria-hidden />
        {fila.estado}
      </span>
      {fila.simulado && (
        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">
          Simulado
        </span>
      )}
    </span>
  );
}
