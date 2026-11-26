import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, crearZip, crearLibro, letraColumna, serialFecha } from "../docs/xlsx.js";
import { crearReporteXlsx, nombreArchivoReporte, fechaCorta } from "../docs/reporte.js";
import { filasDelMes, resumenDeFilas, expandirRecurrentes, crearSerie, conOcurrencia } from "../docs/logica.js";

const HOY = "2026-12-10";
const texto = (bytes) => new TextDecoder().decode(bytes);

/** Lector mínimo de ZIP (solo para probar): devuelve { nombre: bytes } y verifica los CRC. */
function leerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const finDir = bytes.length - 22;
  assert.equal(v.getUint32(finDir, true), 0x06054b50, "firma del fin del directorio central");
  const entradas = v.getUint16(finDir + 10, true);
  let p = v.getUint32(finDir + 16, true);
  const archivos = {};
  for (let i = 0; i < entradas; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, "firma del directorio central");
    const crc = v.getUint32(p + 16, true);
    const tamano = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const desplazamiento = v.getUint32(p + 42, true);
    const nombre = texto(bytes.subarray(p + 46, p + 46 + largoNombre));
    assert.equal(v.getUint32(desplazamiento, true), 0x04034b50, "firma del encabezado local");
    assert.equal(v.getUint16(desplazamiento + 8, true), 0, "sin compresión");
    const inicio = desplazamiento + 30 + v.getUint16(desplazamiento + 26, true) + v.getUint16(desplazamiento + 28, true);
    const datos = bytes.subarray(inicio, inicio + tamano);
    assert.equal(crc32(datos), crc, `CRC de ${nombre}`);
    archivos[nombre] = datos;
    p += 46 + largoNombre;
  }
  return archivos;
}

// ---- Archivo ZIP y Excel -------------------------------------------------------------------

test("crc32: valor de referencia conocido", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zip: se puede volver a leer, con sus CRC y sin comprimir", () => {
  const e = new TextEncoder();
  const zip = crearZip([
    { nombre: "a.txt", datos: e.encode("hola") },
    { nombre: "carpeta/ñ.txt", datos: e.encode("acentos áéíóú") },
    { nombre: "vacio.txt", datos: new Uint8Array(0) },
  ]);
  const leido = leerZip(zip);
  assert.deepEqual(Object.keys(leido), ["a.txt", "carpeta/ñ.txt", "vacio.txt"]);
  assert.equal(texto(leido["a.txt"]), "hola");
  assert.equal(texto(leido["carpeta/ñ.txt"]), "acentos áéíóú");
  assert.equal(leido["vacio.txt"].length, 0);
  // fecha fija: dos veces el mismo archivo da exactamente los mismos bytes
  assert.deepEqual(crearZip([{ nombre: "a.txt", datos: e.encode("hola") }]), crearZip([{ nombre: "a.txt", datos: e.encode("hola") }]));
});

test("letras de columna y fechas de Excel", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letraColumna), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  assert.equal(serialFecha("2000-01-01"), 36526); // número de serie que usa Excel para esa fecha
  assert.equal(serialFecha("1900-03-01"), 61);
  assert.equal(serialFecha("2024-03-01") - serialFecha("2024-02-28"), 2); // año bisiesto
  assert.equal(serialFecha("2026-12-06") - serialFecha("2026-12-05"), 1);
});

test("libro: estructura de un .xlsx válido, estilos consistentes y textos escapados", () => {
  const bytes = crearLibro([
    {
      nombre: "Datos: 2026/12 [x]", // los caracteres no permitidos en el nombre de una hoja se reemplazan
      anchos: [20, 12],
      congelarFilas: 1,
      filtro: "A1:B3",
      filas: [
        [{ v: "Descripción", e: "encabezado" }, { v: "Monto", e: "encabezado_derecha" }],
        ["Luz & Gas <Edenor> \"2\"\u0001", { v: 1500, e: "moneda" }],
        [{ v: "  con espacios  " }, { v: 3000, e: "total_moneda", f: "SUBTOTAL(109,B2:B2)" }],
      ],
    },
  ]);
  const a = leerZip(bytes);
  assert.deepEqual(Object.keys(a), [
    "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml",
  ]);
  for (const [nombre, datos] of Object.entries(a)) assert.ok(texto(datos).startsWith("<?xml"), `${nombre} empieza con la declaración XML`);

  const hoja = texto(a["xl/worksheets/sheet1.xml"]);
  assert.match(hoja, /Luz &amp; Gas &lt;Edenor&gt; "2"<\/t>/); // escapado, y sin el carácter de control
  assert.ok(!hoja.includes("\u0001"));
  assert.match(hoja, /<t xml:space="preserve">  con espacios  <\/t>/);
  assert.match(hoja, /<f>SUBTOTAL\(109,B2:B2\)<\/f><v>3000<\/v>/);
  assert.match(hoja, /<autoFilter ref="A1:B3"\/>/);
  assert.match(hoja, /<pane ySplit="1" topLeftCell="A2"[^>]*state="frozen"\/>/);
  assert.match(texto(a["xl/workbook.xml"]), /<sheet name="Datos- 2026-12 -x-" sheetId="1" r:id="rId1"\/>/);

  // Todos los estilos usados existen: ningún s="N" se pasa de la cantidad de estilos declarados
  const estilos = texto(a["xl/styles.xml"]);
  const declarados = Number(estilos.match(/<cellXfs count="(\d+)"/)[1]);
  assert.equal((estilos.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf /g) ?? []).length, declarados);
  for (const m of hoja.matchAll(/ s="(\d+)"/g)) assert.ok(Number(m[1]) < declarados, `estilo ${m[1]} declarado`);
});

