"use client";

import { useState } from "react";
import {
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import type {
  ConsultaEstudio,
  ResultadoFuente,
  RolConsulta,
} from "@/lib/estudios/tipos";

const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
};

/** Intentos de descarga mientras TusDatos construye el PDF (cada ~10 s). */
const MAX_INTENTOS_PDF = 12;

/** Datos sueltos que entrega TusDatos (vehículo, SOAT, revisión): solo valores simples. */
function datosSimples(datos: Record<string, unknown>) {
  const filas: [string, string][] = [];
  for (const [grupo, valor] of Object.entries(datos)) {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      for (const [k, v] of Object.entries(valor))
        if (["string", "number", "boolean"].includes(typeof v) && v !== "")
          filas.push([`${grupo} · ${k}`, String(v)]);
    } else if (["string", "number", "boolean"].includes(typeof valor)) {
      filas.push([
        grupo,
        valor === true ? "Sí" : valor === false ? "No" : String(valor),
      ]);
    }
  }
  return filas;
}

/** Resultado de una consulta del estudio: estado, fuentes, hallazgos y reporte. */
export function TarjetaConsulta({
  consulta: c,
}: {
  consulta: ConsultaEstudio;
}) {
  const [verReporte, setVerReporte] = useState(false);
  const [pdf, setPdf] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const datos = datosSimples(c.datos);
  const url = `/api/estudios/reporte/${c.id}`;

  async function descargarPdf() {
    setAviso(null);
    setPdf("Preparando el PDF…");
    try {
      for (let i = 0; i < MAX_INTENTOS_PDF; i++) {
        const res = await fetch(`${url}?formato=pdf`);
        if (res.status === 202) {
          const d = (await res.json().catch(() => ({}))) as {
            reintentarEn?: number;
          };
          setPdf("TusDatos está generando el PDF…");
          await new Promise((r) =>
            setTimeout(r, (d.reintentarEn ?? 10) * 1000),
          );
          continue;
        }
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error || "No se pudo descargar el PDF.");
        }
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(await res.blob());
        enlace.download =
          /filename="([^"]+)"/.exec(
            res.headers.get("content-disposition") ?? "",
          )?.[1] ?? "reporte.pdf";
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(enlace.href), 30_000);
        return;
      }
      throw new Error(
        "TusDatos sigue generando el PDF. Intenta de nuevo en unos minutos.",
      );
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setPdf(null);
    }
  }

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {NOMBRE_ROL[c.rol]}
            {c.placa && <span className="font-mono"> · {c.placa}</span>}
          </h2>
          {c.tipoDoc && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {c.placa ? "Propietario: " : ""}
              {c.tipoDoc} {c.documento}
            </p>
          )}
          {c.nombreConsultado && (
            <p className="mt-0.5 text-sm">{c.nombreConsultado}</p>
          )}
        </div>
        {c.estado === "finalizada" && (
          <PastillaNivel nivel={c.nivel ?? "sin_hallazgo"} />
        )}
        {c.estado === "procesando" && (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            En proceso
          </span>
        )}
        {c.estado === "error" && (
          <span className="border-destructive/30 bg-destructive/5 text-destructive inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
            <CircleAlert className="size-3.5" aria-hidden />
            Error en la consulta
          </span>
        )}
      </div>

      {c.mensajeError && (
        <p className="border-destructive/30 bg-destructive/5 text-destructive mt-3 rounded-lg border px-3 py-2 text-sm">
          {c.mensajeError}
        </p>
      )}
      {c.simulada && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700">
          <TriangleAlert className="size-3.5" aria-hidden />
          Consulta simulada: no gastó créditos reales.
        </p>
      )}

      {c.tieneReporte && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variante="secundario"
            onClick={() => setVerReporte((v) => !v)}
          >
            {verReporte ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            {verReporte ? "Ocultar reporte" : "Ver reporte"}
          </Button>
          <Button
            type="button"
            variante="secundario"
            onClick={() => void descargarPdf()}
            disabled={pdf !== null}
          >
            {pdf ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {pdf ?? "Descargar PDF"}
          </Button>
        </div>
      )}
      {aviso && (
        <p className="text-destructive mt-2 flex items-center gap-1.5 text-sm">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      )}
      {verReporte && (
        // sandbox vacío: el HTML de TusDatos no ejecuta scripts ni llega al portal
        <iframe
          src={`${url}?formato=html`}
          sandbox=""
          title={`Reporte de ${NOMBRE_ROL[c.rol]}`}
          className="mt-3 h-[70vh] w-full rounded-lg border bg-white"
        />
      )}

      {datos.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Datos entregados por TusDatos
          </summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-muted-foreground shrink-0">{k}:</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {c.estado === "finalizada" && (
        <>
          <h3 className="mt-5 text-sm font-medium">Fuentes consultadas</h3>
          <ul className="mt-2 divide-y text-sm">
            {Object.entries(c.fuentes).map(([fuente, estado]) => (
              <li
                key={fuente}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 break-words">{fuente}</span>
                <PastillaFuente estado={estado} />
              </li>
            ))}
            {Object.keys(c.fuentes).length === 0 && (
              <li className="text-muted-foreground py-2">
                Sin fuentes disponibles.
              </li>
            )}
          </ul>

          <h3 className="mt-5 text-sm font-medium">Hallazgos</h3>
          {c.hallazgos.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Sin hallazgos en las fuentes consultadas.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {c.hallazgos.map((h, i) => (
                <li key={`${h.codigo}-${i}`} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">
                        {h.titulo}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {h.fuente}
                      </p>
                    </div>
                    <PastillaNivel nivel={h.nivel} tamaño="sm" />
                  </div>
                  <p className="mt-2 text-sm break-words">{h.descripcion}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PastillaFuente({ estado }: { estado: ResultadoFuente }) {
  const config = {
    ok: {
      texto: "Sin hallazgo",
      clase: "border-primary/25 bg-primary/5 text-primary",
    },
    hallazgo: {
      texto: "Hallazgo",
      clase: "border-destructive/30 bg-destructive/5 text-destructive",
    },
    error: {
      texto: "Error de fuente",
      clase: "border-amber-500/30 bg-amber-500/5 text-amber-700",
    },
  }[estado];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.clase}`}
    >
      {config.texto}
    </span>
  );
}
