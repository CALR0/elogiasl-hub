import * as cheerio from "cheerio";

/*
 * Cálculo del SICETAC vigente en el portal del Ministerio de Transporte
 * (ASP.NET WebForms / DotNetNuke), por HTTP y sin navegador: se reproducen los
 * mismos postbacks en cascada que hace la extensión autosice (CONFIGURACION →
 * CONDICIONCARGA → UNIDADTRANSPORTE → TIPOCARGA → ORIGEN → DESTINO → RUTA),
 * se resuelve la suma de validación y se pulsa Calcular. El valor del viaje
 * es COSTOTOTALVIAJE (movilización + tiempos logísticos de las horas pactadas).
 */

export const URL_PORTAL =
  "https://plc.mintransporte.gov.co/Runtime/empresa/ctl/SiceTAC/mid/417";
const P = "dnn$ctr417$SiceTAC$";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export interface ParametrosSicetac {
  CONFIGURACION: string; // 2, 3, 2S2, 2S3, 3S2, 3S3…
  CONDICIONCARGA: string; // 1 cargado, 2 vacío
  UNIDADTRANSPORTE: string; // 1 estacas (por defecto, como la extensión)
  TIPOCARGA: string; // 12 general, 13 contenedor cargado, 15 sin carga, 16 contenedor vacío
  ORIGEN: string; // código de nodo (DIVIPOLA + 000)
  DESTINO: string;
  /** Ruta preferida (de routes.json); si no se da y el portal ofrece una sola, se usa esa. */
  RUTA?: string;
  HORASCARGUE: string;
  HORASDESCARGUE: string;
  /** AAAAMMDD */
  periodo: string;
}

export interface ResultadoSicetac {
  total: number;
  ruta: string;
  rutasDisponibles: { valor: string; texto: string }[];
  distanciaKm: string;
}

export class ErrorSicetac extends Error {}

const ORDEN = [
  "CONFIGURACION",
  "CONDICIONCARGA",
  "UNIDADTRANSPORTE",
  "TIPOCARGA",
  "ORIGEN",
  "DESTINO",
] as const;

/** El portal escribe los valores como "3,048,939.42" (coma de miles, punto decimal). */
const numero = (s: string | undefined) =>
  Number.parseFloat(String(s ?? "").replace(/[^\d.]/g, "")) || 0;

class Portal {
  private cookies = new Map<string, string>();
  html = "";

