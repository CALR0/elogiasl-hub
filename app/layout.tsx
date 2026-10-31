import type { Metadata } from "next";
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
