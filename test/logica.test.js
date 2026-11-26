import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hoyISO, estadoEfectivo, pagadoDe, saldoDe, agregarPago, quitarPago, totales, ordenar,
  textoVencimiento, formatoPesos, formatoFecha, parseMonto, validarGasto, validarPago, diasHasta,
  FORMAS_PAGO, etiquetaForma, mesDe, nombreMes, mesesDisponibles, gastosDelMes, totalesDelMes,
  RUBROS, etiquetaRubro, SIN_RUBRO, coincideBusqueda, coincideRubro,
} from "../docs/logica.js";

const HOY = "2026-12-10";
const gasto = (extra = {}) => ({
  descripcion: "Alquiler", monto: 10000, fechaPago: "2026-12-20", estado: "a_pagar", pagos: [], ...extra,
});

test("hoyISO usa la fecha local con ceros", () => {
  assert.equal(hoyISO(new Date(2026, 10, 6)), "2026-11-06");
});

test("formatoPesos y formatoFecha", () => {
  assert.equal(formatoPesos(0), "$ 0");
  assert.equal(formatoPesos(1500), "$ 1.500");
  assert.equal(formatoPesos(1234567), "$ 1.234.567");
  assert.equal(formatoFecha("2026-12-05"), "05/12/2026");
});

test("parseMonto acepta puntos, signo $ y coma; rechaza lo que no es número", () => {
  assert.equal(parseMonto("15000"), 15000);
  assert.equal(parseMonto("15.000"), 15000);
  assert.equal(parseMonto("$ 2.500"), 2500);
  assert.equal(parseMonto("1500,50"), 1501);
  assert.equal(parseMonto(""), null);
  assert.equal(parseMonto("abc"), null);
  assert.equal(parseMonto("-5"), null);
});

test("Vencido se calcula solo: no pagado y fecha anterior a hoy", () => {
  assert.equal(estadoEfectivo(gasto({ fechaPago: "2026-12-09" }), HOY), "vencido");
  assert.equal(estadoEfectivo(gasto({ fechaPago: "2026-12-09", estado: "estimado" }), HOY), "vencido");
  assert.equal(estadoEfectivo(gasto({ fechaPago: HOY }), HOY), "a_pagar"); // el día del vencimiento aún no está vencido
  assert.equal(estadoEfectivo(gasto({ fechaPago: "2026-12-09", estado: "pagado" }), HOY), "pagado");
  assert.equal(estadoEfectivo(gasto({ estado: "estimado" }), HOY), "estimado");
});

test("pagos parciales: total pagado y saldo", () => {
  let g = gasto();
  g = agregarPago(g, { fecha: HOY, monto: 3000 });
  g = agregarPago(g, { fecha: HOY, monto: 2000 });
  assert.equal(pagadoDe(g), 5000);
  assert.equal(saldoDe(g), 5000);
  assert.equal(g.estado, "a_pagar");
});

test("el último pago que completa el monto deja el gasto en Pagado", () => {
  let g = agregarPago(gasto(), { fecha: HOY, monto: 4000 });
  g = agregarPago(g, { fecha: HOY, monto: 6000 });
  assert.equal(g.estado, "pagado");
  assert.equal(saldoDe(g), 0);
  assert.equal(pagadoDe(g), 10000);
});

test("marcar Pagado sin pagos registrados cuenta el monto completo", () => {
  const g = gasto({ estado: "pagado" });
  assert.equal(pagadoDe(g), 10000);
  assert.equal(saldoDe(g), 0);
});

test("quitar el pago que había completado el gasto lo vuelve a A pagar", () => {
  let g = agregarPago(gasto(), { fecha: HOY, monto: 10000 });
  assert.equal(g.estado, "pagado");
  g = quitarPago(g, 0);
  assert.equal(g.estado, "a_pagar");
  assert.equal(saldoDe(g), 10000);
});

test("quitar un pago de un gasto marcado Pagado a mano no cambia su estado", () => {
  const g = gasto({ estado: "pagado", pagos: [{ fecha: HOY, monto: 2000 }] });
  assert.equal(quitarPago(g, 0).estado, "pagado");
});

test("totales generales", () => {
  const gastos = [
    gasto({ monto: 10000, fechaPago: "2026-12-01", pagos: [{ fecha: HOY, monto: 4000 }] }), // vencido, saldo 6000
    gasto({ monto: 5000, fechaPago: "2026-12-30" }), // a pagar, saldo 5000
    gasto({ monto: 8000, estado: "pagado" }), // pagado 8000
  ];
  assert.deepEqual(totales(gastos, HOY), { pagado: 12000, saldo: 11000, saldoVencido: 6000, cantidadVencidos: 1 });
});

test("orden: no pagados por fecha, pagados al final", () => {
  const a = gasto({ descripcion: "A", fechaPago: "2026-12-30" });
  const b = gasto({ descripcion: "B", fechaPago: "2026-12-12" });
  const c = gasto({ descripcion: "C", estado: "pagado", fechaPago: "2026-12-01" });
  const d = gasto({ descripcion: "D", estado: "pagado", fechaPago: "2026-12-05" });
  assert.deepEqual(ordenar([a, c, d, b]).map((g) => g.descripcion), ["B", "A", "D", "C"]);
});

