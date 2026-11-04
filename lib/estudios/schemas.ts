import { z } from "zod";

/**
 * Validación de los dos formularios de "Solicitar estudios" (migrado de
 * elogix-app, sin el flujo de remolque — se puede añadir más adelante).
 */

export const TIPOS_DOCUMENTO = [
  { valor: "CC", corto: "CC", largo: "Cédula de ciudadanía" },
  { valor: "CE", corto: "CE", largo: "Cédula de extranjería" },
  { valor: "PPT", corto: "PPT", largo: "Permiso por protección temporal" },
  { valor: "PP", corto: "Pasaporte", largo: "Pasaporte" },
  { valor: "NIT", corto: "NIT", largo: "NIT de empresa" },
] as const;

export const TIPOS_DOC_PROPIETARIO = [
  { valor: "CC", corto: "CC", largo: "Cédula de ciudadanía" },
  { valor: "CE", corto: "CE", largo: "Cédula de extranjería" },
  { valor: "NIT", corto: "NIT", largo: "NIT de empresa" },
  { valor: "TI", corto: "TI", largo: "Tarjeta de identidad" },
] as const;

export type TipoDocumentoFormulario =
  (typeof TIPOS_DOCUMENTO)[number]["valor"];
export type TipoDocPropietario =
  (typeof TIPOS_DOC_PROPIETARIO)[number]["valor"];

const soloDigitos = z
  .string()
  .trim()
  .regex(
    /^\d{5,12}$/,
    "Escribe solo números, sin puntos ni espacios (5 a 12 dígitos).",
  );

const autorizacion = z.literal(true, {
  error: "Debes confirmar la autorización del titular.",
});

const fechaExpedicion = z.iso
  .date({ error: "Indica la fecha de expedición." })
  .refine((f) => new Date(f) <= new Date(), "La fecha no puede ser futura.");

export const consultaDocumentoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("CC"), documento: soloDigitos, autorizacion }),
  z.object({ tipo: z.literal("NIT"), documento: soloDigitos, autorizacion }),
  z.object({
    tipo: z.literal("CE"),
    documento: soloDigitos,
    fechaExpedicion,
    autorizacion,
  }),
  z.object({
    tipo: z.literal("PPT"),
    documento: soloDigitos,
    fechaExpedicion,
    autorizacion,
  }),
  z.object({
    tipo: z.literal("PP"),
    documento: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9]{5,15}$/,
        "Solo letras y números (5 a 15 caracteres).",
      ),
    nombre: z
      .string()
      .trim()
      .min(5, "Escribe el nombre completo (mínimo 5 letras)."),
    autorizacion,
  }),
]);

/** Carros: ABC123. Motos: ABC12D. */
export const PLACA_REGEX = /^[A-Z]{3}\d{3}$|^[A-Z]{3}\d{2}[A-Z]$/;

export const consultaVehiculoSchema = z.object({
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PLACA_REGEX, "Placa inválida. Formato ABC123 (carro) o ABC12D (moto)."),
  tipoPropietario: z.enum(["CC", "CE", "NIT", "TI"]),
  documentoPropietario: soloDigitos,
  autorizacion,
});

export type ConsultaDocumento = z.infer<typeof consultaDocumentoSchema>;
export type ConsultaVehiculo = z.infer<typeof consultaVehiculoSchema>;

export function erroresPorCampo(error: z.ZodError) {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "form");
    errores[campo] ??= issue.message;
  }
  return errores;
}
