// Arma el Excel del reporte mensual a partir de las filas de un mes (ver `filasDelMes` en logica.js).
// Tres hojas: "Resumen" (totales por estado, rubro y forma de pago), "Gastos" (el detalle, con filtros y
// totales que se recalculan al filtrar) y "Pagos" (los pagos parciales registrados).
import { crearLibro, serialFecha } from "./xlsx.js";
import { ETIQUETAS, etiquetaRubro, etiquetaForma, nombreMes, resumenDeFilas } from "./logica.js";

export function nombreArchivoReporte(mes) {
  return `Gastos-Copani-Caballito-${mes}.xlsx`;
}

const dos = (n) => String(n).padStart(2, "0");

/** "2026-12-01T10:30:00.000Z" -> "01/12/2026" (en la hora del dispositivo). */
export function fechaCorta(iso) {
  const f = new Date(iso);
  return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()}`;
}

function fechaYHora(iso) {
  const f = new Date(iso);
  return `${fechaCorta(iso)} ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

const t = (v, e) => ({ v, e });
// Los títulos de las columnas de números van a la derecha, igual que los números.
const NUMERICAS = new Set(["Cantidad", "Monto", "Pagado", "Saldo a pagar", "Saldo", "Monto del pago"]);
const encabezados = (...nombres) => nombres.map((n) => t(n, NUMERICAS.has(n) ? "encabezado_derecha" : "encabezado"));

/**
 * Devuelve los bytes del archivo .xlsx.
 * - Mes cerrado: pasar `cerradoEn` (texto ISO de cuándo se guardó).
 * - Mes en curso: pasar `generadoEn` (texto ISO de cuándo se descargó).
 */
export function crearReporteXlsx({ mes, filas, cerradoEn, generadoEn }) {
  const resumen = resumenDeFilas(filas);
  const estadoDelReporte = cerradoEn
    ? `Mes cerrado el ${fechaCorta(cerradoEn)}. Este reporte ya no cambia.`
    : `Mes en curso: datos al ${fechaYHora(generadoEn ?? new Date().toISOString())}.`;

  // ---- Hoja 1: Resumen ----
  const lineaTotales = (nombre, total, e = "normal", eNumero = "moneda") => [
    t(nombre, e), total.cantidad, t(total.monto, eNumero), t(total.pagado, eNumero), t(total.saldo, eNumero),
  ];
  const bloque = (titulo, lineas) => [
    encabezados(titulo, "Cantidad", "Monto", "Pagado", "Saldo a pagar"),
    ...lineas,
    [],
  ];
  const estados = ["estimado", "a_pagar", "vencido", "pagado"].map((e) =>
    lineaTotales(ETIQUETAS[e], resumen.porEstado[e], `estado_${e}`));
  const hojaResumen = {
    nombre: "Resumen",
    anchos: [38, 11, 16, 16, 16],
    filas: [
      [t("Copani Caballito · Reporte de gastos", "titulo")],
      [t(nombreMes(mes), "titulo")],
      [estadoDelReporte],
      [],
      ...bloque("Resumen del mes", [
        lineaTotales("Gastos que vencen en el mes", resumen.delMes),
        lineaTotales("Impagos de meses anteriores", resumen.arrastrados),
        lineaTotales("Total", resumen.total, "total_texto", "total_moneda").map((c, i) => (i === 1 ? t(c, "total_texto") : c)),
      ]),
      ...bloque("Por estado", estados),
      ...bloque("Por rubro", resumen.porRubro.map((r) => lineaTotales(r.nombre, r))),
      ...bloque("Por forma de pago", resumen.porForma.map((r) => lineaTotales(r.nombre, r))),
      [t("Pagado: lo ya pagado de cada gasto. Saldo a pagar: lo que falta. Los gastos impagos pasan al mes siguiente.", "normal")],
    ],
  };

  // ---- Hoja 2: Gastos ----
  const COLUMNAS = ["Fecha de pago", "Descripción", "Rubro", "Forma de pago", "Estado", "Recurrente", "Origen", "Monto", "Pagado", "Saldo"];
  const filasGastos = [encabezados(...COLUMNAS)];
  for (const f of filas) {
    filasGastos.push([
      t(serialFecha(f.fechaPago), "fecha"),
      f.descripcion,
      etiquetaRubro(f.rubro),
      etiquetaForma(f.formaPago),
      t(ETIQUETAS[f.estado], `estado_${f.estado}`),
      f.recurrente ? "Sí" : "No",
      f.arrastradoDe ? `Impago de ${nombreMes(f.arrastradoDe)}` : "Del mes",
      t(f.monto, "moneda"),
      t(f.pagado, "moneda"),
      t(f.saldo, "moneda"),
    ]);
  }
  const ultima = filasGastos.length; // fila de Excel del último gasto (la 1 es el encabezado)
  if (filas.length) {
    // Los totales usan SUBTOTAL: si se filtra la tabla en Excel, se recalculan con lo que queda a la vista.
    const total = (columna, valor) => ({ v: valor, e: "total_moneda", f: `SUBTOTAL(109,${columna}2:${columna}${ultima})` });
    filasGastos.push([]);
    filasGastos.push([null, null, null, null, null, null, t("Total", "total_texto"),
      total("H", resumen.total.monto), total("I", resumen.total.pagado), total("J", resumen.total.saldo)]);
  } else {
    filasGastos.push([t("No hay gastos en este mes.", "normal")]);
  }
  const hojaGastos = {
    nombre: "Gastos",
    anchos: [14, 34, 18, 28, 12, 12, 30, 16, 16, 16],
    congelarFilas: 1,
    filtro: filas.length ? `A1:J${ultima}` : undefined,
    filas: filasGastos,
  };

  // ---- Hoja 3: Pagos parciales ----
  const pagos = filas
    .flatMap((f) => f.pagos.map((p) => ({ ...p, descripcion: f.descripcion, fechaPago: f.fechaPago })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.descripcion.localeCompare(b.descripcion, "es"));
  const hojaPagos = {
    nombre: "Pagos",
    anchos: [16, 34, 16, 18],
    congelarFilas: 1,
    filas: [
      encabezados("Fecha del pago", "Gasto", "Vence el", "Monto del pago"),
      ...(pagos.length
        ? pagos.map((p) => [t(serialFecha(p.fecha), "fecha"), p.descripcion, t(serialFecha(p.fechaPago), "fecha"), t(p.monto, "moneda")])
        : [["Sin pagos parciales registrados."]]),
    ],
  };

  return crearLibro([hojaResumen, hojaGastos, hojaPagos]);
}
