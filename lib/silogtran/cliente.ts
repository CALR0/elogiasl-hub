import "server-only";
import * as cheerio from "cheerio";

/*
 * Cliente HTTP para Silogtran (PRADO/PHP renderizado en servidor; no hay API).
 * Reproduce lo que hace un navegador: login por postback (+ centro de costo),
 * búsqueda por placa en Maestros.Vehiculo.Buscar (redirige al detalle
 * Home_111&vehiculo_codigo=N), ficha del tercero (conductor) y búsqueda en el
 * Log de la Interfaz (anticipos para SAP).
 * Silogtran está detrás de AWS WAF: el reto se pasa con un Chromium headless.
 * Portado de FVE-C (src/silogtran.js); ver la guía silogtran-integration.
 */

const LOGIN_PAGE = "index.php?page=LoginPage";
const BUSCAR_PAGE = "index.php?page=Maestros.Vehiculo.Buscar";
const LOG_PAGE = "index.php?page=Maestros.Interfaz.BuscarLogInterfaz";
// Visor del log RNDC (Vue): la página entrega un JWT "token_fenix" para la API GraphQL
const VISOR_RNDC_PAGE =
  "index.php?page=Maestros.InterfazlogRndc.VisorLogInterfazRndcV2";
// Interfaz "QAS DAABON OC SAP" (autocompletar: hay que fijar el IDHidden, no solo el texto)
const INTERFAZ_ID = process.env.SILOG_INTERFAZ_ID || "139";
const INTERFAZ_TEXTO = process.env.SILOG_INTERFAZ_TEXTO || "QAS DAABON OC SAP";
const LOG_FECHA_INI = process.env.SILOG_LOG_FECHA_INI || "2026-01-01";
const LOG_FECHA_FIN = process.env.SILOG_LOG_FECHA_FIN || "2030-01-01";
const TERCERO_PAGE = (codigo: string) =>
  `index.php?page=Maestros.Tercero.Home_111&tercero_codigo=${Number.parseInt(codigo, 10)}`;
const REMESA_PAGE = (codigo: string) =>
  `index.php?page=Despacho.Remesa_003.Home_111&remesa_codigo=${encodeURIComponent(codigo)}`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export type Cookies = [string, string][];

export class SilogtranError extends Error {
  /** La sesión venció: hay que volver a iniciar sesión y reintentar. */
  sesionExpirada: boolean;
  /** Error de credenciales / cuenta (no reintentar seguido: puede bloquear la cuenta). */
  deCuenta: boolean;
  constructor(
    msg: string,
    opciones: { sesionExpirada?: boolean; deCuenta?: boolean } = {},
  ) {
    super(msg);
    this.sesionExpirada = opciones.sesionExpirada ?? false;
    this.deCuenta = opciones.deCuenta ?? false;
  }
}

const esLogin = (html: string) => html.includes("ctl0$MainModule$BtnIngresar");

