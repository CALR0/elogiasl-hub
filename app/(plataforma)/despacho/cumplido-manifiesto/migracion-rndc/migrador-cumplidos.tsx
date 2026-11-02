"use client";

import { useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  FileWarning,
  LoaderCircle,
  Play,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import type { ResultadoCumplido } from "@/lib/cumplidos/servicio";
import { manifiestosUnicos } from "@/lib/sicetac/manifiesto";
import { cx } from "@/lib/utils";

/*
 * Migración cumplido RNDC (Despacho › Cumplido manifiesto). "Procesar" hace
 * todo en un paso por cada manifiesto: toma el flete del RNDC, corrige las
 * retenciones que pide el error y radica el cumplido.
 */

const POR_PAGINA = 10;
const CABECERAS = { "content-type": "application/json", "x-portal": "1" };

interface Fila {
  manifiesto: string;
  resultado: ResultadoCumplido | null;
  error?: string;
}

class SesionVencida extends Error {}

async function pedir(manifiesto: string): Promise<ResultadoCumplido> {
  const res = await fetch("/api/cumplidos/procesar", {
    method: "POST",
    headers: CABECERAS,
    body: JSON.stringify({ manifiesto }),
  });
  if (res.status === 401) {
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", window.location.pathname);
    window.location.assign(login.href);
    throw new SesionVencida();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error inesperado.");
  return data as ResultadoCumplido;
}

export function MigradorCumplidos() {
  const [texto, setTexto] = useEstadoSesion("cumplidos.texto", "");
  const [filas, setFilas] = useEstadoSesion<Fila[]>("cumplidos.filas", []);
  const [progreso, setProgreso] = useEstadoSesion<{
    hecho: number;
    total: number;
  } | null>("cumplidos.progreso", null);
  const [confirmar, setConfirmar] = useState(false);
  const { ancla, visibles, reiniciar, props } = usePaginacion(
    filas,
    POR_PAGINA,
    "cumplidos",
  );

  const { unicos, duplicados } = manifiestosUnicos(texto);
  const ocupado = progreso !== null;

  const actualizar = (i: number, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...cambio } : f)));

  async function procesar() {
    setConfirmar(false);
    if (!unicos.length || ocupado) return;
    setFilas(unicos.map((manifiesto) => ({ manifiesto, resultado: null })));
    reiniciar();
    setProgreso({ hecho: 0, total: unicos.length });
    // En serie: página del cumplido → flete en el RNDC → envío → consulta posterior
    for (let i = 0; i < unicos.length; i++) {
      try {
        actualizar(i, { resultado: await pedir(unicos[i]) });
      } catch (e) {
        if (e instanceof SesionVencida) return;
        actualizar(i, { error: (e as Error).message });
      }
      setProgreso({ hecho: i + 1, total: unicos.length });
    }
    setProgreso(null);
  }

  const pct = progreso?.total
    ? Math.round((progreso.hecho / progreso.total) * 100)
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr] lg:items-start">
      {/* Entrada */}
      <section className="bg-card rounded-xl border p-5 lg:sticky lg:top-20">
        <label htmlFor="manifiestos" className="block text-sm font-medium">
          Manifiestos
        </label>
        <textarea
          id="manifiestos"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={ocupado}
          rows={6}
          spellCheck={false}
          placeholder={"Ej.: 0101224880, 101224881\n0101224882"}
          className="border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-primary mt-1.5 w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-sm transition-colors outline-none"
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          Separa con coma, espacio o salto de línea. Sin el 0 inicial se
          completa solo ·{" "}
          <span className="text-foreground font-medium">{unicos.length}</span>{" "}
          manifiesto
          {unicos.length === 1 ? "" : "s"}
        </p>
        {duplicados > 0 && (
          <p className="bg-construccion-bg text-construccion mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Se ignora{duplicados === 1 ? "" : "n"} {duplicados} repetido
            {duplicados === 1 ? "" : "s"}.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setConfirmar(true)}
            disabled={ocupado || !unicos.length}
          >
            {progreso ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {progreso ? "Procesando…" : "Procesar"}
          </Button>
          <Button
            variante="secundario"
            onClick={() => {
              setTexto("");
              setFilas([]);
            }}
            disabled={ocupado}
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
      </section>

      {/* Resultados */}
      <section aria-labelledby="titulo-resultados" className="min-w-0">
        {filas.length > 0 ? (
          <div className="space-y-3">
            <h2 id="titulo-resultados" className="font-semibold tracking-tight">
              Resultados
            </h2>
            <div
              ref={ancla}
              className="bg-card overflow-hidden rounded-xl border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Manifiesto
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Remesa
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left font-medium"
                      >
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibles.map((f) => {
                      const remesas = f.resultado?.remesas ?? [];
                      return (
                        <tr key={f.manifiesto} className="align-top">
                          <td className="px-4 py-3 font-mono font-medium">
                            {f.manifiesto}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {remesas.length
                              ? remesas.map((x) => (
                                  <p key={x.remesa}>{x.remesa}</p>
                                ))
                              : "—"}
                          </td>
                          <td className="max-w-md px-4 py-3">
                            <Resultado fila={f} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <Paginacion
              {...props}
              etiqueta="manifiestos"
              singular="manifiesto"
            />
          </div>
        ) : (
          <div className="bg-card text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm">
            <FileWarning className="size-6" aria-hidden />
            <p className="text-foreground font-medium">
              Aún no hay cumplidos procesados
            </p>
            <p>
              Ingresa los manifiestos con cumplido rechazado y pulsa{" "}
              <span className="font-medium">Procesar</span>.
            </p>
          </div>
        )}
      </section>

      <Dialogo
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        ancho="sm"
        titulo={
          unicos.length > 1
            ? `¿Procesar y radicar ${unicos.length} cumplidos?`
            : "¿Procesar y radicar el cumplido?"
        }
        descripcion="Esta acción no se puede deshacer."
      >
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void procesar()}>
            <Send className="size-4" aria-hidden />
            Procesar y radicar
          </Button>
        </div>
      </Dialogo>
    </div>
  );
}

function Resultado({ fila }: { fila: Fila }) {
  if (fila.error)
    return (
      <Insignia tipo="error" texto="Error">
        {fila.error}
      </Insignia>
    );
  const r = fila.resultado;
  if (!r)
    return (
      <span role="status" className="text-muted-foreground inline-flex px-1">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span className="sr-only">Procesando</span>
      </span>
    );
  const tipo = {
    migrado: "ok",
    registrado: "ok",
    rechazado: "error",
    "no-aplica": "neutro",
    error: "error",
  } as const;
  const texto = {
    migrado: "Radicado",
    registrado: "Ya registrado",
    rechazado: "Rechazado",
    "no-aplica": "No se ajusta",
    error: "Error",
  } as const;
  return (
    <div className="space-y-2">
      <Insignia tipo={tipo[r.estado]} texto={texto[r.estado]}>
        {r.mensaje}
      </Insignia>
      {r.remesas.length > 0 && (
        <ul className="space-y-1 border-t pt-2">
          {r.remesas.map((x) => (
            <li
              key={x.remesa}
              className={cx(
                "flex items-start gap-1.5 text-xs leading-snug",
                x.estado === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {x.estado === "error" ? (
                <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
              ) : (
                <CircleCheck className="mt-px size-3 shrink-0" aria-hidden />
              )}
              <span>
                Remesa <span className="font-mono">{x.remesa}</span>:{" "}
                {x.estado === "ya-cumplida"
                  ? `ya cumplida (radicado ${x.radicado})`
                  : x.estado === "cumplida"
                    ? `cumplida ahora (radicado ${x.radicado})`
                    : x.mensaje}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Insignia({
  tipo,
  texto,
  children,
}: {
  tipo: "ok" | "error" | "neutro";
  texto: string;
  children: React.ReactNode;
}) {
  const estilos = {
    ok: { clases: "bg-secondary text-accent-foreground", icono: CircleCheck },
    error: { clases: "bg-destructive/8 text-destructive", icono: CircleAlert },
    neutro: { clases: "bg-muted text-muted-foreground", icono: CircleAlert },
  }[tipo];
  const Icono = estilos.icono;
  return (
    <div className="space-y-1">
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
          estilos.clases,
        )}
      >
        <Icono className="size-3" aria-hidden />
        {texto}
      </span>
      <p className="text-xs leading-snug break-words">{children}</p>
    </div>
  );
}
