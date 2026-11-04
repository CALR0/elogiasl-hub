# Elogia HUB · soporte-elogiasl

**El portal de soporte de Elogia Soluciones Logísticas:** un solo lugar, con un solo inicio de
sesión, donde el equipo encuentra las herramientas y soluciones para sus procesos de la operación.

---

## ¿Para qué sirve?

Antes, cada herramienta era una aplicación aparte, con su propio acceso. El portal las reúne:

- **Un solo acceso:** cada persona entra con su correo y contraseña corporativos.
- **Cada quien ve lo suyo:** el administrador define roles y decide a qué módulos, submódulos y
  funcionalidades accede cada rol. Lo que no está habilitado no aparece en el menú.
- **Todo queda registrado:** inicios y cierres de sesión, consultas, envíos a SAP, cambios de
  usuarios y roles, e intentos de entrar sin permiso. Se consulta en el visor de logs.

## Módulos

| Módulo | Qué hay | Estado |
|---|---|---|
| **Despacho** | Manifiesto › **Expedir manifiesto SICETAC** | ✅ Funcionando |
| | Cumplido manifiesto › **Migración cumplido RNDC** | ✅ Funcionando |
| | Tráfico › **Monitoreo vehículo** | ✅ Funcionando |
| **Financiero** | Factura | En construcción |
| | Transferencia › **Migración anticipo SAP** | ✅ Funcionando |
| **Maestros** | Vehículo › **Generar ficha técnica** | ✅ Funcionando |
| **Estudios** | **Solicitar** · **Mis solicitudes** · **Verificar** · **Historial** | ✅ Funcionando (TusDatos real o modo simulado) |
| **Auditoría** | **Visor de logs** | ✅ Funcionando |
| **Configuración** | **Roles** · **Usuarios** | ✅ Funcionando |

### Lo que ya funciona

- **Generar ficha técnica** (Maestros › Vehículo) — se escriben o pegan placas y el portal trae de
  Silogtran la ficha del vehículo y la de su conductor. Se pueden ver en pantalla, descargar en PDF
  (todas juntas en un ZIP) o exportar a Excel. *(Antes era la app FVE-C.)*
- **Migración anticipo SAP** (Financiero › Transferencia) — se pegan planillas o consolidados de
  transferencia; el portal busca los anticipos de flota de terceros en Silogtran, los reenvía a SAP
  y confirma el resultado. No reenvía lo que ya está migrado ni lo repetido. Resultado exportable a
  Excel. *(Antes era la app SMA.)*
- **Expedir manifiesto SICETAC** (Despacho › Manifiesto) — para manifiestos que el Ministerio
  rechazó porque el flete quedó por debajo del SICETAC (error MAN045): el portal calcula el valor
  SICETAC vigente del viaje, ajusta el flete y sus retenciones en el XML y, con tu confirmación,
  lo expide ante el Ministerio mostrando el número de radicado.
- **Migración cumplido RNDC** (Despacho › Cumplido manifiesto) — para cumplidos que el Ministerio
  rechazó por las retenciones (FOPAT o retención en la fuente) o por remesas sin cumplir: cumple
  primero las remesas que el RNDC no tenga cumplidas (con el último XML del log RNDC de Silogtran),
  toma el flete pactado que tiene el RNDC, corrige las retenciones y radica el cumplido.
- **Estudios** — quien tiene **Solicitar** envía solicitudes por documento (CC, CE, PPT, PP, NIT) o
  por vehículo (placa + propietario). Quedan en su bandeja **Mis solicitudes** con estado y decisión
  del verificador (nunca ve hallazgos ni fuentes). Quien tiene **Verificar** revisa la bandeja
  ordenada por nivel de riesgo, abre el detalle con fuentes y hallazgos, y aprueba o rechaza con
  comentario. **Historial** lista lo decidido con filtros por decisión. Mientras no haya API de
  TusDatos, se procesa en **modo simulado** (deterministas, sin gastar créditos). *(Antes era la app
  ELOGIX.)*
- **Monitoreo vehículo** (Despacho › Tráfico) — localiza vehículos en el mapa y consulta su viaje
  activo en Control T. Busca por una o varias **placas** (separadas por coma) o por **manifiesto u
  orden**. Muestra la posición GPS, dirección, prestador, estado del viaje, avance, conductor con su
  teléfono, origen, destino, cliente, transportador, comentario y observaciones. Si Control T no
  tiene el viaje activo, cae en los viajes programados. Vista con mapa (modo mapa o satélite) y
  panel colapsable por vehículo. *(Antes era la app TVIEWER.)*
- **Roles** — crear, editar, activar o inactivar roles, marcando a qué partes del portal acceden.
  Nadie (salvo el administrador) puede modificar el rol al que pertenece.
- **Usuarios** — crear cuentas, asignarles un rol, editarlas y activarlas o inactivarlas. Las
  cuentas de administrador solo las gestiona otro administrador.
- **Visor de logs** — todo lo que pasa en el portal, con filtros (fechas, usuario, módulo, acción,
  resultado y búsqueda), detalle de cada registro (incluido lo que se envió a SAP) y exportación a CSV.

En todos los módulos, lo que escribiste y los resultados **siguen ahí si cambias de módulo y
vuelves** (incluso si un lote sigue procesando); se borran al recargar la página o al cerrar sesión.

Los módulos "en construcción" ya tienen su lugar en el menú y en los permisos; se irán desarrollando.

## Cómo se conecta con Silogtran

Silogtran no tiene una API, así que el portal se conecta como lo haría una persona: inicia sesión
con una **cuenta de servicio** (configurada en el servidor) y lee la información de sus pantallas.
Esa sesión se guarda cifrada y se **reutiliza** entre consultas y entre módulos, de modo que no se
inicia sesión a cada rato; solo cuando Silogtran la vence. Tiene protecciones para que la cuenta no
se bloquee por intentos repetidos. En el visor de logs siempre queda qué usuario del portal hizo
cada consulta.

## Tecnología (resumen)

- **Next.js 16 + React 19 + TypeScript**, estilos con **Tailwind CSS**.
- **Supabase**: inicio de sesión, base de datos con permisos por fila y actualizaciones en vivo.
- **Vercel** para publicarlo en internet: https://elogiasl-hub.vercel.app
- Diseño con la gama de colores y el logo de Elogia, adaptado a celular. Abre en modo claro; el
  oscuro se activa con el botón de tema y se recuerda en ese navegador.

## Para desarrolladores

```bash
npm install
npm run dev          # http://localhost:3000
```

- Variables de entorno: copia `.env.example` a `.env` (o `.env.local`) y complétalo.
- Base de datos: los archivos de `supabase/migrations/` se aplican en orden en el SQL Editor de Supabase.
- Pruebas: `npm run db:test` (permisos de la base de datos), `npm run test:fichas`,
  `npm run test:anticipos`, `npm run test:sicetac`, `npm run test:cumplidos`, `npm run probar:waf` (firewall de Silogtran),
  `npm run probar:sicetac` (cálculo en el portal SICETAC).
- Revisión: `npm run lint` · `npm run type-check` · `npm run build`.

El detalle técnico, las decisiones tomadas y el estado del proyecto están en
**[docs/CONTEXTO.md](docs/CONTEXTO.md)**. Las reglas para trabajar el código con IA están en
**[CLAUDE.md](CLAUDE.md)**.

---

© Elogia Soluciones Logísticas · Uso interno.
