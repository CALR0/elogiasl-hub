# Elogia HUB · soporte-elogiasl

**El portal de soporte de Elogia Soluciones Logísticas:** un solo lugar, con un solo inicio de
sesión, donde el equipo encuentra las herramientas y soluciones para sus procesos de la operación.

Producción: **https://elogiasl-hub.vercel.app**

---

## ¿Para qué sirve?

Antes, cada herramienta era una aplicación aparte, con su propio acceso. El portal las reúne:

- **Un solo acceso:** cada persona entra con su correo y contraseña corporativos.
- **Cada quien ve lo suyo:** el administrador define roles y decide a qué módulos, submódulos y
  funcionalidades accede cada rol. Lo que no está habilitado no aparece en el menú.
- **Todo queda registrado:** inicios y cierres de sesión, consultas, envíos a SAP, cambios de
  usuarios y roles, e intentos de entrar sin permiso. Se consulta en el visor de logs.
- **Asistente integrada:** **Elia**, la IA del HUB, está en toda la plataforma para consultar
  manifiestos y explicar errores del Ministerio en lenguaje claro.

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
| **Transversal** | **Elia — IA asistente** (botón flotante) | ✅ Funcionando (si hay `GEMINI_API_KEY`) |

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
  lo expide ante el Ministerio mostrando el número de radicado. Cuando el portal del Ministerio
  ofrece varias rutas para el par origen → destino, se usa siempre la primera (la estándar sin
  "VÍA …").
- **Migración cumplido RNDC** (Despacho › Cumplido manifiesto) — para cumplidos que el Ministerio
  rechazó por las retenciones (FOPAT o retención en la fuente) o por remesas sin cumplir: cumple
  primero las remesas que el RNDC no tenga cumplidas (con el último XML del log RNDC de Silogtran),
  toma el flete pactado que tiene el RNDC, corrige las retenciones y radica el cumplido.
- **Monitoreo vehículo** (Despacho › Tráfico) — localiza vehículos en el mapa y consulta su viaje
  activo en Control T. Busca por **placas** (textarea con separadores libres —
  coma, espacio, salto de línea— o importando un Excel), o por **manifiesto u orden**. Muestra
  posición GPS, dirección, prestador, estado del viaje, avance, conductor con su teléfono, origen,
  destino, cliente, transportador, comentario y observaciones. Si Control T no tiene el viaje
  activo, cae en los viajes programados. Vista con mapa (modo mapa o satélite), panel colapsable
  por vehículo y **exportación a Excel** del resultado. También descarga una **plantilla** con
  columna `placa *`. *(Antes era la app TVIEWER.)*
- **Estudios** — quien tiene **Solicitar** envía solicitudes por documento (CC, CE, PPT, PP, NIT) o
  por vehículo (placa + propietario y, si lleva, remolque con su placa y propietario). El formulario
  de vehículo es un **combo**: puede agregarse tenedor / poseedor, conductor y marcar "Incluir
  consulta de antecedentes" del propietario (y del propietario del remolque). Cada placa y cada
  persona se consulta por aparte y todas quedan como un solo estudio.
  Quedan en su bandeja **Mis solicitudes** con pastilla Individual / Combo y detalle expandible de
  lo digitado, estado y decisión del verificador (nunca ve hallazgos ni fuentes). Quien tiene
  **Verificar** revisa la bandeja ordenada por nivel de riesgo, abre el detalle con el resultado de
  cada consulta (fuentes, hallazgos, reporte en pantalla y PDF), descarga individualmente o en ZIP
  cuando es combo, y aprueba o rechaza con comentario. **Historial** lista lo decidido con filtros.
  Chip de créditos TusDatos en la esquina del encabezado (restantes, con umbrales 100 / 50). Sin
  credenciales de TusDatos se procesa en **modo simulado** (deterministas, sin gastar créditos).
  *(Antes era la app ELOGIX.)*
- **Elia — IA asistente** (botón flotante, toda la plataforma) — chat con un botón de estrella en
  la esquina inferior derecha. Pensada para resolver dudas de la operación logística: si le pegas
  un número de manifiesto, consulta la página del Ministerio en Colombia Software, lee TODAS las
  secciones del acordeón (Tercero, Vehículo, Remesa, Manifiesto…) con sus XML enviados, y te dice
  en lenguaje claro si ya está radicado, qué error aparece (MAN045, REM054, VEH003, …) y dónde
  corregir. Conocimiento específico de los códigos más comunes en Elogia; nunca inventa. Historial
  en memoria de la pestaña (se pierde al recargar). Se oculta si no hay `GEMINI_API_KEY`.
- **Roles** — crear, editar, activar o inactivar roles, marcando a qué partes del portal acceden.
  Nadie (salvo el administrador) puede modificar el rol al que pertenece.
- **Usuarios** — crear cuentas, asignarles un rol, editarlas y activarlas o inactivarlas. Las
  cuentas de administrador solo las gestiona otro administrador. A cada usuario se le puede otorgar
  o quitar un módulo puntual sobre lo que da su rol; nadie (salvo el administrador) cambia sus propios
  accesos.
