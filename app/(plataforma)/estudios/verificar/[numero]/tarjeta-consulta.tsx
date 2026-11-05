"use client";

import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import { buttonClasses } from "@/components/ui/button";
import type {
  ConsultaEstudio,
  NivelHallazgo,
  ResultadoFuente,
  RolConsulta,
} from "@/lib/estudios/tipos";
import { cx } from "@/lib/utils";

const NOMBRE_ROL: Record<RolConsulta, string> = {
  documento: "Documento",
  cabezote: "Cabezote",
  remolque: "Remolque",
  propietario: "Propietario",
  tenedor: "Tenedor",
  conductor: "Conductor",
  prop_remolque: "Propietario del remolque",
};

/** Datos útiles del vehículo (placa, modelo, SOAT…). Solo valores simples. */
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

function conteoNivel(
  hallazgos: ConsultaEstudio["hallazgos"],
): Partial<Record<NivelHallazgo, number>> {
  const r: Partial<Record<NivelHallazgo, number>> = {};
  for (const h of hallazgos) r[h.nivel] = (r[h.nivel] ?? 0) + 1;
  return r;
}

function conteoFuentes(fuentes: Record<string, ResultadoFuente>) {
  const r = { ok: 0, hallazgo: 0, error: 0 };
  for (const v of Object.values(fuentes)) r[v]++;
  return r;
}

/**
 * Resumen esencial de una consulta a TusDatos. El detalle completo (fuentes
 * una por una, hallazgos textuales) vive en el reporte HTML de TusDatos y se
 * abre con "Ver reporte": acá solo mostramos lo contundente.
 */
export function TarjetaConsulta({
  consulta: c,
}: {
  consulta: ConsultaEstudio;
}) {
  const datos = datosSimples(c.datos);
  const totalFuentes = Object.keys(c.fuentes).length;
  const cFuentes = conteoFuentes(c.fuentes);
  const cNiveles = conteoNivel(c.hallazgos);

  return (
    <section className="bg-card rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              {NOMBRE_ROL[c.rol]}
            </span>
            {c.placa && (
              <span className="bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-xs">
                {c.placa}
              </span>
            )}
            {c.tipoDoc && c.documento && (
              <span className="text-muted-foreground text-xs">
                {c.tipoDoc} {c.documento}
              </span>
            )}
            {c.simulada && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Simulada
              </span>
            )}
          </div>
          {c.nombreConsultado && (
            <p className="mt-0.5 truncate text-sm">{c.nombreConsultado}</p>
          )}
        </div>
        <EstadoConsulta consulta={c} />
      </div>

      {c.mensajeError && (
        <p className="border-destructive/30 bg-destructive/5 text-destructive mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-words">{c.mensajeError}</span>
        </p>
      )}

      {c.estado === "finalizada" && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ResumenFuentes total={totalFuentes} conteo={cFuentes} />
            <ResumenHallazgos
              total={c.hallazgos.length}
              conteo={cNiveles}
              nivel={c.nivel ?? "sin_hallazgo"}
            />
          </div>

          {(c.tieneReporte || datos.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {c.tieneReporte && (
                <Link
                  href={`/estudios/reporte/${c.id}`}
                  target="_blank"
                  rel="noopener"
                  className={buttonClasses("primario", "md")}
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Ver reporte
                </Link>
              )}
              {datos.length > 0 && (
                <details className="ml-auto text-sm">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
                    Datos del vehículo
                  </summary>
                  <dl className="bg-muted/30 mt-2 grid gap-x-4 gap-y-1 rounded-lg p-3 text-xs sm:grid-cols-2">
                    {datos.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">
                          {k}:
                        </dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EstadoConsulta({ consulta: c }: { consulta: ConsultaEstudio }) {
  if (c.estado === "procesando")
    return (
      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs font-medium">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        En proceso
      </span>
    );
  if (c.estado === "error")
    return (
      <span className="border-destructive/30 bg-destructive/5 text-destructive inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
        <TriangleAlert className="size-3.5" aria-hidden />
        Error
      </span>
    );
  return <PastillaNivel nivel={c.nivel ?? "sin_hallazgo"} />;
}

function ResumenFuentes({
  total,
  conteo,
}: {
  total: number;
  conteo: { ok: number; hallazgo: number; error: number };
}) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5">
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Fuentes
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{total}</span>
        <span className="text-muted-foreground text-xs">consultadas</span>
      </p>
      {total > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <ChipMini
            tono="verde"
            icono={<ShieldCheck className="size-3" aria-hidden />}
          >
            {conteo.ok} sin hallazgo
          </ChipMini>
          {conteo.hallazgo > 0 && (
            <ChipMini
              tono="rojo"
              icono={<AlertOctagon className="size-3" aria-hidden />}
            >
              {conteo.hallazgo} con hallazgo
            </ChipMini>
          )}
          {conteo.error > 0 && (
            <ChipMini
              tono="ambar"
              icono={<AlertTriangle className="size-3" aria-hidden />}
            >
              {conteo.error} con error
            </ChipMini>
          )}
        </div>
      )}
    </div>
  );
}

function ResumenHallazgos({
  total,
  conteo,
  nivel,
}: {
  total: number;
  conteo: Partial<Record<NivelHallazgo, number>>;
  nivel: NivelHallazgo;
}) {
  const tono: "verde" | "ambar" | "rojo" =
    nivel === "alto" || nivel === "medio"
      ? "rojo"
      : nivel === "bajo" || nivel === "info"
        ? "ambar"
        : "verde";
  const clasesTotal: Record<typeof tono, string> = {
    verde: "text-primary",
    ambar: "text-amber-700",
    rojo: "text-destructive",
  };
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5">
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Hallazgos
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cx(
            "text-xl font-semibold tabular-nums",
            total > 0 ? clasesTotal[tono] : "",
          )}
        >
          {total}
        </span>
        <span className="text-muted-foreground text-xs">
          {total === 1 ? "encontrado" : "encontrados"}
        </span>
      </p>
      {total > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
          {(["alto", "medio", "bajo", "info"] as const).map((n) =>
            (conteo[n] ?? 0) > 0 ? (
              <PastillaNivel key={n} nivel={n} tamaño="sm" />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function ChipMini({
  tono,
  icono,
  children,
}: {
  tono: "verde" | "ambar" | "rojo";
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  const clases: Record<typeof tono, string> = {
    verde: "text-primary",
    ambar: "text-amber-700",
    rojo: "text-destructive",
  };
  return (
    <span
      className={cx("inline-flex items-center gap-1 font-medium", clases[tono])}
    >
      {icono}
      {children}
    </span>
  );
}
