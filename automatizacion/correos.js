// Redacción de los tres mails. Cada función devuelve { asunto, texto, html, adjuntos }.
// `texto` es la versión sin formato (por si el mail se lee en un lugar que no muestra HTML).
import { ETIQUETAS, formatoFecha, formatoPesos, nombreMes, etiquetaForma, etiquetaRubro } from "../docs/logica.js";
import { crearReporteXlsx, nombreArchivoReporte } from "../docs/reporte.js";
import { TIPO_XLSX } from "../docs/xlsx.js";
import { fechaHoraAR } from "./fechas.js";

const esc = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MARRON = "#6d4c41";

const gastos = (n) => `${n} ${n === 1 ? "gasto" : "gastos"}`;

/** Marco común de los mails (tabla simple con estilos en línea: es lo que entienden todos los programas de correo). */
function marco(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:16px;background:#f6f1ee;font-family:Arial,Helvetica,sans-serif;color:#2b2321">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:${MARRON};color:#ffffff;padding:14px 18px;font-size:18px;font-weight:bold">Copani Caballito · Gastos</td></tr>
<tr><td style="padding:18px"><h2 style="margin:0 0 14px;font-size:19px">${esc(titulo)}</h2>${cuerpo}</td></tr>
<tr><td style="padding:12px 18px;background:#f6f1ee;color:#6a5d58;font-size:12px">Mail automático de la app de gastos. No hace falta responderlo.</td></tr>
</table></body></html>`;
}

/** En el celular un monto no tiene que partirse en dos renglones ("$" arriba y el número abajo): espacio que no se corta. */
const sinCorte = (texto) => String(texto).replace(/\$ (?=\d)/g, () => "$ ");

const celda = (contenido, derecha = false, extra = "") =>
  `<td style="padding:7px 6px;border-bottom:1px solid #eee3de;${derecha ? "text-align:right;" : ""}${extra}">${sinCorte(contenido)}</td>`;

/** Tabla con encabezado. `derechas`: índices de las columnas de números. */
function tabla(encabezados, filas, derechas = []) {
  const cabeza = encabezados
    .map((e, i) => `<th style="padding:7px 8px;background:${MARRON};color:#ffffff;font-size:13px;text-align:${derechas.includes(i) ? "right" : "left"}">${esc(e)}</th>`)
    .join("");
  const cuerpo = filas.map((f) => `<tr>${f.map((c, i) => celda(c, derechas.includes(i))).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:6px 0 18px"><tr>${cabeza}</tr>${cuerpo}</table>`;
}

/** Recuadros con un total grande (ej. "Total pagado  $ 120.000"). */
function totales(items) {
  const celdas = items
    .map(([nombre, valor, color = "#2b2321"]) => `<td style="padding:10px;background:#f6f1ee;border-radius:8px;text-align:center;width:${Math.floor(100 / items.length)}%">
<div style="font-size:12px;color:#6a5d58">${esc(nombre)}</div><div style="font-size:18px;font-weight:bold;color:${color}">${sinCorte(esc(valor))}</div></td>`)
    .join('<td style="width:8px"></td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${celdas}</tr></table>`;
}

const subtitulo = (texto) => `<h3 style="margin:18px 0 4px;font-size:15px">${esc(texto)}</h3>`;

// ---- 1. Aviso de cada pago -----------------------------------------------------------------

export function correoAviso(aviso, prueba = false) {
  const queda = aviso.saldo > 0;
  const saldoTexto = queda ? formatoPesos(aviso.saldo) : "Sin saldo: el gasto quedó pagado";
  const detalle = [
    ["Gasto", aviso.descripcion],
    ["Monto pagado", formatoPesos(aviso.monto)],
    ["Saldo pendiente", saldoTexto],
    ["Monto del gasto", formatoPesos(aviso.montoGasto)],
    ["Vence", formatoFecha(aviso.fechaPago)],
  ];
  if (aviso.rubro) detalle.push(["Rubro", etiquetaRubro(aviso.rubro)]);
  if (aviso.formaPago) detalle.push(["Forma de pago", etiquetaForma(aviso.formaPago)]);
  detalle.push(["Registrado", `${fechaHoraAR(aviso.creadoEn)}${aviso.por ? ` por ${aviso.por}` : ""}`]);

  const filas = detalle
    .map(([nombre, valor]) => {
      const destacado = nombre === "Saldo pendiente" ? `font-weight:bold;color:${queda ? "#b45f06" : "#2e7d32"};` : nombre === "Monto pagado" ? "font-weight:bold;" : "";
      return `<tr>${celda(esc(nombre), false, "color:#6a5d58;width:38%")}${celda(esc(valor), false, destacado)}</tr>`;
    })
    .join("");
  return {
    asunto: `${prueba ? "[PRUEBA] " : ""}Pago registrado: ${aviso.descripcion} · ${formatoPesos(aviso.monto)}`,
    texto: ["Se registró un pago.", "", ...detalle.map(([n, v]) => `${n}: ${v}`)].join("\n"),
    html: marco("Se registró un pago", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">${filas}</table>`),
    adjuntos: [],
  };
}

// ---- 2. Cierre de semana -------------------------------------------------------------------

export function correoSemanal(d, prueba = false) {
  const desde = fechaHoraAR(d.desde).slice(0, 5);
  const hasta = fechaHoraAR(d.hasta).slice(0, 5);
  const titulo = `Cierre de semana · ${desde} al ${hasta}`;
  const filasPagos = d.pagos.map((p) => [fechaHoraAR(p.creadoEn), esc(p.descripcion), formatoPesos(p.monto), p.saldo > 0 ? formatoPesos(p.saldo) : "Pagado"]);
  const filasVencidos = d.vencidos.map((v) => [
    formatoFecha(v.fechaPago), esc(v.descripcion), formatoPesos(v.saldo), `${v.diasDeAtraso} ${v.diasDeAtraso === 1 ? "día" : "días"}`,
  ]);
  const html = marco(
    titulo,
    totales([
      ["Total pagado en la semana", formatoPesos(d.totalPagado), "#2e7d32"],
      ["Saldo a pagar", formatoPesos(d.saldo)],
      ["Saldo vencido", formatoPesos(d.saldoVencido), d.saldoVencido > 0 ? "#c62828" : "#2b2321"],
    ]) +
      subtitulo(`Pagos realizados (${d.pagos.length})`) +
      (d.pagos.length
        ? tabla(["Cuándo", "Gasto", "Pagado", "Saldo del gasto"], filasPagos, [2, 3])
        : `<p style="margin:6px 0 18px;color:#6a5d58">No se registraron pagos en la semana.</p>`) +
      subtitulo(`Pagos vencidos (${d.vencidos.length})`) +
      (d.vencidos.length
        ? tabla(["Vencía", "Gasto", "Saldo", "Atraso"], filasVencidos, [2, 3])
        : `<p style="margin:6px 0 18px;color:#6a5d58">No hay gastos vencidos.</p>`) +
      `<p style="margin:0;font-size:12px;color:#6a5d58">El saldo es lo que falta pagar de ${esc(nombreMes(d.mes))}, incluidos los impagos de meses anteriores (lo mismo que muestra la pantalla principal de la app).</p>`,
  );
  const texto = [
    titulo, "",
    `Total pagado en la semana: ${formatoPesos(d.totalPagado)}`,
    `Saldo a pagar (${nombreMes(d.mes)}): ${formatoPesos(d.saldo)}`,
    `Saldo vencido: ${formatoPesos(d.saldoVencido)}`, "",
    `PAGOS REALIZADOS (${d.pagos.length})`,
    ...(d.pagos.length ? d.pagos.map((p) => `- ${fechaHoraAR(p.creadoEn)} · ${p.descripcion} · pagado ${formatoPesos(p.monto)} · ${p.saldo > 0 ? `saldo ${formatoPesos(p.saldo)}` : "sin saldo"}`) : ["- Ninguno."]), "",
    `PAGOS VENCIDOS (${d.vencidos.length})`,
    ...(d.vencidos.length ? d.vencidos.map((v) => `- vencía ${formatoFecha(v.fechaPago)} · ${v.descripcion} · saldo ${formatoPesos(v.saldo)} · ${v.diasDeAtraso} días de atraso`) : ["- Ninguno."]),
  ].join("\n");
  return { asunto: `${prueba ? "[PRUEBA] " : ""}${titulo}`, texto, html, adjuntos: [] };
}

// ---- 3. Informe del mes (con el Excel adjunto) ---------------------------------------------

export function correoMensual({ mes, filas, resumen, generadoEn }, prueba = false) {
  const titulo = `Informe mensual · ${nombreMes(mes)}`;
  const fila = (nombre, t) => [esc(nombre), String(t.cantidad), formatoPesos(t.monto), formatoPesos(t.pagado), formatoPesos(t.saldo)];
  const encabezado = (primero) => [primero, "Cant.", "Monto", "Pagado", "Saldo"];
  const html = marco(
    titulo,
    totales([
      ["Gastos del mes", String(resumen.total.cantidad)],
      ["Pagado", formatoPesos(resumen.total.pagado), "#2e7d32"],
      ["Saldo a pagar", formatoPesos(resumen.total.saldo), resumen.total.saldo > 0 ? "#b45f06" : "#2b2321"],
    ]) +
      subtitulo("Resumen") +
      tabla(encabezado("Detalle"), [
        fila("Vencen en el mes", resumen.delMes),
        fila("Impagos de meses anteriores", resumen.arrastrados),
        fila("Total", resumen.total),
      ], [1, 2, 3, 4]) +
      subtitulo("Por estado") +
      tabla(encabezado("Estado"), ["estimado", "a_pagar", "vencido", "pagado"].map((e) => fila(ETIQUETAS[e], resumen.porEstado[e])), [1, 2, 3, 4]) +
      subtitulo("Por rubro") +
      tabla(encabezado("Rubro"), resumen.porRubro.map((r) => fila(r.nombre, r)), [1, 2, 3, 4]) +
      `<p style="margin:0;font-size:14px">Con el detalle completo, los pagos parciales y la forma de pago de cada gasto, en el <b>Excel adjunto</b>.</p>`,
  );
  const lineas = (titulo2, items) => [titulo2, ...items.map((i) => `- ${i}`), ""];
  const texto = [
    titulo, "",
    `Gastos: ${resumen.total.cantidad} · Pagado: ${formatoPesos(resumen.total.pagado)} · Saldo a pagar: ${formatoPesos(resumen.total.saldo)}`, "",
    ...lineas("RESUMEN", [
      `Vencen en el mes: ${gastos(resumen.delMes.cantidad)}, saldo ${formatoPesos(resumen.delMes.saldo)}`,
      `Impagos de meses anteriores: ${gastos(resumen.arrastrados.cantidad)}, saldo ${formatoPesos(resumen.arrastrados.saldo)}`,
    ]),
    ...lineas("POR ESTADO", ["estimado", "a_pagar", "vencido", "pagado"].map((e) => `${ETIQUETAS[e]}: ${resumen.porEstado[e].cantidad} · saldo ${formatoPesos(resumen.porEstado[e].saldo)}`)),
    "Con el detalle completo, en el Excel adjunto.",
  ].join("\n");
  const bytes = crearReporteXlsx({ mes, filas, generadoEn });
  return {
    asunto: `${prueba ? "[PRUEBA] " : ""}${titulo}`,
    texto,
    html,
    adjuntos: [{ filename: nombreArchivoReporte(mes), content: Buffer.from(bytes), contentType: TIPO_XLSX }],
  };
}
