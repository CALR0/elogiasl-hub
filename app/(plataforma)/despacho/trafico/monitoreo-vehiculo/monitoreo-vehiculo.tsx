"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  MapPin,
  Phone,
  Search,
  Truck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClasses, Select } from "@/components/ui/field";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import {
  descargarPlantilla,
  exportarResultados,
  leerPlacasDeExcel,
} from "@/lib/controlt/excel";
import type { ResultadoConsulta, ViajeResumen } from "@/lib/controlt/tipos";
import { cx, fechaHora } from "@/lib/utils";
import { consultar, type ConsultaEntrada } from "./acciones";

/*
 * Monitoreo vehículo (Despacho › Tráfico). Portado de TVIEWER a la plataforma:
 * la consulta llega a una server action que oculta el token. Dos modos:
 * "Placa" (una o varias separadas por coma) y "Manifiesto / orden".
 * El mapa Leaflet se carga solo del lado cliente.
 */

const Mapa = dynamic(
  () => import("./mapa").then((m) => m.MapaVehiculos),
  { ssr: false, loading: () => <EsqueletoMapa /> },
);

function EsqueletoMapa() {
  return (
    <div className="bg-muted text-muted-foreground flex h-[420px] w-full items-center justify-center rounded-xl border text-sm md:h-[520px] lg:h-[640px]">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="ml-2">Cargando mapa…</span>
    </div>
  );
}

type Tipo = ConsultaEntrada["tipo"];

