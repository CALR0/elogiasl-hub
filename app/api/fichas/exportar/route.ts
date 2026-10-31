import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizar,
  cuerpoJson,
  json,
  MODULO_FICHAS,
} from "@/lib/fichas/guardia.ts";
import {
  abrirFicha,
  excelDeFichas,
  MAX_FICHAS_EXPORTAR,
  selloArchivo,
} from "@/lib/fichas/servicio.ts";

export const runtime = "nodejs";

/** Excel con dos hojas: Vehículos y Conductores, de las fichas consultadas. */
export async function POST(req: Request) {
  const usuario = await autorizar(req);
  if (usuario instanceof Response) return usuario;

  const tokens = (await cuerpoJson(req))?.fichas;
  const lista = (
    Array.isArray(tokens) ? tokens.slice(0, MAX_FICHAS_EXPORTAR) : []
  )
    .map((t) => abrirFicha(usuario, t))
    .filter((f) => f !== null);
  if (!lista.length)
    return json(
      { error: "No hay datos vigentes para exportar. Consulta de nuevo." },
      400,
    );

  const libro = excelDeFichas(lista);
  await registrarAuditoria({
    actorId: usuario.id,
    actorEmail: usuario.email,
    modulo: MODULO_FICHAS,
    accion: "ficha.exportar",
    detalle: { placas: lista.length },
  });
  return new Response(new Uint8Array(libro), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fichas_vehiculos_${selloArchivo()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
