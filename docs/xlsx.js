// Escritor mínimo de archivos Excel (.xlsx), sin dependencias.
// Un .xlsx es un ZIP con varios archivos XML. Acá se arma el ZIP "sin comprimir" (método 0, el que ya
// aceptan Excel, Google Sheets, LibreOffice y Numbers) y los XML de cada hoja, con estilos básicos.
//
// Uso:
//   const bytes = crearLibro([{
//     nombre: "Gastos", anchos: [14, 30], congelarFilas: 1, filtro: "A1:B10",
//     filas: [
//       [{ v: "Fecha", e: "encabezado" }, { v: "Monto", e: "encabezado" }],
//       [{ v: serialFecha("2026-12-05"), e: "fecha" }, { v: 150000, e: "moneda" }],
//       [null, { v: 150000, e: "total_moneda", f: "SUBTOTAL(109,B2:B2)" }],   // con fórmula
//     ],
//   }]);

const codificador = new TextEncoder();

// ---- ZIP -----------------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function unir(partes) {
  const total = partes.reduce((suma, p) => suma + p.length, 0);
  const todo = new Uint8Array(total);
  let posicion = 0;
  for (const p of partes) {
    todo.set(p, posicion);
    posicion += p.length;
  }
  return todo;
}

/** ZIP sin compresión. `archivos`: [{ nombre, datos: Uint8Array }]. */
export function crearZip(archivos) {
  const fecha = ((2026 - 1980) << 9) | (1 << 5) | 1; // fecha fija (2026-01-01): el ZIP sale igual cada vez
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of archivos) {
    const nombreBytes = codificador.encode(nombre);
    const crc = crc32(datos);

    const local = new Uint8Array(30 + nombreBytes.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); // firma "encabezado local"
    l.setUint16(4, 20, true); // versión necesaria
    l.setUint16(6, 0x0800, true); // nombres en UTF-8
    l.setUint16(8, 0, true); // método 0 = sin comprimir
    l.setUint16(10, 0, true); // hora
    l.setUint16(12, fecha, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, datos.length, true); // tamaño comprimido
    l.setUint32(22, datos.length, true); // tamaño original
    l.setUint16(26, nombreBytes.length, true);
    l.setUint16(28, 0, true); // campo extra
    local.set(nombreBytes, 30);
    locales.push(local, datos);

    const central = new Uint8Array(46 + nombreBytes.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); // firma "directorio central"
    c.setUint16(4, 20, true); // versión con la que se creó
    c.setUint16(6, 20, true); // versión necesaria
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, fecha, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, nombreBytes.length, true);
    c.setUint32(42, desplazamiento, true); // dónde empieza el encabezado local de este archivo
    central.set(nombreBytes, 46);
    centrales.push(central);

    desplazamiento += local.length + datos.length;
  }
  const tamanoCentral = centrales.reduce((suma, x) => suma + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true); // firma "fin del directorio central"
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamanoCentral, true);
  f.setUint32(16, desplazamiento, true);
  return unir([...locales, ...centrales, fin]);
}

// ---- Estilos -------------------------------------------------------------------------------

const FUENTES = [
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>', // 0 normal
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>', // 1 negrita
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>', // 2 negrita blanca
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>', // 3 título
];
const colorRelleno = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const RELLENOS = [
  '<fill><patternFill patternType="none"/></fill>', // 0 (obligatorio)
  '<fill><patternFill patternType="gray125"/></fill>', // 1 (obligatorio)
  colorRelleno("6D4C41"), // 2 marrón (encabezados)
  colorRelleno("F9C22E"), // 3 amarillo (Estimado)
  colorRelleno("F58A1F"), // 4 naranja (A pagar)
  colorRelleno("2E7D32"), // 5 verde (Pagado)
  colorRelleno("C62828"), // 6 rojo (Vencido)
  colorRelleno("F3ECE8"), // 7 gris claro (secciones)
];
const BORDES = [
  "<border><left/><right/><top/><bottom/><diagonal/></border>", // 0 sin borde
  '<border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border>', // 1 línea arriba
];
const FORMATOS = { fecha: 164, moneda: 165 };
const CODIGOS_FORMATO = { 164: "dd/mm/yyyy", 165: '"$"\\ #,##0' };

// nombre -> { fuente, relleno, borde, formato, ajustar }
const ESTILOS = {
  normal: {},
  encabezado: { fuente: 2, relleno: 2, ajustar: true },
  encabezado_derecha: { fuente: 2, relleno: 2, ajustar: true, derecha: true },
  titulo: { fuente: 3 },
  negrita: { fuente: 1 },
  fecha: { formato: FORMATOS.fecha },
  moneda: { formato: FORMATOS.moneda },
  moneda_negrita: { fuente: 1, formato: FORMATOS.moneda },
  seccion: { fuente: 1, relleno: 7 },
  estado_estimado: { fuente: 1, relleno: 3 },
  estado_a_pagar: { fuente: 1, relleno: 4 },
  estado_pagado: { fuente: 2, relleno: 5 },
  estado_vencido: { fuente: 2, relleno: 6 },
  total_texto: { fuente: 1, borde: 1 },
  total_moneda: { fuente: 1, borde: 1, formato: FORMATOS.moneda },
};
const NOMBRES_ESTILO = Object.keys(ESTILOS);

