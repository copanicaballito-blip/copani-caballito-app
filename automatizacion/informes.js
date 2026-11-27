// Qué datos lleva cada informe. Usa las MISMAS reglas que la app (docs/logica.js), así los números coinciden con la pantalla.
import { expandirRecurrentes, filasDelMes, resumenDeFilas, diasHasta } from "../docs/logica.js";

/** Todos los gastos como los ve la app: los comunes + los meses que generan los gastos recurrentes. */
export function juntarGastos(unicos, series, hoy) {
  return [...unicos, ...expandirRecurrentes(series, hoy)];
}

/**
 * Informe de cierre de semana.
 * - pagos: los pagos registrados en la ventana (de los avisos de pago), del más viejo al más nuevo.
 * - vencidos: gastos del mes en curso (con los impagos arrastrados) que ya vencieron y siguen sin pagar.
 * - saldo: lo que falta pagar del mes en curso (lo mismo que muestra la pantalla principal de la app).
 */
export function datosSemanal({ gastos, avisos, hoy, ventana }) {
  const pagos = avisos
    .filter((a) => a.tipo === "pago")
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
    .map((a) => ({ creadoEn: a.creadoEn, descripcion: a.descripcion, monto: a.monto, saldo: a.saldo, fechaPago: a.fechaPago }));
  const mes = hoy.slice(0, 7);
  const filas = filasDelMes(gastos, mes, hoy);
  const resumen = resumenDeFilas(filas);
  const vencidos = filas
    .filter((f) => f.estado === "vencido")
    .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago) || a.descripcion.localeCompare(b.descripcion, "es"))
    .map((f) => ({ descripcion: f.descripcion, fechaPago: f.fechaPago, monto: f.monto, saldo: f.saldo, diasDeAtraso: -diasHasta(f.fechaPago, hoy) }));
  return {
    mes,
    desde: ventana.desde.toISOString(),
    hasta: ventana.cierre.toISOString(),
    pagos,
    totalPagado: pagos.reduce((suma, p) => suma + p.monto, 0),
    vencidos,
    saldo: resumen.total.saldo,
    saldoVencido: resumen.porEstado.vencido.saldo,
  };
}

/** Informe del mes: las filas (para el Excel adjunto) y los totales (para el resumen del mail). */
export function datosMensual({ gastos, mes, hoy }) {
  const filas = filasDelMes(gastos, mes, hoy);
  return { mes, filas, resumen: resumenDeFilas(filas) };
}
