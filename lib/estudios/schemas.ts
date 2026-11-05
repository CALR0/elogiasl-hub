import { z } from "zod";

/**
 * Validación de los dos formularios de "Solicitar estudios" (fielmente
 * portado de elogix-app, incluyendo remolque opcional en el formulario de
 * vehículo).
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

/** El remolque es otra placa: se consulta igual que el cabezote. */
export const TIPOS_DOC_REMOLQUE = TIPOS_DOC_PROPIETARIO;

/**
 * Tenedor y conductor son personas (van por /api/launch). Soporta los mismos
 * tipos que el formulario de documento, con el añadido de TI.
 */
export const TIPOS_DOC_PERSONA = [
  { valor: "CC", corto: "CC", largo: "Cédula de ciudadanía" },
  { valor: "CE", corto: "CE", largo: "Cédula de extranjería" },
  { valor: "PPT", corto: "PPT", largo: "Permiso por protección temporal" },
  { valor: "PP", corto: "Pasaporte", largo: "Pasaporte" },
  { valor: "TI", corto: "TI", largo: "Tarjeta de identidad" },
  { valor: "NIT", corto: "NIT", largo: "NIT de empresa" },
] as const;

export type TipoDocumentoFormulario = (typeof TIPOS_DOCUMENTO)[number]["valor"];
export type TipoDocPropietario =
  (typeof TIPOS_DOC_PROPIETARIO)[number]["valor"];
export type TipoDocRemolque = (typeof TIPOS_DOC_REMOLQUE)[number]["valor"];
export type TipoDocPersona = (typeof TIPOS_DOC_PERSONA)[number]["valor"];

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

/** Remolque (R) o semirremolque (S) + 5 dígitos: R41130, S12345. */
export const PLACA_REMOLQUE_REGEX = /^[RS]\d{5}$/;

/** Tipos de documento que acepta TusDatos en el combo de personas. */
const TIPOS_PERSONA_ENUM = ["CC", "CE", "NIT", "TI", "PP", "PPT"] as const;

/** Un documento ingresado como tenedor o conductor. Fecha de expedición es
 *  opcional (TusDatos la marca "opcional" incluso para CC). */
function validarPersona(
  d: { tipo: string; documento: string; fechaExpedicion?: string },
  ctx: z.RefinementCtx,
  prefijo: string,
) {
  if (!d.documento) {
    ctx.addIssue({
      code: "custom",
      path: [`${prefijo}Documento`],
      message: "Escribe el número de documento.",
    });
    return;
  }
  const valido =
    d.tipo === "PP"
      ? /^[A-Za-z0-9]{5,15}$/.test(d.documento)
      : /^\d{5,12}$/.test(d.documento);
  if (!valido) {
    ctx.addIssue({
      code: "custom",
      path: [`${prefijo}Documento`],
      message:
        d.tipo === "PP"
          ? "Solo letras y números (5 a 15 caracteres)."
          : "Escribe solo números, sin puntos ni espacios (5 a 12 dígitos).",
    });
  }
  if (d.fechaExpedicion && new Date(d.fechaExpedicion) > new Date()) {
    ctx.addIssue({
      code: "custom",
      path: [`${prefijo}FechaExpedicion`],
      message: "La fecha no puede ser futura.",
    });
  }
}

export const consultaVehiculoSchema = z
  .object({
    placa: z
      .string()
      .trim()
      .toUpperCase()
      .regex(PLACA_REGEX, "Placa inválida. Formato ABC123."),
    tipoPropietario: z.enum(["CC", "CE", "NIT", "TI"]),
    documentoPropietario: soloDigitos,
    fechaExpedicionPropietario: z.string().trim().default(""),
    // Tenedor / Poseedor (opcional)
    incluirTenedor: z.boolean(),
    tipoTenedor: z.enum(TIPOS_PERSONA_ENUM),
    documentoTenedor: z.string().trim(),
    fechaExpedicionTenedor: z.string().trim().default(""),
    // Conductor (opcional)
    incluirConductor: z.boolean(),
    tipoConductor: z.enum(TIPOS_PERSONA_ENUM),
    documentoConductor: z.string().trim(),
    fechaExpedicionConductor: z.string().trim().default(""),
    // Remolque (opcional)
    incluirRemolque: z.boolean(),
    placaRemolque: z.string().trim().toUpperCase(),
    remolqueMismoPropietario: z.boolean(),
    tipoPropietarioRemolque: z.enum(["CC", "CE", "NIT", "TI"]),
    documentoPropietarioRemolque: z.string().trim(),
    /** Si true, también se piden antecedentes del propietario (y del propietario
     *  del remolque, si lleva) con /api/launch del tipo+documento. */
    incluirAntecedentes: z.boolean(),
    autorizacion,
  })
  .superRefine((d, ctx) => {
    if (d.incluirTenedor) {
      validarPersona(
        {
          tipo: d.tipoTenedor,
          documento: d.documentoTenedor,
          fechaExpedicion: d.fechaExpedicionTenedor,
        },
        ctx,
        "tenedor",
      );
    }
    if (d.incluirConductor) {
      validarPersona(
        {
          tipo: d.tipoConductor,
          documento: d.documentoConductor,
          fechaExpedicion: d.fechaExpedicionConductor,
        },
        ctx,
        "conductor",
      );
    }
    if (!d.incluirRemolque) return;
    if (!PLACA_REMOLQUE_REGEX.test(d.placaRemolque)) {
      ctx.addIssue({
        code: "custom",
        path: ["placaRemolque"],
        message: "Placa de remolque inválida. Formato R12345 o S12345.",
      });
    }
    if (d.remolqueMismoPropietario) return;
    if (!/^\d{5,12}$/.test(d.documentoPropietarioRemolque)) {
      ctx.addIssue({
        code: "custom",
        path: ["documentoPropietarioRemolque"],
        message:
          "Escribe solo números, sin puntos ni espacios (5 a 12 dígitos).",
      });
    }
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
