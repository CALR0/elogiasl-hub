# soporte-elogiasl (Elogia HUB) — Guía de arranque para Claude

Plataforma interna de Elogia Soluciones Logísticas que unifica SMA (anticipos SAP), FVE-C (fichas
de vehículo) y, más adelante, Estudios (elogix). El usuario y el equipo hablan español: responde,
comenta el código y escribe la documentación en español.

**Lee primero `docs/CONTEXTO.md`** (mapa de módulos, permisos, decisiones y siguientes pasos) y
actualiza su sección "Estado actual" al terminar una sesión.

## Stack y comandos
- Next.js 16 (App Router, `proxy.ts` en lugar de middleware) + React 19 + TS · Supabase · Tailwind v4 · Vercel · npm.
  Es distinto de Next 15: consulta `node_modules/next/dist/docs/` antes de usar una API.
- `npm run dev` · `lint` · `type-check` · `build` · `format`. Resumen para usuarios en `README.md`.
- `npm run db:test` — aplica las migraciones en PGlite y prueba RLS/funciones/triggers. Si cambias la BD, actualízalo y córrelo.
- `npm run test:fichas` (parser/PDF/Excel sin conexión) · `npm run test:anticipos` (parser del log) · `npm run test:sicetac` (XML del manifiesto) · `npm run test:cumplidos` (XML del cumplido) · `npm run test:estudios` (respuestas de TusDatos, sin créditos) · `npm run probar:waf` (firewall de Silogtran).
- Sin `.env.local` la app corre en modo demostración (`lib/demo.ts`).
- Silogtran: cuenta de servicio vía `conSilogtran()` (`lib/silogtran/`); lee la guía `silogtran-integration`.

## Reglas
- Módulos: `lib/modulos.ts` es la fuente única. Un nodo nuevo también va en una migración nueva de `public.modulos`.
- Autorización en tres capas: `proxy.ts` → `requireUsuario` / `requirePermiso` (`lib/auth.ts`) en cada página,
  Server Function y Route Handler → RLS. Nunca confiar solo en ocultar el menú.
- Permiso efectivo = (rol) ∪ (otorgado) ∖ (revocado): `lib/auth.ts` y `public.tiene_acceso()` deben calcular lo mismo.
- Toda acción relevante se registra con `registrarAuditoria()` (`lib/auditoria.ts`) y su texto va en `lib/gestion/etiquetas.ts`.
  Nunca contraseñas ni tokens en `detalle`.
- Lecturas/escrituras nuevas deben funcionar también en modo demostración (`lib/gestion/demo.ts`).
- Secretos (`SUPABASE_SECRET_KEY`, credenciales de Silogtran/AWS) solo en servidor (`import "server-only"`).
- Cada cambio de BD es un archivo NUEVO en `supabase/migrations/`.
- Diseño: corporativo, paleta salvia de Elogia (`app/globals.css`), sin emojis; estados siempre con ícono + texto.
- Fechas: `fechaCorta` / `fechaHora` de `lib/utils.ts` (no `Intl`: rompe la hidratación).
- Lo escrito y los resultados de un módulo van con `useEstadoSesion` (`components/sesion/memoria-sesion.tsx`),
  no `useState`: así sobreviven al cambiar de módulo (se borran al recargar o cerrar sesión).
