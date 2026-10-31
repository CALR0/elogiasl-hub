import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar, cuerpoJson, json } from "@/lib/api/guardia.ts";
import { simulaCreacion } from "@/lib/anticipos/aws.ts";
import { normalizarPlanilla } from "@/lib/anticipos/planilla.ts";
import { migrarValor } from "@/lib/anticipos/servicio.ts";
import type { FilaMigracion } from "@/lib/anticipos/tipos.ts";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";

export const runtime = "nodejs";
// Inicio de sesión + firewall + confirmación en SAP de varios anticipos de un consolidado
export const maxDuration = 60;

const MODULO = "financiero.transferencia.migracion-anticipo-sap";

/** Procesa UNA planilla o UN consolidado (el navegador los envía en serie, como en SMA). */
export async function POST(req: Request) {
  const usuario = await autorizar(req, MODULO, "Migración anticipo SAP");
  if (usuario instanceof Response) return usuario;

  const cuerpo = await cuerpoJson(req);
  const tipo = cuerpo?.tipo;
  const valor = String(cuerpo?.valor ?? "").trim();
  if (
    (tipo !== "planilla" && tipo !== "consolidado") ||
    !/^[A-Za-z0-9-]{1,30}$/.test(valor)
  )
    return json({ error: "Planilla o consolidado no válido." }, 400);

  const actor = { id: usuario.id, email: usuario.email };
  let filas: FilaMigracion[];
  try {
    filas = await migrarValor(actor, tipo, valor);
  } catch (e) {
    const conocido = e instanceof SilogtranError;
    if (!conocido) console.error("[anticipos/procesar]", e);
    const error = conocido ? e.message : "Error procesando la solicitud.";
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "anticipo.migrar",
      entidad: tipo,
      entidadId: tipo === "planilla" ? normalizarPlanilla(valor) : valor,
      resultado: "error",
      detalle: { mensaje: error },
    });
    return json({ error }, 502);
  }

  // Una entrada de Auditoría por anticipo procesado, con su payload y la respuesta de SAP
  for (const f of filas) {
    await registrarAuditoria({
      actorId: usuario.id,
      actorEmail: usuario.email,
      modulo: MODULO,
      accion: "anticipo.migrar",
      entidad: "planilla",
      entidadId: f.planilla,
      resultado: f.estado === "Error" ? "error" : "ok",
      detalle: {
        consolidado: f.consolidado,
        estado: f.estado,
        mensaje: f.mensaje,
        http: f.httpStatus,
        ...(f.simulado && { simulado: true }),
        // Si se hizo el POST a AWS: "Duplicado" o simulado nunca envían nada a SAP
        enviado_a_sap: f.enviado,
        // Lo que se encontró en Silogtran y se envió (o se habría enviado) a SAP, y lo que respondió
        ...(f.entrada != null && { payload: f.entrada }),
        ...(f.info && { respuesta: f.info }),
      },
    });
  }
  return json({ filas, simulado: simulaCreacion() });
}
