import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hoyISO, estadoEfectivo, pagadoDe, saldoDe, agregarPago, quitarPago, totales, ordenar,
  textoVencimiento, formatoPesos, formatoFecha, parseMonto, validarGasto, validarPago, diasHasta,
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
