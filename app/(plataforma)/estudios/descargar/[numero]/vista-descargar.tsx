"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConsultaItem {
  id: string;
  titulo: string;
  subtitulo: string;
  /** Nombre base del archivo (sin extensión). */
  archivo: string;
}

/**
 * Página "para imprimir / descargar": apila los HTML de todas las consultas
 * en iframes same-origin (sin scripts) y los convierte a PDF client-side con
 * html2canvas-pro + jsPDF (sin esperar al PDF asíncrono de TusDatos).
 *  - 1 consulta → descarga un solo PDF con la etiqueta del estudio.
 *  - >1 consulta → empaqueta cada PDF por aparte en un ZIP nombrado con
 *    placa/documento y fecha; cada archivo adentro lleva su propio nombre.
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
  const [descargando, setDescargando] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframes = useRef(new Map<string, HTMLIFrameElement>());
  const total = consultas.length;
  const listo = cargados >= total && total > 0;
  const nombreBase = sanear(`${etiqueta} ${fecha}`);

  useEffect(() => {
    document.title = titulo;
  }, [titulo]);

  async function descargar() {
    if (!listo || descargando) return;
    setDescargando(true);
    setError(null);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const { jsPDF } = await import("jspdf");

      const pdfs: { nombre: string; datos: Uint8Array }[] = [];
      for (let i = 0; i < consultas.length; i++) {
        const c = consultas[i];
        setProgreso(`Generando ${i + 1}/${total}: ${c.titulo}`);
        const iframe = iframes.current.get(c.id);
        const doc = iframe?.contentDocument;
        if (!doc?.body) continue;
        const canvas = await html2canvas(doc.body, {
          useCORS: true,
          backgroundColor: "#ffffff",
          scale: 1.5,
          windowWidth: doc.documentElement.scrollWidth,
          windowHeight: doc.documentElement.scrollHeight,
        });
        const pdf = canvasAPdf(jsPDF, canvas);
        pdfs.push({
          nombre: `${sanear(c.archivo)}.pdf`,
          datos: new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer),
        });
      }

      if (pdfs.length === 1) {
        descargarBlob(
          new Blob([pdfs[0].datos.buffer as ArrayBuffer], {
            type: "application/pdf",
          }),
          `${nombreBase}.pdf`,
        );
      } else {
        setProgreso("Empaquetando en ZIP…");
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const p of pdfs) zip.file(p.nombre, p.datos);
        const blob = await zip.generateAsync({ type: "blob" });
        descargarBlob(blob, `${nombreBase}.zip`);
      }
      setProgreso("Listo.");
      setTimeout(() => setProgreso(null), 1500);
    } catch (e) {
      console.error("[descargar]", e);
      setError((e as Error).message || "No se pudo generar la descarga.");
    } finally {
      setDescargando(false);
    }
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
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground font-mono">
            {etiqueta} · {fecha}
          </span>
          {listo ? (
            <Button
              type="button"
              variante="primario"
              onClick={descargar}
              disabled={descargando}
            >
              {descargando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {total === 1 ? "Descargar PDF" : `Descargar ZIP (${total})`}
            </Button>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Cargando reportes {cargados}/{total}…
            </span>
          )}
        </div>
      </div>

      {progreso && (
        <p className="text-muted-foreground mt-2 text-xs">{progreso}</p>
      )}
      {error && (
        <p className="text-destructive mt-2 text-sm">{error}</p>
      )}

      <div className="mt-4 space-y-4">
        {consultas.map((c) => (
          <article
            key={c.id}
            className="bg-card overflow-hidden rounded-xl border"
          >
            <header className="bg-muted/30 flex flex-wrap items-baseline gap-2 border-b px-4 py-2">
              <h2 className="text-sm font-semibold">{c.titulo}</h2>
              {c.subtitulo && (
                <p className="text-muted-foreground text-xs">{c.subtitulo}</p>
              )}
            </header>
            <ReporteIframe
              id={c.id}
              titulo={c.titulo}
              refCallback={(el) => {
                if (el) iframes.current.set(c.id, el);
                else iframes.current.delete(c.id);
              }}
              onLoad={() => setCargados((n) => n + 1)}
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
  refCallback,
  onLoad,
}: {
  id: string;
  titulo: string;
  refCallback: (el: HTMLIFrameElement | null) => void;
  onLoad: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState(600);

  function ajustarAltura() {
    try {
      const doc = ref.current?.contentDocument;
      const h = doc?.documentElement?.scrollHeight ?? 0;
      if (h > 200) setAltura(h + 40);
    } catch {
      // same-origin: no debería fallar
    }
  }

  return (
    <iframe
      ref={(el) => {
        (ref as React.RefObject<HTMLIFrameElement | null>).current = el;
        refCallback(el);
      }}
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
  );
}

/** Convierte un <canvas> ya renderizado a un PDF A4 vertical multipágina. */
function canvasAPdf(
  JsPdf: typeof import("jspdf").jsPDF,
  canvas: HTMLCanvasElement,
) {
  // JsPDF toma una imagen por página. Si el canvas es más alto que una página
  // A4, hay que repartirlo en varias hojas (misma imagen, offset distinto).
  const pdf = new JsPdf("p", "mm", "a4");
  const anchoPdf = pdf.internal.pageSize.getWidth();
  const altoPdf = pdf.internal.pageSize.getHeight();
  const ratio = anchoPdf / canvas.width;
  const altoImgMm = canvas.height * ratio;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  if (altoImgMm <= altoPdf) {
    pdf.addImage(dataUrl, "JPEG", 0, 0, anchoPdf, altoImgMm);
  } else {
    let y = 0;
    while (y < altoImgMm) {
      if (y > 0) pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", 0, -y, anchoPdf, altoImgMm);
      y += altoPdf;
    }
  }
  return pdf;
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function sanear(nombre: string) {
  return nombre.replace(/[^\w .-]/g, "_").slice(0, 120);
}
