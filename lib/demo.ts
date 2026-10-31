/**
 * Modo demostración: permite recorrer la interfaz sin Supabase configurado,
 * con un usuario de ejemplo con acceso total. Solo aplica en desarrollo y SIN
 * las variables de Supabase: en producción la app exige sesión real.
 */
export const MODO_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NODE_ENV === "development";
