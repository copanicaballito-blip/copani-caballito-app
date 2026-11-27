import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ahoraAR, diaDeLaSemana, esUltimoDiaDelMes, fechaHoraAR, mesDelInformeMensual, sumarDias, ventanaSemanal, viernesDeCierre,
} from "../fechas.js";

const utc = (texto) => new Date(texto);

test("hora de Argentina a partir de la hora UTC (3 horas menos)", () => {
  assert.deepEqual(ahoraAR(utc("2026-12-01T00:05:00Z")), { fecha: "2026-11-30", hora: 21, minuto: 5 });
  assert.deepEqual(ahoraAR(utc("2026-12-01T02:59:00Z")), { fecha: "2026-11-30", hora: 23, minuto: 59 });
  assert.deepEqual(ahoraAR(utc("2026-12-01T03:00:00Z")), { fecha: "2026-12-01", hora: 0, minuto: 0 }); // medianoche argentina
  assert.equal(fechaHoraAR("2026-12-05T00:03:00.000Z"), "04/12/2026 21:03");
});

test("días: sumar, día de la semana y último día del mes", () => {
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29"); // año bisiesto
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(diaDeLaSemana("2026-11-27"), 5); // viernes
  assert.equal(diaDeLaSemana("2026-11-29"), 0); // domingo
  assert.equal(esUltimoDiaDelMes("2026-11-30"), true);
  assert.equal(esUltimoDiaDelMes("2026-11-29"), false);
  assert.equal(esUltimoDiaDelMes("2028-02-29"), true);
  assert.equal(esUltimoDiaDelMes("2028-02-28"), false);
  assert.equal(esUltimoDiaDelMes("2026-12-31"), true);
});

test("viernes de cierre: el viernes más reciente cuyas 21:00 ya pasaron", () => {
  assert.equal(viernesDeCierre(utc("2026-12-05T00:03:00Z")), "2026-12-04"); // viernes 21:03 (cuando corre el programa)
  assert.equal(viernesDeCierre(utc("2026-12-05T00:40:00Z")), "2026-12-04"); // si el programa se atrasa un rato
  assert.equal(viernesDeCierre(utc("2026-12-05T03:30:00Z")), "2026-12-04"); // ya sábado en Argentina
  assert.equal(viernesDeCierre(utc("2026-12-07T15:00:00Z")), "2026-12-04"); // lunes
  assert.equal(viernesDeCierre(utc("2026-12-04T23:30:00Z")), "2026-11-27"); // viernes 20:30: todavía no cerró la semana
  assert.equal(viernesDeCierre(utc("2026-12-04T15:00:00Z")), "2026-11-27"); // viernes por la mañana
});

test("ventana semanal: de un viernes 21:00 al siguiente, en hora argentina", () => {
  const v = ventanaSemanal(utc("2026-12-05T00:03:00Z"));
  assert.equal(v.viernes, "2026-12-04");
  assert.equal(v.cierre.toISOString(), "2026-12-05T00:00:00.000Z"); // 21:00 argentinas
  assert.equal(v.desde.toISOString(), "2026-11-28T00:00:00.000Z"); // 7 días antes
  // Un pago a las 21:02 del viernes cae FUERA de esta ventana (es de la semana que viene)
  assert.ok(utc("2026-12-05T00:02:00Z") >= v.cierre);
  // y dos ventanas seguidas no se pisan ni dejan huecos
  const siguiente = ventanaSemanal(utc("2026-12-12T00:03:00Z"));
  assert.equal(siguiente.desde.toISOString(), v.cierre.toISOString());
});

test("informe mensual: toca el último día del mes (y el día 1 si el programa se atrasó)", () => {
  assert.equal(mesDelInformeMensual(utc("2026-12-01T00:05:00Z")), "2026-11"); // 30/11 a las 21:05
  assert.equal(mesDelInformeMensual(utc("2027-01-01T00:05:00Z")), "2026-12"); // 31/12 a las 21:05
  assert.equal(mesDelInformeMensual(utc("2028-03-01T00:05:00Z")), "2028-02"); // 29/02/2028 (bisiesto)
  assert.equal(mesDelInformeMensual(utc("2026-12-01T03:30:00Z")), "2026-11"); // se atrasó y ya es 1/12 en Argentina
  assert.equal(mesDelInformeMensual(utc("2026-11-29T00:05:00Z")), null); // 28/11
  assert.equal(mesDelInformeMensual(utc("2026-11-16T00:05:00Z")), null); // 15/11
});
