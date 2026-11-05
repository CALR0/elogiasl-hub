"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { cx } from "@/lib/utils";

const ANCHO_RENDER = 1024;

interface ConsultaMeta {
  id: string;
  titulo: string;
  archivo: string;
}

interface Metadata {
  etiqueta: string;
  fecha: string;
  consultas: ConsultaMeta[];
}

type Estado =
  | { fase: "idle" }
  | { fase: "preparando" }
  | { fase: "cargando"; hecho: number; total: number }
  | { fase: "generando"; hecho: number; total: number }
  | { fase: "empaquetando" }
  | { fase: "error"; mensaje: string };

/**
 * Descarga el reporte del estudio en el mismo lugar (sin redirect). Monta
 * iframes ocultos con los HTML oficiales de TusDatos, los convierte a PDF
 * con html2canvas-pro + jsPDF, y entrega un PDF (si es una consulta) o un
 * ZIP con los PDF por aparte (si son varias). Nada se guarda en el servidor:
 * la conversión ocurre en el navegador y el servidor solo registra en auditoría.
 */
export function BotonDescargarEstudio({ numero }: { numero: number }) {
  const [estado, setEstado] = useState<Estado>({ fase: "idle" });
  const trabajando = estado.fase !== "idle" && estado.fase !== "error";

  async function descargar() {
    setEstado({ fase: "preparando" });
    try {
      const meta = await pedirMetadata(numero);
      if (meta.consultas.length === 0)
        throw new Error("El estudio no tiene reportes disponibles.");

      setEstado({
        fase: "cargando",
        hecho: 0,
        total: meta.consultas.length,
      });
      const iframes: HTMLIFrameElement[] = [];
      try {
        for (let i = 0; i < meta.consultas.length; i++) {
          const iframe = await cargarIframeOculto(
            `/api/estudios/reporte/${meta.consultas[i].id}?formato=html`,
          );
          iframes.push(iframe);
          setEstado({
            fase: "cargando",
            hecho: i + 1,
            total: meta.consultas.length,
          });
        }

        const { default: html2canvas } = await import("html2canvas-pro");
        const { jsPDF } = await import("jspdf");

        setEstado({
          fase: "generando",
          hecho: 0,
          total: meta.consultas.length,
        });
        const pdfs: { nombre: string; datos: Uint8Array }[] = [];
        for (let i = 0; i < iframes.length; i++) {
          const doc = iframes[i].contentDocument;
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
            nombre: `${sanear(meta.consultas[i].archivo)}.pdf`,
            datos: new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer),
          });
          setEstado({
            fase: "generando",
            hecho: i + 1,
            total: iframes.length,
          });
        }

        const nombreBase = sanear(`${meta.etiqueta} ${meta.fecha}`);
        if (pdfs.length === 1) {
          descargarBlob(
            new Blob([pdfs[0].datos.buffer as ArrayBuffer], {
              type: "application/pdf",
            }),
            `${nombreBase}.pdf`,
          );
        } else {
          setEstado({ fase: "empaquetando" });
          const { default: JSZip } = await import("jszip");
          const zip = new JSZip();
          for (const p of pdfs) zip.file(p.nombre, p.datos);
          const blob = await zip.generateAsync({ type: "blob" });
          descargarBlob(blob, `${nombreBase}.zip`);
        }
        setEstado({ fase: "idle" });
      } finally {
        for (const i of iframes) i.remove();
      }
    } catch (e) {
      console.error("[descargar]", e);
      setEstado({
        fase: "error",
        mensaje: (e as Error).message || "No se pudo descargar.",
      });
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={descargar}
        disabled={trabajando}
        className={cx(
          "text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
          "disabled:cursor-wait disabled:opacity-80",
        )}
        title={titulo(estado)}
      >
        {trabajando ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        <span>{etiquetaBoton(estado)}</span>
      </button>
      {estado.fase === "error" && (
        <p className="text-destructive max-w-xs text-right text-[11px]">
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}

function etiquetaBoton(estado: Estado) {
  switch (estado.fase) {
    case "idle":
    case "error":
      return "Descargar";
    case "preparando":
      return "Preparando…";
    case "cargando":
      return `Cargando ${estado.hecho}/${estado.total}`;
    case "generando":
      return `Generando ${estado.hecho}/${estado.total}`;
    case "empaquetando":
      return "Empaquetando ZIP…";
  }
}

function titulo(estado: Estado) {
  if (estado.fase === "cargando")
    return "Cargando los reportes de TusDatos en segundo plano…";
  if (estado.fase === "generando")
    return "Convirtiendo cada reporte a PDF…";
  return "Descargar reporte";
}

/** Monta un iframe oculto y espera a que cargue (HTML + imágenes). */
function cargarIframeOculto(src: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.sandbox.add("allow-same-origin");
    iframe.setAttribute("aria-hidden", "true");
    // Fuera de pantalla pero renderizado con un ancho fijo; alto se ajusta
    // después para que html2canvas capture todo el documento.
    iframe.style.cssText = [
      "position:fixed",
      "left:-99999px",
      "top:0",
      `width:${ANCHO_RENDER}px`,
      "height:800px",
      "border:0",
      "pointer-events:none",
    ].join(";");
    iframe.onload = async () => {
      try {
        await esperarImagenes(iframe);
        const doc = iframe.contentDocument;
        if (doc?.documentElement) {
          iframe.style.height = `${doc.documentElement.scrollHeight}px`;
        }
        // Un frame para que el layout aplique el nuevo alto
        requestAnimationFrame(() => resolve(iframe));
      } catch (e) {
        reject(e);
      }
    };
    iframe.onerror = () =>
      reject(new Error("No se pudo cargar un reporte de TusDatos."));
    document.body.appendChild(iframe);
  });
}

/** Espera a que todas las <img> del iframe terminen (o fallen, sin bloquear). */
function esperarImagenes(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return Promise.resolve();
  const imagenes = Array.from(doc.images);
  return Promise.all(
    imagenes.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            const terminar = () => res();
            img.addEventListener("load", terminar, { once: true });
            img.addEventListener("error", terminar, { once: true });
          }),
    ),
  ).then(() => undefined);
}

/** Canvas a PDF A4 vertical multipágina. */
function canvasAPdf(
  JsPdf: typeof import("jspdf").jsPDF,
  canvas: HTMLCanvasElement,
) {
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

async function pedirMetadata(numero: number): Promise<Metadata> {
  const res = await fetch(`/api/estudios/estudio/${numero}/descargar`, {
    headers: { "x-portal": "1" },
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error || "No se pudo preparar la descarga.");
  }
  return (await res.json()) as Metadata;
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