export function MonitoreoVehiculo() {
  const [tipo, setTipo] = useEstadoSesion<Tipo>("controlt.tipo", "placa");
  const [valor, setValor] = useEstadoSesion("controlt.valor", "");
  const [datos, setDatos] = useEstadoSesion<ResultadoConsulta | null>(
    "controlt.datos",
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [mensajeImport, setMensajeImport] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [exportando, setExportando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    const v = valor.trim();
    if (!v) return;
    setError(null);
    startTransition(async () => {
      const r = await consultar({ tipo, valor: v } as ConsultaEntrada);
      if (r.ok) setDatos(r.datos);
      else {
        setDatos(null);
        setError(r.error);
      }
    });
  }

  async function onImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    setMensajeImport(null);
    try {
      const placas = await leerPlacasDeExcel(archivo);
      if (placas.length === 0) {
        setError(
          "El archivo no tenía placas válidas. Usa la plantilla y llena la columna «placa».",
        );
        return;
      }
      setValor(placas.join(", "));
      setMensajeImport(
        `${placas.length} placa${placas.length === 1 ? "" : "s"} cargada${placas.length === 1 ? "" : "s"} desde el Excel.`,
      );
    } catch (err) {
      console.error("[controlt.import]", err);
      setError("No se pudo leer el Excel. Asegúrate de que es .xlsx o .xls.");
    }
  }

  async function onExportar() {
    if (!datos) return;
    setExportando(true);
    try {
      await exportarResultados(datos);
    } catch (err) {
      console.error("[controlt.export]", err);
      setError("No se pudo exportar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  async function onPlantilla() {
    try {
      await descargarPlantilla();
    } catch (err) {
      console.error("[controlt.plantilla]", err);
      setError("No se pudo generar la plantilla.");
    }
  }

  const vehiculos = datos?.vehiculos ?? [];
  const viajes = datos?.viajes ?? [];
  const hayResultados = vehiculos.length > 0 || viajes.length > 0;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-start xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* Panel de consulta y resumen (en mobile apilado arriba, en md+ a la izquierda) */}
      <aside className="min-w-0 space-y-4">
        <form
          onSubmit={ejecutar}
          className="bg-card space-y-3 rounded-xl border p-4"
        >
          <Field id="tipo" label="Buscar por">
            <Select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              disabled={pendiente}
            >
              <option value="placa">Placa</option>
              <option value="manifiesto">Manifiesto / orden</option>
            </Select>
          </Field>

          <Field
            id="valor"
            label={tipo === "placa" ? "Placas" : "Número"}
            hint={
              tipo === "placa"
                ? "Una o varias placas. Separa con coma, espacio o salto de línea."
                : "Número de manifiesto u orden (ej. 0101220628)."
            }
          >
            {tipo === "placa" ? (
              <textarea
                id="valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={pendiente}
                className={cx(inputClasses, "min-h-24 resize-y py-2 font-mono")}
                spellCheck={false}
                autoComplete="off"
                rows={4}
                placeholder="TUL689, TFR852&#10;ABC123"
              />
            ) : (
              <input
                id="valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={pendiente}
                className={inputClasses}
                spellCheck={false}
                autoComplete="off"
                placeholder="0101220628"
              />
            )}
          </Field>

          <Button type="submit" disabled={pendiente || !valor.trim()}>
            {pendiente ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            {pendiente ? "Consultando…" : "Consultar"}
          </Button>

          {tipo === "placa" && (
            <div className="flex flex-wrap gap-2 border-t pt-3 text-xs">
              <input
                ref={inputArchivo}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={onImportar}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputArchivo.current?.click()}
                disabled={pendiente}
                className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors disabled:opacity-60"
                title="Importar placas desde un archivo Excel"
              >
                <Upload className="size-3.5" aria-hidden />
                Importar Excel
              </button>
              <button
                type="button"
                onClick={onPlantilla}
                className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors"
                title="Descargar una plantilla de Excel para llenar"
              >
                <FileSpreadsheet className="size-3.5" aria-hidden />
                Plantilla
              </button>
              {hayResultados && (
                <button
                  type="button"
                  onClick={onExportar}
                  disabled={exportando}
                  className="text-primary hover:bg-primary/10 ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/30 px-2 py-1 font-medium transition-colors disabled:opacity-60"
                  title="Exportar los resultados a Excel"
                >
                  {exportando ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-3.5" aria-hidden />
                  )}
                  Exportar resultados
                </button>
              )}
            </div>
          )}
          {mensajeImport && (
            <p className="text-primary text-xs">{mensajeImport}</p>
          )}
        </form>

        {error && (
          <div className="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {datos?.aviso && !error && (
          <div className="bg-construccion-bg text-construccion flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
            <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
            {datos.aviso}
          </div>
        )}

        {vehiculos.length > 0 && (
          <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-wider uppercase">
            {vehiculos.length === 1
              ? "Vehículo localizado"
              : `${vehiculos.length} vehículos localizados`}
          </h2>
        )}

        {vehiculos.map((v) => {
          const viaje = viajes.find((j) => j.placa === v.placa);
          return (
            <TarjetaVehiculo
              key={v.placa}
              placa={v.placa}
              direccion={v.direccion}
              ultimoGps={v.fechaGps}
              prestador={v.prestadorGps}
              temperatura={v.temperatura}
              viaje={viaje}
              abiertaPorDefecto={vehiculos.length === 1}
            />
          );
        })}

        {/* Si la consulta por manifiesto trajo viajes pero sin ubicación, igual se muestran */}
        {!vehiculos.length &&
          viajes.map((viaje) => (
            <TarjetaVehiculo
              key={viaje.idMonitoreo || viaje.manifiesto || viaje.placa}
              placa={viaje.placa ?? "Sin placa"}
              direccion={viaje.direccionActual}
              ultimoGps={viaje.ultimoReporteGps}
              prestador={viaje.prestadorGps}
              temperatura={null}
              viaje={viaje}
              abiertaPorDefecto={viajes.length === 1}
            />
          ))}
      </aside>

      {/* Mapa (en mobile debajo del panel; min-w-0 evita que empuje el layout) */}
      <section
        className={cx("min-w-0", !vehiculos.length && "opacity-80")}
      >
        <Mapa vehiculos={vehiculos} viajes={viajes} />
      </section>
    </div>
  );
}

