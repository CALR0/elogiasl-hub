/**
 * ZIP sin compresión armado en el navegador (los PDF ya vienen comprimidos),
 * con nombres en UTF-8. El servidor entrega un PDF por petición y aquí se
 * juntan, para no superar el límite de tamaño de respuesta de Vercel.
 * Portado de FVE-C (public/app.js).
 */

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(datos: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++)
    c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escribir(
  vista: DataView<ArrayBuffer>,
  campos: [number, number, 2 | 4][],
) {
  for (const [pos, valor, bytes] of campos) {
    if (bytes === 4) vista.setUint32(pos, valor, true);
    else vista.setUint16(pos, valor, true);
  }
  return vista;
}

export function crearZip(entradas: { nombre: string; datos: Uint8Array }[]) {
  const d = new Date();
  const hora =
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    Math.floor(d.getSeconds() / 2);
  const fecha =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const partes: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let tamCentral = 0;
  for (const { nombre, datos } of entradas) {
    const n = new TextEncoder().encode(nombre);
    const crc = crc32(datos);
    partes.push(
      escribir(new DataView(new ArrayBuffer(30)), [
        [0, 0x04034b50, 4],
        [4, 20, 2],
        [6, 0x0800, 2],
        [8, 0, 2],
        [10, hora, 2],
        [12, fecha, 2],
        [14, crc, 4],
        [18, datos.length, 4],
        [22, datos.length, 4],
        [26, n.length, 2],
        [28, 0, 2],
      ]),
      n as Uint8Array<ArrayBuffer>,
      datos as Uint8Array<ArrayBuffer>,
    );
    central.push(
      escribir(new DataView(new ArrayBuffer(46)), [
        [0, 0x02014b50, 4],
        [4, 20, 2],
        [6, 20, 2],
        [8, 0x0800, 2],
        [10, 0, 2],
        [12, hora, 2],
        [14, fecha, 2],
        [16, crc, 4],
        [20, datos.length, 4],
        [24, datos.length, 4],
        [28, n.length, 2],
        [42, offset, 4],
      ]),
      n as Uint8Array<ArrayBuffer>,
    );
    tamCentral += 46 + n.length;
    offset += 30 + n.length + datos.length;
  }
  const fin = escribir(new DataView(new ArrayBuffer(22)), [
    [0, 0x06054b50, 4],
    [8, entradas.length, 2],
    [10, entradas.length, 2],
    [12, tamCentral, 4],
    [16, offset, 4],
  ]);
  return new Blob([...partes, ...central, fin], { type: "application/zip" });
}
