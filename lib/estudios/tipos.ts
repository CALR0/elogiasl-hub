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

/** Qué agrupó el solicitante: una sola persona o placa, o varias. */
export type TipoSolicitud = "individual" | "combo";

/**
 * Datos que escribió el solicitante (sin resultados): se muestran al abrir
 * el detalle en Mis solicitudes.
 */
export interface EntradaSolicitud {
  placa: string | null;
  tipoDocPropietario: string | null;
  documentoPropietario: string | null;
  // Tenedor y conductor (combo)
  tipoDocTenedor: string | null;
  documentoTenedor: string | null;
  tipoDocConductor: string | null;
  documentoConductor: string | null;
  // Remolque
  placaRemolque: string | null;
  tipoDocPropietarioRemolque: string | null;
  documentoPropietarioRemolque: string | null;
  // Flags
  incluirAntecedentes: boolean;
}

/** Fila de "Mis solicitudes": sin hallazgos ni fuentes. */
export interface SolicitudResumen {
  id: string;
  numero: number;
  modulo: "documento" | "vehiculo";
  tipo: TipoSolicitud;
  descripcion: string;
  estado: EstadoEstudio;
  fecha: string;
  decision: Decision;
  comentario: string | null;
  decididaAt: string | null;
  entrada: EntradaSolicitud;
}

/**
 * Qué se consultó. Los estudios de documento tienen rol "documento". Los de
 * vehículo tienen "cabezote" y, si lleva, "remolque" (consultas de placa +
 * propietario). Si el combo agrega tenedor / conductor, cada uno es una
 * consulta de antecedentes con su propio rol; "propietario" y "prop_remolque"
 * son los antecedentes de los propietarios cuando se marca "Incluir consulta
 * de antecedentes".
 */
export type RolConsulta =
  | "documento"
  | "cabezote"
  | "remolque"
  | "propietario"
  | "tenedor"
  | "conductor"
  | "prop_remolque";

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
    descripcion: "El analista aprobó el estudio.",
  },
  rechazado: {
    etiqueta: "Rechazado",
    descripcion: "El analista rechazó el estudio.",
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
