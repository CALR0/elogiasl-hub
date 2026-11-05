"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Container,
  LoaderCircle,
  Minus,
  Plus,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Autorizacion,
  Field,
  Input,
  OpcionesPastilla,
} from "@/components/ui/field";
import { PlacaInput } from "@/components/estudios/placa-input";
import {
  EnvioError,
  EnvioExitoso,
} from "@/components/estudios/resultado-envio";
import {
  TIPOS_DOC_PERSONA,
  TIPOS_DOC_PROPIETARIO,
  TIPOS_DOC_REMOLQUE,
  consultaVehiculoSchema,
  erroresPorCampo,
  type TipoDocPersona,
  type TipoDocPropietario,
  type TipoDocRemolque,
} from "@/lib/estudios/schemas";
import { cx } from "@/lib/utils";
import { solicitarVehiculo } from "../acciones";

const VACIO = {
  placa: "",
  tipoPropietario: "CC" as TipoDocPropietario,
  documentoPropietario: "",
  fechaExpedicionPropietario: "",
  // Tenedor
  incluirTenedor: false,
  tipoTenedor: "CC" as TipoDocPersona,
  documentoTenedor: "",
  fechaExpedicionTenedor: "",
  // Conductor
  incluirConductor: false,
  tipoConductor: "CC" as TipoDocPersona,
  documentoConductor: "",
  fechaExpedicionConductor: "",
  // Remolque
  incluirRemolque: false,
  placaRemolque: "",
  remolqueMismoPropietario: false,
  tipoPropietarioRemolque: "CC" as TipoDocRemolque,
  documentoPropietarioRemolque: "",
  // Antecedentes
  incluirAntecedentes: false,
  autorizacion: false,
};

type Envio =
  | { estado: "idle" }
  | { estado: "exito"; numero: number }
  | { estado: "error"; mensaje: string };

