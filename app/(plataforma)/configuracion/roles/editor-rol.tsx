"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, LoaderCircle, Save } from "lucide-react";
import { EstadoBadge } from "@/components/plataforma/estado-badge";
import { IconoModulo } from "@/components/plataforma/icono-modulo";
import { Aviso } from "@/components/ui/aviso";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Interruptor } from "@/components/ui/field";
import type { RolFila } from "@/lib/gestion/tipos";
import {
  esHoja,
  estadoDe,
  hojas,
  MODULOS,
  type NodoModulo,
} from "@/lib/modulos";
import { cx } from "@/lib/utils";
import { guardarRol } from "./acciones";

const TOTAL = hojas().length;

/**
 * Edita un rol: nombre, estado y a qué módulos, submódulos y funcionalidades
 * tiene acceso. Marcar un módulo o submódulo marca todo lo que tiene debajo;
 * se puede dar acceso a solo una parte (p. ej. Financiero › Transferencia sin
 * Factura). Lo que se guarda son las funcionalidades (hojas) marcadas.
 */
export function EditorRol({
  rol,
  mensajeInicial,
}: {
  rol: RolFila | null;
  mensajeInicial?: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "");
  const [activo, setActivo] = useState(rol?.activo ?? true);
  const [accesos, setAccesos] = useState<Set<string>>(
    () => new Set(rol?.accesos ?? []),
  );
  const [resultado, setResultado] = useState<
    { tipo: "ok" | "error"; texto: string } | undefined
  >(mensajeInicial ? { tipo: "ok", texto: mensajeInicial } : undefined);
  const [pendiente, iniciar] = useTransition();

  const superadmin = rol?.esSuperadmin ?? false;
  const tiene = (clave: string) => superadmin || accesos.has(clave);

  /** Marca o desmarca un nodo y todas sus funcionalidades. */
  function alternar(nodo: NodoModulo, marcar: boolean) {
    setAccesos((prev) => {
      const nuevo = new Set(prev);
      for (const h of esHoja(nodo) ? [nodo] : hojas(nodo.hijos)) {
        if (marcar) nuevo.add(h.clave);
        else nuevo.delete(h.clave);
      }
      return nuevo;
    });
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setResultado(undefined);
    iniciar(async () => {
      const r = await guardarRol({
        id: rol?.id,
        nombre,
        descripcion,
        activo,
        accesos: [...accesos],
      });
      if (!r.ok) return setResultado({ tipo: "error", texto: r.error });
      if (!rol) router.replace(`/configuracion/roles/${r.dato!.id}?creado=1`);
      else {
        setResultado({ tipo: "ok", texto: r.mensaje });
        router.refresh();
      }
    });
  }

  const conAcceso = superadmin ? TOTAL : accesos.size;

  return (
    <form onSubmit={guardar} className="space-y-6">
      {superadmin && (
        <p className="bg-brand-deep flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-white">
          <Crown className="text-brand mt-0.5 size-4 shrink-0" aria-hidden />
          Este rol tiene acceso a toda la plataforma, incluidos los módulos que
          se agreguen en el futuro. No se puede restringir ni desactivar.
        </p>
      )}

      <section className="bg-card grid gap-5 rounded-xl border p-5 md:grid-cols-[1fr_1.4fr_auto] md:items-start">
        <Field id="nombre" label="Nombre del rol">
          <Input
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            minLength={3}
            maxLength={60}
            disabled={superadmin}
            placeholder="Ej.: Analista financiero"
          />
        </Field>
        <Field
          id="descripcion"
          label="Descripción"
          hint="Opcional. Para qué sirve este rol."
        >
          <Input
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={240}
            disabled={superadmin}
          />
        </Field>
        <div className="md:pt-8">
          <Interruptor
            checked={activo}
            onChange={setActivo}
            disabled={superadmin}
            etiqueta={activo ? "Activo" : "Inactivo"}
          />
        </div>
      </section>

      <section aria-labelledby="titulo-accesos" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="titulo-accesos" className="font-semibold tracking-tight">
              Acceso a módulos
            </h2>
            <p className="text-muted-foreground text-sm">
              Marca un módulo completo o solo los submódulos que el rol
              necesita. Lo que no esté marcado no aparece en su menú.
            </p>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            <span className="text-foreground font-medium">{conAcceso}</span> de{" "}
            {TOTAL} con acceso
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {MODULOS.map((m) => {
            const hojasModulo = hojas(m.hijos);
            const marcadas = hojasModulo.filter((h) => tiene(h.clave)).length;
            return (
              <div
                key={m.clave}
                className="bg-card overflow-hidden rounded-xl border"
              >
                <label
                  className={cx(
                    "bg-muted/50 flex items-center gap-3 border-b px-4 py-3",
                    !superadmin && "cursor-pointer",
                  )}
                >
                  <Casilla
                    marcada={marcadas === hojasModulo.length}
                    parcial={marcadas > 0 && marcadas < hojasModulo.length}
                    onChange={(v) => alternar(m, v)}
                    disabled={superadmin}
                  />
                  <IconoModulo
                    nombre={m.icono}
                    className="text-accent-foreground size-4"
                  />
                  <span className="flex-1 text-sm font-semibold">
                    {m.nombre}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {marcadas}/{hojasModulo.length}
                  </span>
                </label>
                <ul className="space-y-0.5 p-2">
                  {m.hijos?.map((sub) => (
                    <li key={sub.clave}>
                      <FilaNodo
                        nodo={sub}
                        tiene={tiene}
                        alternar={alternar}
                        bloqueado={superadmin}
                      />
                      {!esHoja(sub) && (
                        <ul className="mb-1 ml-6 space-y-0.5 border-l border-dashed pl-2">
                          {sub.hijos!.map((f) => (
                            <li key={f.clave}>
                              <FilaNodo
                                nodo={f}
                                tiene={tiene}
                                alternar={alternar}
                                bloqueado={superadmin}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {!superadmin && (
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex flex-col gap-3 border-t px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-10 lg:px-10">
          <div className="min-h-5 flex-1">
            {resultado && (
              <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>
            )}
          </div>
          <div className="flex gap-2">
            <ButtonLink href="/configuracion/roles" variante="secundario">
              Volver
            </ButtonLink>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {rol ? "Guardar cambios" : "Crear rol"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

/** Submódulo o funcionalidad con su casilla (parcial si solo tiene parte de sus hijos). */
function FilaNodo({
  nodo,
  tiene,
  alternar,
  bloqueado,
}: {
  nodo: NodoModulo;
  tiene: (clave: string) => boolean;
  alternar: (nodo: NodoModulo, marcar: boolean) => void;
  bloqueado: boolean;
}) {
  const hijas = esHoja(nodo) ? [nodo] : hojas(nodo.hijos);
  const marcadas = hijas.filter((h) => tiene(h.clave)).length;
  const estado = estadoDe(nodo);

  return (
    <label
      className={cx(
        "flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm transition-colors",
        !bloqueado && "hover:bg-muted/50 cursor-pointer",
      )}
    >
      <Casilla
        marcada={marcadas === hijas.length}
        parcial={marcadas > 0 && marcadas < hijas.length}
        onChange={(v) => alternar(nodo, v)}
        disabled={bloqueado}
      />
      <span className="flex-1">{nodo.nombre}</span>
      {esHoja(nodo) && estado !== "disponible" && (
        <EstadoBadge estado={estado} className="scale-90" />
      )}
    </label>
  );
}

/** Casilla con estado "parcial" (indeterminate), que solo existe por JS. */
function Casilla({
  marcada,
  parcial,
  onChange,
  disabled,
}: {
  marcada: boolean;
  parcial: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <input
      type="checkbox"
      ref={(el) => {
        if (el) el.indeterminate = parcial;
      }}
      checked={marcada}
      onChange={() => onChange(!marcada)}
      disabled={disabled}
      className={cx(
        "accent-primary size-4 shrink-0",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    />
  );
}
