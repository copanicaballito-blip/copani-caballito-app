// Reglas de la app de gastos. No toca la pantalla ni la base de datos: se prueba con `npm test`.
// Montos: pesos enteros (sin decimales). Fechas: texto "aaaa-mm-dd".

/** Estados que se eligen a mano. "Vencido" no se elige: se calcula según la fecha de pago. */
export const ESTADOS = ["estimado", "a_pagar", "pagado"];

export const ETIQUETAS = {
  estimado: "Estimado",
  a_pagar: "A pagar",
  pagado: "Pagado",
  vencido: "Vencido",
};

/** Formas de pago de un gasto (es opcional: un gasto puede estar "sin definir"). */
export const FORMAS_PAGO = ["manual_mp", "debito_mp", "manual_galicia", "debito_galicia", "efectivo"];

export const ETIQUETAS_FORMA = {
  manual_mp: "Manual - MP",
  debito_mp: "Débito Automático - MP",
  manual_galicia: "Manual - Galicia",
  debito_galicia: "Débito Automático - Galicia",
  efectivo: "Efectivo",
};

export function etiquetaForma(clave) {
  return ETIQUETAS_FORMA[clave] ?? "Sin definir";
}

/** Rubros de un gasto (opcional: un gasto puede estar "sin rubro"). */
export const RUBROS = ["productos", "servicio", "alquiler", "compra_insumos", "tarjeta", "gasto_bancario", "impuesto"];

export const ETIQUETAS_RUBRO = {
  productos: "Productos",
  servicio: "Servicio",
  alquiler: "Alquiler",
  compra_insumos: "Compra insumos",
  tarjeta: "Tarjeta",
  gasto_bancario: "Gasto Bancario",
  impuesto: "Impuesto",
};

export function etiquetaRubro(clave) {
  return ETIQUETAS_RUBRO[clave] ?? "Sin rubro";
}

/** Valor especial del filtro por rubro para ver los gastos que todavía no tienen rubro. */
export const SIN_RUBRO = "__sin";

/** Fecha de hoy como "aaaa-mm-dd" en hora local. */
export function hoyISO(ahora = new Date()) {
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

export function fechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? "")) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// ---- Pagos y saldo -------------------------------------------------------------------------

/** Suma de los pagos parciales registrados. */
export function totalPagos(gasto) {
  return (gasto.pagos ?? []).reduce((suma, p) => suma + p.monto, 0);
}

export function estaPagado(gasto) {
  return gasto.estado === "pagado";
}

/** Total pagado: si el gasto está en "Pagado" cuenta completo, si no, lo que suman los pagos parciales. */
export function pagadoDe(gasto) {
  return estaPagado(gasto) ? Math.max(gasto.monto, totalPagos(gasto)) : totalPagos(gasto);
}

/** Saldo a pagar: 0 si está pagado; si no, monto menos pagos parciales (nunca negativo). */
export function saldoDe(gasto) {
  return estaPagado(gasto) ? 0 : Math.max(0, gasto.monto - totalPagos(gasto));
}

/** Registra un pago parcial. Si con eso se completa el monto, el gasto pasa a "Pagado". */
export function agregarPago(gasto, pago) {
  const nuevo = { ...gasto, pagos: [...(gasto.pagos ?? []), { fecha: pago.fecha, monto: pago.monto }] };
  if (gasto.monto > 0 && totalPagos(nuevo) >= gasto.monto) nuevo.estado = "pagado";
  return nuevo;
}

/** Quita un pago. Si el gasto estaba "Pagado" solo por haber completado los pagos y deja de estarlo, vuelve a "A pagar". */
export function quitarPago(gasto, indice) {
  const nuevo = { ...gasto, pagos: (gasto.pagos ?? []).filter((_, i) => i !== indice) };
  const estabaCompleto = totalPagos(gasto) >= gasto.monto;
  if (estaPagado(gasto) && estabaCompleto && totalPagos(nuevo) < gasto.monto) nuevo.estado = "a_pagar";
  return nuevo;
}

// ---- Estado, vencimiento, totales ----------------------------------------------------------