function decodificar(buf: Buffer, contentType: string) {
  const charset =
    /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() || "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** Campos que el navegador enviaría en un postback PRADO (sin botones). */
function camposFormulario(html: string) {
  const $ = cheerio.load(html);
  const form = $("form").first();
  if (!form.length)
    throw new SilogtranError("No se encontró el formulario en la página.");
  const datos: Record<string, string> = {};
  form.find("input, select, textarea").each((_, el) => {
    const $el = $(el);
    const nombre = $el.attr("name");
    if (!nombre || $el.is("[disabled]")) return;
    const tipo = ($el.attr("type") || "").toLowerCase();
    if (
      el.tagName === "input" &&
      ["submit", "button", "image", "reset"].includes(tipo)
    )
      return;
    if (["checkbox", "radio"].includes(tipo) && !$el.is("[checked]")) return;
    if (el.tagName === "select") {
      const sel = $el.find("option[selected]").first();
      const op = sel.length ? sel : $el.find("option").first();
      datos[nombre] = op.attr("value") ?? op.text();
    } else if (el.tagName === "textarea") {
      datos[nombre] = $el.text();
    } else {
      datos[nombre] = $el.attr("value") ?? "";
    }
  });
  return { $, form, datos };
}

interface Respuesta {
  status: number;
  url: string;
  body: Buffer;
  type: string;
  headers: Headers;
}

export class Silogtran {
  readonly base: string;
  private readonly origen: string;
  private jar: Map<string, string>;
  private ocupado: Promise<unknown> = Promise.resolve();

  /** cookies: sesión previa (de exportarCookies) para continuar sin volver a iniciar sesión. */
  constructor(baseUrl: string, cookies: Cookies | null = null) {
    this.base = baseUrl.replace(/\/?$/, "/");
    this.origen = new URL(this.base).origin;
    this.jar = new Map(
      Array.isArray(cookies)
        ? cookies
            .filter((c) => Array.isArray(c) && c.length === 2)
            .map(([k, v]) => [String(k), String(v)])
        : [],
    );
  }

  exportarCookies(): Cookies {
    return [...this.jar];
  }

  /** Solo el token del firewall: sirve para no abrir el navegador en un nuevo login. */
  cookiesWaf(): Cookies {
    return [...this.jar].filter(([k]) => k.toLowerCase().startsWith("aws-waf"));
  }

  private guardarCookies(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [par, ...attrs] = c.split(";");
      const i = par.indexOf("=");
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      const borrar =
        valor === "deleted" || attrs.some((a) => /max-age=0\b/i.test(a.trim()));
      if (borrar) this.jar.delete(nombre);
      else this.jar.set(nombre, valor);
    }
  }

  private async request(
    path: string,
    {
      method = "GET",
      form = null,
    }: { method?: string; form?: Record<string, string> | null } = {},
  ): Promise<Respuesta> {
    let url = new URL(path, this.base);
    let wafIntentos = 0;
    for (let saltos = 0; saltos < 10; saltos++) {
      // Nunca enviar las cookies de Silogtran a otro dominio (redirecciones incluidas)
      if (url.origin !== this.origen)
        throw new SilogtranError("Redirección fuera de Silogtran bloqueada.");
      const headers: Record<string, string> = {
        "user-agent": UA,
        cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      };
      if (form) headers["content-type"] = "application/x-www-form-urlencoded";
      const res = await fetch(url, {
        method,
        headers,
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      });
      this.guardarCookies(res);
      // AWS WAF: el reto llega sin el HTML de Silogtran. Un navegador headless lo
      // resuelve, deja la cookie aws-waf-token en el jar y se reintenta la MISMA url.
      if (res.headers.get("x-amzn-waf-action") === "challenge") {
        if (wafIntentos >= 1) {
          throw new SilogtranError(
            "El firewall de Silogtran (AWS WAF) sigue bloqueando. Reintente en unos minutos.",
          );
        }
        wafIntentos += 1;
        await this.resolverWaf();
        continue;
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        url = new URL(res.headers.get("location") || "", url);
        if (res.status !== 307 && res.status !== 308) {
          method = "GET";
          form = null;
        }
        continue;
      }
      const body = Buffer.from(await res.arrayBuffer());
      return {
        status: res.status,
        url: url.href,
        body,
        type: res.headers.get("content-type") || "",
        headers: res.headers,
      };
    }
    throw new SilogtranError("Demasiadas redirecciones.");
  }

  /** Pasa el reto de AWS WAF con un navegador real y guarda solo las cookies aws-waf*. */
  private async resolverWaf() {
    if (process.env.WAF_NAVEGADOR === "0") {
      throw new SilogtranError(
        "AWS WAF está bloqueando y la resolución con navegador está desactivada (WAF_NAVEGADOR=0).",
      );
    }
    for (const c of await this.obtenerCookiesWaf())
      this.jar.set(c.name, c.value);
    if (
      ![...this.jar.keys()].some((k) => k.toLowerCase().startsWith("aws-waf"))
    ) {
      throw new SilogtranError("No se obtuvo el token de AWS WAF.");
    }
  }

  /**
   * Abre un Chromium headless que resuelve el reto y devuelve las cookies
   * aws-waf. En Vercel (Linux) usa @sparticuz/chromium; en local, el Chrome
   * del sistema indicado en WAF_CHROME_PATH.
   */
  async obtenerCookiesWaf(): Promise<{ name: string; value: string }[]> {
    const esperaMs = (Number(process.env.WAF_ESPERA_SEG) || 30) * 1000;
    const puppeteer = (await import("puppeteer-core")).default;
    let opciones: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      defaultViewport: { width: 1280, height: 800 },
    };
    // En Linux (Vercel) siempre se usa @sparticuz/chromium: la ruta de Chrome
    // local solo tiene sentido fuera de Linux y, si se filtrara al servidor,
    // apuntaría a un ejecutable que no existe allí.
    if (process.env.WAF_CHROME_PATH && process.platform !== "linux") {
      opciones.executablePath = process.env.WAF_CHROME_PATH;
    } else {
      if (process.platform !== "linux") {
        throw new SilogtranError(
          "Falta WAF_CHROME_PATH (ruta de Chrome) para pasar el firewall de Silogtran en este equipo.",
        );
      }
      const chromium = (await import("@sparticuz/chromium")).default;
      opciones = {
        args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
        executablePath: await chromium.executablePath(),
        headless: true,
        defaultViewport: { width: 1280, height: 800 },
      };
    }
    let navegador;
    try {
      navegador = await puppeteer.launch(opciones);
    } catch (e) {
      console.error("[waf] no abrió el navegador:", e);
      throw new SilogtranError(
        "No se pudo abrir el navegador para pasar el firewall de Silogtran.",
      );
    }
    try {
      const pagina = await navegador.newPage();
      await pagina.setUserAgent(UA);
      try {
        await pagina.goto(new URL(LOGIN_PAGE, this.base).href, {
          waitUntil: "domcontentloaded",
          timeout: esperaMs,
        });
      } catch {
        // Aunque la navegación no "termine", el token puede quedar fijado
      }
      const limite = Date.now() + esperaMs;
      let cookies: { name: string; value: string }[] = [];
      while (Date.now() < limite) {
        cookies = await pagina.cookies();
        if (cookies.some((c) => c.name === "aws-waf-token")) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      cookies = cookies
        .filter((c) => c.name.toLowerCase().startsWith("aws-waf"))
        .map((c) => ({ name: c.name, value: c.value }));
      if (!cookies.length) {
        throw new SilogtranError(
          `El navegador no obtuvo el token del firewall en ${esperaMs / 1000} s.`,
        );
      }
      return cookies;
    } finally {
      await navegador.close().catch(() => {});
    }
  }

  private async html(path: string, opts?: Parameters<Silogtran["request"]>[1]) {
    const r = await this.request(path, opts);
    if (r.status >= 400)
      throw new SilogtranError(`Silogtran respondió HTTP ${r.status}.`);
    return { ...r, text: decodificar(r.body, r.type) };
  }

  /** Serializa: PRADO guarda estado por sesión, una operación a la vez. */
  private enCola<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.ocupado.then(fn, fn);
    this.ocupado = p.catch(() => {});
    return p;
  }

  /** Login: usuario/clave → (centro de costo: el configurado o el primero) → inicio. */
  login(usuario: string, clave: string) {
    return this.enCola(async () => {
      const pag = await this.html(LOGIN_PAGE);
      const { form, datos } = camposFormulario(pag.text);
      Object.assign(datos, {
        ctl0$MainModule$Usuario: usuario,
        ctl0$MainModule$Clave: clave,
        PRADO_POSTBACK_TARGET: "ctl0$MainModule$BtnIngresar",
        ctl0$MainModule$BtnIngresar: "Iniciar Sesión",
      });
      let r = await this.html(
        new URL(form.attr("action") || LOGIN_PAGE, pag.url).href,
        {
          method: "POST",
          form: datos,
        },
      );

      for (let paso = 0; paso < 3; paso++) {
        if (r.text.includes("ctl0$MainModule$centrocosto")) {
          r = await this.continuarCentroCosto(r);
          continue;
        }
        if (r.text.includes("ctl0$MainModule$verification_code")) {
          throw new SilogtranError(
            "La cuenta de servicio de Silogtran tiene verificación en dos pasos (2FA), que no está soportada.",
            { deCuenta: true },
          );
        }
        if (r.text.includes("ctl0$MainModule$NuevaClave")) {
          throw new SilogtranError(
            "Silogtran exige cambiar la contraseña de la cuenta de servicio.",
            { deCuenta: true },
          );
        }
        if (esLogin(r.text)) {
          const $ = cheerio.load(r.text);
          const msg = $("#ctl0_MainModule_ErrorPanel")
            .text()
            .replace(/\s+/g, " ")
            .trim();
          throw new SilogtranError(
            msg || "Usuario o contraseña de la cuenta de servicio incorrectos.",
            { deCuenta: true },
          );
        }
        break;
      }

      const prueba = await this.html(BUSCAR_PAGE);
      if (esLogin(prueba.text))
        throw new SilogtranError("Silogtran no aceptó el inicio de sesión.", {
          deCuenta: true,
        });
    });
  }

  private async continuarCentroCosto(r: Respuesta & { text: string }) {
    const { $, form, datos } = camposFormulario(r.text);
    const nombre = "ctl0$MainModule$centrocosto";
    const campo = $(`[name="${nombre}"]`).first();
    if (campo.is("select")) {
      const opciones = campo
        .find("option")
        .toArray()
        .map((o) => ({
          valor: $(o).attr("value") ?? $(o).text(),
          texto: $(o).text().trim(),
        }))
        .filter((o) => o.valor !== "" && !/seleccione/i.test(o.texto));
      const preferido = process.env.SILOG_CENTRO_COSTO?.trim().toLowerCase();
      const opcion =
        (preferido &&
          opciones.find(
            (o) =>
              o.valor.toLowerCase() === preferido ||
              o.texto.toLowerCase() === preferido,
          )) ||
        opciones[0];
      if (!opcion)
        throw new SilogtranError(
          "La cuenta de servicio no tiene centros de costo.",
          {
            deCuenta: true,
          },
        );
      datos[nombre] = opcion.valor;
    } else if (!datos[nombre]) {
      throw new SilogtranError(
        "No se pudo seleccionar el centro de costo automáticamente.",
      );
    }

    const boton = "ctl0$MainModule$BtnContinuar";
    const url = new URL(form.attr("action") || LOGIN_PAGE, r.url).href;
    const esCallback =
      /TActive\w*Button\(\{'ID':'ctl0_MainModule_BtnContinuar'/.test(r.text);
    if (!esCallback) {
      datos.PRADO_POSTBACK_TARGET = boton;
      datos[boton] =
        $("#ctl0_MainModule_BtnContinuar").attr("value") || "Continuar";
      return this.html(url, { method: "POST", form: datos });
    }
    // Botón AJAX de PRADO: la redirección llega en cabecera o en el cuerpo
    datos.PRADO_CALLBACK_TARGET = boton;
    datos.PRADO_CALLBACK_PARAMETER = "null";
    const cb = await this.html(url, { method: "POST", form: datos });
    const destino =
      cb.headers.get("x-prado-redirect") ||
      /<!--X-PRADO-REDIRECT-->\s*"?([^"<]+)"?\s*<!--/.exec(cb.text)?.[1] ||
      "index.php";
    return this.html(new URL(destino.replace(/\\\//g, "/"), url).href);
  }

  /** HTML de la ficha del vehículo con esa placa. */
  detallePorPlaca(placa: string) {
    return this.enCola(async () => {
      const pag = await this.html(BUSCAR_PAGE);
      if (esLogin(pag.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      const { form, datos } = camposFormulario(pag.text);
      const boton =
        form.find("input[type=submit][value=Buscar]").attr("name") ||
        "ctl0$MainModule$ctl3";
      Object.assign(datos, {
        ctl0$MainModule$vehiculo_placa: placa,
        PRADO_POSTBACK_TARGET: boton,
        [boton]: "Buscar",
      });
      const r = await this.html(
        new URL(form.attr("action") || BUSCAR_PAGE, pag.url).href,
        {
          method: "POST",
          form: datos,
        },
      );
      if (esLogin(r.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      if (!r.text.includes("layerUno_formtable"))
        throw new SilogtranError(
          `No existe un vehículo con la placa ${placa} en Silogtran.`,
        );
      return r.text;
    });
  }

  /** HTML de la ficha del tercero (conductor). */
  detalleTercero(codigo: string) {
    return this.enCola(async () => {
      const r = await this.html(TERCERO_PAGE(codigo));
      if (esLogin(r.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      if (!r.text.includes("layerSeis_formtable"))
        throw new SilogtranError("No se encontró la ficha del conductor.");
      return r.text;
    });
  }

  /** HTML de la remesa (origen/destino, horas pactadas, tipo de remesa RNDC, ítems). */
  paginaRemesa(codigo: string) {
    return this.enCola(async () => {
      const r = await this.html(REMESA_PAGE(codigo));
      if (esLogin(r.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      if (!r.text.includes("tiempoCarguePactado"))
        throw new SilogtranError(
          `No se encontró la remesa ${codigo} en Silogtran.`,
        );
      return r.text;
    });
  }

  /**
   * HTML de resultados del Log de la Interfaz para una planilla (Datos de
   * Entrada) o un consolidado de transferencia (Documento). El filtro es
   * literal: se consulta de a un valor. Portado de SMA (buscarLog).
   */
  buscarLogInterfaz(tipo: "planilla" | "consolidado", valor: string) {
    return this.enCola(async () => {
      const pag = await this.html(LOG_PAGE);
      if (esLogin(pag.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      const { form, datos } = camposFormulario(pag.text);
      Object.assign(datos, {
        ctl0$MainModule$interfaz_codigo: INTERFAZ_TEXTO,
        ctl0$MainModule$interfaz_codigo$IDHidden: INTERFAZ_ID,
        ctl0$MainModule$iteint_parametros_entrada:
          tipo === "planilla" ? valor : "",
        ctl0$MainModule$iteint_documento: tipo === "consolidado" ? valor : "",
        ctl0$MainModule$iteint_fechainicial: LOG_FECHA_INI,
        ctl0$MainModule$iteint_fechafinal: LOG_FECHA_FIN,
        PRADO_POSTBACK_TARGET: "ctl0$MainModule$ctl3",
        ctl0$MainModule$ctl3: "Buscar",
      });
      const r = await this.html(
        new URL(form.attr("action") || LOG_PAGE, pag.url).href,
        {
          method: "POST",
          form: datos,
        },
      );
      if (esLogin(r.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      return r.text;
    });
  }

  /**
   * Token (JWT, ~1 h) que el Visor Log Interfaz RNDC usa para consultar la API
   * GraphQL de Colombia Software; viene en el HTML como
   * localStorage.setItem('token_fenix', '…').
   */
  tokenVisorRndc() {
    return this.enCola(async () => {
      const r = await this.html(VISOR_RNDC_PAGE);
      if (esLogin(r.text))
        throw new SilogtranError("La sesión de Silogtran expiró.", {
          sesionExpirada: true,
        });
      const token =
        /localStorage\.setItem\(\s*['"]token_fenix['"]\s*,\s*['"]([^'"]+)['"]/.exec(
          r.text,
        )?.[1];
      if (!token)
        throw new SilogtranError(
          "El Visor Log Interfaz RNDC de Silogtran no entregó el token de consulta.",
        );
      return token;
    });
  }

  /** Solo imágenes de documentos digitalizados de Silogtran (evita pedir otras URLs). */
  esImagenPermitida(url: string) {
    try {
      const u = new URL(url, this.base);
      return (
        u.origin === this.origen &&
        /^\/images\/imagenes\/[\w-]+\/(vehiculo|tercero)\/+\d+_\d+\.(jpe?g|png)$/i.test(
          u.pathname,
        )
      );
    } catch {
      return false;
    }
  }

  descargarImagen(url: string): Promise<Buffer | null> {
    if (!this.esImagenPermitida(url)) return Promise.resolve(null);
    return this.enCola(async () => {
      try {
        const r = await this.request(url);
        if (
          r.status === 200 &&
          /^image\/(jpe?g|png)/i.test(r.type) &&
          r.body.length <= 8 * 1024 * 1024
        )
          return r.body;
      } catch {
        // Sin foto
      }
      return null;
    });
  }
}