export function FormularioVehiculo() {
  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [envio, setEnvio] = useState<Envio>({ estado: "idle" });
  const [enviando, startTransition] = useTransition();

  function set<K extends keyof typeof VACIO>(
    campo: K,
    valor: (typeof VACIO)[K],
  ) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: "" }));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const parsed = consultaVehiculoSchema.safeParse(datos);
    if (!parsed.success) {
      setErrores(erroresPorCampo(parsed.error));
      return;
    }
    startTransition(async () => {
      const resultado = await solicitarVehiculo(parsed.data);
      if (!resultado.ok) {
        if (resultado.campos) setErrores(resultado.campos);
        setEnvio({ estado: "error", mensaje: resultado.error });
        return;
      }
      setEnvio({ estado: "exito", numero: resultado.datos.numero });
    });
  }

  const resumen = useMemo(() => {
    const lineas: string[] = [];
    lineas.push(`Propietario: ${datos.tipoPropietario} ${datos.documentoPropietario || "—"}`);
    if (datos.incluirTenedor)
      lineas.push(`Tenedor: ${datos.tipoTenedor} ${datos.documentoTenedor || "—"}`);
    if (datos.incluirConductor)
      lineas.push(`Conductor: ${datos.tipoConductor} ${datos.documentoConductor || "—"}`);
    if (datos.incluirRemolque) {
      if (datos.remolqueMismoPropietario)
        lineas.push(`Remolque: ${datos.placaRemolque || "—"} (mismo propietario)`);
      else
        lineas.push(
          `Remolque: ${datos.placaRemolque || "—"} · ${datos.tipoPropietarioRemolque} ${datos.documentoPropietarioRemolque || "—"}`,
        );
    }
    if (datos.incluirAntecedentes)
      lineas.push("Incluye consulta de antecedentes de las personas.");
    return lineas;
  }, [datos]);

  if (envio.estado === "exito") {
    return (
      <EnvioExitoso
        referencia={`SOL-${String(envio.numero).padStart(6, "0")}`}
        onNueva={() => {
          setDatos(VACIO);
          setErrores({});
          setEnvio({ estado: "idle" });
        }}
      />
    );
  }
  if (envio.estado === "error") {
    return (
      <EnvioError
        mensaje={envio.mensaje}
        onReintentar={() => setEnvio({ estado: "idle" })}
        pendiente={enviando}
      />
    );
  }

  const pideDocRemolque =
    datos.incluirRemolque && !datos.remolqueMismoPropietario;

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="bg-card space-y-6 rounded-2xl border p-5 sm:p-8"
    >
      <PlacaInput
        id="placa"
        label={
          datos.incluirRemolque ? "Placa del cabezote" : "Placa del vehículo"
        }
        value={datos.placa}
        onChange={(v) => set("placa", v)}
        placeholder="ABC123"
        ayuda="Carro o cabezote: ABC123"
        error={errores.placa}
      />

      <div className="space-y-5 border-t pt-6">
        <h2 className="text-sm font-semibold">
          Propietario {datos.incluirRemolque ? "del cabezote" : "del vehículo"}
        </h2>
        <OpcionesPastilla
          name="tipoPropietario"
          etiqueta="Tipo de documento"
          opciones={TIPOS_DOC_PROPIETARIO}
          valor={datos.tipoPropietario}
          onChange={(v) => set("tipoPropietario", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="documentoPropietario"
            label="Número de documento"
            hint="Sin puntos ni espacios."
            error={errores.documentoPropietario}
          >
            <Input
              id="documentoPropietario"
              inputMode="numeric"
              autoComplete="off"
              value={datos.documentoPropietario}
              onChange={(e) =>
                set("documentoPropietario", e.target.value.replace(/\s/g, ""))
              }
              aria-invalid={Boolean(errores.documentoPropietario)}
              className="tabular-nums"
            />
          </Field>
          <Field
            id="fechaExpedicionPropietario"
            label="Fecha de expedición (opcional)"
            hint="Ayuda a desambiguar el documento."
          >
            <Input
              id="fechaExpedicionPropietario"
              type="date"
              value={datos.fechaExpedicionPropietario}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) =>
                set("fechaExpedicionPropietario", e.target.value)
              }
            />
          </Field>
        </div>
      </div>

      <SeccionPersona
        activo={datos.incluirTenedor}
        onToggle={(v) => set("incluirTenedor", v)}
        icono={<User className="size-5" aria-hidden />}
        etiquetaBoton="Agregar tenedor / poseedor"
        titulo="Tenedor / Poseedor"
      >
        <OpcionesPastilla
          name="tipoTenedor"
          etiqueta="Tipo de documento"
          opciones={TIPOS_DOC_PERSONA}
          valor={datos.tipoTenedor}
          onChange={(v) => set("tipoTenedor", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="documentoTenedor"
            label="Número de documento"
            error={errores.tenedorDocumento}
          >
            <Input
              id="documentoTenedor"
              inputMode={datos.tipoTenedor === "PP" ? "text" : "numeric"}
              autoComplete="off"
              value={datos.documentoTenedor}
              onChange={(e) =>
                set("documentoTenedor", e.target.value.replace(/\s/g, ""))
              }
              className="tabular-nums"
            />
          </Field>
          <Field
            id="fechaExpedicionTenedor"
            label="Fecha de expedición (opcional)"
            error={errores.tenedorFechaExpedicion}
          >
            <Input
              id="fechaExpedicionTenedor"
              type="date"
              value={datos.fechaExpedicionTenedor}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set("fechaExpedicionTenedor", e.target.value)}
            />
          </Field>
        </div>
      </SeccionPersona>

      <SeccionPersona
        activo={datos.incluirConductor}
        onToggle={(v) => set("incluirConductor", v)}
        icono={<User className="size-5" aria-hidden />}
        etiquetaBoton="Agregar conductor"
        titulo="Conductor"
      >
        <OpcionesPastilla
          name="tipoConductor"
          etiqueta="Tipo de documento"
          opciones={TIPOS_DOC_PERSONA}
          valor={datos.tipoConductor}
          onChange={(v) => set("tipoConductor", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="documentoConductor"
            label="Número de documento"
            error={errores.conductorDocumento}
          >
            <Input
              id="documentoConductor"
              inputMode={datos.tipoConductor === "PP" ? "text" : "numeric"}
              autoComplete="off"
              value={datos.documentoConductor}
              onChange={(e) =>
                set("documentoConductor", e.target.value.replace(/\s/g, ""))
              }
              className="tabular-nums"
            />
          </Field>
          <Field
            id="fechaExpedicionConductor"
            label="Fecha de expedición (opcional)"
            error={errores.conductorFechaExpedicion}
          >
            <Input
              id="fechaExpedicionConductor"
              type="date"
              value={datos.fechaExpedicionConductor}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) =>
                set("fechaExpedicionConductor", e.target.value)
              }
            />
          </Field>
        </div>
      </SeccionPersona>

      <div
        className={cx(
          "rounded-xl border transition-colors",
          datos.incluirRemolque && "border-primary/40 bg-secondary/30",
        )}
      >
        <label className="flex cursor-pointer items-center gap-4 p-4">
          <span className="bg-brand-deep flex size-10 shrink-0 items-center justify-center rounded-lg text-white">
            <Container className="size-5" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">
              Agregar remolque o tráiler
            </span>
            <span className="text-muted-foreground block text-xs">
              El remolque tiene su propia placa y puede tener otro propietario.
            </span>
          </span>
          <input
            type="checkbox"
            checked={datos.incluirRemolque}
            onChange={(e) => set("incluirRemolque", e.target.checked)}
            className="accent-primary size-5 shrink-0"
          />
        </label>

        {datos.incluirRemolque && (
          <div className="space-y-6 border-t px-4 pt-5 pb-5 sm:px-6">
            <PlacaInput
              id="placaRemolque"
              label="Placa del remolque"
              value={datos.placaRemolque}
              onChange={(v) => set("placaRemolque", v)}
              placeholder="R12345"
              ayuda="Remolque: R12345 · Semirremolque: S12345"
              error={errores.placaRemolque}
              pequena
            />

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={datos.remolqueMismoPropietario}
                onChange={(e) =>
                  set("remolqueMismoPropietario", e.target.checked)
                }
                className="accent-primary size-4"
              />
              El remolque es del mismo propietario del cabezote
            </label>

            {pideDocRemolque && (
              <div className="space-y-5">
                <h3 className="text-sm font-semibold">
                  Propietario del remolque
                </h3>
                <OpcionesPastilla
                  name="tipoPropietarioRemolque"
                  etiqueta="Tipo de documento"
                  opciones={TIPOS_DOC_REMOLQUE}
                  valor={datos.tipoPropietarioRemolque}
                  onChange={(v) => set("tipoPropietarioRemolque", v)}
                />
                <div className="sm:max-w-sm">
                  <Field
                    id="documentoPropietarioRemolque"
                    label="Número de documento"
                    hint="Sin puntos ni espacios."
                    error={errores.documentoPropietarioRemolque}
                  >
                    <Input
                      id="documentoPropietarioRemolque"
                      inputMode="numeric"
                      autoComplete="off"
                      value={datos.documentoPropietarioRemolque}
                      onChange={(e) =>
                        set(
                          "documentoPropietarioRemolque",
                          e.target.value.replace(/\s/g, ""),
                        )
                      }
                      aria-invalid={Boolean(
                        errores.documentoPropietarioRemolque,
                      )}
                      className="tabular-nums"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <label
        className={cx(
          "flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors",
          datos.incluirAntecedentes && "border-primary/40 bg-secondary/30",
        )}
      >
        <span className="bg-brand-deep flex size-10 shrink-0 items-center justify-center rounded-lg text-white">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">
            Incluir consulta de antecedentes
          </span>
          <span className="text-muted-foreground block text-xs">
            Se consultarán los antecedentes del propietario (y del propietario
            del remolque, si lleva). Tenedor y conductor siempre incluyen
            antecedentes.
          </span>
        </span>
        <input
          type="checkbox"
          checked={datos.incluirAntecedentes}
          onChange={(e) => set("incluirAntecedentes", e.target.checked)}
          className="accent-primary size-5 shrink-0"
        />
      </label>

      {resumen.length > 1 && (
        <aside className="bg-muted/30 rounded-xl border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Resumen
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">
            {resumen.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </aside>
      )}

      <Autorizacion
        checked={datos.autorizacion}
        onChange={(v) => set("autorizacion", v)}
        error={errores.autorizacion}
      />

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          La consulta se envía de inmediato. Cada persona y placa consume un
          crédito por separado.
        </p>
        <Button
          type="submit"
          tamano="lg"
          disabled={enviando}
          className="sm:min-w-44"
        >
          {enviando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {enviando ? "Enviando…" : "Enviar consulta"}
        </Button>
      </div>
    </form>
  );
}

function SeccionPersona({
  activo,
  onToggle,
  icono,
  etiquetaBoton,
  titulo,
  children,
}: {
  activo: boolean;
  onToggle: (v: boolean) => void;
  icono: React.ReactNode;
  etiquetaBoton: string;
  titulo: string;
  children: React.ReactNode;
}) {
  if (!activo)
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="text-primary hover:bg-secondary inline-flex items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm font-medium transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        {etiquetaBoton}
      </button>
    );
  return (
    <div className="border-primary/40 bg-secondary/30 space-y-5 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-brand-deep flex size-10 shrink-0 items-center justify-center rounded-lg text-white">
            {icono}
          </span>
          <h3 className="text-sm font-semibold">{titulo}</h3>
        </div>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs"
          title="Quitar"
        >
          <Minus className="size-3.5" aria-hidden />
          Quitar
        </button>
      </div>
      {children}
    </div>
  );
}
