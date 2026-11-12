import type {
  Hallazgo,
  NivelHallazgo,
  ResultadoFuente,
  RolConsulta,
  TipoDocumento,
} from "./tipos.ts";

/*
 * Interpretación de las respuestas de TusDatos (docs.tusdatos.co), separada del
 * cliente para poder probarla sin conexión (npm run test:estudios).
 */

export const PESO_NIVEL: Record<NivelHallazgo, number> = {
  alto: 0,
  medio: 1,
  bajo: 2,
  info: 3,
  sin_hallazgo: 4,
};

/** El nivel más grave de una lista. */
export function nivelMasGrave(niveles: NivelHallazgo[]): NivelHallazgo {
  return niveles.reduce<NivelHallazgo>(
    (max, n) => (PESO_NIVEL[n] < PESO_NIVEL[max] ? n : max),
    "sin_hallazgo",
  );
}

/** `hallazgos` llega como "Alto", "medio", "info" o vacío: se compara sin mayúsculas. */
export function normalizarNivel(valor: unknown): NivelHallazgo {
  const n = String(valor ?? "")
    .trim()
    .toLowerCase();
  return n === "alto" || n === "medio" || n === "bajo" || n === "info"
    ? n
    : "sin_hallazgo";
}

export interface RespuestaResultado {
  id?: string;
  estado?: string;
  nombre?: string;
  hallazgo?: boolean;
  hallazgos?: unknown;
  error?: boolean;
  errores?: unknown;
  validado?: boolean;
  time?: number;
  typedoc?: string;
  results?: Record<string, unknown>;
}

export interface ResultadoInterpretado {
  reportId: string | null;
  nombre: string | null;
  nivel: NivelHallazgo;
  fuentes: Record<string, ResultadoFuente>;
  hallazgos: Hallazgo[];
}

const CATEGORIAS: [string, Hallazgo["nivel"]][] = [
  ["altos", "alto"],
  ["medios", "medio"],
  ["bajos", "bajo"],
  ["infos", "info"],
];

/** Hallazgos con detalle de /api/report_json/{id} (`dict_hallazgos`). */
export function hallazgosDelReporte(reporte: unknown): Hallazgo[] {
  const dict = (reporte as { dict_hallazgos?: unknown } | null)?.dict_hallazgos;
  if (!dict || typeof dict !== "object") return [];
  const lista: Hallazgo[] = [];
  for (const [categoria, nivel] of CATEGORIAS) {
    const items = (dict as Record<string, unknown>)[categoria];
    if (!Array.isArray(items)) continue;
    for (const item of items as Record<string, unknown>[]) {
      const titulo = String(item.hallazgo ?? item.codigo ?? "Hallazgo");
      lista.push({
        nivel,
        codigo: String(item.codigo ?? "sin_codigo"),
        fuente: String(item.fuente ?? "—"),
        titulo,
        descripcion: String(item.descripcion ?? titulo),
      });
    }
  }
  return lista;
}

/**
 * Convierte una respuesta "finalizado" de /api/results/{jobid}. Sin el detalle
 * del reporte, cada fuente con hallazgo queda con el nivel máximo de la consulta
 * (TusDatos no da el nivel por fuente en esta respuesta) y remite al reporte.
 */
export function interpretarResultado(
  r: RespuestaResultado,
  reporte?: unknown,
): ResultadoInterpretado {
  const fuentes: Record<string, ResultadoFuente> = {};
  for (const [fuente, valor] of Object.entries(r.results ?? {})) {
    fuentes[fuente] =
      valor === true ? "hallazgo" : valor === false ? "ok" : "error";
  }
  if (Array.isArray(r.errores))
    for (const fuente of r.errores) fuentes[String(fuente)] ??= "error";

  let hallazgos = hallazgosDelReporte(reporte);
  // El nivel nunca queda por debajo de lo que dice el detalle del reporte
  const nivel = nivelMasGrave([
    normalizarNivel(r.hallazgos),
    ...hallazgos.map((h) => h.nivel),
  ]);
  if (!hallazgos.length && nivel !== "sin_hallazgo") {
    hallazgos = Object.entries(fuentes)
      .filter(([, e]) => e === "hallazgo")
      .map(([fuente]) => ({
        nivel: nivel as Hallazgo["nivel"],
        fuente,
        codigo: "sin_detalle",
        titulo: `Hallazgo en ${fuente}`,
        descripcion:
          "TusDatos reporta una coincidencia en esta fuente. Revisa el reporte para ver el detalle.",
      }));
  }
  return {
    reportId: r.id ?? null,
    nombre: r.nombre?.trim() || null,
    nivel,
    fuentes,
    hallazgos,
  };
}

