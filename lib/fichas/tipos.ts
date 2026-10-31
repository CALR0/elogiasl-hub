/** Tipos de las fichas técnicas (vehículo y conductor) leídas de Silogtran. */

export type Par = [etiqueta: string, valor: string];
export type Seccion = [titulo: string, pares: Par[]];

/** Lo que se guarda (sellado) de una ficha para regenerar PDF / Excel / vista. */
export interface FichaGuardada {
  encabezadoPares: Par[];
  secciones: Seccion[];
  fotoUrl: string | null;
  /** Solo conductor: nombre completo. */
  nombre?: string;
}

/** Ficha lista para dibujar (PDF) o mostrar en pantalla. */
export interface FichaVista {
  titulo: string;
  consultado: string;
  destacados: Par[];
  secciones: Seccion[];
  textoSinFoto: string;
}

export type TipoFicha = "vehiculo" | "conductor";

/** Respuesta de una consulta por placa. */
export interface ResultadoConsulta {
  placa: string;
  conductor: string | null;
  conductorError: string | null;
  /** Ficha sellada: el navegador la reenvía para PDF, vista y Excel. */
  ficha: string;
}
