"use client";

import { useState, useTransition } from "react";
import { Container, LoaderCircle, Send } from "lucide-react";
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
  TIPOS_DOC_PROPIETARIO,
  TIPOS_DOC_REMOLQUE,
  consultaVehiculoSchema,
  erroresPorCampo,
  type TipoDocPropietario,
  type TipoDocRemolque,
} from "@/lib/estudios/schemas";
import { cx } from "@/lib/utils";
import { solicitarVehiculo } from "../acciones";

const VACIO = {
  placa: "",
  tipoPropietario: "CC" as TipoDocPropietario,
  documentoPropietario: "",
  incluirRemolque: false,
  placaRemolque: "",
  remolqueMismoPropietario: false,
  tipoPropietarioRemolque: "CC" as TipoDocRemolque,
  documentoPropietarioRemolque: "",
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
      className="bg-card space-y-7 rounded-2xl border p-5 sm:p-8"
    >
      <PlacaInput
        id="placa"
        label={
          datos.incluirRemolque ? "Placa del cabezote" : "Placa del vehículo"
        }
        value={datos.placa}
        onChange={(v) => set("placa", v)}
        placeholder="ABC123"
        ayuda="Carro o cabezote: ABC123 · Moto: ABC12D"
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
        <div className="sm:max-w-sm">
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
        </div>
      </div>

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
              Lleva remolque o tráiler
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
                      inputMode={
                        datos.tipoPropietarioRemolque === "PP"
                          ? "text"
                          : "numeric"
                      }
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

            <p className="text-muted-foreground text-xs">
              Se hace una consulta combinada: cabezote, remolque y cada
              propietario consumen créditos por separado.
            </p>
          </div>
        )}
      </div>

      <Autorizacion
        checked={datos.autorizacion}
        onChange={(v) => set("autorizacion", v)}
        error={errores.autorizacion}
      />

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          La consulta se envía de inmediato. Tarda alrededor de un minuto.
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