function xmlEstilos() {
  const formatos = Object.entries(CODIGOS_FORMATO)
    .map(([id, codigo]) => `<numFmt numFmtId="${id}" formatCode="${atributo(codigo)}"/>`)
    .join("");
  const xfs = NOMBRES_ESTILO.map((nombre) => {
    const { fuente = 0, relleno = 0, borde = 0, formato = 0, ajustar = false, derecha = false } = ESTILOS[nombre];
    const alineacion = ajustar ? `<alignment${derecha ? ' horizontal="right"' : ""} vertical="center" wrapText="1"/>` : "";
    return `<xf numFmtId="${formato}" fontId="${fuente}" fillId="${relleno}" borderId="${borde}" xfId="0"` +
      `${formato ? ' applyNumberFormat="1"' : ""}${fuente ? ' applyFont="1"' : ""}${relleno ? ' applyFill="1"' : ""}` +
      `${borde ? ' applyBorder="1"' : ""}${ajustar ? ' applyAlignment="1">' + alineacion + "</xf>" : "/>"}`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${Object.keys(CODIGOS_FORMATO).length}">${formatos}</numFmts>` +
    `<fonts count="${FUENTES.length}">${FUENTES.join("")}</fonts>` +
    `<fills count="${RELLENOS.length}">${RELLENOS.join("")}</fills>` +
    `<borders count="${BORDES.length}">${BORDES.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${NOMBRES_ESTILO.length}">${xfs}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;
}

// ---- Hojas ---------------------------------------------------------------------------------

// Quita los caracteres que XML no admite y escapa los que tienen significado especial.
function limpiar(texto) {
  return String(texto).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}
function atributo(texto) {
  return limpiar(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function contenido(texto) {
  return limpiar(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Letra de una columna: 0 -> A, 25 -> Z, 26 -> AA. */
export function letraColumna(indice) {
  let letras = "";
  for (let n = indice; n >= 0; n = Math.floor(n / 26) - 1) letras = String.fromCharCode(65 + (n % 26)) + letras;
  return letras;
}

/** "2026-12-05" -> número de serie de Excel (días desde 1899-12-30). */
export function serialFecha(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

function xmlCelda(celda, referencia) {
  if (celda === null || celda === undefined || celda === "") return "";
  const { v, e = "normal", f } = typeof celda === "object" ? celda : { v: celda };
  if (v === null || v === undefined || v === "") return "";
  const estilo = NOMBRES_ESTILO.indexOf(e);
  if (estilo < 0) throw new Error(`Estilo desconocido: ${e}`);
  const s = estilo ? ` s="${estilo}"` : "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Número inválido en ${referencia}`);
    return `<c r="${referencia}"${s}>${f ? `<f>${contenido(f)}</f>` : ""}<v>${v}</v></c>`;
  }
  const texto = limpiar(v);
  const conservar = /^\s|\s$/.test(texto) ? ' xml:space="preserve"' : "";
  return `<c r="${referencia}"${s} t="inlineStr"><is><t${conservar}>${contenido(texto)}</t></is></c>`;
}

function xmlHoja(hoja, esPrimera) {
  const filas = hoja.filas
    .map((celdas, i) => {
      const numero = i + 1;
      const xml = celdas.map((celda, j) => xmlCelda(celda, `${letraColumna(j)}${numero}`)).join("");
      return `<row r="${numero}">${xml}</row>`;
    })
    .join("");
  const columnas = (hoja.anchos ?? [])
    .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
    .join("");
  const congelar = hoja.congelarFilas
    ? `<pane ySplit="${hoja.congelarFilas}" topLeftCell="A${hoja.congelarFilas + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : "";
  // Para imprimir: hoja apaisada y ajustada al ancho de la página (el largo puede ocupar varias).
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView${esPrimera ? ' tabSelected="1"' : ""} workbookViewId="0">${congelar}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (columnas ? `<cols>${columnas}</cols>` : "") +
    `<sheetData>${filas}</sheetData>` +
    (hoja.filtro ? `<autoFilter ref="${hoja.filtro}"/>` : "") +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`;
}

/** Los nombres de hoja no pueden tener []:*?/\ ni pasar de 31 letras. */
function nombreDeHoja(nombre) {
  return limpiar(nombre).replace(/[[\]:*?/\\]/g, "-").slice(0, 31) || "Hoja";
}

// ---- Libro ---------------------------------------------------------------------------------

/** Arma el archivo .xlsx. Devuelve los bytes (Uint8Array). */
export function crearLibro(hojas) {
  const nombres = hojas.map((h) => nombreDeHoja(h.nombre));
  const tipos = {
    hoja: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
    estilos: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    documento: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  };
  const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const contentTypes = `${cabecera}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;
  const relacionesRaiz = `${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${tipos.documento}" Target="xl/workbook.xml"/></Relationships>`;
  const libro = `${cabecera}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${nombres.map((n, i) => `<sheet name="${atributo(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const relacionesLibro = `${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${tipos.hoja}" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="${tipos.estilos}" Target="styles.xml"/></Relationships>`;

  const texto = (xml) => codificador.encode(xml);
  return crearZip([
    { nombre: "[Content_Types].xml", datos: texto(contentTypes) },
    { nombre: "_rels/.rels", datos: texto(relacionesRaiz) },
    { nombre: "xl/workbook.xml", datos: texto(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: texto(relacionesLibro) },
    { nombre: "xl/styles.xml", datos: texto(xmlEstilos()) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: texto(xmlHoja(h, i === 0)) })),
  ]);
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
