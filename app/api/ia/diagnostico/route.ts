import { getUsuarioActual } from "@/lib/auth";
import { json } from "@/lib/api/guardia.ts";
import { cascadaModelos, iaDisponible, listarModelos } from "@/lib/ia/gemini.ts";

export const runtime = "nodejs";

/**
 * GET /api/ia/diagnostico
 *
 * Devuelve qué modelos puede usar la API key de Gemini configurada y en qué
 * orden los probamos. Útil cuando el chat responde "ninguno de los modelos
 * probados" para saber qué tiene disponible la cuenta. Requiere sesión (no
 * se expone sin login).
 */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario) return json({ error: "Sin sesión." }, 401);
  if (!iaDisponible())
    return json(
      { error: "Falta GEMINI_API_KEY en el servidor." },
      503,
    );
  const r = await listarModelos();
  if (!r.ok) return json({ ok: false, error: r.error }, 502);
  const generadores = r.modelos
    .filter((m) => m.generaContenido)
    .map((m) => m.nombre);
  return json({
    ok: true,
    cascadaProbada: cascadaModelos(),
    modelosDisponibles: generadores,
    nota:
      generadores.length === 0
        ? "Tu API key no tiene ningún modelo que soporte generateContent."
        : `Pon alguno de estos en GEMINI_MODELO si la cascada no acierta.`,
  });
}
