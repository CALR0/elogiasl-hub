/**
 * Árbol de módulos de la plataforma: Módulo → Submódulo → Funcionalidad.
 *
 * Es la única fuente para el menú, las rutas, las migas de pan y la pantalla
 * de permisos de Roles. La tabla `public.modulos` es su espejo en la BD (para
 * las llaves foráneas y RLS): si agregas un nodo aquí, agrégalo también en una
 * migración nueva con la misma `clave`.
 *
 * La ruta de cada nodo sale de su clave: "financiero.transferencia.x" →
 * "/financiero/transferencia/x". Los roles reciben acceso a los nodos HOJA
 * (funcionalidades); con eso ven también su submódulo y su módulo.
 */

/**
 * - `disponible`: la funcionalidad ya trabaja en la plataforma.
 * - `migracion`: existe como aplicación aparte y se está trayendo (ver `origen`).
 * - `construccion`: definido en el mapa, sin desarrollar todavía.
 */
export type EstadoModulo = "disponible" | "migracion" | "construccion";

/** Nombre del ícono (ver components/plataforma/icono-modulo.tsx). */
export type IconoModulo =
  | "despacho"
  | "manifiesto"
  | "cumplido"
  | "expedir"
  | "subir"
  | "trafico"
  | "monitoreo"
  | "financiero"
  | "factura"
  | "transferencia"
  | "anticipo"
  | "maestros"
  | "vehiculo"
  | "ficha"
  | "estudios"
  | "solicitar"
  | "solicitudes"
  | "verificar"
  | "historial"
  | "auditoria"
  | "logs"
  | "configuracion"
  | "roles"
  | "usuarios";

export interface NodoModulo {
  clave: string;
  nombre: string;
  descripcion: string;
  icono: IconoModulo;
  /** Solo en hojas: se hereda "construccion" si no se indica. */
  estado?: EstadoModulo;
  /** Proyecto de donde se migra la funcionalidad. */
  origen?: { nombre: string; repo: string };
  hijos?: readonly NodoModulo[];
}

export const MODULOS: readonly NodoModulo[] = [
  {
    clave: "despacho",
    nombre: "Despacho",
    descripcion: "Manifiestos de carga y su cumplido.",
    icono: "despacho",
    hijos: [
      {
        clave: "despacho.manifiesto",
        nombre: "Manifiesto",
        descripcion: "Gestión de manifiestos de carga.",
        icono: "manifiesto",
        hijos: [
          {
            clave: "despacho.manifiesto.expedir-sicetac",
            nombre: "Expedir manifiesto SICETAC",
            descripcion:
              "Recalcula el flete con el SICETAC vigente y expide ante el Ministerio los manifiestos rechazados por MAN045.",
            icono: "expedir",
            estado: "disponible",
          },
        ],
      },
      {
        clave: "despacho.cumplido-manifiesto",
        nombre: "Cumplido manifiesto",
        descripcion: "Registro y control del cumplido de manifiestos.",
        icono: "cumplido",
        hijos: [
          {
            clave: "despacho.cumplido-manifiesto.migracion-rndc",
            nombre: "Migración cumplido RNDC",
            descripcion:
              "Corrige las retenciones con el flete del RNDC y radica los cumplidos rechazados (CMA273, CMA262).",
            icono: "subir",
            estado: "disponible",
          },
        ],
      },
      {
        clave: "despacho.trafico",
        nombre: "Tráfico",
        descripcion: "Seguimiento y monitoreo de la operación en ruta.",
        icono: "trafico",
        hijos: [
          {
            clave: "despacho.trafico.monitoreo-vehiculo",
            nombre: "Monitoreo vehículo",
            descripcion:
              "Ubica vehículos y consulta viajes de Control T por placa o manifiesto.",
            icono: "monitoreo",
            estado: "disponible",
            origen: {
              nombre: "TVIEWER · Control T",
              repo: "local://tviewer/controlt-mapa",
            },
          },
        ],
      },
    ],
  },
  {
    clave: "financiero",
    nombre: "Financiero",
    descripcion: "Facturación y transferencias hacia SAP.",
    icono: "financiero",
    hijos: [
      {
        clave: "financiero.factura",
        nombre: "Factura",
        descripcion: "Gestión de facturas.",
        icono: "factura",
      },
      {
        clave: "financiero.transferencia",
        nombre: "Transferencia",
        descripcion: "Transferencias y anticipos de flota de terceros.",
        icono: "transferencia",
        hijos: [
          {
            clave: "financiero.transferencia.migracion-anticipo-sap",
            nombre: "Migración anticipo SAP",
            descripcion:
              "Reenvía a SAP los anticipos de flota de terceros por planilla o consolidado.",
            icono: "anticipo",
            estado: "disponible",
            origen: {
              nombre: "SMA · Migración de anticipos",
              repo: "https://github.com/CALR0/sma-elogia",
            },
          },
        ],
      },
    ],
  },
  {
    clave: "maestros",
    nombre: "Maestros",
    descripcion: "Datos maestros de la operación.",
    icono: "maestros",
    hijos: [
      {
        clave: "maestros.vehiculo",
        nombre: "Vehículo",
        descripcion: "Vehículos y sus conductores asignados.",
        icono: "vehiculo",
        hijos: [
          {
            clave: "maestros.vehiculo.ficha-tecnica",
            nombre: "Generar ficha técnica",
            descripcion:
              "Consulta placas en Silogtran y genera las fichas PDF de vehículo y conductor.",
            icono: "ficha",
            estado: "disponible",
            origen: {
              nombre: "FVE-C · Ficha de vehículos y conductores",
              repo: "https://github.com/CALR0/fvec-elogia",
            },
          },
        ],
      },
    ],
  },
  {
    clave: "estudios",
    nombre: "Estudios",
    descripcion: "Estudios de seguridad de conductores y vehículos.",
    icono: "estudios",
    hijos: [
      {
        clave: "estudios.solicitar",
        nombre: "Solicitar estudios",
        descripcion:
          "Envía los datos de un conductor o vehículo para su estudio.",
        icono: "solicitar",
        estado: "disponible",
      },
      {
        clave: "estudios.mis-solicitudes",
        nombre: "Mis solicitudes",
        descripcion: "Estado y decisión de las solicitudes que enviaste.",
        icono: "solicitudes",
        estado: "disponible",
      },
      {
        clave: "estudios.verificar",
        nombre: "Verificar estudios",
        descripcion: "Bandeja del analista: revisar hallazgos y decidir.",
        icono: "verificar",
        estado: "disponible",
      },
      {
        clave: "estudios.historial",
        nombre: "Historial",
        descripcion: "Estudios revisados, decisiones y trazabilidad.",
        icono: "historial",
        estado: "disponible",
      },
    ],
  },
  {
    clave: "auditoria",
    nombre: "Auditoría",
    descripcion: "Trazabilidad de todo lo que ocurre en la plataforma.",
    icono: "auditoria",
    hijos: [
      {
        clave: "auditoria.visor-logs",
        nombre: "Visor de logs",
        descripcion:
          "Inicios y cierres de sesión, acciones en los módulos y cambios de configuración, con filtros.",
        icono: "logs",
        estado: "disponible",
      },
    ],
  },
  {
    clave: "configuracion",
    nombre: "Configuración",
    descripcion: "Roles, permisos y usuarios de la plataforma.",
    icono: "configuracion",
    hijos: [
      {
        clave: "configuracion.roles",
        nombre: "Roles",
        descripcion:
          "Crea roles y define a qué módulos acceden y con qué permisos.",
        icono: "roles",
        estado: "disponible",
      },
      {
        clave: "configuracion.usuarios",
        nombre: "Usuarios",
        descripcion:
          "Crea, edita, activa o inactiva usuarios y asígnales un rol.",
        icono: "usuarios",
        estado: "disponible",
      },
    ],
  },
];

