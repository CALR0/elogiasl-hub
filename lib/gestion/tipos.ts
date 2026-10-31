/** Tipos compartidos (servidor y navegador) de Configuración y Auditoría. */

export interface RolFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  esSuperadmin: boolean;
  activo: boolean;
  usuarios: number;
  /** Claves de las funcionalidades (hojas) con acceso. */
  accesos: string[];
}

export interface UsuarioFila {
  id: string;
  nombre: string | null;
  email: string;
  rolId: string | null;
  rolNombre: string | null;
  activo: boolean;
  ultimoAcceso: string | null;
  creado: string;
}

export interface LogFila {
  id: number;
  fecha: string;
  actorNombre: string | null;
  actorEmail: string | null;
  modulo: string | null;
  accion: string;
  entidad: string | null;
  entidadId: string | null;
  resultado: "ok" | "error" | "denegado";
  detalle: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

export interface FiltrosLogs {
  desde?: string; // AAAA-MM-DD (hora de Colombia)
  hasta?: string;
  usuario?: string; // correo del actor
  modulo?: string; // clave raíz o completa ('financiero' o 'financiero.factura')
  accion?: string; // código exacto
  resultado?: "ok" | "error" | "denegado";
  q?: string;
}

export type Resultado<T = undefined> =
  { ok: true; mensaje: string; dato?: T } | { ok: false; error: string };
