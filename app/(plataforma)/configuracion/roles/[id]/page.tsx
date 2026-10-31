import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/plataforma/encabezado";
import { requirePermiso } from "@/lib/auth";
import { obtenerRol } from "@/lib/gestion/datos";
import { EditorRol } from "../editor-rol";

export const metadata: Metadata = { title: "Rol" };

export default async function RolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  await requirePermiso("configuracion.roles");
  const [{ id }, { creado }] = await Promise.all([params, searchParams]);
  const rol = /^[0-9a-f-]{36}$/i.test(id) ? await obtenerRol(id) : null;
  if (!rol) notFound();

  return (
    <div className="space-y-6">
      <Encabezado
        icono="roles"
        titulo={rol.nombre}
        descripcion={`${rol.usuarios} ${rol.usuarios === 1 ? "usuario tiene" : "usuarios tienen"} este rol.`}
      />
      <EditorRol
        key={rol.id}
        rol={rol}
        mensajeInicial={creado ? `Se creó el rol "${rol.nombre}".` : undefined}
      />
    </div>
  );
}
