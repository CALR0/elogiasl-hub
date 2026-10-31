import { autorizar, cuerpoJson, json } from "@/lib/fichas/guardia.ts";
import { abrirFicha, prepararFicha } from "@/lib/fichas/servicio.ts";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

/** La misma ficha del PDF en JSON, para verla en pantalla sin descargar. */
export async function POST(req: Request) {
  const usuario = await autorizar(req);
  if (usuario instanceof Response) return usuario;

  const cuerpo = await cuerpoJson(req);
  const tipo = cuerpo?.tipo;
  const f = abrirFicha(usuario, cuerpo?.ficha);
  if (!f || (tipo !== "vehiculo" && tipo !== "conductor"))
    return json(
      { error: "Ficha no válida o vencida. Consulta de nuevo." },
      400,
    );

  try {
    const p = await prepararFicha(usuario, f, tipo);
    if (!p)
      return json({ error: "La placa no tiene conductor asignado." }, 404);
    const foto = p.foto
      ? `data:image/${p.foto[0] === 0x89 ? "png" : "jpeg"};base64,${p.foto.toString("base64")}`
      : null;
    return json({ ...p.ficha, foto, nombrePdf: p.nombre });
  } catch (e) {
    if (!(e instanceof SilogtranError)) console.error("[fichas/ver]", e);
    return json(
      {
        error:
          e instanceof SilogtranError
            ? e.message
            : "No se pudo cargar la ficha.",
      },
      502,
    );
  }
}
