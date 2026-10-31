import "server-only";
import { autorizar as autorizarModulo } from "@/lib/api/guardia.ts";

export { cuerpoJson, json } from "@/lib/api/guardia.ts";

export const MODULO_FICHAS = "maestros.vehiculo.ficha-tecnica";

/** Puerta de /api/fichas/*: sesión del portal y acceso a Generar ficha técnica. */
export const autorizar = (req: Request) =>
  autorizarModulo(req, MODULO_FICHAS, "Generar ficha técnica");