function TarjetaVehiculo({
  placa,
  direccion,
  ultimoGps,
  prestador,
  temperatura,
  viaje,
  abiertaPorDefecto,
}: {
  placa: string;
  direccion: string | null;
  ultimoGps: string | null;
  prestador: string | null;
  temperatura: number | null;
  viaje: ViajeResumen | undefined;
  abiertaPorDefecto: boolean;
}) {
  // Resumen en una línea para cuando la tarjeta está colapsada
  const ruta =
    viaje?.ciudadOrigen && viaje?.ciudadDestino
      ? `${viaje.ciudadOrigen} → ${viaje.ciudadDestino}`
      : viaje?.ruta;

  return (
    <details
      open={abiertaPorDefecto}
      className="bg-card group min-w-0 rounded-xl border p-3 open:p-4"
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 group-open:mb-3">
        <Truck className="text-primary size-4 shrink-0" aria-hidden />
        <span className="font-mono text-sm font-semibold">{placa}</span>
        {viaje?.estado && (
          <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
            {viaje.estado}
          </span>
        )}
        {viaje?.avance !== null && viaje?.avance !== undefined && (
          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
            {viaje.avance}%
          </span>
        )}
        {ruta && (
          <span className="text-muted-foreground min-w-0 truncate text-[11px] group-open:hidden">
            {ruta}
          </span>
        )}
        <ChevronDown
          className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      {/* Ubicación */}
      <section className="space-y-1.5 text-xs">
        <h3 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Ubicación
        </h3>
        {direccion && (
          <p className="flex items-start gap-1.5">
            <MapPin className="text-muted-foreground mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{direccion}</span>
          </p>
        )}
        <Dato etiqueta="Último GPS" valor={ultimoGps ? fechaHora(ultimoGps) : null} />
        <Dato etiqueta="Prestador" valor={prestador} />
        {temperatura !== null && (
          <Dato etiqueta="Temperatura" valor={`${temperatura} °C`} />
        )}
      </section>

      {/* Viaje */}
      {viaje ? (
        <section className="space-y-1.5 border-t pt-3 text-xs">
          <h3 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Viaje
          </h3>
          <Dato
            etiqueta="Manifiesto"
            valor={viaje.manifiesto}
            mono
          />
          {viaje.numeroDespacho && (
            <Dato etiqueta="Despacho" valor={viaje.numeroDespacho} mono />
          )}
          <Dato
            etiqueta="Avance"
            valor={viaje.avance !== null ? `${viaje.avance}%` : null}
          />
          <Dato etiqueta="Ruta" valor={viaje.ruta} />
          <Dato
            etiqueta="Origen"
            valor={viaje.origen ?? viaje.ciudadOrigen}
          />
          <Dato
            etiqueta="Destino"
            valor={viaje.destino ?? viaje.ciudadDestino}
          />
          <Dato etiqueta="Transportador" valor={viaje.transportador} />
          <Dato etiqueta="Cliente" valor={viaje.cliente} />
          <Dato etiqueta="Conductor" valor={viaje.conductor} />
          {viaje.telefonoConductor && (
            <div className="grid grid-cols-[88px_1fr] gap-x-2">
              <span className="text-muted-foreground">Teléfono</span>
              <a
                href={`tel:${viaje.telefonoConductor}`}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <Phone className="size-3" aria-hidden />
                {viaje.telefonoConductor}
              </a>
            </div>
          )}
          <Dato etiqueta="Tipo viaje" valor={viaje.tipoViaje} />
          <Dato etiqueta="Operación" valor={viaje.tipoOperacion} />
          <Dato etiqueta="Último evento" valor={viaje.ultimoEvento} />
          {viaje.novedad && (
            <Dato etiqueta="Novedad" valor={viaje.novedad} resaltar />
          )}
          {viaje.ultimaAlarma && (
            <Dato etiqueta="Alarma" valor={viaje.ultimaAlarma} resaltar />
          )}
          {viaje.cumplimientoCita && (
            <Dato etiqueta="Cita" valor={viaje.cumplimientoCita} />
          )}
          {viaje.comentario && (
            <div className="mt-2 rounded-md bg-muted/70 p-2">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Comentario
              </p>
              <p className="mt-0.5">{viaje.comentario}</p>
            </div>
          )}
          {viaje.observaciones && (
            <div className="mt-2 rounded-md bg-muted/70 p-2">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Observaciones
              </p>
              <p className="mt-0.5">{viaje.observaciones}</p>
            </div>
          )}
        </section>
      ) : (
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs italic">
          Sin manifiesto asignado.
        </p>
      )}
    </details>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  resaltar,
}: {
  etiqueta: string;
  valor: string | null | undefined;
  mono?: boolean;
  resaltar?: boolean;
}) {
  if (!valor) return null;
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-2">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span
        className={cx(
          mono && "font-mono",
          resaltar && "text-destructive font-medium",
        )}
      >
        {valor}
      </span>
    </div>
  );
}