- **Visor de logs** — todo lo que pasa en el portal, con filtros (fechas, usuario, módulo, acción,
  resultado y búsqueda), detalle de cada registro (incluido lo que se envió a SAP) y exportación a CSV.

En todos los módulos, lo que escribiste y los resultados **siguen ahí si cambias de módulo y
vuelves** (incluso si un lote sigue procesando); se borran al recargar la página o al cerrar sesión.

Los módulos "en construcción" ya tienen su lugar en el menú y en los permisos; se irán desarrollando.

## Cómo se conecta con los sistemas externos

- **Silogtran** (PRADO / Colombia Software) no tiene API: el portal se conecta como lo haría una
  persona usando una **cuenta de servicio** cuyo login + cookies de AWS WAF se guardan **cifrados**
  en Supabase y se reutilizan entre peticiones y entre instancias de Vercel. Solo vuelve a iniciar
  sesión cuando Silogtran la vence; un candado en la BD evita logins en paralelo y topes por hora/día
  protegen la cuenta compartida. En Auditoría siempre queda qué usuario del portal hizo cada consulta.
- **RNDC** (web service del Ministerio vía Colombia Software, `rndcws` / `rndcws2`) — SOAP directo
  desde el servidor: proceso 4 (manifiesto), 5 (cumplido de remesa), 6 (cumplido de manifiesto),
  11 (tercero), 12 (vehículo). Credenciales en `RNDC_USUARIO` / `RNDC_CLAVE` (o del propio XML).
- **Portal SICETAC** (`plc.mintransporte.gov.co`) — reproduce los postbacks ASP.NET
  (CONFIGURACION → CARGA → UNIDAD → TIPOCARGA → ORIGEN → DESTINO → RUTA → suma de validación →
  Calcular) sin navegador, con caché mensual en memoria.
- **TusDatos** (`dash-board.tusdatos.co`) — Basic Auth; `/api/launch` (personas) y
  `/api/launch/car` (vehículos), `GET /api/results/{jobid}` para pollear, `GET /api/report_json/{id}`
  para los hallazgos. Sin credenciales se activa el simulador determinista.
- **Control T** (`app.controlt.com.co`) — API Public con Bearer OAuth (login JSON) + API Web para
  posición en tiempo real. Token en memoria del runtime (~12 h).
- **Gemini** (`generativelanguage.googleapis.com`) — Elia usa una cascada de modelos
  (`gemini-2.5-flash` → `-lite` → `2.0-flash` → `1.5-flash` → `pro-latest`) y se queda con el primero
  que la API key acepte. Diagnóstico en `/api/ia/diagnostico` (requiere sesión) para ver qué modelos
  tiene disponibles tu cuenta.
- **AWS (SAP)** — `POST /events` con `X_API_KEY` para crear/actualizar anticipos de flota de
  terceros; verificación previa con `GET /logs/{id}`.

## Tecnología (resumen)

- **Next.js 16** (App Router, `proxy.ts`, Turbopack) + **React 19** + **TypeScript**.
- Estilos con **Tailwind CSS v4**, íconos **lucide-react**, validación **Zod**.
- **Supabase**: inicio de sesión, base de datos con RLS y actualizaciones en vivo (Realtime).
- **Vercel** para el despliegue (Node.js 24.x, región pdx1).
- Diseño con la gama de colores "Salvia Elogia" y el logo de Elogia, adaptado a celular. Abre en
  modo claro; el oscuro se activa con el botón de tema y se recuerda en ese navegador.
- Auditoría granular (`audit_logs`) escrita solo por el servidor.

## Para desarrolladores

```bash
npm install
npm run dev          # http://localhost:3000
```

- Variables de entorno: copia `.env.example` a `.env` (o `.env.local`) y complétalo. Sin Supabase
  arranca en **modo demostración** (usuario de ejemplo con acceso total, datos en memoria).
- Base de datos: los archivos de `supabase/migrations/` se aplican en orden en el SQL Editor de
  Supabase.
- Pruebas:
  - `npm run db:test` — RLS, funciones y triggers en PGlite (80+ pruebas).
  - `npm run test:fichas` — parser / PDF / Excel de fichas.
  - `npm run test:anticipos` — parser del log de Silogtran.
  - `npm run test:sicetac` — página del ministerio + ajuste del XML.
  - `npm run test:cumplidos` — página de cumplidos y radicación.
  - `npm run test:estudios` — respuestas de TusDatos contra un servidor falso.
  - `npm run probar:waf` — diagnóstico del firewall de Silogtran.
  - `npm run probar:sicetac` — cálculo contra el portal SICETAC en vivo.
- Revisión: `npm run lint` · `npm run type-check` · `npm run build`.

El detalle técnico, las decisiones tomadas y el estado del proyecto están en
**[docs/CONTEXTO.md](docs/CONTEXTO.md)**. Las reglas para trabajar el código con IA están en
**[CLAUDE.md](CLAUDE.md)**.

---

© Elogia Soluciones Logísticas · Uso interno.