// ─── Utilidades del árbol ───────────────────────────────────────────────────

export const rutaDe = (clave: string) => `/${clave.replaceAll(".", "/")}`;

export const esHoja = (n: NodoModulo) => !n.hijos?.length;

export const estadoDe = (n: NodoModulo): EstadoModulo =>
  esHoja(n)
    ? (n.estado ?? "construccion")
    : // Un padre está "disponible" si algún hijo lo está, si no "migracion" si alguno se migra
      n
        .hijos!.map(estadoDe)
        .reduce<EstadoModulo>(
          (acc, e) =>
            acc === "disponible" || e === "disponible"
              ? "disponible"
              : acc === "migracion" || e === "migracion"
                ? "migracion"
                : "construccion",
          "construccion",
        );

/** Todas las hojas bajo un nodo (o de todo el árbol). */
export function hojas(nodos: readonly NodoModulo[] = MODULOS): NodoModulo[] {
  return nodos.flatMap((n) => (esHoja(n) ? [n] : hojas(n.hijos)));
}

/** Busca un nodo por su ruta en segmentos y devuelve también sus ancestros. */
export function buscarPorSegmentos(
  segmentos: readonly string[],
): { nodo: NodoModulo; ancestros: NodoModulo[] } | null {
  let nivel: readonly NodoModulo[] | undefined = MODULOS;
  const camino: NodoModulo[] = [];
  for (let i = 0; i < segmentos.length; i++) {
    const clave = segmentos.slice(0, i + 1).join(".");
    const n: NodoModulo | undefined = nivel?.find((m) => m.clave === clave);
    if (!n) return null;
    camino.push(n);
    nivel = n.hijos;
  }
  const nodo = camino.pop();
  return nodo ? { nodo, ancestros: camino } : null;
}

/**
 * Poda el árbol según lo que el usuario puede ver. `puedeVer` decide por hoja;
 * un padre queda si le queda algún hijo.
 */
export function filtrarArbol(
  puedeVer: (clave: string) => boolean,
  nodos: readonly NodoModulo[] = MODULOS,
): NodoModulo[] {
  return nodos.flatMap((n) => {
    if (esHoja(n)) return puedeVer(n.clave) ? [n] : [];
    const hijos = filtrarArbol(puedeVer, n.hijos);
    return hijos.length ? [{ ...n, hijos }] : [];
  });
}
