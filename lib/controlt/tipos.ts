/*
 * Tipos compartidos de Control T (portados de TVIEWER · controlt-mapa).
 * Se normaliza la respuesta cruda del API Web / API Public a camelCase antes
 * de pasarla al cliente, para evitar filtrar campos desordenados de la API.
 */

export type MetodoConsulta = "placa" | "manifiesto";

export interface Vehiculo {
  placa: string;
  latitud: number;
  longitud: number;
  fechaGps: string | null;
  prestadorGps: string | null;
  direccion: string | null;
  temperatura: number | null;
}

export interface ViajeResumen {
  idMonitoreo: string;
  numeroViaje: string | null;
  manifiesto: string | null;
  numeroDespacho: string | null;
  numeroOrden: string | null;
  placa: string | null;
  latitud: number | null;
  longitud: number | null;
  estado: string | null;
  avance: number | null;
  novedad: string | null;
  empresa: string | null;
  transportador: string | null;
  cliente: string | null;
  conductor: string | null;
  telefonoConductor: string | null;
  origen: string | null;
  ciudadOrigen: string | null;
  destino: string | null;
  ciudadDestino: string | null;
  ruta: string | null;
  tipoOperacion: string | null;
  tipoViaje: string | null;
  direccionActual: string | null;
  ultimoReporteGps: string | null;
  prestadorGps: string | null;
  ultimoEvento: string | null;
  ultimaAlarma: string | null;
  comentario: string | null;
  observaciones: string | null;
  cumplimientoCita: string | null;
}

export interface ResultadoConsulta {
  /** Vehículos localizados por placa (o la placa del viaje, si la consulta fue por manifiesto). */
  vehiculos: Vehiculo[];
  /** Viajes activos vinculados a la consulta. */
  viajes: ViajeResumen[];
  /** Mensaje de advertencia (no error) para mostrar en la UI. */
  aviso?: string;
}
