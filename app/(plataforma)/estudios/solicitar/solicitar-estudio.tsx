"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import {
  TIPOS_DOCUMENTO,
  TIPOS_DOC_PROPIETARIO,
  type TipoDocumentoFormulario,
  type TipoDocPropietario,
} from "@/lib/estudios/schemas";
import { solicitarDocumento, solicitarVehiculo } from "./acciones";

type Vista = "documento" | "vehiculo";

interface EstadoFormulario {
  tipoDoc: TipoDocumentoFormulario;
  documento: string;
  nombre: string;
  fechaExpedicion: string;
  placa: string;
  tipoPropietario: TipoDocPropietario;
  documentoPropietario: string;
  autorizacion: boolean;
}

const INICIAL: EstadoFormulario = {
  tipoDoc: "CC",
  documento: "",
  nombre: "",
  fechaExpedicion: "",
  placa: "",
  tipoPropietario: "CC",
  documentoPropietario: "",
  autorizacion: false,
};

export function SolicitarEstudio() {
  const [vista, setVista] = useEstadoSesion<Vista>(
    "estudios.solicitar.vista",
    "documento",
  );
  const [datos, setDatos] = useState<EstadoFormulario>(INICIAL);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{
    tono: "ok" | "error";
    texto: string;
  } | null>(null);
  const [procesando, startTransition] = useTransition();

  function set<K extends keyof EstadoFormulario>(
    campo: K,
    valor: EstadoFormulario[K],
  ) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: "" }));
  }

  function limpiar() {
    setDatos(INICIAL);
    setErrores({});
  }

  function enviar() {
    setAviso(null);
    startTransition(async () => {
      let resultado;
      if (vista === "documento") {
        const payload = armarDocumento(datos);
        resultado = await solicitarDocumento(payload);
      } else {
        resultado = await solicitarVehiculo({
          placa: datos.placa,
          tipoPropietario: datos.tipoPropietario,
          documentoPropietario: datos.documentoPropietario,
          autorizacion: datos.autorizacion,
        });
      }
      if (!resultado.ok) {
        setErrores(resultado.campos ?? {});
        setAviso({ tono: "error", texto: resultado.error });
        return;
      }
      setAviso({
        tono: "ok",
        texto: `Solicitud SOL-${String(resultado.datos.numero).padStart(6, "0")} enviada.`,
      });
      limpiar();
    });
  }

  const requiereFecha = vista === "documento" &&
    (datos.tipoDoc === "CE" || datos.tipoDoc === "PPT");
  const requiereNombre = vista === "documento" && datos.tipoDoc === "PP";

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        className="bg-muted/40 inline-flex rounded-xl border p-1 text-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={vista === "documento"}
          onClick={() => {
            setVista("documento");
            limpiar();
          }}
          className={tabClass(vista === "documento")}
        >
          Documento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "vehiculo"}
          onClick={() => {
            setVista("vehiculo");
            limpiar();
          }}
          className={tabClass(vista === "vehiculo")}
        >
          Vehículo
        </button>
      </div>

      {aviso && (
        <Aviso tipo={aviso.tono}>
          {aviso.texto}
          {aviso.tono === "ok" && (
            <>
              {" "}
              <Link
                href="/estudios/mis-solicitudes"
                className="underline underline-offset-2"
              >
                Ver mis solicitudes
              </Link>
              .
            </>
          )}
        </Aviso>
      )}

      <div className="bg-card rounded-xl border p-5 sm:p-6">
        {vista === "documento" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="tipoDoc"
              label="Tipo de documento"
              error={errores.tipo}
            >
              <Select
                id="tipoDoc"
                value={datos.tipoDoc}
                onChange={(e) =>
                  set("tipoDoc", e.target.value as TipoDocumentoFormulario)
                }
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.largo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="documento"
              label={
                datos.tipoDoc === "NIT"
                  ? "NIT (sin dígito de verificación)"
                  : datos.tipoDoc === "PP"
                    ? "Número de pasaporte"
                    : "Número de documento"
              }
              error={errores.documento}
            >
              <Input
                id="documento"
                value={datos.documento}
                onChange={(e) => set("documento", e.target.value)}
                placeholder="Solo números"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            {requiereFecha && (
              <Field
                id="fechaExpedicion"
                label="Fecha de expedición"
                error={errores.fechaExpedicion}
              >
                <Input
                  id="fechaExpedicion"
                  type="date"
                  value={datos.fechaExpedicion}
                  onChange={(e) => set("fechaExpedicion", e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </Field>
            )}
            {requiereNombre && (
              <Field
                id="nombre"
                label="Nombre completo del titular"
                error={errores.nombre}
              >
                <Input
                  id="nombre"
                  value={datos.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  placeholder="Como figura en el pasaporte"
                  autoComplete="off"
                />
              </Field>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="placa" label="Placa del vehículo" error={errores.placa}>
              <Input
                id="placa"
                value={datos.placa}
                onChange={(e) =>
                  set("placa", e.target.value.toUpperCase().slice(0, 6))
                }
                placeholder="ABC123 o ABC12D"
                autoComplete="off"
                maxLength={6}
              />
            </Field>
            <Field
              id="tipoPropietario"
              label="Tipo de documento del propietario"
            >
              <Select
                id="tipoPropietario"
                value={datos.tipoPropietario}
                onChange={(e) =>
                  set(
                    "tipoPropietario",
                    e.target.value as TipoDocPropietario,
                  )
                }
              >
                {TIPOS_DOC_PROPIETARIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.largo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="documentoPropietario"
              label="Documento del propietario"
              error={errores.documentoPropietario}
            >
              <Input
                id="documentoPropietario"
                value={datos.documentoPropietario}
                onChange={(e) =>
                  set("documentoPropietario", e.target.value)
                }
                placeholder="Solo números"
                inputMode="numeric"
              />
            </Field>
          </div>
        )}

        <label
          className="mt-5 flex cursor-pointer items-start gap-2 text-sm"
          htmlFor="autorizacion"
        >
          <input
            id="autorizacion"
            type="checkbox"
            className="mt-0.5 size-4"
            checked={datos.autorizacion}
            onChange={(e) => set("autorizacion", e.target.checked)}
          />
          <span>
            Declaro que cuento con la autorización del titular para consultar
            sus datos personales, conforme a la Ley 1581 de 2012 (Habeas Data).
          </span>
        </label>
        {errores.autorizacion && (
          <p className="text-destructive mt-1 text-xs">
            {errores.autorizacion}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variante="secundario"
            onClick={limpiar}
            disabled={procesando}
          >
            Limpiar
          </Button>
          <Button type="button" onClick={enviar} disabled={procesando}>
            {procesando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : aviso?.tono === "ok" ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Enviar solicitud
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Las consultas se procesan en <strong>modo simulado</strong> mientras se
        conecta la API real. Los resultados aparecen inmediatamente en la
        bandeja del verificador.
      </p>
    </div>
  );
}

function armarDocumento(d: EstadoFormulario) {
  const base = {
    autorizacion: d.autorizacion,
    documento: d.documento,
  };
  switch (d.tipoDoc) {
    case "CC":
      return { tipo: "CC", ...base };
    case "NIT":
      return { tipo: "NIT", ...base };
    case "CE":
      return { tipo: "CE", ...base, fechaExpedicion: d.fechaExpedicion };
    case "PPT":
      return { tipo: "PPT", ...base, fechaExpedicion: d.fechaExpedicion };
    case "PP":
      return { tipo: "PP", ...base, nombre: d.nombre };
  }
}

function tabClass(activo: boolean) {
  return [
    "rounded-lg px-4 py-1.5 font-medium transition-colors",
    activo
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}
