"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Power } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { cambiarEstadoRol } from "./acciones";

/** Activa o inactiva un rol, con confirmación (inactivar corta el acceso a sus usuarios). */
export function BotonEstadoRol({
  id,
  nombre,
  activo,
  usuarios,
}: {
  id: string;
  nombre: string;
  activo: boolean;
  usuarios: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const r = await cambiarEstadoRol(id, !activo);
      if (r.ok) setAbierto(false);
      else setError(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(undefined);
          setAbierto(true);
        }}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors"
      >
        <Power className="size-4" aria-hidden />
        {activo ? "Inactivar" : "Activar"}
      </button>

      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        ancho="sm"
        titulo={activo ? `¿Inactivar "${nombre}"?` : `¿Activar "${nombre}"?`}
        descripcion={
          activo
            ? usuarios > 0
              ? `${usuarios} ${usuarios === 1 ? "usuario perderá" : "usuarios perderán"} el acceso a la plataforma hasta que el rol se vuelva a activar o se les asigne otro.`
              : "Ningún usuario tiene este rol. No se podrá asignar mientras esté inactivo."
            : "Los usuarios con este rol recuperarán su acceso."
        }
      >
        {error && (
          <Aviso tipo="error" className="mb-4">
            {error}
          </Aviso>
        )}
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={pendiente}
            variante={activo ? "peligro" : "primario"}
          >
            {pendiente && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            )}
            {activo ? "Inactivar" : "Activar"}
          </Button>
        </div>
      </Dialogo>
    </>
  );
}
