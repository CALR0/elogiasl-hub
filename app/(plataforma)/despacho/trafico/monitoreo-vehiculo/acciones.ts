"use server";

import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { requirePermiso } from "@/lib/auth";
import { ControlTError, normalizarPlacas } from "@/lib/controlt/cliente";
import {
  consultarPorManifiesto,
  consultarPorPlaca,
  controltConfigurado,
} from "@/lib/controlt/sesion-servicio";
import type { ResultadoConsulta } from "@/lib/controlt/tipos";

const MODULO = "despacho.trafico.monitoreo-vehiculo";

const EntradaPlaca = z.object({
  tipo: z.literal("placa"),
  valor: z.string().min(5).max(120),
});
const EntradaManifiesto = z.object({
  tipo: z.literal("manifiesto"),
  valor: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/),
});
const Entrada = z.discriminatedUnion("tipo", [
  EntradaPlaca,
  EntradaManifiesto,
]);

export type ConsultaEntrada = z.infer<typeof Entrada>;
export type ConsultaResultado =
  | { ok: true; datos: ResultadoConsulta }
  | { ok: false; error: string };

/**
 * Consulta una placa (o varias separadas por coma) o un manifiesto / orden
 * en Control T. El token Bearer se gestiona en el servidor; el cliente nunca
 * lo ve. Cada consulta se audita.
 */
export async function consultar(
  entrada: ConsultaEntrada,
): Promise<ConsultaResultado> {
  const usuario = await requirePermiso(MODULO);
  const parse = Entrada.safeParse(entrada);
  if (!parse.success) {
    return { ok: false, error: "Datos de consulta inválidos." };
  }
  const datos = parse.data;

  if (!controltConfigurado()) {
    return {
      ok: false,
      error:
        "La cuenta de servicio de Control T no está configurada en el servidor.",
    };
  }

  try {
    let resultado: ResultadoConsulta;
    if (datos.tipo === "placa") {
      const placas = normalizarPlacas(datos.valor);
      if (!placas.length) {
        return {
          ok: false,
          error:
            "Escribe al menos una placa válida (5–8 caracteres, letras y números).",
        };
      }
      resultado = await consultarPorPlaca(placas);
    } else {
      resultado = await consultarPorManifiesto(datos.valor);
    }

    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "trafico.consultar",
      entidad: datos.tipo,
      entidadId: datos.valor,
      resultado: "ok",
      detalle: {
        vehiculos: resultado.vehiculos.length,
        viajes: resultado.viajes.length,
      },
    });
    return { ok: true, datos: resultado };
  } catch (e) {
    const mensaje =
      e instanceof ControlTError
        ? e.message
        : "No fue posible consultar Control T.";
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "trafico.consultar",
      entidad: datos.tipo,
      entidadId: datos.valor,
      resultado: "error",
      detalle: { mensaje },
    });
    if (!(e instanceof ControlTError)) console.error("[controlt]", e);
    return { ok: false, error: mensaje };
  }
}
