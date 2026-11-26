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
// OJO: la clave (izquierda) es lo que se guarda en la base y NO se cambia nunca, para no perder el rubro de
// los gastos ya cargados. Lo que se ve en pantalla es la etiqueta (derecha), que sí se puede renombrar.
export const RUBROS = [
  "productos", "servicio", "alquiler", "compra_insumos", "tarjeta", "gasto_bancario", "impuesto",
  "socios", "prestamos", "empleados",
];

export const ETIQUETAS_RUBRO = {
  productos: "Productos",
  servicio: "Servicios",
  alquiler: "Alquiler",
  compra_insumos: "Compra insumos",
  tarjeta: "Tarjeta",
  gasto_bancario: "Gastos Bancarios",
  impuesto: "Impuesto",
  socios: "Socios",
  prestamos: "Préstamos",
  empleados: "Empleados",
};

export function etiquetaRubro(clave) {
  return ETIQUETAS_RUBRO[clave] ?? "Sin rubro";
}

/** Claves de los rubros en orden alfabético por su nombre (sin importar tildes ni mayúsculas), para los desplegables. */
export function rubrosOrdenados() {
  const nombre = (clave) => normalizar(etiquetaRubro(clave));
  return [...RUBROS].sort((a, b) => (nombre(a) < nombre(b) ? -1 : nombre(a) > nombre(b) ? 1 : 0));
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

// ---- Gastos recurrentes --------------------------------------------------------------------
// Un gasto recurrente ("serie") se repite todos los meses y se guarda UNA sola vez:
//   desde / hasta: primer y último mes ("aaaa-mm"); sin `hasta` sigue indefinidamente.
//   cambios: la plantilla (descripción, monto, día, rubro, forma de pago, estado inicial) vigente desde cada
//            mes en adelante. Editar un mes agrega un cambio que vale para ese mes y los siguientes.
//   meses: lo propio de cada mes: `estado` y `pagos`. Si el mes ya estaba pagado cuando se cambió la
//          plantilla de un mes anterior, guarda además `datos` (copia de lo que se pagó): el pasado no se reescribe.
// Los gastos de cada mes ("instancias") se CALCULAN a partir de la serie, no se guardan: así no se pueden duplicar.

/** Estados con los que puede arrancar un mes nuevo de un gasto recurrente. */
export const ESTADOS_INICIALES = ["estimado", "a_pagar"];

const pad2 = (n) => String(n).padStart(2, "0");

/** "2026-12" -> "2027-01" */
export function siguienteMes(clave) {
  return claveDeIndice(indiceMes(clave) + 1);
}

export function diasDelMes(clave) {
  const [a, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Fecha del día `dia` en ese mes; si el mes es más corto (ej. 31 en febrero) se usa su último día. */
export function fechaDeMes(clave, dia) {
  return `${clave}-${pad2(Math.min(dia, diasDelMes(clave)))}`;
}

/** Plantilla vigente en un mes: la última cuyo `desde` no sea posterior a ese mes. */
export function plantillaDe(serie, mes) {
  let elegida = serie.cambios[0];
  for (const cambio of serie.cambios) if (cambio.desde <= mes) elegida = cambio;
  return elegida;
}

/** El gasto de un mes de la serie, con la forma de un gasto común (más `serieId`, `mes` y `recurrente`). */
export function instanciaDe(serie, mes) {
  const ocurrencia = serie.meses?.[mes];
  const vigente = plantillaDe(serie, mes);
  const datos = ocurrencia?.datos ?? vigente;
  const gasto = {
    id: `${serie.id}~${mes}`,
    serieId: serie.id,
    mes,
    recurrente: true,
    descripcion: datos.descripcion,
    monto: datos.monto,
    fechaPago: fechaDeMes(mes, datos.dia),
    estado: ocurrencia?.estado ?? vigente.estado ?? "estimado",
    pagos: ocurrencia?.pagos ?? [],
  };
  if (datos.rubro) gasto.rubro = datos.rubro;
  if (datos.formaPago) gasto.formaPago = datos.formaPago;
  return gasto;
}

/** Meses de la serie hasta `tope` (o hasta su `hasta`, si termina antes). */
export function mesesDeSerie(serie, tope) {
  const ultimo = serie.hasta && serie.hasta < tope ? serie.hasta : tope;
  const lista = [];
  for (let i = indiceMes(serie.desde); i <= indiceMes(ultimo); i++) lista.push(claveDeIndice(i));
  return lista;
}

/**
 * Todos los gastos que generan las series: desde su primer mes hasta el mes siguiente al actual
 * (así siempre se ve el mes que viene ya armado). Una serie que arranca más adelante muestra al menos su primer mes.
 */
export function expandirRecurrentes(series, hoy) {
  const horizonte = siguienteMes(mesDe(hoy));
  const gastos = [];
  for (const serie of series) {
    const tope = serie.desde > horizonte ? serie.desde : horizonte;
    for (const mes of mesesDeSerie(serie, tope)) gastos.push(instanciaDe(serie, mes));
  }
  return gastos;
}

/** Crea la serie a partir de un gasto: ese gasto es el primer mes y su día de pago se repite cada mes. */
export function crearSerie(gasto) {
  const mes = mesDe(gasto.fechaPago);
  const plantilla = {
    desde: mes,
    descripcion: gasto.descripcion,
    monto: gasto.monto,
    dia: Number(gasto.fechaPago.slice(8, 10)),
    estado: ESTADOS_INICIALES.includes(gasto.estado) ? gasto.estado : "a_pagar",
  };
  if (gasto.rubro) plantilla.rubro = gasto.rubro;
  if (gasto.formaPago) plantilla.formaPago = gasto.formaPago;
  return { desde: mes, cambios: [plantilla], meses: { [mes]: { estado: gasto.estado, pagos: gasto.pagos ?? [] } } };
}

/** Datos de la plantilla sin sus campos de control (para guardarlos como copia en un mes pagado). */
function datosDe(plantilla) {
  const { desde, estado, ...datos } = plantilla;
  return datos;
}

/**
 * Edita un mes de la serie: los datos nuevos valen para ESE mes y los SIGUIENTES (los anteriores no cambian).
 * Los meses siguientes que ya estaban pagados conservan lo que se pagó (se les guarda una copia de los datos).
 * `nuevo` trae descripcion, monto, fechaPago (de ese mes), rubro, formaPago y el estado de ese mes.
 */
export function aplicarEdicion(serie, mes, nuevo) {
  const anterior = plantillaDe(serie, mes);
  const plantilla = {
    desde: mes,
    descripcion: nuevo.descripcion,
    monto: nuevo.monto,
    dia: Number(nuevo.fechaPago.slice(8, 10)),
    estado: ESTADOS_INICIALES.includes(nuevo.estado) ? nuevo.estado : anterior.estado ?? "a_pagar",
  };
  if (nuevo.rubro) plantilla.rubro = nuevo.rubro;
  if (nuevo.formaPago) plantilla.formaPago = nuevo.formaPago;

  const meses = {};
  for (const [m, ocurrencia] of Object.entries(serie.meses ?? {})) {
    meses[m] = ocurrencia;
    if (m > mes && ocurrencia.estado === "pagado" && !ocurrencia.datos) {
      meses[m] = { ...ocurrencia, datos: datosDe(plantillaDe(serie, m)) };
    }
  }
  const actual = { pagos: [], ...(meses[mes] ?? {}), estado: nuevo.estado };
  delete actual.datos;
  if (nuevo.estado === "pagado") actual.datos = datosDe(plantilla);
  meses[mes] = actual;

  return { ...serie, cambios: [...serie.cambios.filter((c) => c.desde < mes), plantilla], meses };
}

/** Guarda el estado y los pagos de un mes. Si deja de estar pagado, vuelve a seguir la plantilla. */
export function conOcurrencia(serie, mes, { estado, pagos }) {
  const ocurrencia = { ...(serie.meses?.[mes] ?? {}), estado, pagos };
  if (estado !== "pagado") delete ocurrencia.datos;
  return { ...serie, meses: { ...serie.meses, [mes]: ocurrencia } };
}

/** Termina la serie: ese mes es el último; los siguientes dejan de aparecer. */
export function dejarDeRepetir(serie, mes) {
  return { ...serie, hasta: mes };
}

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

// ---- Reporte mensual -----------------------------------------------------------------------
// Las "filas" de un mes son los gastos que muestra la pantalla de ese mes (los que vencen en él + los impagos
// arrastrados), ya con su estado calculado. Son datos simples y autosuficientes: se guardan tal cual al cerrar
// el mes (colección `cierres`) y de ahí sale siempre el mismo Excel, aunque después cambie la app.

/** Filas del reporte de un mes: [{ fechaPago, descripcion, rubro?, formaPago?, estado, monto, pagado, saldo, recurrente?, arrastradoDe?, pagos }] */
export function filasDelMes(gastos, mes, hoy) {
  return gastosDelMes(gastos, mes, hoy).map(({ gasto: g, arrastradoDe }) => {
    const fila = {
      fechaPago: g.fechaPago,
      descripcion: g.descripcion,
      estado: estadoEfectivo(g, hoy),
      monto: g.monto,
      pagado: pagadoDe(g),
      saldo: saldoDe(g),
      pagos: (g.pagos ?? []).map((p) => ({ fecha: p.fecha, monto: p.monto })),
    };
    if (g.rubro) fila.rubro = g.rubro;
    if (g.formaPago) fila.formaPago = g.formaPago;
    if (g.recurrente) fila.recurrente = true;
    if (arrastradoDe) fila.arrastradoDe = arrastradoDe;
    return fila;
  });
}

const totalVacio = () => ({ cantidad: 0, monto: 0, pagado: 0, saldo: 0 });
function sumarFila(total, fila) {
  total.cantidad += 1;
  total.monto += fila.monto;
  total.pagado += fila.pagado;
  total.saldo += fila.saldo;
}

/**
 * Totales del reporte (cantidad, monto, pagado y saldo): del mes / arrastrados / total, por estado,
 * por rubro y por forma de pago. Son sumas simples de las filas.
 */
export function resumenDeFilas(filas) {
  const r = {
    delMes: totalVacio(),
    arrastrados: totalVacio(),
    total: totalVacio(),
    porEstado: { estimado: totalVacio(), a_pagar: totalVacio(), vencido: totalVacio(), pagado: totalVacio() },
    porRubro: [],
    porForma: [],
  };
  const rubros = new Map();
  const formas = new Map();
  for (const fila of filas) {
    sumarFila(fila.arrastradoDe ? r.arrastrados : r.delMes, fila);
    sumarFila(r.total, fila);
    sumarFila(r.porEstado[fila.estado], fila);
    const rubro = fila.rubro ?? "";
    if (!rubros.has(rubro)) rubros.set(rubro, totalVacio());
    sumarFila(rubros.get(rubro), fila);
    const forma = fila.formaPago ?? "";
    if (!formas.has(forma)) formas.set(forma, totalVacio());
    sumarFila(formas.get(forma), fila);
  }
  // Rubros por nombre (A-Z) y "Sin rubro" al final; formas de pago en el orden de la app y "Sin definir" al final.
  r.porRubro = [...rubros]
    .map(([clave, total]) => ({ clave, nombre: etiquetaRubro(clave), ...total }))
    .sort((a, b) => (a.clave === "") - (b.clave === "") || (normalizar(a.nombre) < normalizar(b.nombre) ? -1 : 1));
  const ordenForma = (clave) => (clave === "" ? FORMAS_PAGO.length : FORMAS_PAGO.indexOf(clave));
  r.porForma = [...formas]
    .map(([clave, total]) => ({ clave, nombre: etiquetaForma(clave), ...total }))
    .sort((a, b) => ordenForma(a.clave) - ordenForma(b.clave));
  return r;
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
