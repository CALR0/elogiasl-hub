"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import type {
  Par,
  ResultadoConsulta,
  Seccion,
  TipoFicha,
} from "@/lib/fichas/tipos";
import { crearZip } from "@/lib/fichas/zip-navegador";
import { cx } from "@/lib/utils";

/*
 * Generar ficha técnica (Maestros › Vehículo), migrado de FVE-C: se ingresan
 * placas, se consultan en serie en Silogtran (una por petición) y se puede
 * ver cada ficha, descargar el ZIP con los PDF o exportar todo a Excel.
 */

interface Fila {
  placa: string;
  estado: "cargando" | "ok" | "error";
  datos?: ResultadoConsulta;
  error?: string;
}

interface Vista {
  titulo: string;
  consultado: string;
  destacados: Par[];
  secciones: Seccion[];
  textoSinFoto: string;
  foto: string | null;
  nombrePdf: string;
}

const POR_PAGINA = 10;
// La cabecera x-portal identifica peticiones de esta página (protección CSRF)
const CABECERAS = { "content-type": "application/json", "x-portal": "1" };

class SesionVencida extends Error {}

async function pedir(url: string, cuerpo: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: CABECERAS,
    body: JSON.stringify(cuerpo),
  });
  if (res.status === 401) {
    // Carga completa (no navegación del cliente): limpia el estado de la página vencida
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", window.location.pathname);
    window.location.assign(login.href);
    throw new SesionVencida();
  }
  return res;
}

async function api<T>(url: string, cuerpo: unknown): Promise<T> {
  const res = await pedir(url, cuerpo);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error inesperado.");
  return data as T;
}

async function archivo(url: string, cuerpo: unknown) {
  const res = await pedir(url, cuerpo);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo generar el archivo.");
  }
  const nombre =
    /filename="([^"]+)"/.exec(
      res.headers.get("content-disposition") || "",
    )?.[1] || "archivo";
  return { nombre, datos: new Uint8Array(await res.arrayBuffer()) };
}

