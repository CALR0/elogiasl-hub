import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { FichaGuardada, Par, Seccion } from "./tipos.ts";

/*
 * Extrae los datos de las fichas de Silogtran (Maestros.Vehiculo.Home_111 y
 * Maestros.Tercero.Home_111). Estructura: cada fila de etiquetas tiene todas
 * sus celdas td.dataLabelE y la fila siguiente trae los valores en la misma
 * posición. Portado de FVE-C (src/parser.js) sin cambios de lógica.
 */

type $ = cheerio.CheerioAPI;

export const CAPAS_VEHICULO: [string, string][] = [
  ["layerUno", "Datos Básicos"],
  ["layerDos", "Datos Aseguradoras"],
  ["layerTres", "Datos Certificados"],
  ["layerCuatro", "Comunicaciones y GPS"],
];

export const CAPAS_CONDUCTOR: [string, string][] = [
  ["layerSeis", "Datos Básicos"],
  ["layerTres", "Datos Conductor"],
  ["layerCuatro", "Información para Emergencias"],
];

// El encabezado termina en este campo; lo que sigue es la tabla de documentos adjuntos
const FIN_ENCABEZADO = /^por favor especifique/i;
const limpiar = (s: string | undefined) =>
  (s || "").replace(/\s+/g, " ").trim();
const limpiarEtiqueta = (s: string) =>
  limpiar(s)
    .replace(/\s*:$/, "")
    .replace(/^Tipo Documento precio$/i, "Tipo Documento");

function valorCampo($: $, campo: Element) {
  const tag = campo.tagName;
  if (tag === "select") {
    const sel = $(campo).find("option[selected]").first();
    const texto = limpiar(
      (sel.length ? sel : $(campo).find("option").first()).text(),
    );
    return texto.toUpperCase() === "SELECCIONE UNO" ? "" : texto;
  }
  if (tag === "textarea") return $(campo).text().trim();
  return limpiar($(campo).attr("value"));
}

function valorCelda($: $, td: Element | undefined): string {
  if (!td) return "";
  const $td = $(td);
  const campos = $td
    .find("select, textarea, input")
    .filter((_, el) => {
      if (el.tagName !== "input") return true;
      const tipo = ($(el).attr("type") || "text").toLowerCase();
      return ![
        "hidden",
        "checkbox",
        "button",
        "submit",
        "image",
        "radio",
      ].includes(tipo);
    })
    .toArray();
  // Una celda puede traer varios campos (p. ej. Vigencia Pase: desde + hasta)
  if (campos.length)
    return campos
      .map((c) => valorCampo($, c))
      .filter(Boolean)
      .join(" – ");
  // Grupo de casillas (p. ej. Tipo Tercero): se listan las marcadas
  const casillas = $td.find("input[type=checkbox]").toArray();
  if (casillas.length > 1) {
    return casillas
      .filter((c) => $(c).is("[checked]"))
      .map((c) => {
        const id = $(c).attr("id");
        const etiqueta = id ? $(`label[for="${id}"]`).text() : "";
        return limpiar(etiqueta || $(c).parent().text());
      })
      .filter(Boolean)
      .join(", ");
  }
  const copia = $td.clone();
  copia.find("style, script").remove();
  const texto = limpiar(
    copia
      .text()
      .replace("(yyyy-mm-dd)", "")
      .replace(/La fecha ingresada no es v.lida!/g, ""),
  );
  if (texto) return texto;
  // Calificación en estrellas, renderizada como imagen N.gif
  const estrellas = /\/(\d)\.(gif|png)$/i.exec(
    $td.find("img").attr("src") || "",
  );
  return estrellas ? `${estrellas[1]} de 5` : "";
}

function paresEtiquetaValor(
  $: $,
  tabla: Parameters<$>[0],
  { cortarEnFin = false } = {},
): Par[] {
  const pares: Par[] = [];
  let fin = false;
  $(tabla)
    .find("tr")
    .each((_, tr) => {
      if (fin) return;
      const celdas = $(tr).children("td, th").toArray();
      if (!celdas.length || !celdas.every((c) => $(c).hasClass("dataLabelE")))
        return;
      // Filas de etiquetas dentro de una celda de etiqueta: se procesan desde la contenedora
      if ($(tr).parent().closest("td.dataLabelE").length) return;
      const valores = $(tr).next("tr").children("td, th").toArray();
      celdas.forEach((c, i) => {
        if (fin) return;
        // Celda de etiqueta con tabla anidada (p. ej. Actividad Económica + Última
        // Actualización): sus valores están en otra tabla anidada en la misma posición
        if ($(c).find("table").length) {
          const internas = $(c).find("td.dataLabelE").toArray();
          const tablaValores = valores[i]
            ? $(valores[i]).find("table").first()
            : null;
          const celdasValor = tablaValores?.length
            ? tablaValores.find("tr").first().children("td, th").toArray()
            : [valores[i]];
          internas.forEach((ic, k) => {
            const etiqueta = limpiarEtiqueta($(ic).text());
            if (etiqueta) pares.push([etiqueta, valorCelda($, celdasValor[k])]);
          });
          return;
        }
        const etiqueta = limpiarEtiqueta($(c).text());
        if (!etiqueta) return;
        if (FIN_ENCABEZADO.test(etiqueta)) {
          fin = cortarEnFin;
          return;
        }
        pares.push([etiqueta, valorCelda($, valores[i])]);
      });
    });
  return pares;
}

