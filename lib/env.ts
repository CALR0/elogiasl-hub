import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas en el primer uso (no al importar,
 * para que `next build` no falle en entornos sin secretos).
 * Las públicas (NEXT_PUBLIC_*) se leen directamente donde se usan.
 *
 * Las variables de Silogtran / AWS de los módulos migrados (SMA y FVE-C) se
 * agregarán aquí cuando se integren.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
