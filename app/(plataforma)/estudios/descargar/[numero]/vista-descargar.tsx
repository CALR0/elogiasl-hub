"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConsultaItem {
  id: string;
  titulo: string;
  subtitulo: string;
}

/**
 * Vista "para imprimir": apila los HTML de todas las consultas en iframes
 * same-origin (sandbox sin scripts) y abre el diálogo de impresión cuando
 * están cargados. Oculta la barra superior en la impresión con @media print.
 */
export function VistaDescargar({
  titulo,
  consultas,
  numero,
  etiqueta,
  fecha,
}: {
  titulo: string;
  consultas: ConsultaItem[];
  numero: number;
  etiqueta: string;
  fecha: string;
}) {
  const [cargados, setCargados] = useState(0);
  const [impreso, setImpreso] = useState(false);
  const total = consultas.length;
  const listo = cargados >= total && total > 0;

  // El filename que Chrome sugiere en el PDF usa document.title
  useEffect(() => {
    document.title = titulo;
  }, [titulo]);

  // Cuando todos los iframes cargan, abre print una vez (sin setState dentro
  // del effect: cambiamos el flag en el callback del setTimeout).
  useEffect(() => {
    if (!listo || impreso) return;
    const t = setTimeout(() => {
      setImpreso(true);
      window.print();
    }, 250);
    return () => clearTimeout(t);
  }, [listo, impreso]);

  function imprimir() {
    window.print();
  }

  return (
    <>
      <style>{`@media print {
        .barra { display: none !important; }
        iframe { page-break-inside: auto; }
        body { background: white; }
      }`}</style>

      <div className="barra flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/estudios/verificar/${numero}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver al estudio
        </Link>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="font-mono">
            {etiqueta} · {fecha}
          </span>
          {listo ? (
            <Button type="button" variante="primario" onClick={imprimir}>
              <Download className="size-4" aria-hidden />
              Guardar como PDF
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Cargando reportes {cargados}/{total}…
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {consultas.map((c, i) => (
          <article
            key={c.id}
            className="bg-card overflow-hidden rounded-xl border"
          >
            <ReporteIframe
              id={c.id}
              titulo={c.titulo}
              subtitulo={c.subtitulo}
              onLoad={() => setCargados((n) => n + 1)}
              ultima={i === consultas.length - 1}
            />
          </article>
        ))}
        {consultas.length === 0 && (
          <div className="bg-card text-muted-foreground rounded-xl border p-6 text-center text-sm">
            El estudio no tiene reportes disponibles.
          </div>
        )}
      </div>
    </>
  );
}

function ReporteIframe({
  id,
  titulo,
  subtitulo,
  onLoad,
  ultima,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
  onLoad: () => void;
  ultima: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState(600);

  function ajustarAltura() {
    try {
      const doc = ref.current?.contentDocument;
      const h = doc?.documentElement?.scrollHeight ?? 0;
      if (h > 200) setAltura(h + 40);
    } catch {
      // cross-origin: se queda con el default
    }
  }

  return (
    <div style={{ pageBreakAfter: ultima ? "auto" : "always" }}>
      <header className="flex flex-wrap items-baseline gap-2 border-b bg-muted/30 px-4 py-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {subtitulo && (
          <p className="text-muted-foreground text-xs">{subtitulo}</p>
        )}
      </header>
      <iframe
        ref={ref}
        src={`/api/estudios/reporte/${id}?formato=html`}
        sandbox="allow-same-origin"
        title={titulo}
        style={{ height: `${altura}px` }}
        className="w-full bg-white"
        onLoad={() => {
          ajustarAltura();
          onLoad();
        }}
      />
    </div>
  );
}