// Imagen del documento digitalizado (p. ej. 'FOTO VEHICULO' en carpeta 'vehiculo')
function fotoDocumento(
  $: $,
  baseUrl: string,
  documento: string,
  carpeta: string,
) {
  const abs = (u: string) => new URL(u, baseUrl).href;
  const re = new RegExp(documento, "i");
  const filas = $("tr")
    .toArray()
    .filter(
      (tr) =>
        re.test($(tr).text()) &&
        !$(tr)
          .find("tr")
          .toArray()
          .some((t) => re.test($(t).text())),
    );
  const archivo = new RegExp(`/${carpeta}/+\\d+_\\d+\\.(jpe?g|png)$`, "i");
  for (const tr of filas) {
    for (const el of $(tr).find("a, img").toArray()) {
      const src = $(el).attr("href") || $(el).attr("src") || "";
      if (archivo.test(src)) return abs(src);
    }
  }
  const miniatura = new RegExp(`/${carpeta}/+Min_\\d+_\\d+\\.`, "i");
  const min = $("img")
    .toArray()
    .map((i) => $(i).attr("src") || "")
    .find((s) => miniatura.test(s));
  return min ? abs(min.replace(/\/+Min_/, "/")) : null;
}

function parsearFicha(
  html: string,
  opciones: {
    baseUrl: string;
    capas: [string, string][];
    documentoFoto: string;
    carpeta: string;
  },
) {
  const $ = cheerio.load(html);
  const lbl = $("td.dataLabelE")
    .filter((_, td) => limpiar($(td).text()) === "Código")
    .first();
  if (!lbl.length)
    throw new Error("El HTML no corresponde a una ficha de Silogtran.");
  const pares = paresEtiquetaValor($, lbl.closest("table"), {
    cortarEnFin: true,
  });
  // La celda 'Código' incluye la miniatura y el texto 'foto ...'
  const iCodigo = pares.findIndex(([k]) => k === "Código");
  if (iCodigo >= 0)
    pares[iCodigo][1] = (/^\s*(\d*)/.exec(pares[iCodigo][1]) || [])[1] || "";

  const secciones: Seccion[] = opciones.capas.map(([id, titulo]) => {
    const tabla = $(`#ctl0_MainModule_${id}_formtable`);
    return [titulo, tabla.length ? paresEtiquetaValor($, tabla) : []];
  });

  return {
    $,
    ficha: {
      encabezadoPares: pares,
      secciones,
      fotoUrl: fotoDocumento(
        $,
        opciones.baseUrl,
        opciones.documentoFoto,
        opciones.carpeta,
      ),
    } satisfies FichaGuardada,
  };
}

export function parsearVehiculo(html: string, baseUrl: string) {
  const { $, ficha } = parsearFicha(html, {
    baseUrl,
    capas: CAPAS_VEHICULO,
    documentoFoto: "FOTO VEHICULO",
    carpeta: "vehiculo",
  });
  const conductor = $(
    'input[name="ctl0$MainModule$tercero_codigo_conductor$IDHidden"]',
  ).attr("value");
  return {
    ficha,
    conductorCodigo: /^\d+$/.test(conductor || "") ? conductor! : null,
  };
}

export function parsearConductor(html: string, baseUrl: string): FichaGuardada {
  const { ficha } = parsearFicha(html, {
    baseUrl,
    capas: CAPAS_CONDUCTOR,
    documentoFoto: "FOTO CONDUCTOR",
    carpeta: "tercero",
  });
  const e = Object.fromEntries(ficha.encabezadoPares);
  return {
    ...ficha,
    nombre: limpiar(
      [
        e["Primer Nombre"],
        e["Segundo Nombre"],
        e["Primer Apellido"],
        e["Segundo Apellido"],
      ].join(" "),
    ),
  };
}
