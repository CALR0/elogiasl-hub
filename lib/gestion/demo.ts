import "server-only";
import type { LogFila, RolFila, UsuarioFila } from "./tipos";

/**
 * Datos en memoria para el MODO DEMOSTRACIÓN (sin Supabase). Se pierden al
 * reiniciar el servidor. Se guardan en globalThis para sobrevivir a la recarga
 * en caliente de `next dev`. Nunca se usan con Supabase configurado.
 */

interface AlmacenDemo {
  roles: RolFila[];
  usuarios: UsuarioFila[];
  logs: LogFila[];
  siguienteLog: number;
}

const ID_ADMIN = "11111111-1111-4111-8111-111111111111";
const ID_FINANCIERO = "22222222-2222-4222-8222-222222222222";
const ID_FLOTA = "33333333-3333-4333-8333-333333333333";

function crear(): AlmacenDemo {
  const ahora = Date.now();
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();

  const roles: RolFila[] = [
    {
      id: ID_ADMIN,
      nombre: "Administrador",
      descripcion:
        "Acceso total a la plataforma. No se puede restringir ni desactivar.",
      esSuperadmin: true,
      activo: true,
      usuarios: 0,
      accesos: [],
    },
    {
      id: ID_FINANCIERO,
      nombre: "Analista financiero",
      descripcion: "Migración de anticipos a SAP y facturación.",
      esSuperadmin: false,
      activo: true,
      usuarios: 0,
      accesos: [
        "financiero.factura",
        "financiero.transferencia.migracion-anticipo-sap",
      ],
    },
    {
      id: ID_FLOTA,
      nombre: "Coordinador de flota",
      descripcion: "Fichas técnicas de vehículos y solicitud de estudios.",
      esSuperadmin: false,
      activo: true,
      usuarios: 0,
      accesos: [
        "maestros.vehiculo.ficha-tecnica",
        "estudios.solicitar",
        "estudios.mis-solicitudes",
      ],
    },
  ];

  const usuarios: UsuarioFila[] = [
    {
      id: "00000000-0000-0000-0000-000000000000",
      nombre: "Usuario de demostración",
      email: "demo@elogia.com.co",
      rolId: ID_ADMIN,
      rolNombre: "Administrador",
      activo: true,
      ultimoAcceso: hace(2),
      creado: hace(60 * 24 * 30),
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      nombre: "Laura Gómez",
      email: "laura.gomez@elogia.com.co",
      rolId: ID_FINANCIERO,
      rolNombre: "Analista financiero",
      activo: true,
      ultimoAcceso: hace(95),
      creado: hace(60 * 24 * 12),
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      nombre: "Andrés Pérez",
      email: "andres.perez@elogia.com.co",
      rolId: ID_FLOTA,
      rolNombre: "Coordinador de flota",
      activo: true,
      ultimoAcceso: hace(60 * 26),
      creado: hace(60 * 24 * 9),
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      nombre: "Camila Rojas",
      email: "camila.rojas@elogia.com.co",
      rolId: ID_FLOTA,
      rolNombre: "Coordinador de flota",
      activo: false,
      ultimoAcceso: hace(60 * 24 * 6),
      creado: hace(60 * 24 * 20),
    },
  ];

  const plantilla: Array<Omit<LogFila, "id" | "fecha" | "ip" | "userAgent">> = [
    {
      actorNombre: "Laura Gómez",
      actorEmail: "laura.gomez@elogia.com.co",
      modulo: "sesion",
      accion: "sesion.iniciar",
      entidad: null,
      entidadId: null,
      resultado: "ok",
      detalle: null,
    },
    {
      actorNombre: "Laura Gómez",
      actorEmail: "laura.gomez@elogia.com.co",
      modulo: "financiero.transferencia.migracion-anticipo-sap",
      accion: "anticipo.migrar",
      entidad: "planilla",
      entidadId: "0101224688",
      resultado: "ok",
      detalle: { documento_sap: "1500004821" },
    },
    {
      actorNombre: "Laura Gómez",
      actorEmail: "laura.gomez@elogia.com.co",
      modulo: "financiero.transferencia.migracion-anticipo-sap",
      accion: "anticipo.migrar",
      entidad: "planilla",
      entidadId: "0101224681",
      resultado: "error",
      detalle: { mensaje: "No se encontró el payload en el log de Silogtran" },
    },
    {
      actorNombre: null,
      actorEmail: "desconocido@gmail.com",
      modulo: "sesion",
      accion: "sesion.fallida",
      entidad: null,
      entidadId: null,
      resultado: "error",
      detalle: null,
    },
    {
      actorNombre: "Andrés Pérez",
      actorEmail: "andres.perez@elogia.com.co",
      modulo: "sesion",
      accion: "sesion.iniciar",
      entidad: null,
      entidadId: null,
      resultado: "ok",
      detalle: null,
    },
    {
      actorNombre: "Andrés Pérez",
      actorEmail: "andres.perez@elogia.com.co",
      modulo: "maestros.vehiculo.ficha-tecnica",
      accion: "ficha.consultar",
      entidad: "placa",
      entidadId: "SXT482",
      resultado: "ok",
      detalle: { conductor: "1000000001" },
    },
    {
      actorNombre: "Andrés Pérez",
      actorEmail: "andres.perez@elogia.com.co",
      modulo: "configuracion.roles",
      accion: "acceso.denegado",
      entidad: null,
      entidadId: null,
      resultado: "denegado",
      detalle: null,
    },
    {
      actorNombre: "Usuario de demostración",
      actorEmail: "demo@elogia.com.co",
      modulo: "configuracion.usuarios",
      accion: "usuario.inactivar",
      entidad: "usuario",
      entidadId: "camila.rojas@elogia.com.co",
      resultado: "ok",
      detalle: null,
    },
    {
      actorNombre: "Andrés Pérez",
      actorEmail: "andres.perez@elogia.com.co",
      modulo: "sesion",
      accion: "sesion.cerrar",
      entidad: null,
      entidadId: null,
      resultado: "ok",
      detalle: null,
    },
  ];
  const logs: LogFila[] = [];
  let id = 1;
  for (let ronda = 0; ronda < 4; ronda++) {
    for (const p of plantilla) {
      logs.push({
        ...p,
        id: id,
        fecha: hace((plantilla.length * 4 - id) * 47 + 5),
        ip: "190.85.12.34",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36",
      });
      id++;
    }
  }
  logs.reverse();
  return { roles, usuarios, logs, siguienteLog: id };
}

const g = globalThis as unknown as { __portalDemo?: AlmacenDemo };

export function almacenDemo(): AlmacenDemo {
  g.__portalDemo ??= crear();
  const a = g.__portalDemo;
  // Conteo de usuarios por rol siempre al día
  for (const r of a.roles) {
    r.usuarios = a.usuarios.filter((u) => u.rolId === r.id).length;
  }
  return a;
}
