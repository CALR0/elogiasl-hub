import type { Metadata } from "next";
import Image from "next/image";
import { FlaskConical } from "lucide-react";
import logo from "@/public/brand/elogia-logo.svg";
import { APP } from "@/lib/config";
import { MODO_DEMO } from "@/lib/demo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="lg:bg-brand-deep relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 sm:px-8 lg:px-16 xl:px-24">
      <RutasDecorativas />

      <div className="relative grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[minmax(380px,430px)_1fr] xl:gap-24">
        {/* Formulario: tarjeta flotante sobre el fondo de marca en escritorio */}
        <section className="lg:bg-card mx-auto w-full max-w-sm lg:max-w-none lg:rounded-2xl lg:p-10 lg:shadow-2xl lg:shadow-black/30">
          <Image
            src={logo}
            alt="Elogia Soluciones Logísticas"
            priority
            className="mx-auto mb-10 h-auto w-48 dark:brightness-0 dark:invert"
          />

          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <h1 className="text-accent-foreground text-[1.625rem] font-semibold tracking-tight">
              Iniciar sesión
            </h1>
            <span className="bg-brand h-1 w-10 rounded-full" aria-hidden />
            <p className="text-muted-foreground text-sm">
              Ingresa a <span className="text-foreground font-medium">{APP.nombre}</span>{" "}
              con tu cuenta corporativa.
            </p>
          </div>

          {MODO_DEMO && (
            <p className="border-migracion/30 bg-migracion-bg text-migracion mb-5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Modo demostración: Supabase aún no está configurado. Entra sin
              credenciales con acceso total para recorrer la interfaz.
            </p>
          )}

          <LoginForm next={next} demo={MODO_DEMO} />

          <p className="text-muted-foreground mt-8 text-center text-xs">
            ¿No tienes acceso? Solicítalo al administrador de la plataforma.
          </p>
        </section>

        {/* Mensaje de marca: qué es el portal y qué encuentra el usuario */}
        <section className="hidden text-white lg:block">
          <h2 className="max-w-xl text-4xl leading-[1.15] font-semibold tracking-tight xl:text-5xl">
            Las herramientas que mueven la operación, en un solo lugar.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
            El portal de soporte de {APP.empresa}: aquí encuentras las
            soluciones a tus procesos.
          </p>
        </section>
      </div>

      <p className="text-muted-foreground absolute inset-x-0 bottom-5 text-center text-xs tabular-nums lg:text-white/45">
        {new Date().getFullYear()} © {APP.empresa}
      </p>
    </main>
  );
}

/** Líneas de ruta sutiles (SVG en línea, solo escritorio: sin peticiones ni animaciones). */
function RutasDecorativas() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <g stroke="white" strokeOpacity="0.06" strokeWidth="1.5">
        <path d="M-60 760 C 260 640, 420 860, 720 720 S 1180 480, 1500 560" />
        <path d="M-60 820 C 280 720, 460 920, 760 790 S 1200 560, 1500 640" />
        <path d="M-60 140 C 240 250, 520 40, 820 150 S 1240 330, 1500 210" />
        <path d="M-60 200 C 260 300, 540 110, 840 210 S 1260 390, 1500 280" />
      </g>
      <path
        d="M-60 700 C 240 580, 400 800, 700 660 S 1160 420, 1500 500"
        stroke="#95A495"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="10 14"
      />
      <g fill="#95A495" fillOpacity="0.5">
        <circle cx="700" cy="660" r="5" />
        <circle cx="1185" cy="452" r="5" />
      </g>
    </svg>
  );
}
