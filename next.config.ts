import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  // Se cargan de node_modules en el servidor, sin empaquetar: PDFKit lee sus
  // fuentes del disco y @sparticuz/chromium trae un binario de Chromium.
  serverExternalPackages: ["pdfkit", "puppeteer-core", "@sparticuz/chromium"],
  // Archivos que se leen en tiempo de ejecución y el empaquetado no detecta:
  // fuentes de PDFKit y el Chromium comprimido de @sparticuz (firewall de Silogtran)
  outputFileTracingIncludes: {
    "/api/fichas/**": [
      "./node_modules/pdfkit/js/data/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/anticipos/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/sicetac/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/cumplidos/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  experimental: {
    authInterrupts: true, // forbidden() / unauthorized() en lib/auth.ts
    // Caché del navegador: volver a una página visitada hace menos de 30 s no la
    // pide de nuevo al servidor (lo escrito y los resultados viven en
    // components/sesion/memoria-sesion). Las acciones que cambian datos invalidan
    // con revalidatePath, y la API y las acciones siempre verifican permisos.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Nada de la API se guarda en cachés intermedias
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
