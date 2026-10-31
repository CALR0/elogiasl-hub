import { autorizar, cuerpoJson, json } from "@/lib/fichas/guardia.ts";
import {
  abrirFicha,
  pdfDeFicha,
  prepararFicha,
} from "@/lib/fichas/servicio.ts";
import { SilogtranError } from "@/lib/silogtran/cliente.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Un PDF por petición (vehículo o conductor); el navegador arma el ZIP. Así
 * ninguna respuesta supera el límite de tamaño de Vercel con muchas placas.
 */
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
    const pdf = await pdfDeFicha(p);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${p.nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (!(e instanceof SilogtranError)) console.error("[fichas/pdf]", e);
    return json(
      {
        error:
          e instanceof SilogtranError
            ? e.message
            : "No se pudo generar el PDF.",
      },
      502,
    );
  }
}
