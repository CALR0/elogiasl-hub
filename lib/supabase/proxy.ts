import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = [
  "/login",
  "/recuperar",
  "/auth",
  "/api/webhooks",
  "/api/cron",
];

/**
 * Refresca la sesión de Supabase en cada petición y hace la verificación
 * optimista de autenticación. La autorización por rol NO va aquí: se hace
 * cerca de los datos (lib/auth.ts + RLS).
 */
export async function updateSession(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    // Sin .env.local: en desarrollo se deja ver la UI; en producción se falla cerrado.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Supabase no está configurado", { status: 503 });
    }
    console.warn(
      "[proxy] Falta configurar Supabase en .env.local; sin control de sesión.",
    );
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No pongas código entre createServerClient y getClaims(): puede cerrar sesiones al azar.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isAuthenticated && !isPublic) {
    // Las llamadas a la API reciben 401 en JSON (no el HTML del login)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Tu sesión expiró. Vuelve a iniciar sesión." },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
