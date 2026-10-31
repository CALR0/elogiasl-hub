"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { PantallaCarga } from "@/components/ui/pantalla-carga";
import { iniciarSesion } from "./actions";

export function LoginForm({ next, demo }: { next?: string; demo: boolean }) {
  const [state, formAction, pending] = useActionState(iniciarSesion, null);
  const [verClave, setVerClave] = useState(false);
  // Controlado: React limpia el formulario tras cada envío y así el correo no
  // se pierde si la contraseña fue incorrecta (la contraseña sí se borra).
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      {/* Mientras se valida y se carga la pantalla de inicio */}
      {pending && <PantallaCarga texto="Iniciando sesión…" />}
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Correo electrónico
        </label>
        <div className="relative">
          <Mail
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={!demo}
            autoComplete="username"
            placeholder="nombre@elogia.com.co"
            className="border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-primary h-11 w-full rounded-lg border pr-3 pl-10 text-sm transition-colors outline-none"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <div className="relative">
          <LockKeyhole
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id="password"
            name="password"
            type={verClave ? "text" : "password"}
            required={!demo}
            autoComplete="current-password"
            className="border-input bg-card focus-visible:border-primary h-11 w-full rounded-lg border pr-11 pl-10 text-sm transition-colors outline-none"
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
          >
            {verClave ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-70"
      >
        {pending && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        )}
        {pending ? "Iniciando sesión…" : demo ? "Entrar (demostración)" : "Ingresar"}
      </button>
    </form>
  );
}