test("libro: un estilo que no existe se rechaza (no genera un archivo roto)", () => {
  assert.throws(() => crearLibro([{ nombre: "X", filas: [[{ v: 1, e: "no-existe" }]] }]), /Estilo desconocido/);
  assert.throws(() => crearLibro([{ nombre: "X", filas: [[{ v: NaN }]] }]), /Número inválido/);
});

// ---- Filas y resumen del mes ---------------------------------------------------------------

const serieAlquiler = () => ({
  id: "s1",
  ...crearSerie({ descripcion: "Alquiler", monto: 450000, fechaPago: "2026-11-05", estado: "a_pagar", rubro: "alquiler", formaPago: "manual_galicia", pagos: [] }),
});
function gastosDeEjemplo() {
  const serie = conOcurrencia(serieAlquiler(), "2026-12", { estado: "a_pagar", pagos: [{ fecha: "2026-12-03", monto: 100000 }] });
  return [
    { id: "a", descripcion: "Luz", monto: 38500, fechaPago: "2026-12-12", estado: "estimado", rubro: "servicio", formaPago: "debito_galicia", pagos: [] },
    { id: "b", descripcion: "Proveedor", monto: 120000, fechaPago: "2026-12-02", estado: "pagado", rubro: "compra_insumos", formaPago: "manual_mp", pagos: [{ fecha: "2026-12-02", monto: 120000 }] },
    { id: "d", descripcion: "Sin datos", monto: 5000, fechaPago: "2026-12-28", estado: "estimado", pagos: [] },
    { id: "e", descripcion: "Impago viejo", monto: 70000, fechaPago: "2026-11-25", estado: "a_pagar", rubro: "socios", formaPago: "efectivo", pagos: [{ fecha: "2026-11-28", monto: 20000 }] },
    { id: "f", descripcion: "Pagado en noviembre", monto: 9000, fechaPago: "2026-11-10", estado: "pagado", pagos: [] },
    ...expandirRecurrentes([serie], HOY),
  ];
}

test("filas del mes: lo que vence + lo arrastrado, con estado calculado y sin lo pagado de otros meses", () => {
  const filas = filasDelMes(gastosDeEjemplo(), "2026-12", HOY);
  const nombres = filas.map((f) => f.descripcion);
  assert.deepEqual(nombres.sort(), ["Alquiler", "Alquiler", "Impago viejo", "Luz", "Proveedor", "Sin datos"].sort());
  assert.ok(!nombres.includes("Pagado en noviembre")); // lo pagado de noviembre no pasa a diciembre
  const impago = filas.find((f) => f.descripcion === "Impago viejo");
  assert.deepEqual(
    { estado: impago.estado, arrastradoDe: impago.arrastradoDe, saldo: impago.saldo, pagado: impago.pagado, rubro: impago.rubro },
    { estado: "vencido", arrastradoDe: "2026-11", saldo: 50000, pagado: 20000, rubro: "socios" },
  );
  assert.deepEqual(impago.pagos, [{ fecha: "2026-11-28", monto: 20000 }]);
  const alquilerDic = filas.find((f) => f.descripcion === "Alquiler" && !f.arrastradoDe);
  assert.equal(alquilerDic.recurrente, true);
  assert.equal(alquilerDic.saldo, 350000);
  const sinDatos = filas.find((f) => f.descripcion === "Sin datos");
  assert.ok(!("rubro" in sinDatos) && !("formaPago" in sinDatos) && !("recurrente" in sinDatos) && !("arrastradoDe" in sinDatos));
  // son datos simples: sobreviven a guardarse y leerse como JSON (así se guardan en la base)
  assert.deepEqual(JSON.parse(JSON.stringify(filas)), filas);
});

