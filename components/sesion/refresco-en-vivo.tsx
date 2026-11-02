"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Refresca la pantalla cuando cambian las tablas indicadas (Supabase
 * Realtime). Realtime respeta RLS: solo llegan avisos de las filas que el
 * usuario puede leer (p. ej. audit_logs, solo con permiso del visor). Agrupa ráfagas de cambios en un solo
 * refresco para no recargar de más en equipos lentos.
 */
export function RefrescoEnVivo({ tablas }: { tablas: readonly string[] }) {
  const router = useRouter();
  const clave = tablas.join(",");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    let canal: RealtimeChannel | undefined;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let cancelado = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelado || !session) return;
      // El canal usa el token del usuario: así Realtime aplica sus permisos
      supabase.realtime.setAuth(session.access_token);
      canal = supabase.channel(`portal:${clave}`);
      for (const table of clave.split(",")) {
        canal.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            clearTimeout(espera);
            espera = setTimeout(() => router.refresh(), 1000);
          },
        );
      }
      canal.subscribe();
    })();

    return () => {
      cancelado = true;
      clearTimeout(espera);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [router, clave]);

  return null;
}
