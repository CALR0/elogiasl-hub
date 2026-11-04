"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requirePermiso } from "@/lib/auth";
import {
  consultaDocumentoSchema,
  consultaVehiculoSchema,
  erroresPorCampo,
} from "@/lib/estudios/schemas";
import {
  crearSolicitud,
  entradaDocumento,
  entradaVehiculo,
} from "@/lib/estudios/procesar";

const MODULO = "estudios.solicitar";

export type Resultado<T extends Record<string, unknown> = Record<string, never>> =
  | { ok: true; datos: T }
  | { ok: false; error: string; campos?: Record<string, string> };

type DatosSalida = { numero: number; id: string; simulada: boolean };

/** Solicita un estudio de documento (persona o empresa). */
export async function solicitarDocumento(
  entrada: unknown,
): Promise<Resultado<DatosSalida>> {
  const usuario = await requirePermiso(MODULO);
  const parse = consultaDocumentoSchema.safeParse(entrada);
  if (!parse.success) {
    return {
      ok: false,
      error: "Revisa los datos del formulario.",
      campos: erroresPorCampo(parse.error),
    };
  }
  try {
    const salida = await crearSolicitud(
      usuario.id,
      entradaDocumento(parse.data),
    );
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.solicitar",
      entidad: "estudio",
      entidadId: String(salida.numero),
      resultado: "ok",
      detalle: {
        tipo: parse.data.tipo,
        modulo: "documento",
        simulada: salida.simulada,
      },
    });
    revalidatePath("/estudios/mis-solicitudes");
    revalidatePath("/estudios/verificar");
    return { ok: true, datos: salida };
  } catch (e) {
    const mensaje =
      e instanceof Error ? e.message : "No fue posible enviar la solicitud.";
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.solicitar",
      resultado: "error",
      detalle: { mensaje, tipo: (parse.data as { tipo: string }).tipo },
    });
    return { ok: false, error: mensaje };
  }
}

/** Solicita un estudio de vehículo (placa + propietario). */
export async function solicitarVehiculo(
  entrada: unknown,
): Promise<Resultado<DatosSalida>> {
  const usuario = await requirePermiso(MODULO);
  const parse = consultaVehiculoSchema.safeParse(entrada);
  if (!parse.success) {
    return {
      ok: false,
      error: "Revisa los datos del formulario.",
      campos: erroresPorCampo(parse.error),
    };
  }
  try {
    const salida = await crearSolicitud(
      usuario.id,
      entradaVehiculo(parse.data),
    );
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.solicitar",
      entidad: "estudio",
      entidadId: String(salida.numero),
      resultado: "ok",
      detalle: {
        placa: parse.data.placa,
        modulo: "vehiculo",
        remolque: parse.data.incluirRemolque ? parse.data.placaRemolque : null,
        simulada: salida.simulada,
      },
    });
    revalidatePath("/estudios/mis-solicitudes");
    revalidatePath("/estudios/verificar");
    return { ok: true, datos: salida };
  } catch (e) {
    const mensaje =
      e instanceof Error ? e.message : "No fue posible enviar la solicitud.";
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "estudio.solicitar",
      resultado: "error",
      detalle: { mensaje },
    });
    return { ok: false, error: mensaje };
  }
}
