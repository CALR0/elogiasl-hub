import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Cliente con la secret key: IGNORA RLS. Solo para procesos del sistema
 * (webhooks, cron de sincronización, creación de usuarios, auditoría).
 * Antes de usarlo en nombre de un usuario, verifica su rol con lib/auth.ts.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