function guardarArchivo(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

const normalizar = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function selloArchivo() {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}`;
}

export function GeneradorFichas() {
  const [placas, setPlacas] = useEstadoSesion<string[]>("fichas.placas", []);
  const [texto, setTexto] = useEstadoSesion("fichas.texto", "");
  const [filas, setFilas] = useEstadoSesion<Fila[]>("fichas.filas", []);
  const [consultando, setConsultando] = useEstadoSesion(
    "fichas.consultando",
    false,
  );
  const [descarga, setDescarga] = useState<string | null>(null);
  const [aviso, setAviso] = useEstadoSesion<string | undefined>(
    "fichas.aviso",
    undefined,
  );
  const [visor, setVisor] = useState<Fila | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const { ancla, visibles, reiniciar, props } = usePaginacion(
    filas,
    POR_PAGINA,
    "fichas",
  );

  const encontradas = filas.filter((f) => f.estado === "ok");
  const errores = filas.filter((f) => f.estado === "error").length;
  const pendientes = filas.filter((f) => f.estado === "cargando").length;
  const ocupado = consultando || descarga !== null;

  function agregar(valor: string) {
    const nuevas = valor
      .split(/[\s,;]+/)
      .map(normalizar)
      .filter(Boolean);
    if (nuevas.length)
      setPlacas((p) => [...p, ...nuevas.filter((n) => !p.includes(n))]);
  }

  async function consultar() {
    const lote = [
      ...placas,
      ...texto
        .split(/[\s,;]+/)
        .map(normalizar)
        .filter(Boolean),
    ].filter((p, i, a) => a.indexOf(p) === i);
    if (!lote.length || consultando) return;
    setPlacas([]);
    setTexto("");
    setAviso(undefined);
    setConsultando(true);
    // Cada consulta muestra solo sus placas
    setFilas(lote.map((placa) => ({ placa, estado: "cargando" })));
    reiniciar();

    const actualizar = (i: number, fila: Partial<Fila>) =>
      setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...fila } : f)));

    // En serie, una placa por petición (Silogtran guarda estado por sesión)
    for (let i = 0; i < lote.length; i++) {
      try {
        const datos = await api<ResultadoConsulta>("/api/fichas/consultar", {
          placa: lote[i],
        });
        actualizar(i, { estado: "ok", datos });
      } catch (e) {
        if (e instanceof SesionVencida) return;
        actualizar(i, { estado: "error", error: (e as Error).message });
      }
    }
    setConsultando(false);
  }

  async function descargarZip() {
    if (!encontradas.length || ocupado) return;
    setAviso(undefined);
    const total = encontradas.reduce(
      (n, f) => n + (f.datos!.conductor ? 2 : 1),
      0,
    );
    let hechos = 0;
    const entradas: { nombre: string; datos: Uint8Array }[] = [];
    try {
      for (const f of encontradas) {
        const carpeta = normalizar(f.datos!.placa || f.placa);
        const tipos: TipoFicha[] = f.datos!.conductor
          ? ["vehiculo", "conductor"]
          : ["vehiculo"];
        for (const tipo of tipos) {
          setDescarga(`Generando ${++hechos}/${total}…`);
          const pdf = await archivo("/api/fichas/pdf", {
            ficha: f.datos!.ficha,
            tipo,
          });
          entradas.push({
            nombre: `${carpeta}/${pdf.nombre}`,
            datos: pdf.datos,
          });
        }
      }
      guardarArchivo(
        crearZip(entradas),
        encontradas.length === 1
          ? `ficha_${normalizar(encontradas[0].datos!.placa)}_${selloArchivo()}.zip`
          : `fichas_vehiculos_${selloArchivo()}.zip`,
      );
    } catch (e) {
      if (!(e instanceof SesionVencida)) setAviso((e as Error).message);
    } finally {
      setDescarga(null);
    }
  }

  async function exportarExcel() {
    if (!encontradas.length || ocupado) return;
    setAviso(undefined);
    setDescarga("excel");
    try {
      const x = await archivo("/api/fichas/exportar", {
        fichas: encontradas.map((f) => f.datos!.ficha),
      });
      guardarArchivo(
        new Blob([x.datos as Uint8Array<ArrayBuffer>], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        x.nombre,
      );
    } catch (e) {
      if (!(e instanceof SesionVencida)) setAviso((e as Error).message);
    } finally {
      setDescarga(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Entrada de placas */}
      <section className="bg-card rounded-xl border p-5">
        <label htmlFor="placa" className="text-sm font-medium">
          Placas a consultar
        </label>
        <div
          onClick={() => entrada.current?.focus()}
          className="border-input focus-within:border-primary mt-1.5 flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors"
        >
          {placas.map((p) => (
            <span
              key={p}
              className="bg-secondary text-accent-foreground inline-flex h-7 items-center gap-1 rounded-md pr-1 pl-2.5 text-sm font-medium tracking-wide"
            >
              {p}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPlacas((prev) => prev.filter((x) => x !== p));
                }}
                aria-label={`Quitar ${p}`}
                className="hover:bg-background/60 flex size-5 items-center justify-center rounded"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={entrada}
            id="placa"
            value={texto}
            disabled={consultando}
            autoComplete="off"
            spellCheck={false}
            placeholder={placas.length ? "" : "Ej.: ABC123"}
            onChange={(e) => {
              const v = e.target.value;
              // Separadores que llegan como texto (pegar, teclados móviles, dictado)
              if (/[\s,;]/.test(v)) {
                const partes = v.split(/[\s,;]+/);
                setTexto(partes.pop() ?? "");
                agregar(partes.join(" "));
              } else setTexto(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (texto.trim()) {
                  agregar(texto);
                  setTexto("");
                } else void consultar();
              } else if (e.key === "Backspace" && !texto && placas.length) {
                setPlacas((p) => p.slice(0, -1));
              }
            }}
            className="placeholder:text-muted-foreground/70 h-8 min-w-24 flex-1 bg-transparent px-1 text-sm uppercase outline-none"
          />
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Escribe o pega varias placas separadas por espacio, coma o Enter.
          </p>
          <Button
            onClick={() => void consultar()}
            disabled={consultando || (!placas.length && !texto.trim())}
          >
            {consultando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            {consultando ? "Consultando…" : "Consultar"}
          </Button>
        </div>
      </section>

      {/* Resultados */}
      {filas.length > 0 && (
        <section aria-labelledby="titulo-resultados" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="titulo-resultados" className="font-semibold tracking-tight">
              Resultados
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {encontradas.length} encontrada
                {encontradas.length === 1 ? "" : "s"}
                {errores > 0 &&
                  ` · ${errores} con error o no encontrada${errores === 1 ? "" : "s"}`}
                {pendientes > 0 && ` · ${pendientes} en proceso`}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variante="fantasma"
                onClick={() => setFilas([])}
                disabled={ocupado}
              >
                <Trash2 className="size-4" aria-hidden />
                Limpiar
              </Button>
              <Button
                variante="secundario"
                onClick={() => void exportarExcel()}
                disabled={!encontradas.length || pendientes > 0 || ocupado}
              >
                {descarga === "excel" ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="size-4" aria-hidden />
                )}
                Excel
              </Button>
              <Button
                onClick={() => void descargarZip()}
                disabled={!encontradas.length || pendientes > 0 || ocupado}
              >
                {descarga && descarga !== "excel" ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                {descarga && descarga !== "excel"
                  ? descarga
                  : `Descargar ZIP${encontradas.length > 1 ? ` (${encontradas.length})` : ""}`}
              </Button>
            </div>
          </div>

          {aviso && <Aviso tipo="error">{aviso}</Aviso>}

          <ul
            ref={ancla as React.Ref<HTMLUListElement>}
            className="bg-card divide-y overflow-hidden rounded-xl border"
          >
            {visibles.map((f) => {
              const n = filas.indexOf(f) + 1;
              return (
                <li
                  key={`${n}-${f.placa}`}
                  className="flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                    {n}
                  </span>
                  <span className="w-20 shrink-0 font-semibold tracking-wide">
                    {f.datos?.placa || f.placa}
                  </span>
                  {/* Texto completo al pasar el mouse (en pantallas angostas se recorta) */}
                  <span
                    title={f.estado === "error" ? f.error : undefined}
                    className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
                  >
                    {f.estado === "ok" &&
                      (f.datos!.conductor
                        ? `Conductor: ${f.datos!.conductor}`
                        : f.datos!.conductorError || "Sin conductor asignado")}
                    {f.estado === "error" && f.error}
                  </span>
                  {f.estado === "ok" && (
                    <button
                      type="button"
                      onClick={() => setVisor(f)}
                      aria-label={`Ver ficha de ${f.placa}`}
                      title="Ver ficha"
                      className="text-muted-foreground hover:bg-secondary hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                    >
                      <Eye className="size-4" aria-hidden />
                    </button>
                  )}
                  <EstadoFila fila={f} />
                </li>
              );
            })}
          </ul>
          <Paginacion {...props} etiqueta="placas" singular="placa" />
        </section>
      )}

      {visor?.datos && (
        <VisorFicha fila={visor} onCerrar={() => setVisor(null)} />
      )}
    </div>
  );
}

function EstadoFila({ fila }: { fila: Fila }) {
  if (fila.estado === "cargando")
    return (
      // Solo el ícono: el botón "Consultando…" ya lo dice (el texto queda para lectores de pantalla)
      <span
        role="status"
        className="text-muted-foreground inline-flex shrink-0 items-center px-2"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span className="sr-only">Consultando</span>
      </span>
    );
  if (fila.estado === "ok")
    return (
      <span className="bg-secondary text-accent-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
        <CircleCheck className="size-3" aria-hidden />
        Encontrada
      </span>
    );
  const noExiste = /no existe/i.test(fila.error || "");
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        noExiste
          ? "bg-muted text-muted-foreground"
          : "bg-destructive/8 text-destructive",
      )}
    >
      <CircleAlert className="size-3" aria-hidden />
      {noExiste ? "No encontrada" : "Error"}
    </span>
  );
}

/** Ver la ficha en pantalla (vehículo / conductor) y descargar su PDF. */
function VisorFicha({ fila, onCerrar }: { fila: Fila; onCerrar: () => void }) {
  const datos = fila.datos!;
  const [tipo, setTipo] = useState<TipoFicha>("vehiculo");
  const [vistas, setVistas] = useState<Partial<Record<TipoFicha, Vista>>>({});
  const [error, setError] = useState<string>();
  const [generando, setGenerando] = useState(false);
  const pedidas = useRef(new Set<TipoFicha>());

  function cargar(t: TipoFicha) {
    setTipo(t);
    setError(undefined);
    if (pedidas.current.has(t)) return;
    pedidas.current.add(t);
    api<Vista>("/api/fichas/ver", { ficha: datos.ficha, tipo: t })
      .then((v) => setVistas((prev) => ({ ...prev, [t]: v })))
      .catch((e) => {
        pedidas.current.delete(t);
        if (!(e instanceof SesionVencida)) setError((e as Error).message);
      });
  }
  // Primera carga: la ficha del vehículo (los estados se fijan al llegar la respuesta)
  useEffect(() => {
    pedidas.current.add("vehiculo");
    api<Vista>("/api/fichas/ver", { ficha: datos.ficha, tipo: "vehiculo" })
      .then((v) => setVistas((prev) => ({ ...prev, vehiculo: v })))
      .catch((e) => {
        pedidas.current.delete("vehiculo");
        if (!(e instanceof SesionVencida)) setError((e as Error).message);
      });
  }, [datos.ficha]);

  async function descargarPdf() {
    setGenerando(true);
    try {
      const pdf = await archivo("/api/fichas/pdf", {
        ficha: datos.ficha,
        tipo,
      });
      guardarArchivo(
        new Blob([pdf.datos as Uint8Array<ArrayBuffer>], {
          type: "application/pdf",
        }),
        pdf.nombre,
      );
    } catch (e) {
      if (!(e instanceof SesionVencida)) setError((e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  const vista = vistas[tipo];
  const pestanas: { t: TipoFicha; texto: string; deshabilitada: boolean }[] = [
    { t: "vehiculo", texto: "Vehículo", deshabilitada: false },
    { t: "conductor", texto: "Conductor", deshabilitada: !datos.conductor },
  ];

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo={`Ficha ${datos.placa}`}
    >
      <div
        role="tablist"
        aria-label="Tipo de ficha"
        className="bg-muted mb-5 inline-flex rounded-lg p-1"
      >
        {pestanas.map(({ t, texto, deshabilitada }) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tipo === t}
            disabled={deshabilitada}
            title={deshabilitada ? "Sin conductor asignado" : undefined}
            onClick={() => cargar(t)}
            className={cx(
              "h-8 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              tipo === t
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {texto}
          </button>
        ))}
      </div>

      {error && (
        <Aviso tipo="error" className="mb-4">
          {error}
        </Aviso>
      )}

      {!vista && !error && (
        <p
          className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Cargando ficha del {tipo === "vehiculo" ? "vehículo" : "conductor"}…
        </p>
      )}

      {vista && (
        <div className="animate-aparecer space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-tight">
              {vista.titulo}
            </h3>
            <span className="text-muted-foreground text-xs">
              Fecha consultada: {vista.consultado}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
            <figure className="bg-muted text-muted-foreground flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl text-sm italic md:aspect-auto md:min-h-44">
              {vista.foto &&
              /^data:image\/(jpeg|png);base64,/.test(vista.foto) ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagen en data URL, sin optimizar
                <img
                  src={vista.foto}
                  alt={vista.titulo}
                  className="h-full w-full object-cover"
                />
              ) : (
                vista.textoSinFoto
              )}
            </figure>
            <Campos pares={vista.destacados} columnas={1} />
          </div>
          {vista.secciones
            .filter(([, pares]) => pares.length)
            .map(([titulo, pares]) => (
              <section key={titulo}>
                <h4 className="bg-primary text-primary-foreground rounded-t-lg px-3 py-1.5 text-sm font-semibold">
                  {titulo}
                </h4>
                <Campos pares={pares} columnas={2} />
              </section>
            ))}
        </div>
      )}

      <div className="bg-card sticky -bottom-6 -mx-6 mt-6 flex justify-end gap-2 border-t px-6 py-4">
        <Button variante="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
        <Button
          onClick={() => void descargarPdf()}
          disabled={!vista || generando}
        >
          {generando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Descargar PDF
        </Button>
      </div>
    </Dialogo>
  );
}

function Campos({ pares, columnas }: { pares: Par[]; columnas: 1 | 2 }) {
  return (
    <dl
      className={cx(
        "grid overflow-hidden rounded-b-lg border text-sm",
        columnas === 2 ? "sm:grid-cols-2" : "rounded-t-lg",
      )}
    >
      {pares.map(([etq, val], i) => (
        <div
          key={`${etq}-${i}`}
          className="grid grid-cols-[40%_60%] border-b last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
        >
          <dt className="bg-muted/60 text-muted-foreground px-3 py-2 text-xs font-medium">
            {etq}
          </dt>
          <dd className="px-3 py-2 break-words">
            {val?.trim() ? (
              val
            ) : (
              <span className="text-muted-foreground italic">
                (Sin información)
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
