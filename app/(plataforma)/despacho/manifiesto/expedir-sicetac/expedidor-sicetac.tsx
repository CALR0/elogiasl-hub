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
import { manifiestosUnicos } from "@/lib/sicetac/manifiesto";
import type { ResultadoCalculo } from "@/lib/sicetac/servicio";
import { cx } from "@/lib/utils";

/*
 * Expedir manifiesto SICETAC (Despacho › Manifiesto). "Procesar" hace todo en
 * un paso por cada manifiesto: calcula el SICETAC, corrige flete y
 * retenciones y lo expide ante el Ministerio, mostrando el radicado.
 */

const POR_PAGINA = 10;
const CABECERAS = { "content-type": "application/json", "x-portal": "1" };

interface Fila {
  manifiesto: string;
  calculo: ResultadoCalculo | null;
  error?: string;
}

class SesionVencida extends Error {}

async function pedir<T>(url: string, cuerpo: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: CABECERAS,
    body: JSON.stringify(cuerpo),
  });
  if (res.status === 401) {
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", window.location.pathname);
    window.location.assign(login.href);
    throw new SesionVencida();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error inesperado.");
  return data as T;
}

export function ExpedidorSicetac() {
  const [texto, setTexto] = useEstadoSesion("sicetac.texto", "");
  const [filas, setFilas] = useEstadoSesion<Fila[]>("sicetac.filas", []);
  const [progreso, setProgreso] = useEstadoSesion<{
    hecho: number;
    total: number;
  } | null>("sicetac.progreso", null);
  const [confirmar, setConfirmar] = useState(false);
  const { ancla, visibles, reiniciar, props } = usePaginacion(
    filas,
    POR_PAGINA,
    "sicetac",
  );

  const { unicos, duplicados } = manifiestosUnicos(texto);
  const ocupado = progreso !== null;

  const actualizar = (i: number, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...cambio } : f)));

  async function procesar() {
    setConfirmar(false);
    if (!unicos.length || ocupado) return;
    setFilas(unicos.map((manifiesto) => ({ manifiesto, calculo: null })));
    reiniciar();
    setProgreso({ hecho: 0, total: unicos.length });
    // En serie: cada uno consulta Ministerio, Silogtran, RNDC y SICETAC, y se expide
    for (let i = 0; i < unicos.length; i++) {
      try {
        const calculo = await pedir<ResultadoCalculo>("/api/sicetac/procesar", {
          manifiesto: unicos[i],
        });
        actualizar(i, { calculo });
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
          placeholder={"Ej.: 0101223914, 101225099\n0101225824"}
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
                Calculando {progreso.hecho} de {progreso.total}
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
            <div className="flex items-center justify-between gap-3">
              <h2
                id="titulo-resultados"
                className="font-semibold tracking-tight"
              >
                Resultados
              </h2>
            </div>

            <div
              ref={ancla}
              className="bg-card overflow-hidden rounded-xl border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
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
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibles.map((f) => (
                      <tr key={f.manifiesto} className="align-top">
                        <td className="px-4 py-3 font-mono font-medium">
                          {f.manifiesto}
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <Resultado fila={f} />
                        </td>
                      </tr>
                    ))}
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
              Aún no hay manifiestos procesados
            </p>
            <p>
              Ingresa los manifiestos rechazados por SICETAC y pulsa{" "}
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
            ? `¿Procesar y expedir ${unicos.length} manifiestos?`
            : "¿Procesar y expedir el manifiesto?"
        }
        descripcion="Esta acción no se puede deshacer."
      >
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void procesar()}>
            <Send className="size-4" aria-hidden />
            Procesar y expedir
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
  const c = fila.calculo;
  if (!c)
    return (
      <span role="status" className="text-muted-foreground inline-flex px-1">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span className="sr-only">Procesando</span>
      </span>
    );
  if (c.envio)
    return (
      <Insignia
        tipo={c.envio.ok ? "ok" : "error"}
        texto={c.envio.ok ? "Expedido" : "Rechazado"}
      >
        {c.envio.mensaje}
      </Insignia>
    );
  const tipo = {
    listo: "aviso",
    cumple: "neutro",
    registrado: "ok",
    error: "error",
  } as const;
  const texto = {
    listo: "Listo para expedir",
    cumple: "Ya cumple",
    registrado: "Ya expedido",
    error: "No se ajusta",
  } as const;
  return (
    <Insignia tipo={tipo[c.estado]} texto={texto[c.estado]}>
      {c.mensaje}
    </Insignia>
  );
}

function Insignia({
  tipo,
  texto,
  children,
}: {
  tipo: "ok" | "error" | "aviso" | "neutro";
  texto: string;
  children: React.ReactNode;
}) {
  const estilos = {
    ok: { clases: "bg-secondary text-accent-foreground", icono: CircleCheck },
    error: { clases: "bg-destructive/8 text-destructive", icono: CircleAlert },
    aviso: {
      clases: "bg-construccion-bg text-construccion",
      icono: TriangleAlert,
    },
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
