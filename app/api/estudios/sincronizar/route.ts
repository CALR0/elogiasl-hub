import { autorizar, json } from "@/lib/api/guardia.ts";
import { sincronizarPendientes } from "@/lib/estudios/procesar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Pregunta a TusDatos por las consultas en proceso. La llaman las pantallas de
 * Estudios mientras haya pendientes. Solo devuelve conteos: quien solicita nunca
 * recibe resultados. Basta con tener acceso a algo de Estudios.
 */
export async function POST(req: Request) {
  const usuario = await autorizar(req, "estudios", "Estudios");
  if (usuario instanceof Response) return usuario;
  try {
    return json(
      await sincronizarPendientes({ id: usuario.id, email: usuario.email }),
    );
  } catch (e) {
    console.error("[estudios/sincronizar]", e);
    return json({ error: "No se pudo actualizar el estado." }, 502);
  }
}
