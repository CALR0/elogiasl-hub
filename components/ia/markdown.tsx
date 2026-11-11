import { Fragment, type ReactNode } from "react";

/*
 * Render mínimo de Markdown para las respuestas de la IA. Gemini usa
 * **negrillas**, *cursivas*, `código inline` y listas con "- " o "* ".
 * Es suficiente con esto; evita traerse react-markdown por algo pequeño.
 *
 * - Intencionalmente NO renderiza HTML del texto (los fragmentos se escapan
 *   usando los nodos de React, no dangerouslySetInnerHTML).
 * - No procesa encabezados ni enlaces: la IA en este chat no los usa.
 */

/** Parte en párrafos y listas; los asteriscos sueltos del texto se respetan. */
export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: ReactNode[] = [];
  let listaActual: string[] | null = null;
  let parrafoActual: string[] | null = null;

  const cerrarPendientes = () => {
    if (listaActual) {
      bloques.push(
        <ul key={`ul-${bloques.length}`} className="ml-4 list-disc space-y-1">
          {listaActual.map((item, i) => (
            <li key={i}>
              <InlineMarkdown texto={item} />
            </li>
          ))}
        </ul>,
      );
      listaActual = null;
    }
    if (parrafoActual) {
      bloques.push(
        <p key={`p-${bloques.length}`} className="whitespace-pre-wrap">
          <InlineMarkdown texto={parrafoActual.join("\n")} />
        </p>,
      );
      parrafoActual = null;
    }
  };

  for (const linea of lineas) {
    const item = /^\s*[-*]\s+(.*)$/.exec(linea);
    if (item) {
      if (parrafoActual) cerrarPendientes();
      listaActual ??= [];
      listaActual.push(item[1]);
      continue;
    }
    if (!linea.trim()) {
      cerrarPendientes();
      continue;
    }
    if (listaActual) cerrarPendientes();
    parrafoActual ??= [];
    parrafoActual.push(linea);
  }
  cerrarPendientes();

  return <div className="space-y-2">{bloques}</div>;
}

/** **bold**, *cursiva*, `code` en una porción de texto. */
function InlineMarkdown({ texto }: { texto: string }) {
  // Primero código inline (no se procesa nada dentro), luego el resto.
  const partes = dividir(texto, /`([^`]+)`/g, (m, i) => (
    <code
      key={`c-${i}`}
      className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]"
    >
      {m}
    </code>
  ));
  return (
    <>
      {partes.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{procesarNegritaCursiva(p, i)}</Fragment>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function procesarNegritaCursiva(texto: string, idx: number): ReactNode {
  // **bold** o __bold__
  const conBold = dividir(texto, /\*\*([^*]+)\*\*|__([^_]+)__/g, (m, i) => (
    <strong key={`b-${idx}-${i}`}>{m}</strong>
  ));
  // Luego *cursiva* / _cursiva_ dentro de los pedazos de texto
  return conBold.map((p, i) =>
    typeof p === "string" ? (
      <Fragment key={`t-${idx}-${i}`}>
        {dividir(p, /\*([^*]+)\*|_([^_]+)_/g, (m, j) => (
          <em key={`i-${idx}-${i}-${j}`}>{m}</em>
        ))}
      </Fragment>
    ) : (
      <Fragment key={`r-${idx}-${i}`}>{p}</Fragment>
    ),
  );
}

/**
 * Divide `texto` según un regex con grupo de captura y devuelve una lista
 * mezclando trozos de string y lo que haga `render` para cada coincidencia.
 * Soporta regex con uno o dos grupos de captura (toma el primero que exista).
 */
function dividir(
  texto: string,
  regex: RegExp,
  render: (contenido: string, i: number) => ReactNode,
): ReactNode[] {
  const salida: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  // Reiniciamos el lastIndex por si el regex es global y se reutiliza
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) salida.push(texto.slice(ultimo, m.index));
    const contenido = m[1] ?? m[2] ?? "";
    salida.push(render(contenido, i++));
    ultimo = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (ultimo < texto.length) salida.push(texto.slice(ultimo));
  return salida.length ? salida : [texto];
}
