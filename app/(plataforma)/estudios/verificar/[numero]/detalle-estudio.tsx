"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  X,
} from "lucide-react";
import { ActualizadorEstudios } from "@/components/estudios/actualizador-estudios";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Field } from "@/components/ui/field";
import { PastillaNivel } from "@/components/estudios/pastilla-nivel";
import type { Estudio } from "@/lib/estudios/tipos";
import { fechaHora } from "@/lib/utils";
import { aprobar, rechazar } from "../acciones";
import { TarjetaConsulta } from "./tarjeta-consulta";

type Accion = "aprobar" | "rechazar";

export function DetalleEstudio({
  estudio,
  soloLectura = false,
}: {
  estudio: Estudio;
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [comentario, setComentario] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, startTransition] = useTransition();

  const decidido = estudio.decision !== "pendiente";
  const enProceso = estudio.estado === "procesando";
  const conError = estudio.consultas.filter((c) => c.estado === "error").length;
  // Solo se decide con las consultas terminadas
  const puedeDecidir = !decidido && !soloLectura && !enProceso;

  function ejecutar() {
    if (!accion) return;
    setAviso(null);
    startTransition(async () => {
      const resultado = await (accion === "aprobar" ? aprobar : rechazar)({
        numero: estudio.numero,
        comentario: comentario.trim() || undefined,
      });
      if (!resultado.ok) {
        setAviso(resultado.error);
        return;
      }
      setAccion(null);
      setComentario("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="bg-card rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Resultado del estudio</h2>
              {estudio.nombreConsultado && (
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {estudio.nombreConsultado}
                </p>
              )}
            </div>
            {enProceso ? null : (
              <PastillaNivel nivel={estudio.nivel ?? "sin_hallazgo"} />
            )}
          </div>
          {enProceso && (
            <div className="mt-3">
              <ActualizadorEstudios />
            </div>
          )}
          {!enProceso && conError > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700">
              <AlertTriangle className="size-3.5" aria-hidden />
              {conError === 1
                ? "Una consulta no se completó: el resultado no la incluye."
                : `${conError} consultas no se completaron: el resultado no las incluye.`}
            </p>
          )}
        </section>

        {estudio.consultas.map((c) => (
          <TarjetaConsulta key={c.id} consulta={c} />
        ))}
      </div>

      <aside className="space-y-4">
        <section className="bg-card rounded-xl border p-5">
          <h2 className="text-sm font-semibold">Solicitud</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Dato etiqueta="Solicitante" valor={estudio.solicitante} />
            <Dato etiqueta="Fecha" valor={fechaHora(estudio.fecha)} />
            <Dato
              etiqueta="Módulo"
              valor={estudio.modulo === "vehiculo" ? "Vehículo" : "Documento"}
            />
            <Dato etiqueta="Entrada" valor={estudio.descripcion} />
          </dl>
        </section>

        {decidido ? (
          <section className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Decisión</h2>
            <p
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                estudio.decision === "aprobado"
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-destructive/25 bg-destructive/10 text-destructive"
              }`}
            >
              {estudio.decision === "aprobado" ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {estudio.decision === "aprobado" ? "Aprobado" : "Rechazado"}
            </p>
            {estudio.comentario && (
              <p className="bg-muted/40 mt-3 rounded-md px-3 py-2 text-sm italic">
                {estudio.comentario}
              </p>
            )}
          </section>
        ) : puedeDecidir ? (
          <section className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Decisión</h2>
            <p className="text-muted-foreground mt-2 text-xs">
              El solicitante verá únicamente aprobado o rechazado y tu
              comentario. Los hallazgos nunca se le muestran.
            </p>
            {aviso && (
              <Aviso tipo="error" className="mt-3">
                {aviso}
              </Aviso>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => setAccion("aprobar")}
                disabled={procesando}
              >
                <CircleCheck className="size-4" aria-hidden />
                Aprobar
              </Button>
              <Button
                type="button"
                variante="peligro"
                onClick={() => setAccion("rechazar")}
                disabled={procesando}
              >
                <CircleAlert className="size-4" aria-hidden />
                Rechazar
              </Button>
            </div>
          </section>
        ) : (
          <section className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Decisión</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {enProceso
                ? "Se podrá decidir cuando terminen las consultas."
                : "Pendiente de revisión por el verificador."}
            </p>
          </section>
        )}

        {estudio.eventos.length > 0 && (
          <section className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Bitácora</h2>
            <ol className="mt-3 space-y-3">
              {estudio.eventos.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  {e.tipo === "error" ? (
                    <CircleAlert
                      className="text-destructive mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <CircleCheck
                      className="text-primary mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <p className="break-words">{e.texto}</p>
                    <time
                      dateTime={e.fecha}
                      className="text-muted-foreground tabular-nums"
                    >
                      {fechaHora(e.fecha)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>

      <Dialogo
        abierto={accion !== null}
        onCerrar={() => {
          if (!procesando) {
            setAccion(null);
            setComentario("");
          }
        }}
        titulo={accion === "aprobar" ? "Aprobar estudio" : "Rechazar estudio"}
        descripcion={`SOL-${String(estudio.numero).padStart(6, "0")} · ${estudio.descripcion}`}
      >
        <div className="space-y-4">
          <Field
            id="comentario"
            label="Comentario (lo verá el solicitante)"
            hint="Opcional. Máximo 500 caracteres."
          >
            <textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value.slice(0, 500))}
              rows={4}
              className="border-input bg-card focus-visible:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
              placeholder={
                accion === "aprobar"
                  ? "Ej. Documentación completa, apto para operar."
                  : "Ej. Hallazgo en listas restrictivas."
              }
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variante="secundario"
              onClick={() => {
                setAccion(null);
                setComentario("");
              }}
              disabled={procesando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variante={accion === "rechazar" ? "peligro" : "primario"}
              onClick={ejecutar}
              disabled={procesando}
            >
              {procesando && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              )}
              Confirmar {accion === "aprobar" ? "aprobación" : "rechazo"}
            </Button>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-muted-foreground w-24 shrink-0 text-xs">
        {etiqueta}
      </dt>
      <dd className="min-w-0 flex-1 text-sm">{valor}</dd>
    </div>
  );
}
