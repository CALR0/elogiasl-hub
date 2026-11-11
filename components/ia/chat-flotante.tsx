"use client";

import { Bot, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/ia/markdown";
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
  /** Modelo que generó esta respuesta (solo para mensajes de la IA). */
  modelo?: string | null;
}

const BIENVENIDA: Mensaje = {
  rol: "ia",
  texto:
    "Hola, soy Elia, la IA asistente de Elogia Soluciones Logísticas. Puedo consultar un manifiesto y explicarte si ya está radicado o por qué el Ministerio lo rechazó. Pégame el número para empezar, o pregúntame lo que necesites.",
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
    if (!abierto) return;
    // En móvil no autoenfocamos: así no se abre el teclado al entrar (ni
    // dispara el zoom involuntario de iOS). El usuario toca el textarea
    // cuando quiere escribir. Desde tablet/desktop sí tiene sentido.
    const esMovil =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches;
    if (!esMovil) textareaRef.current?.focus();
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
        { rol: "ia", texto: datos.respuesta, modelo: datos.modelo ?? null },
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
          aria-label="Abrir Elia, IA asistente de Elogia"
          onClick={() => setAbierto(true)}
          className="fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <Sparkles size={22} />
        </button>
      )}

      {abierto && (
        <div
          className={cx(
            "fixed z-40 flex flex-col overflow-hidden bg-card shadow-2xl",
            // En celular ocupa toda la pantalla; desde sm vuelve a ser una
            // ventana flotante en la esquina con su borde redondeado.
            "inset-0 h-[100dvh] w-screen rounded-none border-0",
            "sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(620px,calc(100dvh-2rem))] sm:w-[min(420px,calc(100vw-2rem))] sm:rounded-xl sm:border",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Elia, IA asistente de Elogia"
        >
          {/* Encabezado */}
          <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                Elia
              </p>
              <p className="truncate text-xs text-muted-foreground">
                IA asistente de Elogia
              </p>
            </div>
            <button
              type="button"
              onClick={reiniciar}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Empezar una conversación nueva"
              aria-label="Empezar una conversación nueva"
            >
              <MessageCircle size={18} />
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Cerrar"
              aria-label="Cerrar Elia"
            >
              <X size={20} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <ul className="space-y-3">
              {mensajes.map((m, i) => (
                <Burbuja key={i} mensaje={m} />
              ))}
              {cargando && (
                <li className="text-xs text-muted-foreground">Pensando…</li>
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
                /*
                 * text-base (16 px) en móvil, text-sm (14 px) desde sm. iOS
                 * Safari acerca automáticamente cualquier input con fuente
                 * menor a 16 px al enfocarlo; con 16 px exactos no lo hace.
                 */
                className="min-h-[48px] max-h-32 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 sm:text-sm"
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
          </form>
        </div>
      )}
    </>
  );
}

function Burbuja({ mensaje }: { mensaje: Mensaje }) {
  const esIA = mensaje.rol === "ia";
  return (
    <li className={cx("flex flex-col", esIA ? "items-start" : "items-end")}>
      <div
        className={cx(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
          esIA
            ? "bg-secondary text-foreground"
            : "bg-primary text-primary-foreground whitespace-pre-wrap",
        )}
      >
        {esIA ? <Markdown texto={mensaje.texto} /> : mensaje.texto}
      </div>
      {esIA && mensaje.modelo && (
        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
          {mensaje.modelo}
        </span>
      )}
    </li>
  );
}
