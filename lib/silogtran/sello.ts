import "server-only";
import crypto from "node:crypto";
import zlib from "node:zlib";

/**
 * Sellos cifrados (AES-256-GCM): guardan datos del servidor sin que se puedan
 * leer ni alterar. Se usan para la sesión de Silogtran guardada en Supabase y
 * para cada ficha consultada (que viaja al navegador y vuelve para PDF/Excel).
 * Portado de FVE-C (src/sello.js).
 */

function obtenerClave() {
  const secreto = process.env.SESSION_SECRET || "";
  if (secreto.length >= 32)
    return crypto.createHash("sha256").update(`portal:${secreto}`).digest();
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET es obligatorio en producción (mínimo 32 caracteres aleatorios).",
    );
  }
  // Desarrollo: clave aleatoria por proceso (al reiniciar se vuelve a iniciar sesión)
  console.warn(
    "[sello] SESSION_SECRET no definido: clave temporal (solo desarrollo).",
  );
  return crypto.randomBytes(32);
}

let clave: Buffer | undefined;
const CLAVE = () => (clave ??= obtenerClave());

/** tipo: distingue usos ('silogtran', 'ficha') para que un sello no sirva en otro. */
export function sellar(tipo: string, datos: unknown, ttlMs: number) {
  const cuerpo = zlib.deflateRawSync(
    Buffer.from(JSON.stringify({ t: tipo, exp: Date.now() + ttlMs, d: datos })),
  );
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv("aes-256-gcm", CLAVE(), iv);
  cifrador.setAAD(Buffer.from(tipo));
  const cifrado = Buffer.concat([cifrador.update(cuerpo), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString(
    "base64url",
  );
}

/** Devuelve los datos, o null si el sello es inválido, de otro tipo o venció. */
export function abrir<T = unknown>(tipo: string, sello: unknown): T | null {
  try {
    if (
      typeof sello !== "string" ||
      sello.length < 40 ||
      sello.length > 200_000
    )
      return null;
    const bruto = Buffer.from(sello, "base64url");
    const descifrador = crypto.createDecipheriv(
      "aes-256-gcm",
      CLAVE(),
      bruto.subarray(0, 12),
    );
    descifrador.setAAD(Buffer.from(tipo));
    descifrador.setAuthTag(bruto.subarray(12, 28));
    const cuerpo = Buffer.concat([
      descifrador.update(bruto.subarray(28)),
      descifrador.final(),
    ]);
    const { t, exp, d } = JSON.parse(
      zlib.inflateRawSync(cuerpo, { maxOutputLength: 2_000_000 }).toString(),
    );
    if (t !== tipo || typeof exp !== "number" || Date.now() > exp) return null;
    return d as T;
  } catch {
    return null;
  }
}
