"use client";

import {
  Bot,
  CheckCircle2,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/lib/utils";

/*
 * Botón flotante en la esquina inferior derecha que abre un panel de chat con
 * la IA. Pensado para analizar manifiestos SICETAC: si el usuario escribe un
 * número, el servidor consulta ministerio.colombiasoftware.net y se lo pasa a
 * Gemini como contexto antes de responder.
 *
 * - El historial vive en `useEstadoSesion`: sobrevive entre módulos y se borra
 *   al recargar o cerrar sesión.
 * - Se oculta si `GEMINI_API_KEY` no está configurada (prop `activo`).
 */

type Rol = "usuario" | "ia";

interface Mensaje {
  rol: Rol;
  texto: string;
  analisis?: {
    manifiesto: string;
    encontrado: boolean;
    radicado: boolean;
    errorSicetac: boolean;
  } | null;
}

const BIENVENIDA: Mensaje = {
  rol: "ia",
  texto:
    "Hola. Puedo consultar un manifiesto SICETAC y explicarte si ya está radicado o por qué el Ministerio lo rechazó. Pégame el número para empezar.",
};

export function ChatIaFlotante({ activo }: { activo: boolean }) {
  const [abierto, setAbierto] = useEstadoSesion("ia.chat.abierto", false);
  const [mensajes, setMensajes] = useEstadoSesion<Mensaje[]>("ia.chat.mensajes", [
    BIENVENIDA,
  ]);
  const [borrador, setBorrador] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [abierto, mensajes.length, cargando]);

  useEffect(() => {
    if (abierto) textareaRef.current?.focus();
  }, [abierto]);

  if (!activo) return null;

  async function enviar() {
    const texto = borrador.trim();
    if (!texto || cargando) return;
    const nuevos: Mensaje[] = [...mensajes, { rol: "usuario", texto }];
    setMensajes(nuevos);
    setBorrador("");
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal": "1" },
        body: JSON.stringify({
          mensajes: nuevos.map((m) => ({ rol: m.rol, texto: m.texto })),
        }),
      });
      const datos = await res.json().catch(() => null);
      if (!res.ok || !datos?.respuesta) {
        setError(datos?.error ?? "La IA no pudo responder.");
        return;
      }
      setMensajes([
        ...nuevos,
        { rol: "ia", texto: datos.respuesta, analisis: datos.analisis ?? null },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  function reiniciar() {
    setMensajes([BIENVENIDA]);
    setError(null);
  }

  return (
    <>
      {!abierto && (
        <button
          type="button"
          aria-label="Abrir asistente IA"
          onClick={() => setAbierto(true)}
          className="fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <Sparkles size={22} />
        </button>
      )}

      {abierto && (
        <div className="fixed right-4 bottom-4 z-40 flex h-[min(620px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          {/* Encabezado */}
          <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                Asistente de manifiestos
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Consulta y explica manifiestos SICETAC
              </p>
            </div>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Empezar una conversación nueva"
            >
              <MessageCircle size={16} />
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Cerrar"
              aria-label="Cerrar asistente"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <ul className="space-y-3">
              {mensajes.map((m, i) => (
                <Burbuja key={i} mensaje={m} />
              ))}
              {cargando && (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Search size={12} className="animate-pulse" />
                  Consultando el ministerio y pensando…
                </li>
              )}
              {error && (
                <li className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </li>
              )}
              <div ref={finRef} />
            </ul>
          </div>

          {/* Compositor */}
          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder="Pégame un número de manifiesto o pregúntame algo…"
                rows={2}
                className="min-h-[48px] max-h-32 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                disabled={cargando}
              />
              <button
                type="submit"
                className={buttonClasses("primario", "md", "h-10 w-10 shrink-0 px-0")}
                disabled={cargando || !borrador.trim()}
                aria-label="Enviar"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Enter envía · Shift+Enter nueva línea. Las respuestas pueden tener errores; verifica lo importante.
            </p>
          </form>
        </div>
      )}
    </>
  );
}

function Burbuja({ mensaje }: { mensaje: Mensaje }) {
  const esIA = mensaje.rol === "ia";
  return (
    <li className={cx("flex", esIA ? "justify-start" : "justify-end")}>
      <div
        className={cx(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
          esIA
            ? "bg-secondary text-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {mensaje.analisis && <Pastilla a={mensaje.analisis} />}
        {mensaje.texto}
      </div>
    </li>
  );
}

function Pastilla({
  a,
}: {
  a: NonNullable<Mensaje["analisis"]>;
}) {
  const estilo = !a.encontrado
    ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
    : a.radicado
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const Icono = !a.encontrado ? Search : a.radicado ? CheckCircle2 : TriangleAlert;
  const texto = !a.encontrado
    ? `Manifiesto ${a.manifiesto}: sin registro`
    : a.radicado
      ? `Manifiesto ${a.manifiesto}: radicado`
      : a.errorSicetac
        ? `Manifiesto ${a.manifiesto}: error SICETAC (MAN045)`
        : `Manifiesto ${a.manifiesto}: con error`;
  return (
    <div
      className={cx(
        "mb-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        estilo,
      )}
    >
      <Icono size={12} />
      {texto}
    </div>
  );
}
