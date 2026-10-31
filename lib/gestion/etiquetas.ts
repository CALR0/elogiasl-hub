import { buscarPorSegmentos, MODULOS } from "@/lib/modulos";

/**
 * Textos legibles de los códigos de auditoría. Al registrar una acción nueva
 * (p. ej. al migrar SMA o FVE-C), agrega aquí su etiqueta.
 */
export const ACCIONES_AUDITORIA: Record<string, string> = {
  "sesion.iniciar": "Inició sesión",
  "sesion.cerrar": "Cerró sesión",
  "sesion.fallida": "Inicio de sesión fallido",
  "sesion.denegada": "Inicio de sesión denegado",
  "acceso.denegado": "Acceso denegado",
  "rol.crear": "Creó un rol",
  "rol.editar": "Editó un rol",
  "rol.activar": "Activó un rol",
  "rol.inactivar": "Inactivó un rol",
  "usuario.crear": "Creó un usuario",
  "usuario.editar": "Editó un usuario",
  "usuario.activar": "Activó un usuario",
  "usuario.inactivar": "Inactivó un usuario",
  "auditoria.exportar": "Exportó logs",
  "anticipo.migrar": "Migró un anticipo a SAP",
  "ficha.consultar": "Consultó una ficha técnica",
  "ficha.exportar": "Exportó fichas a Excel",
  "silogtran.sesion": "Inició sesión en Silogtran (cuenta de servicio)",
};

export const etiquetaAccion = (codigo: string) =>
  ACCIONES_AUDITORIA[codigo] ?? codigo;

/** "Financiero › Transferencia › Migración anticipo SAP" para una clave. */
export function etiquetaModulo(clave: string | null) {
  if (!clave) return "—";
  if (clave === "sesion") return "Sesión";
  const hallado = buscarPorSegmentos(clave.split("."));
  if (!hallado) return clave;
  return [...hallado.ancestros, hallado.nodo].map((n) => n.nombre).join(" › ");
}

/** Opciones del filtro de módulo: módulos raíz y sus hojas. */
export const OPCIONES_MODULO: ReadonlyArray<{ valor: string; texto: string }> =
  [
    { valor: "sesion", texto: "Sesión" },
    ...MODULOS.map((m) => ({ valor: m.clave, texto: m.nombre })),
  ];
