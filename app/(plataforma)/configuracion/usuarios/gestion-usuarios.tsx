"use client";

import { useState, useTransition } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  Search,
  UserX,
} from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import {
  Field,
  Input,
  Select,
  inputClasses,
  selectClasses,
} from "@/components/ui/field";
import { Paginacion, usePaginacion } from "@/components/ui/paginacion";
import type { Resultado, UsuarioFila } from "@/lib/gestion/tipos";
import { cx, fechaCorta, iniciales } from "@/lib/utils";
import { cambiarEstadoUsuario, crearUsuario, editarUsuario } from "./acciones";

type RolOpcion = { id: string; nombre: string; activo: boolean };
type Estado = "todos" | "activos" | "inactivos";

export function GestionUsuarios({
  usuarios,
  roles,
  miId,
}: {
  usuarios: UsuarioFila[];
  roles: RolOpcion[];
  miId: string;
}) {
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState("");
  const [estado, setEstado] = useState<Estado>("todos");
  const [formulario, setFormulario] = useState<UsuarioFila | "nuevo" | null>(
    null,
  );
  const [cambioEstado, setCambioEstado] = useState<UsuarioFila | null>(null);
  const [mensaje, setMensaje] = useState<string>();

  const q = texto.trim().toLowerCase();
  // Derivado de las props (no copiado a estado): refleja revalidatePath al instante
  const filtrados = usuarios.filter(
    (u) =>
      (!q || `${u.nombre ?? ""} ${u.email}`.toLowerCase().includes(q)) &&
      (!rol || u.rolId === rol) &&
      (estado === "todos" || u.activo === (estado === "activos")),
  );
  const { ancla, visibles, reiniciar, props } = usePaginacion(filtrados);
  const activos = usuarios.filter((u) => u.activo).length;

  function alTerminar(r: Resultado) {
    if (r.ok) {
      setMensaje(r.mensaje);
      setFormulario(null);
      setCambioEstado(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              reiniciar();
            }}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar usuarios"
            className={cx(inputClasses, "pl-10")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <select
            value={rol}
            onChange={(e) => {
              setRol(e.target.value);
              reiniciar();
            }}
            aria-label="Filtrar por rol"
            className={cx(selectClasses, "sm:w-48")}
          >
            <option value="">Todos los roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as Estado);
              reiniciar();
            }}
            aria-label="Filtrar por estado"
            className={cx(selectClasses, "sm:w-40")}
          >
            <option value="todos">Todos ({usuarios.length})</option>
            <option value="activos">Activos ({activos})</option>
            <option value="inactivos">
              Inactivos ({usuarios.length - activos})
            </option>
          </select>
          <Button
            className="col-span-2 h-11"
            onClick={() => {
              setMensaje(undefined);
              setFormulario("nuevo");
            }}
          >
            <Plus className="size-4" aria-hidden />
            Nuevo usuario
          </Button>
        </div>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}

      <div ref={ancla} className="bg-card overflow-hidden rounded-xl border">
        {visibles.length === 0 ? (
          <p className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
            <UserX className="size-6" aria-hidden />
            No hay usuarios que coincidan con los filtros.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground hidden text-xs md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">
                  Usuario
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Rol
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Estado
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Último acceso
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibles.map((u) => {
                const soyYo = u.id === miId;
                return (
                  <tr
                    key={u.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 md:table-row md:p-0"
                  >
                    <td className="flex min-w-0 basis-full items-center gap-3 md:table-cell md:px-5 md:py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className={cx(
                            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            u.activo
                              ? "bg-secondary text-accent-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {iniciales(u.nombre || u.email)}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate font-medium">
                            {u.nombre || "Sin nombre"}
                            {soyYo && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                (tú)
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="md:px-3 md:py-3">
                      <span className="bg-muted rounded-md px-2 py-0.5 text-xs">
                        {u.rolNombre ?? "Sin rol"}
                      </span>
                    </td>
                    <td className="md:px-3 md:py-3">
                      <span
                        className={cx(
                          "inline-flex items-center gap-1.5 text-xs font-medium",
                          u.activo
                            ? "text-accent-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cx(
                            "size-2 rounded-full",
                            u.activo ? "bg-primary" : "bg-muted-foreground/50",
                          )}
                        />
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="text-muted-foreground text-xs md:px-3 md:py-3">
                      <span className="md:hidden">Último acceso: </span>
                      {u.ultimoAcceso ? fechaCorta(u.ultimoAcceso) : "Nunca"}
                    </td>
                    <td className="ml-auto md:px-5 md:py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setMensaje(undefined);
                            setFormulario(u);
                          }}
                          aria-label={`Editar a ${u.nombre ?? u.email}`}
                          title="Editar"
                          className="text-muted-foreground hover:bg-secondary hover:text-foreground flex size-9 items-center justify-center rounded-lg transition-colors"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        {!soyYo && (
                          <button
                            type="button"
                            onClick={() => {
                              setMensaje(undefined);
                              setCambioEstado(u);
                            }}
                            aria-label={`${u.activo ? "Inactivar" : "Activar"} a ${u.nombre ?? u.email}`}
                            title={u.activo ? "Inactivar" : "Activar"}
                            className="text-muted-foreground hover:bg-secondary hover:text-foreground flex size-9 items-center justify-center rounded-lg transition-colors"
                          >
                            <Power className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Paginacion {...props} etiqueta="usuarios" singular="usuario" />

      {formulario && (
        <FormularioUsuario
          usuario={formulario === "nuevo" ? null : formulario}
          roles={roles}
          esPropio={formulario !== "nuevo" && formulario.id === miId}
          onCerrar={() => setFormulario(null)}
          onListo={alTerminar}
        />
      )}

      {cambioEstado && (
        <ConfirmarEstado
          usuario={cambioEstado}
          onCerrar={() => setCambioEstado(null)}
          onListo={alTerminar}
        />
      )}
    </div>
  );
}

/** Contraseña aleatoria de 14 caracteres sin caracteres ambiguos (0/O, 1/l…). */
function generarClave() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#$%&*+?";
  const n = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(n, (x) => c[x % c.length]).join("");
}

function FormularioUsuario({
  usuario,
  roles,
  esPropio,
  onCerrar,
  onListo,
}: {
  usuario: UsuarioFila | null;
  roles: RolOpcion[];
  esPropio: boolean;
  onCerrar: () => void;
  onListo: (r: Resultado) => void;
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [rolId, setRolId] = useState(usuario?.rolId ?? "");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  // Se ofrecen los roles activos y, si lo tiene, el rol actual aunque esté inactivo
  const opciones = roles.filter((r) => r.activo || r.id === usuario?.rolId);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    iniciar(async () => {
      const datos = { nombre, email, rolId, clave };
      const r = usuario
        ? await editarUsuario({ id: usuario.id, ...datos })
        : await crearUsuario(datos);
      if (r.ok) onListo(r);
      else setError(r.error);
    });
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={usuario ? "Editar usuario" : "Nuevo usuario"}
      descripcion={
        usuario
          ? "Los cambios de rol aplican desde su siguiente acción en la plataforma."
          : "La persona iniciará sesión con este correo y la contraseña que definas aquí."
      }
    >
      <form onSubmit={enviar} className="space-y-4">
        <Field id="u-nombre" label="Nombre completo">
          <Input
            id="u-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </Field>
        <Field id="u-email" label="Correo electrónico">
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
            placeholder="nombre@elogia.com.co"
          />
        </Field>
        <Field
          id="u-rol"
          label="Rol"
          hint={esPropio ? "No puedes cambiar tu propio rol." : undefined}
        >
          <Select
            id="u-rol"
            value={rolId}
            onChange={(e) => setRolId(e.target.value)}
            required
            disabled={esPropio}
          >
            <option value="" disabled>
              Elige un rol
            </option>
            {opciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="u-clave"
          label={usuario ? "Nueva contraseña" : "Contraseña"}
          hint={
            usuario
              ? "Déjala vacía para no cambiarla. Mínimo 10 caracteres."
              : "Mínimo 10 caracteres. Es la contraseña con la que entrará siempre."
          }
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="u-clave"
                type={verClave ? "text" : "password"}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required={!usuario}
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                spellCheck={false}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={
                  verClave ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
              >
                {verClave ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            <Button
              type="button"
              variante="secundario"
              className="h-11 shrink-0"
              title="Generar una contraseña segura"
              onClick={() => {
                setClave(generarClave());
                setVerClave(true); // para poder anotarla
              }}
            >
              <KeyRound className="size-4" aria-hidden />
              Generar
            </Button>
          </div>
        </Field>

        {error && <Aviso tipo="error">{error}</Aviso>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pendiente}>
            {pendiente && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            )}
            {usuario ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

function ConfirmarEstado({
  usuario,
  onCerrar,
  onListo,
}: {
  usuario: UsuarioFila;
  onCerrar: () => void;
  onListo: (r: Resultado) => void;
}) {
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  const nombre = usuario.nombre ?? usuario.email;

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      ancho="sm"
      titulo={
        usuario.activo ? `¿Inactivar a ${nombre}?` : `¿Activar a ${nombre}?`
      }
      descripcion={
        usuario.activo
          ? "No podrá iniciar sesión y perderá el acceso de inmediato. Su historial en Auditoría se conserva."
          : "Podrá volver a iniciar sesión con el rol que tiene asignado."
      }
    >
      {error && (
        <Aviso tipo="error" className="mb-4">
          {error}
        </Aviso>
      )}
      <div className="flex justify-end gap-2">
        <Button variante="secundario" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button
          variante={usuario.activo ? "peligro" : "primario"}
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await cambiarEstadoUsuario(usuario.id, !usuario.activo);
              if (r.ok) onListo(r);
              else setError(r.error);
            })
          }
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          )}
          {usuario.activo ? "Inactivar" : "Activar"}
        </Button>
      </div>
    </Dialogo>
  );
}