/** Estado que se muestra: "pagado", "vencido" (no pagado y con fecha anterior a hoy), "a_pagar" o "estimado". */
export function estadoEfectivo(gasto, hoy) {
  if (estaPagado(gasto)) return "pagado";
  if (gasto.fechaPago < hoy) return "vencido";
  return gasto.estado === "a_pagar" ? "a_pagar" : "estimado";
}

const MS_POR_DIA = 86400000;
function aUTC(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días desde hoy hasta la fecha (negativo si ya pasó). */
export function diasHasta(fecha, hoy) {
  return Math.round((aUTC(fecha) - aUTC(hoy)) / MS_POR_DIA);
}

/** "Vence hoy", "Vence en 3 días", "Venció hace 2 días". Vacío si el gasto ya está pagado. */
export function textoVencimiento(gasto, hoy) {
  if (estaPagado(gasto)) return "";
  const n = diasHasta(gasto.fechaPago, hoy);
  if (n < 0) return n === -1 ? "Venció ayer" : `Venció hace ${-n} días`;
  if (n === 0) return "Vence hoy";
  if (n === 1) return "Vence mañana";
  return `Vence en ${n} días`;
}

export function totales(gastos, hoy) {
  const r = { pagado: 0, saldo: 0, saldoVencido: 0, cantidadVencidos: 0 };
  for (const g of gastos) {
    r.pagado += pagadoDe(g);
    r.saldo += saldoDe(g);
    if (estadoEfectivo(g, hoy) === "vencido") {
      r.saldoVencido += saldoDe(g);
      r.cantidadVencidos += 1;
    }
  }
  return r;
}

/** Primero los no pagados (la fecha más próxima arriba) y al final los pagados (el más reciente arriba). */
export function ordenar(gastos) {
  return [...gastos].sort((a, b) => {
    const pa = estaPagado(a);
    const pb = estaPagado(b);
    if (pa !== pb) return pa ? 1 : -1;
    const porFecha = a.fechaPago.localeCompare(b.fechaPago);
    if (porFecha !== 0) return pa ? -porFecha : porFecha;
    return a.descripcion.localeCompare(b.descripcion, "es");
  });
}

// ---- Meses ---------------------------------------------------------------------------------
// Un mes se identifica con el texto "aaaa-mm". Se compara como texto: "2026-11" < "2026-12" < "2027-01".

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "2026-12-20" -> "2026-12" */
export function mesDe(fechaISO) {
  return fechaISO.slice(0, 7);
}

/** "2026-12" -> "Diciembre 2026" */
export function nombreMes(clave) {
  const [a, m] = clave.split("-").map(Number);
  return `${NOMBRES_MES[m - 1]} ${a}`;
}

const indiceMes = (clave) => {
  const [a, m] = clave.split("-").map(Number);
  return a * 12 + (m - 1);
};
const claveDeIndice = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/** Meses para elegir: desde el más antiguo hasta el más lejano, sin huecos. Siempre incluye el mes actual y el siguiente. */
export function mesesDisponibles(gastos, hoy, extra = []) {
  const claves = new Set([mesDe(hoy), claveDeIndice(indiceMes(mesDe(hoy)) + 1), ...extra]);
  for (const g of gastos) claves.add(mesDe(g.fechaPago));
  const indices = [...claves].map(indiceMes);
  const lista = [];
  for (let i = Math.min(...indices); i <= Math.max(...indices); i++) lista.push(claveDeIndice(i));
  return lista;
}

/**
 * Gastos que se muestran al elegir un mes: los que vencen en ese mes, más los impagos de meses anteriores
 * ("arrastrados": pasan al mes siguiente, ya vencidos, hasta que se paguen). El arrastre llega hasta el mes
 * actual; en meses futuros solo se ve lo que vence en ese mes.
 * Devuelve [{ gasto, arrastradoDe }] ordenado; `arrastradoDe` es el mes original ("aaaa-mm") o null.
 */
export function gastosDelMes(gastos, mes, hoy) {
  const actual = mesDe(hoy);
  const resultado = [];
  for (const gasto of ordenar(gastos)) {
    const propio = mesDe(gasto.fechaPago);
    if (propio === mes) resultado.push({ gasto, arrastradoDe: null });
    else if (propio < mes && mes <= actual && !estaPagado(gasto)) resultado.push({ gasto, arrastradoDe: propio });
  }
  return resultado;
}

/** Totales de una lista de gastos del mes. Lo arrastrado suma su saldo, pero no lo que ya se pagó en meses anteriores. */
export function totalesDelMes(items, hoy) {
  const r = { pagado: 0, saldo: 0, saldoVencido: 0, cantidadVencidos: 0 };
  for (const { gasto, arrastradoDe } of items) {
    if (!arrastradoDe) r.pagado += pagadoDe(gasto);
    r.saldo += saldoDe(gasto);
    if (estadoEfectivo(gasto, hoy) === "vencido") {
      r.saldoVencido += saldoDe(gasto);
      r.cantidadVencidos += 1;
    }
  }
  return r;
}

// ---- Formato y validación ------------------------------------------------------------------

// ---- Búsqueda y filtro por rubro -----------------------------------------------------------

/** Minúsculas y sin tildes: "Córdoba" -> "cordoba". */
function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * ¿El gasto coincide con lo que se escribió en la lupa? Todas las palabras tienen que aparecer
 * (en cualquier orden) en la descripción, el rubro, la forma de pago o el monto. Sin importar
 * mayúsculas ni tildes. Un texto vacío coincide con todo.
 */
export function coincideBusqueda(gasto, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar([
    gasto.descripcion,
    etiquetaRubro(gasto.rubro),
    etiquetaForma(gasto.formaPago),
    String(gasto.monto),
    formatoPesos(gasto.monto),
  ].join(" "));
  return palabras.every((p) => pajar.includes(p));
}

/** Filtro por rubro: "" = todos, SIN_RUBRO = los que no tienen rubro, o la clave de un rubro. */
export function coincideRubro(gasto, rubro) {
  if (!rubro) return true;
  if (rubro === SIN_RUBRO) return !gasto.rubro;
  return gasto.rubro === rubro;
}

// ---- Formato y validación ------------------------------------------------------------------

/** 1234567 -> "$ 1.234.567" */
export function formatoPesos(n) {
  const signo = n < 0 ? "-" : "";
  const texto = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$ ${texto}`;
}

/** "2026-12-05" -> "05/12/2026" */
export function formatoFecha(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** "15.000", "$ 15000" o "15000,50" -> entero en pesos. Devuelve null si no es un número. */
export function parseMonto(texto) {
  const limpio = String(texto ?? "").replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Math.round(Number(limpio));
}

/** Devuelve un mensaje de error en español, o null si el gasto es válido. */
export function validarGasto(g) {
  const descripcion = String(g.descripcion ?? "").trim();
  if (!descripcion) return "Escribí una descripción.";
  if (descripcion.length > 120) return "La descripción es muy larga (máximo 120 letras).";
  if (!Number.isInteger(g.monto) || g.monto < 0) return "El monto tiene que ser un número, por ejemplo 15000.";
  if (!fechaValida(g.fechaPago)) return "Elegí la fecha de pago.";
  if (!ESTADOS.includes(g.estado)) return "Elegí un estado.";
  if (g.formaPago && !FORMAS_PAGO.includes(g.formaPago)) return "Elegí una forma de pago válida.";
  if (g.rubro && !RUBROS.includes(g.rubro)) return "Elegí un rubro válido.";
  return null;
}

/** Devuelve un mensaje de error en español, o null si el pago es válido para ese gasto. */
export function validarPago(gasto, pago) {
  if (!Number.isInteger(pago.monto) || pago.monto <= 0) return "Escribí el monto del pago, por ejemplo 50000.";
  if (!fechaValida(pago.fecha)) return "Elegí la fecha del pago.";
  if (estaPagado(gasto)) return "Este gasto ya está pagado.";
  if (pago.monto > saldoDe(gasto)) return `El pago supera el saldo (${formatoPesos(saldoDe(gasto))}).`;
  return null;
}