test("resumen: del mes, arrastrados y total; por estado, rubro y forma de pago", () => {
  const r = resumenDeFilas(filasDelMes(gastosDeEjemplo(), "2026-12", HOY));
  assert.deepEqual(r.delMes, { cantidad: 4, monto: 613500, pagado: 220000, saldo: 393500 });
  assert.deepEqual(r.arrastrados, { cantidad: 2, monto: 520000, pagado: 20000, saldo: 500000 });
  assert.deepEqual(r.total, { cantidad: 6, monto: 1133500, pagado: 240000, saldo: 893500 });
  assert.equal(r.porEstado.vencido.cantidad, 3); // alquiler de noviembre, impago viejo y alquiler de diciembre (ya pasó el día 5)
  assert.equal(r.porEstado.pagado.saldo, 0);
  assert.deepEqual(r.porRubro.map((x) => x.nombre), ["Alquiler", "Compra insumos", "Servicios", "Socios", "Sin rubro"]);
  assert.deepEqual(r.porForma.map((x) => x.nombre), ["Manual - MP", "Manual - Galicia", "Débito Automático - Galicia", "Efectivo", "Sin definir"]);
  // cada desglose suma lo mismo que el total
  const suma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);
  for (const lista of [r.porRubro, r.porForma, Object.values(r.porEstado)]) {
    assert.equal(suma(lista, "monto"), r.total.monto);
    assert.equal(suma(lista, "saldo"), r.total.saldo);
    assert.equal(suma(lista, "cantidad"), r.total.cantidad);
  }
});

// ---- El Excel del reporte ------------------------------------------------------------------

test("reporte: tres hojas, con el detalle, los totales y los pagos parciales", () => {
  const filas = filasDelMes(gastosDeEjemplo(), "2026-12", HOY);
  const a = leerZip(crearReporteXlsx({ mes: "2026-12", filas, cerradoEn: "2027-01-01T12:00:00.000Z" }));
  const libro = texto(a["xl/workbook.xml"]);
  for (const nombre of ["Resumen", "Gastos", "Pagos"]) assert.ok(libro.includes(`name="${nombre}"`), `hoja ${nombre}`);

  const resumen = texto(a["xl/worksheets/sheet1.xml"]);
  assert.ok(resumen.includes("Diciembre 2026"));
  assert.match(resumen, /Mes cerrado el \d{2}\/\d{2}\/\d{4}\. Este reporte ya no cambia\./);
  assert.match(resumen, /<v>1133500<\/v>/); // monto total
  assert.match(resumen, /<v>893500<\/v>/); // saldo total

  const gastos = texto(a["xl/worksheets/sheet2.xml"]);
  const n = filas.length;
  assert.match(gastos, new RegExp(`<autoFilter ref="A1:J${n + 1}"/>`));
  assert.match(gastos, new RegExp(`<f>SUBTOTAL\\(109,H2:H${n + 1}\\)</f><v>1133500</v>`));
  assert.match(gastos, new RegExp(`<f>SUBTOTAL\\(109,J2:J${n + 1}\\)</f><v>893500</v>`));
  assert.match(gastos, /Impago de Noviembre 2026/);
  assert.match(gastos, new RegExp(`<v>${serialFecha("2026-12-12")}</v>`)); // las fechas son fechas de Excel, no texto
  assert.ok(gastos.includes("Débito Automático - Galicia"));

  const pagos = texto(a["xl/worksheets/sheet3.xml"]);
  assert.ok(pagos.includes("Proveedor") && pagos.includes("Impago viejo") && pagos.includes("Alquiler"));
  assert.match(pagos, /<v>100000<\/v>/);
});

test("reporte: un mes en curso lo dice, y un mes sin gastos no rompe nada", () => {
  const filas = filasDelMes(gastosDeEjemplo(), "2026-12", HOY);
  const vivo = leerZip(crearReporteXlsx({ mes: "2026-12", filas, generadoEn: "2026-12-10T15:30:00.000Z" }));
  assert.match(texto(vivo["xl/worksheets/sheet1.xml"]), /Mes en curso: datos al \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\./);

  const vacio = leerZip(crearReporteXlsx({ mes: "2026-10", filas: [], cerradoEn: "2026-11-01T12:00:00.000Z" }));
  assert.ok(texto(vacio["xl/worksheets/sheet2.xml"]).includes("No hay gastos en este mes."));
  assert.ok(!texto(vacio["xl/worksheets/sheet2.xml"]).includes("autoFilter"));
  assert.ok(texto(vacio["xl/worksheets/sheet3.xml"]).includes("Sin pagos parciales registrados."));
});

test("reporte: el mismo cierre da siempre el mismo archivo", () => {
  const filas = filasDelMes(gastosDeEjemplo(), "2026-12", HOY);
  const uno = crearReporteXlsx({ mes: "2026-12", filas, cerradoEn: "2027-01-01T12:00:00.000Z" });
  const dos = crearReporteXlsx({ mes: "2026-12", filas: JSON.parse(JSON.stringify(filas)), cerradoEn: "2027-01-01T12:00:00.000Z" });
  assert.deepEqual(uno, dos);
});

test("nombre de archivo y fecha corta", () => {
  assert.equal(nombreArchivoReporte("2026-12"), "Gastos-Copani-Caballito-2026-12.xlsx");
  assert.match(fechaCorta("2027-01-01T12:00:00.000Z"), /^\d{2}\/\d{2}\/\d{4}$/);
});