/** Ruta del reporte de TusDatos según lo consultado. */
export function rutaReporte(
  rol: RolConsulta,
  tipoDoc: string | null,
  formato: "html" | "pdf",
  reportId: string,
) {
  const id = encodeURIComponent(reportId);
  const base =
    rol === "documento"
      ? tipoDoc === "NIT"
        ? "report_nit"
        : "report"
      : "report_car";
  // async=true: si el PDF no está listo responde 202 en vez de dejar esperando
  return formato === "pdf"
    ? `/api/v2/${base}_pdf/${id}?async=true`
    : `/api/v2/${base}/${id}`;
}

export interface EntradaConsulta {
  tipoDocumento: TipoDocumento;
  documento: string | null;
  nombre: string | null;
  fechaExpedicion: string | null;
  placa: string | null;
  tipoDocPropietario: string | null;
  // Remolque (solo PLACA)
  placaRemolque: string | null;
  tipoDocPropietarioRemolque: string | null;
  documentoPropietarioRemolque: string | null;
  // Combo: tenedor, conductor y antecedentes (solo PLACA)
  tipoDocTenedor: string | null;
  documentoTenedor: string | null;
  fechaExpedicionTenedor: string | null;
  tipoDocConductor: string | null;
  documentoConductor: string | null;
  fechaExpedicionConductor: string | null;
  incluirAntecedentes: boolean;
}

export interface PlanConsulta {
  rol: RolConsulta;
  placa: string | null;
  tipoDoc: string;
  documento: string;
  nombre: string | null;
  fechaExpedicion: string | null;
}

/** Las consultas del estudio. El remolque sin propietario propio usa el del cabezote. */
export function planDeConsultas(e: EntradaConsulta): PlanConsulta[] {
  if (e.tipoDocumento !== "PLACA")
    return [
      {
        rol: "documento",
        placa: null,
        tipoDoc: e.tipoDocumento,
        documento: e.documento ?? "",
        nombre: e.nombre,
        fechaExpedicion: e.fechaExpedicion,
      },
    ];
  const placa = (
    rol: RolConsulta,
    numero: string,
    tipoDoc: string,
    documento: string,
  ): PlanConsulta => ({
    rol,
    placa: numero,
    tipoDoc,
    documento,
    nombre: null,
    fechaExpedicion: null,
  });
  const persona = (
    rol: RolConsulta,
    tipoDoc: string,
    documento: string,
    fechaExpedicion: string | null,
  ): PlanConsulta => ({
    rol,
    placa: null,
    tipoDoc,
    documento,
    nombre: null,
    fechaExpedicion,
  });
  const tipoPropCabezote = e.tipoDocPropietario ?? "CC";
  const docPropCabezote = e.documento ?? "";
  const tipoPropRem = e.tipoDocPropietarioRemolque ?? tipoPropCabezote;
  const docPropRem = e.documentoPropietarioRemolque ?? docPropCabezote;

  const consultas: PlanConsulta[] = [
    placa("cabezote", e.placa ?? "", tipoPropCabezote, docPropCabezote),
  ];
  // Sin la casilla de antecedentes NO hay combo: solo el cabezote con su
  // propietario, aunque se haya diligenciado remolque, tenedor o conductor.
  if (!e.incluirAntecedentes) return consultas;

  if (e.placaRemolque) {
    consultas.push(placa("remolque", e.placaRemolque, tipoPropRem, docPropRem));
  }

  consultas.push(
    persona("propietario", tipoPropCabezote, docPropCabezote, null),
  );
  // Mismo propietario del cabezote: ya quedó consultado arriba
  if (e.placaRemolque && e.documentoPropietarioRemolque) {
    consultas.push(persona("prop_remolque", tipoPropRem, docPropRem, null));
  }
  if (e.tipoDocTenedor && e.documentoTenedor) {
    consultas.push(
      persona(
        "tenedor",
        e.tipoDocTenedor,
        e.documentoTenedor,
        e.fechaExpedicionTenedor,
      ),
    );
  }
  if (e.tipoDocConductor && e.documentoConductor) {
    consultas.push(
      persona(
        "conductor",
        e.tipoDocConductor,
        e.documentoConductor,
        e.fechaExpedicionConductor,
      ),
    );
  }
  return consultas;
}
