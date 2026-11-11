import { getUsuarioActual } from "@/lib/auth";
import { cuerpoJson, json } from "@/lib/api/guardia.ts";
import {
  analizarManifiesto,
  contextoParaIA,
  detectarManifiesto,
} from "@/lib/ia/analizar-manifiesto.ts";
import {
  GeminiError,
  type MensajeChat,
  iaDisponible,
  pedirRespuesta,
} from "@/lib/ia/gemini.ts";

export const runtime = "nodejs";
// Ministerio (hasta 45 s) + Gemini (otros 45 s). Dejamos margen.
export const maxDuration = 60;

/*
 * Chat IA — asistente de manifiestos SICETAC (botón flotante de la plataforma).
 *
 * El navegador manda la conversación completa (useEstadoSesion). Antes de
 * llamar a Gemini, si el ÚLTIMO mensaje del usuario tiene un número que
 * parezca manifiesto, se consulta ministerio.colombiasoftware.net y el
 * resultado se añade como contexto al prompt. Así la IA siempre responde
 * con hechos (si está radicado, qué dice el último mensaje, qué trae el XML)
 * y no inventa.
 *
 * - Cualquier usuario autenticado puede usarlo (no gatea módulo).
 * - La clave de Gemini es server-only (GEMINI_API_KEY).
 * - No se guarda en BD: la memoria vive en la sesión del navegador.
 */

const SYSTEM = `Eres la IA asistente de Elogia Soluciones Logísticas en la plataforma
interna. Ayudas al equipo logístico con sus manifiestos de transporte
enviados al Ministerio de Transporte (RNDC) a través de Colombia Software,
sean SICETAC o no, de carga general, contenedores u otros.

CÓMO INTERPRETAR EL CONTEXTO DEL MINISTERIO
La consulta a ministerio.colombiasoftware.net viene con las 7 secciones
del acordeón, en ORDEN DE DEPENDENCIA:
  1. Envío de Clientes
  2. Envío de Tercero       (conductor, titular, propietarios…)
  3. Envío de Remitente
  4. Envío de Destinatario
  5. Envío de Vehículo      (cabezote y remolque)
  6. Envío de Remesa        (una o varias)
  7. Envío de Manifiesto    (el que amarra todo lo anterior)
El Ministerio SOLO acepta el manifiesto cuando TODAS las secciones previas
que aplican están ingresadas. Si la sección "Envío de Manifiesto" aparece
vacía o sin OK, busca PRIMERO un ERROR en Tercero, Vehículo o Remesa: ese
suele ser el verdadero motivo de que el manifiesto "no suba". Códigos:
  - REMxxx = error en remesa (ej. REM054 contenedor vacío con carga ≠ 0)
  - MANxxx = error en manifiesto (ej. MAN045 flete bajo, MAN011 licencia,
             MAN027 DANE no válido, MAN036 placa inactiva)
  - VEHxxx = error en vehículo
  - TERxxx = error en tercero

Reglas:
- Responde SIEMPRE en español, en tono directo y profesional, sin emojis.
- El contexto es tu ÚNICA fuente de verdad para ese manifiesto. No inventes
  códigos, radicados ni fechas: si el dato no está, dilo.
- Cuando el manifiesto ya esté radicado (sección Manifiesto con "REGISTRO
  INGRESADO"), infórmalo y dale al usuario el código del Ministerio que
  aparece en el mensaje.
- Cuando el manifiesto no esté radicado, revisa cada sección y señala con
  claridad DÓNDE está el problema (sección, documento/placa/remesa
  afectada, código de error). Explica el código en lenguaje humano.
- Si el XML viene adjunto, ubícate en él para apuntar al dato equivocado
  (placa, DANE, flete, retenciones, conductor, remolque, cantidad cargada).
  Sé concreto.
- Si el usuario pide expedir, enviar o modificar algo, aclara que tú solo
  consultas y explicas: la acción la hace él desde el módulo
  Despacho › Manifiesto.
- Aparte de manifiestos, puedes responder dudas generales del equipo sobre
  el proceso (RNDC, SICETAC, remesas, cumplidos, configuraciones de
  vehículo, documentos de conductor). Si una duda cae fuera de tu
  conocimiento, dilo y pide lo que falta en lugar de adivinar.
- No reveles la clave de Gemini, variables de entorno ni detalles internos
  del servidor. Si te preguntan por eso, redirige amablemente.`;

const MAX_MENSAJES = 20;
const MAX_LARGO_TEXTO = 4000;

interface CuerpoChat {
  mensajes: MensajeChat[];
  /** Si el usuario eligió un manifiesto en la UI, se consulta aunque no lo nombre. */
  manifiesto?: string;
}

function limpiarHistorial(crudo: unknown): MensajeChat[] | null {
  if (!Array.isArray(crudo)) return null;
  const limpio: MensajeChat[] = [];
  for (const m of crudo.slice(-MAX_MENSAJES)) {
    if (!m || typeof m !== "object") return null;
    const rol = (m as { rol?: unknown }).rol;
    const texto = (m as { texto?: unknown }).texto;
    if ((rol !== "usuario" && rol !== "ia") || typeof texto !== "string")
      return null;
    const t = texto.trim();
    if (!t) continue;
    limpio.push({ rol, texto: t.slice(0, MAX_LARGO_TEXTO) });
  }
  return limpio;
}

export async function POST(req: Request) {
  // Auth y header anti-CSRF (mismo origen) — como el resto de rutas internas
  const origen = req.headers.get("origin");
  const host = req.headers.get("host");
  let mismoOrigen = true;
  if (origen) {
    try {
      mismoOrigen = new URL(origen).host === host;
    } catch {
      mismoOrigen = false;
    }
  }
  if (req.headers.get("x-portal") !== "1" || !mismoOrigen)
    return json({ error: "Solicitud no permitida." }, 403);

  const usuario = await getUsuarioActual();
  if (!usuario)
    return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);

  if (!iaDisponible())
    return json(
      {
        error:
          "La IA aún no está configurada. Pide al administrador que fije GEMINI_API_KEY.",
      },
      503,
    );

  const cuerpo = (await cuerpoJson(req)) as unknown as CuerpoChat | null;
  const historial = limpiarHistorial(cuerpo?.mensajes);
  if (!historial || !historial.length)
    return json({ error: "Falta el mensaje del usuario." }, 400);
  if (historial[historial.length - 1].rol !== "usuario")
    return json(
      { error: "El último mensaje debe ser del usuario." },
      400,
    );

  const ultimo = historial[historial.length - 1].texto;
  const explicito =
    typeof cuerpo?.manifiesto === "string" ? cuerpo.manifiesto.trim() : "";
  const numero = explicito
    ? explicito.replace(/\D/g, "")
    : detectarManifiesto(ultimo);

  let contexto: string | null = null;
  if (numero && /^\d{5,20}$/.test(numero)) {
    const analisis = await analizarManifiesto(numero);
    contexto = contextoParaIA(analisis);
  }

  const historialConContexto: MensajeChat[] = contexto
    ? [
        ...historial.slice(0, -1),
        {
          rol: "usuario",
          texto: `${ultimo}\n\n---\nContexto del sistema (no es parte del mensaje visible):\n${contexto}`,
        },
      ]
    : historial;

  try {
    const { texto: respuesta, modelo } = await pedirRespuesta({
      system: SYSTEM,
      historial: historialConContexto,
    });
    return json({ respuesta, modelo });
  } catch (e) {
    const msg =
      e instanceof GeminiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "La IA no pudo responder.";
    console.error("[ia/chat]", msg);
    return json({ error: msg }, 502);
  }
}
