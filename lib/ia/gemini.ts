import "server-only";

/*
 * Cliente mínimo de Gemini (generativelanguage.googleapis.com) por REST.
 * No se mete el SDK oficial para no agregar dependencias: una sola llamada
 * POST a /v1beta/models/<modelo>:generateContent con la clave en query.
 *
 * La clave está en GEMINI_API_KEY (server-only). Si no está definida, las
 * funciones que llaman devuelven un mensaje legible y nunca intentan salir
 * a internet.
 */

export const GEMINI_MODELO = process.env.GEMINI_MODELO || "gemini-2.0-flash";

export interface MensajeChat {
  rol: "usuario" | "ia";
  texto: string;
}

export class GeminiError extends Error {}

interface Parte {
  text: string;
}
interface Contenido {
  role: "user" | "model";
  parts: Parte[];
}
interface Respuesta {
  candidates?: {
    content?: { parts?: Parte[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/** ¿Está configurada la IA? (si no, el chat se oculta en el navegador). */
export function iaDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Envía la conversación a Gemini y devuelve el texto de la respuesta. El
 * `system` guía el estilo; el `historial` es la conversación completa (la
 * última entrada del historial es el mensaje del usuario a responder).
 */
export async function pedirRespuesta({
  system,
  historial,
}: {
  system: string;
  historial: MensajeChat[];
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    throw new GeminiError(
      "La IA no está configurada (falta GEMINI_API_KEY en el servidor).",
    );

  const contents: Contenido[] = historial.map((m) => ({
    role: m.rol === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODELO)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini respondió HTTP ${res.status}. ${cuerpo.slice(0, 300)}`.trim(),
    );
  }
  const datos = (await res.json()) as Respuesta;
  if (datos.promptFeedback?.blockReason)
    throw new GeminiError(
      `La IA bloqueó la respuesta (${datos.promptFeedback.blockReason}).`,
    );
  const texto = datos.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join("")
    .trim();
  if (!texto) throw new GeminiError("La IA no devolvió respuesta.");
  return texto;
}