test("textos de vencimiento", () => {
  assert.equal(diasHasta("2026-12-13", HOY), 3);
  assert.equal(textoVencimiento(gasto({ fechaPago: "2026-12-13" }), HOY), "Vence en 3 días");
  assert.equal(textoVencimiento(gasto({ fechaPago: "2026-12-11" }), HOY), "Vence mañana");
  assert.equal(textoVencimiento(gasto({ fechaPago: HOY }), HOY), "Vence hoy");
  assert.equal(textoVencimiento(gasto({ fechaPago: "2026-12-09" }), HOY), "Venció ayer");
  assert.equal(textoVencimiento(gasto({ fechaPago: "2026-12-05" }), HOY), "Venció hace 5 días");
  assert.equal(textoVencimiento(gasto({ estado: "pagado" }), HOY), "");
});

test("validarGasto", () => {
  const ok = { descripcion: "Luz", monto: 100, fechaPago: "2026-12-01", estado: "estimado" };
  assert.equal(validarGasto(ok), null);
  assert.match(validarGasto({ ...ok, descripcion: "  " }), /descripción/);
  assert.match(validarGasto({ ...ok, monto: null }), /monto/);
  assert.match(validarGasto({ ...ok, monto: 1.5 }), /monto/);
  assert.match(validarGasto({ ...ok, fechaPago: "2026-02-31" }), /fecha/);
  assert.match(validarGasto({ ...ok, estado: "vencido" }), /estado/);
});

test("validarPago", () => {
  const g = gasto({ pagos: [{ fecha: HOY, monto: 4000 }] }); // saldo 6000
  assert.equal(validarPago(g, { fecha: HOY, monto: 6000 }), null);
  assert.match(validarPago(g, { fecha: HOY, monto: 6001 }), /supera el saldo/);
  assert.match(validarPago(g, { fecha: HOY, monto: 0 }), /monto/);
  assert.match(validarPago(g, { fecha: "x", monto: 10 }), /fecha/);
  assert.match(validarPago(gasto({ estado: "pagado" }), { fecha: HOY, monto: 10 }), /ya está pagado/);
});

// ---- Forma de pago -------------------------------------------------------------------------

test("forma de pago: las 5 opciones con sus nombres y validación", () => {
  assert.deepEqual(FORMAS_PAGO.map(etiquetaForma), [
    "Manual - MP", "Débito Automático - MP", "Manual - Galicia", "Débito Automático - Galicia", "Efectivo",
  ]);
  assert.equal(etiquetaForma(undefined), "Sin definir");
  const ok = { descripcion: "Luz", monto: 100, fechaPago: "2026-12-01", estado: "estimado" };
  assert.equal(validarGasto({ ...ok, formaPago: "efectivo" }), null);
  assert.equal(validarGasto({ ...ok, formaPago: "" }), null); // opcional
  assert.equal(validarGasto(ok), null);
  assert.match(validarGasto({ ...ok, formaPago: "cheque" }), /forma de pago/);
});

// ---- Rubros y búsqueda ---------------------------------------------------------------------

test("rubros: las 10 opciones con sus nombres y validación", () => {
  assert.deepEqual(RUBROS.map(etiquetaRubro), [
    "Productos", "Servicios", "Alquiler", "Compra insumos", "Tarjeta", "Gastos Bancarios", "Impuesto",
    "Socios", "Préstamos", "Empleados",
  ]);
  // Los gastos ya guardados con las claves de antes siguen teniendo rubro (solo cambió el nombre que se ve)
  assert.equal(etiquetaRubro("servicio"), "Servicios");
  assert.equal(etiquetaRubro("gasto_bancario"), "Gastos Bancarios");
  assert.equal(validarGasto({ descripcion: "Luz", monto: 1, fechaPago: "2026-12-01", estado: "estimado", rubro: "servicio" }), null);
  assert.equal(validarGasto({ descripcion: "Cuota", monto: 1, fechaPago: "2026-12-01", estado: "estimado", rubro: "prestamos" }), null);
  assert.ok(coincideBusqueda({ descripcion: "Cuota", monto: 1, rubro: "prestamos" }, "prestamos")); // sin tilde también
  assert.equal(etiquetaRubro(undefined), "Sin rubro");
  const ok = { descripcion: "Luz", monto: 100, fechaPago: "2026-12-01", estado: "estimado" };
  assert.equal(validarGasto({ ...ok, rubro: "impuesto" }), null);
  assert.equal(validarGasto({ ...ok, rubro: "" }), null); // opcional
  assert.equal(validarGasto(ok), null);
  assert.match(validarGasto({ ...ok, rubro: "otro" }), /rubro/);
});

