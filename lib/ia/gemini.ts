import "server-only";

/*
 * Cliente mínimo de Gemini (generativelanguage.googleapis.com) por REST, sin
 * SDK oficial.
 *
 * La clave está en GEMINI_API_KEY (server-only). Como qué modelos ve una
 * API key depende de la cuenta (una key recién creada no ve siempre los
 * mismos modelos que una antigua), se prueban varios en orden:
 *   1. El que el usuario fije en GEMINI_MODELO (si lo fija).
 *   2. Una lista de modelos flash estables.
 * Se guarda en memoria el primero que respondió para no repetir las fallas
 * en cada mensaje. Si todos fallan, se devuelve un mensaje claro al usuario.
 */

/**
 * Cascada de modelos a probar, de más capaz a más liviano. 'gemini-flash-latest'
 * es un alias que siempre apunta al modelo flash vigente, así que no se queda
 * desactualizado. Los demás son fallbacks concretos. La variable
 * GEMINI_MODELO, si se define, va primero.
 */
/*
 * Van primero los que la experiencia muestra más rápidos y con mejor cupo.
 * gemini-flash-latest es un alias que puede apuntar a un modelo pesado (3.x
 * en vista previa) y tardar >45 s por respuesta, así que lo dejamos al final.
 */
const CASCADA_DEFECTO = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-pro-latest",
];

function cascada(): string[] {
  const manual = (process.env.GEMINI_MODELO || "").trim();
  const extra = (process.env.GEMINI_MODELO_RESPALDO || "").trim();
  const lista = [manual, extra, ...CASCADA_DEFECTO].filter(Boolean);
  return Array.from(new Set(lista));
}

/** Para que la UI muestre cuál se está usando, si es del interés. */
export function cascadaModelos(): string[] {
  return cascada();
}

export interface MensajeChat {
  rol: "usuario" | "ia";
  texto: string;
}

export class GeminiError extends Error {
  constructor(
    mensaje: string,
    public saturado = false,
    /** La API dice que este modelo no está disponible para esta cuenta. */
    public noDisponible = false,
  ) {
    super(mensaje);
  }
}

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

// En memoria por instancia: el modelo que respondió bien la última vez.
// Vercel reparte las peticiones entre instancias, así que esto solo acelera
// las siguientes llamadas dentro de la misma lambda.
let modeloRecordado: string | null = null;

/** Tope por intento: debe caber 2-3 veces en el maxDuration del route (60 s). */
const MS_POR_MODELO = 20_000;

async function llamarModelo(
  modelo: string,
  key: string,
  system: string,
  contents: Contenido[],
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url, {
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
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_ONLY_HIGH",
          },
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
      signal: AbortSignal.timeout(MS_POR_MODELO),
    });
  } catch (e) {
    // Timeout o fallo de red: no sabemos si el modelo existe, lo tratamos
    // como "saturado" para que la cascada pruebe el siguiente.
    const esTimeout =
      e instanceof Error &&
      (e.name === "TimeoutError" || /abort/i.test(e.message));
    throw new GeminiError(
      esTimeout
        ? `Gemini (${modelo}) tardó más de ${MS_POR_MODELO / 1000} s en responder.`
        : `Gemini (${modelo}) no pudo contactarse. ${e instanceof Error ? e.message : ""}`.trim(),
      true,
    );
  }

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    // 404 = modelo no disponible para esta cuenta. 429 = cuota. 503 = saturado.
    const noDisponible = res.status === 404;
    const saturado = res.status === 503 || res.status === 429;
    throw new GeminiError(
      `Gemini (${modelo}) respondió HTTP ${res.status}. ${cuerpo.slice(0, 300)}`.trim(),
      saturado,
      noDisponible,
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

/**
 * Envía la conversación a Gemini y devuelve el texto de la respuesta.
 * Prueba los modelos en cascada hasta que uno responda.
 */
export async function pedirRespuesta({
  system,
  historial,
}: {
  system: string;
  historial: MensajeChat[];
}): Promise<{ texto: string; modelo: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    throw new GeminiError(
      "La IA no está configurada (falta GEMINI_API_KEY en el servidor).",
    );

  const contents: Contenido[] = historial.map((m) => ({
    role: m.rol === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));

  // El que funcionó la última vez primero; si no, la cascada
  const ordenados = modeloRecordado
    ? [modeloRecordado, ...cascada().filter((m) => m !== modeloRecordado)]
    : cascada();

  const fallos: string[] = [];
  for (const modelo of ordenados) {
    try {
      const texto = await llamarModelo(modelo, key, system, contents);
      modeloRecordado = modelo;
      if (fallos.length)
        console.warn(
          `[ia] respondió ${modelo} después de descartar ${fallos.join(", ")}`,
        );
      return { texto, modelo };
    } catch (e) {
      if (e instanceof GeminiError) {
        // Si no está disponible o la cuota se agotó o está saturado, probamos
        // el siguiente de la cascada. Otros errores (p. ej. 400 por payload)
        // los re-lanzamos porque cambiar de modelo no los arregla.
        if (e.noDisponible || e.saturado) {
          fallos.push(modelo);
          modeloRecordado = null;
          continue;
        }
        throw e;
      }
      throw e;
    }
  }

  throw new GeminiError(
    `Tu API key de Gemini no pudo usar ninguno de los modelos probados (${ordenados.join(", ")}). Revisa en /api/ia/diagnostico qué modelos ofrece tu cuenta.`,
    true,
  );
}

/**
 * Lista los modelos disponibles para esta API key llamando a /v1beta/models.
 * Útil para diagnosticar cuando la cascada no acierta.
 */
export async function listarModelos(): Promise<
  | { ok: true; modelos: { nombre: string; generaContenido: boolean }[] }
  | { ok: false; error: string }
> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Falta GEMINI_API_KEY." };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${res.status}. ${cuerpo.slice(0, 300)}`.trim(),
    };
  }
  const datos = (await res.json()) as {
    models?: {
      name?: string;
      supportedGenerationMethods?: string[];
    }[];
  };
  const modelos = (datos.models ?? [])
    .map((m) => ({
      nombre: (m.name ?? "").replace(/^models\//, ""),
      generaContenido: (m.supportedGenerationMethods ?? []).includes(
        "generateContent",
      ),
    }))
    .filter((m) => m.nombre);
  return { ok: true, modelos };
}
