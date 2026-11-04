# soporte-elogiasl (Elogia HUB) — Contexto y hoja de ruta

> Proyecto y dominio: **soporte-elogiasl**. Nombre visible en la página: **Elogia HUB** (`lib/config.ts`).
> Última actualización: 2026-11-04.
> Resumen para usuarios: [README.md](../README.md).

## 1. Qué es

Portal de soporte de Elogia Soluciones Logísticas: reúne en un solo login, con roles y auditoría,
herramientas que vivían como aplicaciones separadas:

| Proyecto actual | Qué hace | Dónde queda en la plataforma |
|---|---|---|
| [sma-elogia](https://github.com/CALR0/sma-elogia) | Migración de anticipos a SAP (Silogtran → AWS) | Financiero › Transferencia › **Migración anticipo SAP** ✅ |
| [fvec-elogia](https://github.com/CALR0/fvec-elogia) | Fichas PDF de vehículo/conductor desde Silogtran | Maestros › Vehículo › **Generar ficha técnica** ✅ |
| [elogix-app](https://github.com/CALR0/elogix-app) | Estudios de seguridad (TusDatos) | Estudios (fase posterior) |

## 2. Stack (alineado con elogix-app)

- **Next.js 16** (App Router, `proxy.ts`) + React 19 + TypeScript · Tailwind v4 · lucide-react · Zod.
- **Supabase**: Auth (correo + contraseña), Postgres con RLS, Realtime (visor de logs).
- **Vercel** para el despliegue. Gestor: npm.
- Paleta "Salvia Elogia" de elogix (`app/globals.css`), logo en `public/brand/`.

## 3. Mapa de módulos

Definido en **`lib/modulos.ts`** (única fuente para menú, rutas, migas y permisos) y espejado en la
tabla `public.modulos`. La ruta sale de la clave: `financiero.transferencia.migracion-anticipo-sap`
→ `/financiero/transferencia/migracion-anticipo-sap`.

```
Despacho        › Manifiesto › Expedir manifiesto SICETAC                 (disponible)
                › Cumplido manifiesto › Migración cumplido RNDC           (disponible)
                › Tráfico › Monitoreo vehículo                            (disponible ← TVIEWER)
Financiero      › Factura                                                 (en construcción)
                › Transferencia › Migración anticipo SAP                  (disponible ← SMA)
Maestros        › Vehículo › Generar ficha técnica                        (disponible ← FVE-C)
Estudios        › Solicitar · Mis solicitudes                             (migracion ← elogix, fase 1 simulada)
                › Verificar · Historial                                   (en construcción)
Auditoría       › Visor de logs                                           (disponible)
Configuración   › Roles · Usuarios                                        (disponible)
```

Estados: `disponible`, `migracion`, `construccion`. Las hojas sin página propia las atiende
`app/(plataforma)/[...ruta]/page.tsx` (tarjetas para padres, aviso "En construcción / En migración"
para hojas). Al implementar una funcionalidad se crea su carpeta propia, que tiene prioridad.

Menú lateral: los submódulos con funcionalidades dentro (Transferencia, Vehículo) se despliegan con
una flecha y se abren solos si estás en una de sus páginas; los que son página directa (Factura,
Visor de logs, Roles, Usuarios) son enlaces. En celular el usuario (tema y cerrar sesión) está en el
encabezado y el menú es un cajón.

## 4. Seguridad y permisos

Autorización en tres capas:
1. `proxy.ts` — sin sesión → `/login?next=…` (optimista).
2. `lib/auth.ts` — `requireUsuario()` / `requirePermiso(clave)` en cada página y Server
   Function; las rutas `/api/*` usan `lib/api/guardia.ts` (mismo origen + cabecera `x-portal` +
   acceso). `puede()` replica `public.tiene_acceso()`. Sin sesión, `/api/*` responde 401 en JSON.
3. **RLS** en Supabase (`supabase/migrations/20261031000000_init.sql`).

Modelo:
- `roles` — el rol **Administrador** (`es_superadmin`) tiene todo y no se puede restringir/desactivar.
- `rol_permisos` — **acceso sí/no** por funcionalidad (hoja del árbol), sin acciones. Tener acceso
  a una hoja da acceso a su submódulo y su módulo: un rol puede tener Financiero con solo
  "Migración anticipo SAP" y sin "Factura". Función `tiene_acceso(clave)` (migración `…020000`).
- `perfiles` — 1:1 con `auth.users`, con `rol_id` y `activo`. Un usuario no puede cambiar su propio
  rol ni desactivarse (trigger). Solo un superadministrador modifica a otro superadministrador o
  asigna ese rol (trigger `perfiles_proteger_superadmin`, migración `…20261102020000`; en la app,
  `configuracion/usuarios/acciones.ts` lo exige también para correo y contraseña, que van por la API
  de administración sin RLS).
- Nadie (salvo el superadministrador) edita, desactiva ni cambia los accesos del rol al que
  pertenece (triggers `roles_proteger_propio` y `rol_permisos_proteger_propio`).
- `audit_logs` — la escribe solo el servidor (`registrarAuditoria()` en `lib/auditoria.ts`) con
  módulo, acción, resultado (`ok/error/denegado`), detalle, IP y navegador. Nadie la edita ni borra.
  Códigos actuales y sus textos: `lib/gestion/etiquetas.ts` (agrega ahí cada acción nueva).
  `requirePermiso()` registra `acceso.denegado` cuando alguien intenta entrar sin permiso.
- **Cierre por inactividad** — `components/sesion/cierre-por-inactividad.tsx` (montado en el layout
  de la plataforma) escucha mouse/teclado/táctil/scroll y guarda la última actividad en
  `localStorage` (compartida entre pestañas). Un minuto antes del límite muestra un aviso con
  "Seguir conectado"; al cumplirse, llama la server action `cerrarPorInactividad()`
  (`sesion.inactividad` en auditoría) y redirige a `/login?motivo=inactividad`, donde el login
  muestra el mensaje. También corta al volver a la pestaña si ya se pasó el tiempo.
  Config: `NEXT_PUBLIC_INACTIVIDAD_MINUTOS` (1–240, por defecto 30).
- `guardar_rol()` guarda rol + accesos en una sola transacción y solo acepta funcionalidades
  existentes (no módulos padre). Trigger `proteger_ultimo_admin`: siempre queda un administrador activo.
- `npm run db:test` aplica las migraciones en Postgres embebido (PGlite) y corre 47 pruebas de
  RLS, funciones y triggers. Córrelo antes de subir cambios de BD.

### Configuración y Auditoría (implementado)
- **Roles** (`/configuracion/roles`): lista con usuarios y accesos por rol; crear/editar con un
  árbol de casillas módulo › submódulo › funcionalidad (marcar un módulo marca todo lo de abajo;
  queda "parcial" si solo tiene una parte); activar/inactivar con confirmación. El rol
  Administrador es de solo lectura. El log guarda accesos agregados/quitados.
- **Usuarios** (`/configuracion/usuarios`): búsqueda y filtros por rol/estado, crear (la contraseña
  que se define es la definitiva del usuario; hay generador opcional), editar
  nombre/correo/rol/contraseña, activar/inactivar (inactivar también bloquea la cuenta en Supabase
  Auth). Nadie cambia su propio rol ni se inactiva.
- **Visor de logs** (`/auditoria/visor-logs`): filtros que se aplican sin recargar (selectores al
  cambiar, búsqueda tras una pausa; `filtros-visor.tsx`), guardados en la URL y resueltos en el
  servidor; 10 por página con paginación numerada; detalle desplegable (IP, navegador, detalle y, en
  anticipos, bloques "Payload enviado a SAP / no se envió" y "Respuesta de SAP"); actualización en
  vivo (Supabase Realtime) y exportación CSV para Excel (`;`, UTF-8, celdas protegidas contra fórmulas).
- En **modo demostración** todo funciona contra datos en memoria (`lib/gestion/demo.ts`), que se
  reinician al reiniciar `npm run dev`.

## 5. Integración con Silogtran (SMA y FVE-C)

**Decidido: cuenta de servicio** (una sola cuenta de Silogtran en el servidor; nadie escribe
credenciales de Silogtran). En Silogtran todo queda a nombre de esa cuenta; en el portal, Auditoría
registra qué usuario hizo cada consulta.

- `lib/silogtran/cliente.ts` — cliente PRADO (login + centro de costo, búsqueda, terceros, fotos) y
  paso del AWS WAF con Chromium sin interfaz (`@sparticuz/chromium` en Vercel, `WAF_CHROME_PATH` en
  local). Portado de FVE-C.
- `lib/silogtran/sesion-servicio.ts` — `conSilogtran(actor, fn)`: reutiliza la sesión guardada
  **cifrada** en `public.silogtran_sesion` (migración `…030000`; solo el servidor la lee) y solo vuelve
  a iniciar sesión cuando Silogtran la vence. Anti-bloqueo de la cuenta compartida (en la BD, atómico):
  un login a la vez, pausa de 60 min tras error de cuenta (2 min si es pasajero), topes
  `SILOG_LOGIN_MAX_HORA`/`SILOG_LOGIN_MAX_DIA`.
- `lib/silogtran/sello.ts` — AES-256-GCM con `SESSION_SECRET` (sesión de Silogtran y fichas).
- **Una sola sesión compartida** por fichas y anticipos: consultas seguidas (de cualquier usuario y
  módulo) reutilizan la misma cookie; solo se inicia sesión cuando Silogtran la vence, y si coinciden
  dos peticiones, el candado de la BD hace que solo una inicie sesión y la otra espere y la reutilice.
- `npm run probar:waf` — diagnóstico del firewall sin credenciales (verificado: token en ~3 s).

### Maestros › Vehículo › Generar ficha técnica (FVE-C) — migrado
- Pantalla: `app/(plataforma)/maestros/vehiculo/ficha-tecnica/` (placas tipo chips, consulta en serie,
  visor Vehículo/Conductor, ZIP de PDF armado en el navegador, Excel).
- API (`app/api/fichas/{consultar,ver,pdf,exportar}`): mismo origen + cabecera `x-portal`, sesión y
  acceso a la funcionalidad (`lib/fichas/guardia.ts`). Cada ficha viaja **sellada** al navegador
  (4 h, atada al usuario); no se guarda nada.
- Núcleo en `lib/fichas/` (parser, PDF, Excel) igual a FVE-C; `npm run test:fichas` lo prueba con las
  fichas de muestra de `tests/fixtures`.
- Auditoría: `ficha.consultar` (por placa, ok/error), `ficha.exportar`, `silogtran.sesion`.
- Placa inexistente: la fila muestra el mensaje real de Silogtran ("No existe un vehículo con la
  placa … en Silogtran."). No hay modo de prueba: siempre consulta Silogtran.
- Vercel: Node **24.x**; `next.config.ts` incluye en la función las fuentes de PDFKit y el Chromium.

### Financiero › Transferencia › Migración anticipo SAP (SMA) — migrado
- Pantalla: `app/(plataforma)/financiero/transferencia/migracion-anticipo-sap/` (por planilla o
  consolidado, en serie, progreso, resumen, tabla de 10 por página con estado/HTTP/mensaje, Excel con
  xlsx-js-style en el navegador). El payload y la respuesta NO se muestran en la tabla: van al log.
- API `app/api/anticipos/procesar`: guardia común (`lib/api/guardia.ts`), una entrada de Auditoría
  `anticipo.migrar` por anticipo con estado, mensaje, consolidado, `enviado_a_sap` (true solo si se
  hizo el `POST /events`), `payload` y `respuesta` de SAP.
- "Duplicado" = ya migrado en SAP (se verifica con `GET /logs/{id}`, que solo lee) o repetido en el
  lote: **no se envía**. El HTTP 200 de esas filas es el de la consulta, no de un envío.
- `cli.buscarLogInterfaz()` (Log de la Interfaz, IDHidden 139) con la **misma sesión de servicio**
  que fichas; `lib/anticipos/parser.ts` extrae los payloads create/update; `lib/anticipos/aws.ts`
  envía a AWS (`X_API_KEY`, solo servidor) y confirma en `/logs` (idempotente: no reenvía lo ya
  migrado ni repetidos del lote). Sin `X_API_KEY` (o `SIMULATE_CREATE=true`) queda en **modo
  simulado**, como en SMA. `npm run test:anticipos` prueba el parser.

### Despacho › Manifiesto › Expedir manifiesto SICETAC — nuevo (2026-11-02)
Para manifiestos que el Ministerio rechazó con **MAN045** (flete por debajo del SICETAC). Basado en
la extensión `autosice-extension`, pero todo por HTTP desde el servidor (sin Chrome).
- **Procesar** (`/api/sicetac/procesar`, una sola acción con confirmación en pantalla) por cada
  manifiesto: primero consulta en el RNDC si ya tiene radicado (proceso 4, tipo 3 → `INGRESOID`;
  "RNDC11 Documento no encontrado" = no radicado). Si lo tiene, muestra "ya está expedido bajo el
  número de radicado N" y no envía nada (cubre los radicados de antes y evita radicar dos veces).
  Credenciales: `RNDC_USUARIO`/`RNDC_CLAVE`/`RNDC_NIT` del `.env`, o las del XML si no están.
  Luego `lib/sicetac/ministerio.ts` lee la página de Colombia Software
  (`consumoministerio.php?base=bd_construproyec&documento=…`) → mensaje del último intento + XML del
  proceso 4; si no es MAN045 no se ajusta ni se envía. Remesa en Silogtran (horas pactadas y tipo de
  carga, cuenta de servicio) → configuración del vehículo por RNDC proceso 12 (`lib/sicetac/rndc.ts`,
  con el acceso del propio XML) → **portal SICETAC** por postbacks ASP.NET (`lib/sicetac/portal.ts`,
  ~4 s, suma de validación automática como la extensión; caché por mes y ruta en memoria) → flete =
  `ceil(COSTOTOTALVIAJE)`; `retencionFuenteManifiesto` y `RETENCIONFOPAT` conservan su proporción
  (1 % y 0,1 %). Solo cambian esas 3 etiquetas (`lib/sicetac/xml.ts`). Si está por debajo, se
  **expide de inmediato** al RNDC (`rndcws2…/svr008w.dll/soap/IBPMServices`, proceso 4) → "Manifiesto
  X expedido con éxito bajo el número de radicado N" (`ingresoid`) o el error del Ministerio; con
  éxito se vuelve a consultar `consumoministerio.php` (como se hace a mano).
- Auditoría: **un solo evento** `manifiesto.expedir` por manifiesto con estado, mensaje, radicado,
  flete original, flete SICETAC, flete y retenciones enviados, ruta/vehículo/carga/horas, consulta
  posterior, **XML original**, **XML enviado** (ambos sin usuario ni clave) y respuesta del RNDC.
- Pruebas: `npm run test:sicetac` (página real de 0101223914 sin credenciales + ajuste del XML),
  `npm run probar:sicetac -- 2S3 17001000 76109000 2 2` (portal en vivo, solo consulta).
- Migración `…20261102000000_expedir_manifiesto_sicetac.sql`: Manifiesto pasa a submódulo y los
  accesos que existían sobre él pasan a la funcionalidad nueva.
- ⚠️ La página de Colombia Software es pública y muestra el usuario/clave del RNDC en los enlaces
  "Xml": reportarlo a Colombia Software.

### Despacho › Cumplido manifiesto › Migración cumplido RNDC — nuevo (2026-11-02)
Para cumplidos que el Ministerio rechazó por retenciones. `Procesar` (`/api/cumplidos/procesar`,
confirmación en pantalla) por cada manifiesto, en un paso:
- Primero consulta en el RNDC si el cumplido ya tiene radicado (proceso 6, tipo 3); si lo tiene, no
  envía nada: muestra el radicado y vuelve a consultar la página para que quede marcado.
- `lib/cumplidos/pagina.ts` lee `consumoministeriocumplido.php?base=bd_construproyec&manifiesto=…`
  → mensaje del último intento, códigos de error y XML del proceso 6 (el enlace "Xml" puede venir
  URL-codificado o con entidades HTML). Si ya dice "REGISTRO INGRESADO" no se toca; si el error no es
  de retenciones tampoco.
- **Remesas primero** (sin su cumplido en el RNDC el del manifiesto da **CMA110**): de la sección
  "Envio Cumplido de Remesa" de la misma página salen las remesas; por cada una se consulta el
  proceso 5 (tipo 3, valores entre comillas sencillas o da RNDC027). Si no tiene cumplido (p. ej.
  lo anularon en el RNDC y Silogtran quedó con el radicado viejo, así que ya no lo reenvía), el XML
  se toma del último intento del **Visor Log Interfaz RNDC** de Silogtran
  (`Maestros.InterfazlogRndc.VisorLogInterfazRndcV2`): esa pantalla consulta la API GraphQL
  `getLogRndc` de Colombia Software (`serviciosfx…:8000/graphql_servicios/`) con el JWT
  `token_fenix` que trae su HTML (`Silogtran.tokenVisorRndc()` + `lib/cumplidos/log-rndc.ts`).
  Se radica con `registrarRndc`; si una remesa falla, no se envía el manifiesto. CMA110 cuenta como
  error procesable (sin error de retenciones el XML del manifiesto va igual).
- Flete pactado del manifiesto según el RNDC (proceso 4, tipo 3 → `VALORFLETEPACTADOVIAJE`, en
  `lib/sicetac/rndc.ts › consultarFletePactado`). Puede diferir del de Silogtran (p. ej. tras un
  ajuste SICETAC), y por eso fallan las retenciones del cumplido.
- `lib/cumplidos/xml.ts`: **CMA273** → `RETENCIONFOPAT` (0,1 %) y `RETENCIONFUENTEMANIFIESTO` (1 %);
  **CMA262** → solo `RETENCIONFUENTEMANIFIESTO` (se agrega si no viene). Redondeo al peso.
- Envío al RNDC con `registrarRndc` (también lo usa el manifiesto): si un servidor no atiende
  (RNDC12, respuesta ilegible o más de 25 s) verifica que no haya quedado radicado y reintenta en
  el otro. Cumplido y manifiesto van primero a `rndcws` (el de las consultas, más rápido) y usan
  `rndcws2` de respaldo. Auditoría guarda `tiempos_ms` por paso e `intentos_envio`.
- Envío al RNDC (mismo endpoint/mecanismo que el manifiesto) → "Cumplido del manifiesto X radicado
  con éxito bajo el número de radicado N"; con éxito se vuelve a consultar la página para que quede
  marcado en Silogtran.
- Auditoría: un solo evento `cumplido.migrar` (remesas con su XML/respuesta, estado, mensaje, radicado, errores, flete RNDC,
  retenciones originales y enviadas, consulta posterior, XML original/enviado sin credenciales,
  respuesta del RNDC). Prueba: `npm run test:cumplidos` (página real de 0101224880 sin credenciales).
- Migración `20261102010000_migracion_cumplido_rndc.sql`: Cumplido manifiesto pasa a submódulo y sus
  accesos pasan a la funcionalidad nueva.
- Acceso al RNDC común a los dos módulos: `accesoRndc()` en `lib/sicetac/rndc.ts`.

## 5.4 Monitoreo vehículo (Despacho › Tráfico) · migrado de TVIEWER

- Consulta la ubicación y el viaje activo en **Control T** por **placa** (una o varias) o por
  **manifiesto / orden**. API Public (`/apipublic/*`) para login JSON y `Resume`; API Web
  (`/APP/ApiWeb/CurrentLocation`, multipart) para la ubicación en tiempo real. Ambos usan el mismo
  Bearer que entrega `POST /apipublic/api/login/oauth` con `{username, password}`.
- `lib/controlt/cliente.ts` — login + normalización de `Resume`, `CurrentLocation` y
  `Travel/search`. 401 en Resume marca token inválido; 500/404 = sin resultados (no error).
  **Fallback automático**: si Resume no devuelve nada para una placa, intenta `Travel/search` para
  traer los viajes **programados** (estado `"Programado"`, sin posición, con la fecha de salida
  anotada en observaciones). Portado de `tviewer/controlt-mapa`.
- `lib/controlt/sesion-servicio.ts` — cuenta de servicio `CONTROLT_USUARIO` / `CONTROLT_CLAVE`. El
  token Bearer vive en memoria del runtime y se reusa hasta vencer (~12 h, `expires_in` segundos);
  un 401 fuerza relogin y reintenta una vez. El cliente nunca ve el token.
- Página `app/(plataforma)/despacho/trafico/monitoreo-vehiculo`: server action `consultar()`
  autoriza con `requirePermiso` y audita (`trafico.consultar`); mapa Leaflet cargado por CDN en
  `mapa.tsx` (sin dependencia npm) y panel de resumen por vehículo con viaje asociado.
- Migración `20261104000000_trafico_monitoreo.sql`: inserta los nodos `despacho.trafico` y
  `despacho.trafico.monitoreo-vehiculo`.

## 6. Estudios (migrado de elogix-app, fase 1)

- **Solicitar estudios** — formularios de documento (CC, CE, PPT, PP, NIT) y vehículo (placa +
  propietario), con autorización Habeas Data obligatoria. Permiso `estudios.solicitar`.
- **Mis solicitudes** — lista paginada de lo que envió el usuario con estado y, si ya hay, decisión
  y comentario del verificador. **Nunca muestra fuentes ni hallazgos.** Permiso `estudios.mis-solicitudes`.
- **Verificar estudios** (fase 2) — bandeja del verificador: hallazgos, fuentes, aprobar/rechazar.
- **Historial** (fase 2) — lo ya revisado, con filtros y exportación.

### 6.1 Separación por RLS
Los roles de elogix (`usuario` / `admin`) se reemplazan por permisos sobre estas hojas. "Quien
solicita nunca ve hallazgos" se garantiza en la BD: los resultados viven en tablas separadas
(`estudio_resultados`, `estudio_hallazgos`, `estudio_eventos`) cuyo select solo pasa con
`tiene_permiso('estudios.verificar')` o `tiene_permiso('estudios.historial')`. La decisión y el
comentario del verificador se copian a `estudio_solicitudes` por trigger
(`estudio_propagar_decision`) para que el solicitante los vea sin exponer resultados.

### 6.2 Modo simulado
Mientras no haya credenciales de TusDatos (`TUSDATOS_USUARIO`/`TUSDATOS_CLAVE`), `lib/estudios/
simulador.ts` genera fuentes y hallazgos **deterministas** por documento/placa (misma entrada →
mismo resultado). Las solicitudes quedan con `simulada = true` para distinguirlas luego.

### 6.3 Archivos clave
- Migración: `supabase/migrations/20261105000000_estudios.sql`.
- Esquemas y tipos: `lib/estudios/{schemas,tipos,simulador,procesar,datos}.ts`.
- Rutas: `app/(plataforma)/estudios/{solicitar,mis-solicitudes}/`.
- Auditoría: `estudio.solicitar`, `estudio.aprobar`, `estudio.rechazar` en `lib/gestion/etiquetas.ts`.

## 7. Puesta en marcha

1. `npm install` · `npm run dev`. Sin variables de Supabase arranca en **modo demostración**.
2. Supabase → SQL Editor → pegar, en orden, los archivos de `supabase/migrations/`
   (`…000000_init`, `…010000_gestion_roles_usuarios`, `…020000_permisos_por_acceso`,
   `…030000_silogtran_sesion`, `20261102000000_expedir_manifiesto_sicetac` y
   `20261102010000_migracion_cumplido_rndc`).
3. Authentication → desactivar "Allow new users to sign up"; Users → crear el primer usuario (Auto
   Confirm) y correr `supabase/seed.sql` con su correo.
4. `.env` (o `.env.local`) a partir de `.env.example`: Supabase, `SESSION_SECRET`, cuenta de servicio
   de Silogtran (`SILOG_USUARIO`/`SILOG_CLAVE`), `WAF_CHROME_PATH` (solo local) y `X_API_KEY` de AWS.
5. Vercel (desplegado en https://elogiasl-hub.vercel.app): repo importado, **Node.js 24.x**,
   región de funciones **pdx1** (la misma de Supabase, us-west-2), las mismas variables salvo
   `WAF_CHROME_PATH` y el mismo `SESSION_SECRET` que en local (comparten la sesión de Silogtran
   guardada en Supabase). En Supabase → Authentication → URL Configuration, Site URL y Redirect
   URLs con la URL de Vercel. Cada push a `main` despliega a producción.

### Memoria de los módulos y caché (2026-11-02)
- `components/sesion/memoria-sesion.tsx` — `useEstadoSesion(clave, inicial)`: como `useState`, pero
  lo escrito y los resultados de cada módulo (SICETAC, cumplidos, anticipos, fichas, y la página de
  la tabla) siguen ahí al cambiar de módulo y volver; se pierden al recargar (solo memoria de
  JavaScript). Va atada al usuario (`<MemoriaSesion>` en el layout) y se borra al llegar al login. Es
  un almacén externo: un lote que sigue procesando tras salir del módulo guarda su avance.
- `staleTimes.dynamic = 30` (next.config): volver a una página visitada hace < 30 s no la pide al
  servidor. `listarRoles`/`listarUsuarios` con `cache()` de React (una lectura por petición). El token
  del visor RNDC de Silogtran se reutiliza hasta 5 min antes de vencer (`lib/cumplidos/log-rndc.ts`).

## 8. Estado actual (2026-11-05) y siguientes pasos

**Funcionando en local contra el Supabase real** (migraciones aplicadas, primer administrador creado):

- ✅ Login, menú de módulos según accesos del rol, inicio, avisos "En construcción", modo
  claro/oscuro, diseño adaptado a celular, pantallas de carga.
- ✅ Configuración › Roles (accesos por módulo/submódulo/funcionalidad) y Usuarios.
- ✅ Auditoría › Visor de logs (filtros sin recarga, paginación, detalle, CSV, en vivo).
- ✅ Maestros › Vehículo › **Generar ficha técnica** (ex FVE-C), probado con placas reales usando la
  cuenta de servicio de Silogtran.
- ✅ Financiero › Transferencia › **Migración anticipo SAP** (ex SMA), probado con planillas reales y
  `X_API_KEY` configurada (detecta lo ya migrado y no lo reenvía).
- ✅ Pruebas: `db:test` (47), `test:fichas`, `test:anticipos`, `probar:waf`; lint, tipos y build limpios.

**Pendiente:**
- ✅ Desplegado en **Vercel**: https://elogiasl-hub.vercel.app (región pdx1, Node 24.x; ver §7),
  conectado al Supabase real.
- ✅ Despacho › Manifiesto › **Expedir manifiesto SICETAC**: probado de punta a punta con un
  manifiesto real (calcular y expedir con radicado).
- ✅ Despacho › Cumplido manifiesto › **Migración cumplido RNDC**: probado radicando cumplidos
  reales (incluye cumplir antes las remesas sin cumplido en el RNDC).
- ✅ Migración `20261102020000_proteger_superadmin.sql` aplicada (seguridad de roles y usuarios).
- Modo claro por defecto; el oscuro solo si el usuario lo elige (se recuerda en el navegador).
- 🟡 Estudios fase 1 (Solicitar + Mis solicitudes) migrado de elogix-app en modo simulado.
- ⏭️ Estudios fase 2: Verificar + Historial + integración TusDatos real (ver §6).
- ⏭️ Módulos en construcción: Factura.