test("filtro por rubro: todos, sin rubro o uno en particular", () => {
  const a = gasto({ rubro: "alquiler" });
  const s = gasto({});
  assert.ok(coincideRubro(a, "") && coincideRubro(s, ""));
  assert.ok(coincideRubro(a, "alquiler") && !coincideRubro(s, "alquiler"));
  assert.ok(coincideRubro(s, SIN_RUBRO) && !coincideRubro(a, SIN_RUBRO));
});

test("búsqueda: sin tildes ni mayúsculas, varias palabras, y por rubro, forma de pago o monto", () => {
  const g = gasto({ descripcion: "Alquiler Local Córdoba", monto: 450000, rubro: "gasto_bancario", formaPago: "debito_galicia" });
  assert.ok(coincideBusqueda(g, ""));
  assert.ok(coincideBusqueda(g, "   "));
  assert.ok(coincideBusqueda(g, "cordoba"));
  assert.ok(coincideBusqueda(g, "CÓRDOBA"));
  assert.ok(coincideBusqueda(g, "local alquiler")); // en cualquier orden
  assert.ok(coincideBusqueda(g, "bancario")); // por rubro
  assert.ok(coincideBusqueda(g, "debito")); // por forma de pago
  assert.ok(coincideBusqueda(g, "galicia"));
  assert.ok(coincideBusqueda(g, "450000")); // por monto
  assert.ok(coincideBusqueda(g, "450.000"));
  assert.ok(!coincideBusqueda(g, "luz"));
  assert.ok(!coincideBusqueda(g, "cordoba luz")); // todas las palabras deben estar
  assert.ok(coincideBusqueda(gasto({ descripcion: "X" }), "sin rubro")); // sin rubro también se puede buscar
});

// ---- Filtro por mes ------------------------------------------------------------------------

test("meses: clave y nombre", () => {
  assert.equal(mesDe("2026-12-20"), "2026-12");
  assert.equal(nombreMes("2026-12"), "Diciembre 2026");
  assert.equal(nombreMes("2027-01"), "Enero 2027");
});

test("mesesDisponibles: rango sin huecos, con el mes actual y el siguiente", () => {
  assert.deepEqual(mesesDisponibles([], HOY), ["2026-12", "2027-01"]);
  const gastos = [gasto({ fechaPago: "2026-10-05" }), gasto({ fechaPago: "2027-02-01" })];
  assert.deepEqual(mesesDisponibles(gastos, HOY), ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.ok(mesesDisponibles([], HOY, ["2026-09"]).includes("2026-09"));
});

test("gastosDelMes: lo que vence ese mes + lo impago de meses anteriores (arrastrado)", () => {
  const dic = gasto({ descripcion: "Dic", fechaPago: "2026-12-20" });
  const nov = gasto({ descripcion: "Nov", fechaPago: "2026-11-15" }); // impago -> vencido
  const novPago = gasto({ descripcion: "NovPago", fechaPago: "2026-11-10", estado: "pagado" });
  const ene = gasto({ descripcion: "Ene", fechaPago: "2027-01-05" });
  const todos = [dic, nov, novPago, ene];
  const resumen = (mes) => gastosDelMes(todos, mes, HOY).map((x) => [x.gasto.descripcion, x.arrastradoDe]);

  // Mes actual: lo propio + el impago de noviembre arrastrado; lo pagado no pasa
  assert.deepEqual(resumen("2026-12"), [["Nov", "2026-11"], ["Dic", null]]);
  // Mes pasado: solo lo que vencía entonces (impago primero)
  assert.deepEqual(resumen("2026-11"), [["Nov", null], ["NovPago", null]]);
  // Mes futuro: solo lo que vence en ese mes, sin arrastre
  assert.deepEqual(resumen("2027-01"), [["Ene", null]]);
});

test("un impago pasa mes a mes hasta el mes actual", () => {
  const oct = gasto({ descripcion: "Oct", fechaPago: "2026-10-03" });
  const en = (mes) => gastosDelMes([oct], mes, HOY).map((x) => x.arrastradoDe);
  assert.deepEqual(en("2026-10"), [null]);
  assert.deepEqual(en("2026-11"), ["2026-10"]);
  assert.deepEqual(en("2026-12"), ["2026-10"]);
  assert.deepEqual(en("2027-01"), []);
  // Todo lo arrastrado ya está vencido (se muestra en rojo)
  assert.equal(estadoEfectivo(oct, HOY), "vencido");
});

test("totalesDelMes: lo arrastrado suma su saldo, no lo que ya se pagó antes", () => {
  const nov = gasto({ monto: 10000, fechaPago: "2026-11-15", pagos: [{ fecha: "2026-11-20", monto: 4000 }] });
  const dic = gasto({ monto: 5000, fechaPago: "2026-12-20" });
  const dicPago = gasto({ monto: 8000, estado: "pagado", fechaPago: "2026-12-02" });
  const items = gastosDelMes([nov, dic, dicPago], "2026-12", HOY);
  assert.deepEqual(totalesDelMes(items, HOY), { pagado: 8000, saldo: 11000, saldoVencido: 6000, cantidadVencidos: 1 });
});