  private guardarCookies(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0)
        this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  private async pedir(init?: RequestInit) {
    const res = await fetch(URL_PORTAL, {
      ...init,
      headers: {
        "user-agent": UA,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(init?.body
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    this.guardarCookies(res);
    if (!res.ok)
      throw new ErrorSicetac(`El portal SICETAC respondió HTTP ${res.status}.`);
    this.html = await res.text();
  }

  abrir() {
    return this.pedir();
  }

  /** Campos que enviaría el navegador (ocultos, textos y combos con su opción elegida). */
  private campos() {
    const $ = cheerio.load(this.html);
    const datos: Record<string, string> = {};
    $("#Form")
      .find("input, select, textarea")
      .each((_, el) => {
        const $el = $(el);
        const nombre = $el.attr("name");
        if (!nombre) return;
        const tipo = ($el.attr("type") || "").toLowerCase();
        if (
          el.tagName === "input" &&
          ["submit", "button", "image", "reset", "file"].includes(tipo)
        )
          return;
        if (["checkbox", "radio"].includes(tipo) && !$el.is("[checked]"))
          return;
        if (el.tagName === "select") {
          const sel = $el.find("option[selected]").first();
          datos[nombre] = sel.length ? (sel.attr("value") ?? "") : "";
        } else if (el.tagName === "textarea") datos[nombre] = $el.text();
        else datos[nombre] = $el.attr("value") ?? "";
      });
    return datos;
  }

  /** Simula __doPostBack(destino) con los valores indicados. */
  async postback(destino: string, valores: Record<string, string>) {
    const datos = {
      ...this.campos(),
      ...valores,
      __EVENTTARGET: destino,
      __EVENTARGUMENT: "",
    };
    await this.pedir({
      method: "POST",
      body: new URLSearchParams(datos).toString(),
    });
  }

  valorSelect(ctrl: string) {
    const $ = cheerio.load(this.html);
    return $(`select[name="${P}${ctrl}"] option[selected]`).attr("value") ?? "";
  }

  opciones(ctrl: string) {
    const $ = cheerio.load(this.html);
    return $(`select[name="${P}${ctrl}"] option`)
      .toArray()
      .map((o) => ({
        valor: $(o).attr("value") ?? "",
        texto: $(o).text().trim(),
      }))
      .filter((o) => o.valor);
  }

  valorInput(ctrl: string) {
    const $ = cheerio.load(this.html);
    return $(`input[name="${P}${ctrl}"]`).attr("value") ?? "";
  }

  /** Suma de validación "¿Cuánto es a + b?" del portal. */
  suma() {
    const $ = cheerio.load(this.html);
    const m = /Cu[aá]nto es\s*(\d+)\s*\+\s*(\d+)/i.exec($("body").text());
    return m ? Number(m[1]) + Number(m[2]) : null;
  }
}

/** Calcula el SICETAC vigente (COSTOTOTALVIAJE) para los parámetros del viaje. */
export async function calcularSicetac(
  p: ParametrosSicetac,
): Promise<ResultadoSicetac> {
  const portal = new Portal();
  await portal.abrir();

  // Combos en cascada: cada uno es un AutoPostBack y prepara las opciones del siguiente
  for (const ctrl of ORDEN) {
    const valor = p[ctrl];
    if (!portal.opciones(ctrl).some((o) => o.valor === valor))
      throw new ErrorSicetac(`El portal SICETAC no ofrece ${ctrl} = ${valor}.`);
    await portal.postback(P + ctrl, { [P + ctrl]: valor });
    if (portal.valorSelect(ctrl) !== valor)
      throw new ErrorSicetac(`El portal SICETAC no aceptó ${ctrl} = ${valor}.`);
  }

  // El portal muestra la ruta "estándar" (sin "VIA …" en el texto) primero y
  // alternativas con desvío después. Si hay varias, usamos la primera: igual
  // que el usuario al dejar el desplegable como viene. Solo falla cuando el
  // portal no ofrece ninguna.
  const rutas = portal.opciones("RUTA").filter((r) => r.valor);
  const ruta =
    (p.RUTA && rutas.find((r) => r.valor === p.RUTA)?.valor) ||
    rutas[0]?.valor ||
    "";
  if (!ruta)
    throw new ErrorSicetac(
      "El portal SICETAC no tiene rutas para ese origen y destino.",
    );
  await portal.postback(P + "RUTA", { [P + "RUTA"]: ruta });
  if (portal.valorSelect("RUTA") !== ruta)
    throw new ErrorSicetac("El portal SICETAC no aceptó la ruta.");

  // Horas, periodo y la suma de validación; se reintenta si la suma cambió
  for (let intento = 0; intento < 4; intento++) {
    const suma = portal.suma();
    if (suma === null)
      throw new ErrorSicetac(
        "No se encontró la suma de validación del portal.",
      );
    await portal.postback(P + "btCalcular", {
      [P + "HORASCARGUE"]: p.HORASCARGUE,
      [P + "HORASDESCARGUE"]: p.HORASDESCARGUE,
      [P + "periododiaJ"]: p.periodo,
      [P + "Resultado"]: String(suma),
    });
    const total = numero(portal.valorInput("COSTOTOTALVIAJE"));
    if (total > 0)
      return {
        total,
        ruta,
        rutasDisponibles: rutas,
        distanciaKm: portal.valorInput("DISTANCIA"),
      };
  }
  throw new ErrorSicetac("El portal SICETAC no devolvió el costo del viaje.");
}
