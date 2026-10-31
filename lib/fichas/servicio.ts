import "server-only";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";
import { abrir, sellar } from "@/lib/silogtran/sello.ts";
import {
  BASE_URL,
  conSilogtran,
  type Actor,
} from "@/lib/silogtran/sesion-servicio.ts";
import { parsearConductor, parsearVehiculo } from "./parser.ts";
import {
  fichaConductor,
  fichaVehiculo,
  formatoFecha,
  generarPdf,
} from "./pdf.ts";
import type {
  FichaGuardada,
  FichaVista,
  ResultadoConsulta,
  TipoFicha,
} from "./tipos.ts";
import { aplanar, crearXlsx, tabla } from "./xlsx.ts";

/*
 * Lógica de Generar ficha técnica (Maestros › Vehículo), portada de las rutas
 * de FVE-C (src/app.js). Cada ficha consultada viaja SELLADA al navegador
 * (cifrada y atada al usuario) y vuelve para PDF, vista o Excel: así no se
 * guarda nada en el servidor y no hay que volver a consultar Silogtran.
 */

const FICHA_TTL_MS = 4 * 60 * 60 * 1000; // una ficha consultada sirve 4 h
export const MAX_FICHAS_EXPORTAR = 300;

interface Sellada {
  u: string;
  consultado: string;
  vehiculo: FichaGuardada;
  conductor: FichaGuardada | null;
}

export const normalizarPlaca = (s: unknown) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const aArchivo = (s: string | undefined) =>
  String(s ?? "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 40) || "SIN_DATO";

const campo = (f: FichaGuardada, k: string) =>
  f.encabezadoPares.find(([e]) => e === k)?.[1] ?? "";

/** Consulta una placa en Silogtran: ficha del vehículo y de su conductor. */
export async function consultarPlaca(
  actor: Actor,
  placa: string,
): Promise<ResultadoConsulta> {
  const leer = () =>
    conSilogtran(actor, async (cli) => {
      const v = parsearVehiculo(await cli.detallePorPlaca(placa), BASE_URL);
      let conductor: FichaGuardada | null = null;
      let conductorError: string | null = null;
      if (v.conductorCodigo) {
        try {
          conductor = parsearConductor(
            await cli.detalleTercero(v.conductorCodigo),
            BASE_URL,
          );
        } catch (e) {
          if (e instanceof SilogtranError && e.sesionExpirada) throw e;
          conductorError =
            e instanceof SilogtranError
              ? e.message
              : "No se pudo leer la ficha del conductor.";
        }
      }
      return { ...v, conductor, conductorError };
    });

  const {
    ficha: vehiculo,
    conductorCodigo,
    conductor,
    conductorError,
  } = await leer();
  const ficha = sellar(
    "ficha",
    {
      u: actor.id,
      consultado: formatoFecha(),
      vehiculo,
      conductor,
    } satisfies Sellada,
    FICHA_TTL_MS,
  );
  return {
    placa: campo(vehiculo, "Placa") || placa,
    conductor: conductor
      ? conductor.nombre || campo(conductor, "Documento")
      : null,
    conductorError:
      conductorError || (conductorCodigo ? null : "Sin conductor asignado"),
    ficha,
  };
}

/** Abre una ficha sellada, solo si pertenece al usuario. */
export function abrirFicha(actor: Actor, token: unknown) {
  const d = abrir<Sellada>("ficha", token);
  return d && d.u === actor.id ? d : null;
}

/** Arma la ficha (vista + foto + nombre del PDF) de un vehículo o conductor. */
export async function prepararFicha(actor: Actor, f: Sellada, tipo: TipoFicha) {
  const datos = f[tipo];
  if (!datos) return null;
  const foto = datos.fotoUrl
    ? await conSilogtran(actor, (cli) => cli.descargarImagen(datos.fotoUrl!))
    : null;
  const placa = campo(f.vehiculo, "Placa");
  const ficha: FichaVista =
    tipo === "vehiculo"
      ? fichaVehiculo(datos, f.consultado)
      : fichaConductor(datos, placa, f.consultado);
  const nombre =
    tipo === "vehiculo"
      ? `ficha_vehiculo_${aArchivo(placa)}.pdf`
      : `ficha_conductor_${aArchivo(campo(datos, "Documento") || campo(datos, "Código"))}.pdf`;
  return { ficha, foto, nombre };
}

export async function pdfDeFicha(
  p: NonNullable<Awaited<ReturnType<typeof prepararFicha>>>,
) {
  return generarPdf([{ ficha: p.ficha, foto: p.foto }]);
}

/** Excel con dos hojas: Vehículos (todos los campos) y Conductores. */
export function excelDeFichas(lista: Sellada[]) {
  const vehiculos = tabla(
    lista.map((f) => aplanar(f.vehiculo, [["Fecha consultada", f.consultado]])),
  );
  const conductores = tabla(
    lista
      .filter((f) => f.conductor)
      .map((f) =>
        aplanar(f.conductor!, [
          ["Placa vehículo", campo(f.vehiculo, "Placa")],
          ["Fecha consultada", f.consultado],
          ["Nombre completo", f.conductor!.nombre || ""],
        ]),
      ),
  );
  return crearXlsx([
    { nombre: "Vehículos", ...vehiculos },
    { nombre: "Conductores", ...conductores },
  ]);
}

/** "AAAAMMDD_HHMM" en hora de Colombia, para nombres de archivo. */
export function selloArchivo() {
  return formatoFecha().replace(/[-:]/g, "").replace(" ", "_").slice(0, 13);
}
