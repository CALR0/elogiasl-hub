import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { APP } from "@/lib/config";
import { SCRIPT_TEMA } from "@/components/plataforma/tema";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: APP.nombre, template: `%s · ${APP.nombre}` },
  description: APP.descripcion,
};

/*
 * Sin este viewport, iOS Safari (iPhone 11 Pro y similares) asume un ancho
 * de 980 px y renderiza toda la plataforma "con zoom out": el usuario tiene
 * que acercar para ver bien cualquier pantalla, incluido el chat. Con
 * width=device-width + initialScale=1 la página toma el ancho real del
 * dispositivo. viewportFit="cover" es para respetar la "notch" en iPhone
 * sin bandas negras. No bloqueamos el pinch-zoom (no se fija maximumScale
 * ni userScalable=false): accesibilidad.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1f14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de tema agrega la clase .dark antes de React
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema guardado antes de pintar (sin parpadeo) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      {/* Extensiones (p. ej. antivirus) agregan atributos al <body> antes de que
          React cargue: se ignora solo esa diferencia, no la de los hijos. */}
      <body
        className="flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
