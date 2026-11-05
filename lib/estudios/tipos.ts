/** Tipos compartidos del módulo Estudios. */

export type TipoDocumento = "CC" | "CE" | "NIT" | "PP" | "PPT" | "PLACA";

/** Estado visible al solicitante. */
export type EstadoEstudio =
  "enviada" | "procesando" | "finalizada" | "aprobado" | "rechazado" | "error";

export type NivelHallazgo = "alto" | "medio" | "bajo" | "info" | "sin_hallazgo";

export type Decision = "pendiente" | "aprobado" | "rechazado";

export type ResultadoFuente = "ok" | "hallazgo" | "error";

export interface Hallazgo {
  nivel: Exclude<NivelHallazgo, "sin_hallazgo">;
  codigo: string;
  fuente: string;
  titulo: string;
  descripcion: string;
}

/** Fila de "Mis solicitudes": sin hallazgos ni fuentes. */
export interface SolicitudResumen {
  id: string;
  numero: number;
  modulo: "documento" | "vehiculo";
  descripcion: string;
  estado: EstadoEstudio;
  fecha: string;
  decision: Decision;
  comentario: string | null;
  decididaAt: string | null;
}

/** Qué se consultó: un documento, o la placa del cabezote o del remolque. */
export type RolConsulta = "documento" | "cabezote" | "remolque";

export type EstadoConsulta = "procesando" | "finalizada" | "error";

/** Una consulta a TusDatos dentro del estudio, con su propio resultado. */
export interface ConsultaEstudio {
  id: string;
  rol: RolConsulta;
  placa: string | null;
  tipoDoc: string | null;
  documento: string | null;
  estado: EstadoConsulta;
  nivel: NivelHallazgo | null;
  nombreConsultado: string | null;
  fuentes: Record<string, ResultadoFuente>;
  hallazgos: Hallazgo[];
  datos: Record<string, unknown>;
  mensajeError: string | null;
  tieneReporte: boolean;
  simulada: boolean;
}

export interface EventoEstudio {
  fecha: string;
  tipo: "info" | "ok" | "error";
  texto: string;
}

/** Vista del verificador: resumen + resultados. */
export interface Estudio {
  id: string;
  numero: number;
  modulo: "documento" | "vehiculo";
  descripcion: string;
  nombreConsultado: string | null;
  solicitante: string;
  fecha: string;
  estado: EstadoEstudio;
  nivel: NivelHallazgo | null;
  consultas: ConsultaEstudio[];
  eventos: EventoEstudio[];
  decision: Decision;
  comentario: string | null;
  simulada: boolean;
}

export const ESTADOS: Record<
  EstadoEstudio,
  { etiqueta: string; descripcion: string }
> = {
  enviada: {
    etiqueta: "Enviada",
    descripcion: "Recibida, en cola para consultar.",
  },
  procesando: {
    etiqueta: "En proceso",
    descripcion: "Consultando las fuentes.",
  },
  finalizada: {
    etiqueta: "Finalizada",
    descripcion: "Consulta completa, pendiente de revisión.",
  },
  aprobado: {
    etiqueta: "Aprobado",
    descripcion: "El verificador aprobó el estudio.",
  },
  rechazado: {
    etiqueta: "Rechazado",
    descripcion: "El verificador rechazó el estudio.",
  },
  error: {
    etiqueta: "No enviada",
    descripcion: "Hubo un error al enviarla. Intenta de nuevo.",
  },
};

export const NIVELES: Record<
  NivelHallazgo,
  { etiqueta: string; tono: "rojo" | "naranja" | "amarillo" | "azul" | "verde" }
> = {
  alto: { etiqueta: "Alto", tono: "rojo" },
  medio: { etiqueta: "Medio", tono: "naranja" },
  bajo: { etiqueta: "Bajo", tono: "amarillo" },
  info: { etiqueta: "Informativo", tono: "azul" },
  sin_hallazgo: { etiqueta: "Sin hallazgos", tono: "verde" },
};
