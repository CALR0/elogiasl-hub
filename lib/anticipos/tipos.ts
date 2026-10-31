/** Resultado de migrar un anticipo (una fila de la tabla y del Excel). */
export interface FilaMigracion {
  consolidado: string | null;
  planilla: string;
  estado: "Exitoso" | "Duplicado" | "Error";
  httpStatus: number | null;
  mensaje: string;
  /** Respuesta de AWS /logs (para el detalle y el Excel). */
  info: {
    createdAt?: string;
    data?: unknown;
    entity?: unknown;
    id?: string;
  } | null;
  /** Payload de Silogtran; se envía a SAP solo si `enviado` (columna "Entrada" del Excel). */
  entrada: unknown;
  /** true si no se envió de verdad (sin X_API_KEY o SIMULATE_CREATE=true). */
  simulado: boolean;
  /** true solo si se hizo el POST /events a AWS (lo único que crea el anticipo en SAP). */
  enviado: boolean;
}
