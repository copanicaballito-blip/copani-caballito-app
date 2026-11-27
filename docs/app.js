import { crearDatos } from "./datos.js";
import {
  ESTADOS, ETIQUETAS, FORMAS_PAGO, ETIQUETAS_FORMA, etiquetaForma,
  rubrosOrdenados, ETIQUETAS_RUBRO, etiquetaRubro, SIN_RUBRO, coincideBusqueda, coincideRubro,
  hoyISO, estadoEfectivo, ordenar, saldoDe, pagadoDe,
  mesDe, nombreMes, mesesDisponibles, gastosDelMes, totalesDelMes, diasDelMes,
  expandirRecurrentes, crearSerie, aplicarEdicion, conOcurrencia, dejarDeRepetir, filasDelMes,
  agregarPago, quitarPago, textoVencimiento, formatoPesos, formatoFecha,
  parseMonto, validarGasto, validarPago, venceHoy,
} from "./logica.js";
import { crearReporteXlsx, nombreArchivoReporte, fechaCorta } from "./reporte.js";
import { TIPO_XLSX } from "./xlsx.js";

const $ = (selector) => document.querySelector(selector);
const esc = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const contenido = $("#contenido");
const dlgDetalle = $("#dlg-detalle");
const dlgForm = $("#dlg-form");
const dlgReportes = $("#dlg-reportes");
const formGasto = $("#form-gasto");

let datos = null;
let usuario = null;
let unicos = []; // gastos de una sola vez (colección "gastos")
let series = []; // gastos recurrentes (colección "recurrentes"), una serie por gasto
let gastos = []; // lo que se muestra: los de una sola vez + los meses que generan las series
let cargando = false;
let errorNube = null;
let errorRecurrentes = null; // no es grave: si falla, igual se ven los gastos comunes
let cierres = []; // meses ya cerrados (colección "cierres"): copias congeladas de donde sale su Excel
let errorCierres = null; // no es grave: si falla, se puede descargar el mes en curso pero no se cierran meses
// Cada colección avisa cuando llegó su primera lectura. Un mes solo se cierra con las tres completas,
// para no guardar un cierre al que le falten gastos recurrentes que todavía no cargaron.
let listoGastos = false;
let listoRec = false;
let listoCierres = false;
let desuscribir = null;
let diaMostrado = hoyISO(); // día con el que se dibujó la pantalla por última vez (para detectar el cambio de día)
let filtro = "todos"; // filtro por estado
let mesSel = mesDe(hoyISO()); // mes elegido ("aaaa-mm") o "todos"; empieza en el mes actual
let detalleId = null;
let editando = null; // gasto que se está editando; null = gasto nuevo
let buscando = false; // ¿está abierta la lupa?
let busqueda = ""; // texto escrito en la lupa
let rubroSel = ""; // filtro por rubro: "" = todos, SIN_RUBRO = sin rubro, o la clave de un rubro

// Opciones de forma de pago y de rubro (formulario y buscador)
formGasto.formaPago.innerHTML =
  `<option value="">Sin definir</option>` +
  FORMAS_PAGO.map((k) => `<option value="${k}">${esc(ETIQUETAS_FORMA[k])}</option>`).join("");
const opcionesRubro = rubrosOrdenados().map((k) => `<option value="${k}">${esc(ETIQUETAS_RUBRO[k])}</option>`).join("");
formGasto.rubro.innerHTML = `<option value="">Sin rubro</option>` + opcionesRubro;
$("#sel-rubro").innerHTML =
  `<option value="">Todos los rubros</option><option value="${SIN_RUBRO}">Sin rubro</option>` + opcionesRubro;

// ---- Inicio --------------------------------------------------------------------------------

async function iniciar() {
  contenido.innerHTML = `<p class="vacio">Cargando…</p>`;
  try {
    datos = await crearDatos();
  } catch (e) {
    console.error(e);
    contenido.innerHTML = `<p class="error">No se pudo cargar la app. Revisá la conexión y recargá la página.</p>`;
    return;
  }
  $("#aviso-demo").hidden = datos.modo !== "demo";
  datos.alCambiarSesion((u) => {
    usuario = u;
    if (desuscribir) desuscribir();
    desuscribir = null;
    unicos = [];
    series = [];
    cierres = [];
    errorNube = null;
    errorRecurrentes = null;
    errorCierres = null;
    listoGastos = listoRec = listoCierres = false;
    cargando = Boolean(u);
    if (u) {
      const dejarDeEscucharGastos = datos.escucharGastos(
        (lista) => {
          unicos = lista;
          listoGastos = true;
          cargando = false;
          render();
        },
        (e) => {
          console.error(e);
          errorNube = e;
          cargando = false;
          render();
        },
      );
      const dejarDeEscucharRecurrentes = datos.escucharRecurrentes(
        (lista) => {
          series = lista;
          listoRec = true;
          errorRecurrentes = null;
          render();
        },
        (e) => {
          console.error(e);
          errorRecurrentes = e;
          render();
        },
      );
      const dejarDeEscucharCierres = datos.escucharCierres(
        (lista) => {
          cierres = lista;
          listoCierres = true;
          errorCierres = null;
          render();
        },
        (e) => {
          console.error(e);
          errorCierres = e;
          render();
        },
      );
      desuscribir = () => {
        dejarDeEscucharGastos();
        dejarDeEscucharRecurrentes();
        dejarDeEscucharCierres();
      };
    }
    render();
  });
}

// ---- Pantallas -----------------------------------------------------------------------------

/** Junta los gastos de una sola vez con los meses que generan los gastos recurrentes. */
function mezclar() {
  gastos = [...unicos, ...expandirRecurrentes(series, hoyISO())];
}

/** Aviso rojo cuando una colección nueva (recurrentes, cierres) todavía no tiene permiso: lo demás sigue andando. */
function textoAvisoReglas() {
  const faltan = [];
  if (errorRecurrentes?.code === "permission-denied") faltan.push("los gastos recurrentes");
  if (errorCierres?.code === "permission-denied") faltan.push("los reportes de meses cerrados");
  if (faltan.length) {
    return `Todavía no están habilitados ${faltan.join(" ni ")}: falta actualizar las reglas de Firebase (Firestore → Reglas). Lo demás funciona normal.`;
  }
  const otro = errorRecurrentes ?? errorCierres;
  return `No se pudieron cargar algunos datos (${otro?.code ?? otro?.message ?? "error desconocido"}).`;
}

function render() {
  diaMostrado = hoyISO();
  mezclar();
  $("#btn-salir").hidden = !(usuario && datos.modo === "nube");
  $("#btn-nuevo").hidden = !usuario || Boolean(errorNube);
  const hayLista = Boolean(usuario) && !errorNube;
  $("#btn-buscar").hidden = !hayLista;
  $("#btn-reportes").hidden = !hayLista;
  $("#buscador").hidden = !(hayLista && buscando);
  const conAviso = hayLista && Boolean(errorRecurrentes || errorCierres);
  $("#aviso-reglas").hidden = !conAviso;
  if (conAviso) $("#aviso-reglas").textContent = textoAvisoReglas();
  if (!usuario) return pintarLogin();
  if (errorNube) return pintarError();
  if (cargando) {
    contenido.innerHTML = `<p class="vacio">Cargando gastos…</p>`;
    return;
  }
  pintarLista();
  if (detalleId) pintarDetalle();
  if (dlgReportes.open) pintarReportes();
  cerrarMesesTerminados();
}

function pintarLogin() {
  cerrarDialogos();
  contenido.innerHTML = `
    <form id="form-login" class="tarjeta" novalidate>
      <h2>Ingresar</h2>
      <label>Email
        <input type="email" name="email" autocomplete="username" autocapitalize="none" required>
      </label>
      <label>Contraseña
        <input type="password" name="clave" autocomplete="current-password" required>
      </label>
      <p class="error" id="error-login" role="alert"></p>
      <p class="info-login" id="info-login" role="status"></p>
      <button class="primario" style="width:100%">Ingresar</button>
      <p style="text-align:center;margin:12px 0 0"><button type="button" id="btn-olvide" class="enlace">Olvidé mi contraseña</button></p>
    </form>`;
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const error = $("#error-login");
    error.textContent = "";
    $("#info-login").textContent = "";
    if (!f.email.value.trim() || !f.clave.value) {
      error.textContent = "Escribí tu email y tu contraseña.";
      return;
    }
    const boton = f.querySelector("button.primario");
    boton.disabled = true;
    try {
      await datos.ingresar(f.email.value.trim(), f.clave.value);
    } catch (e) {
      console.error(e);
      error.textContent = mensajeLogin(e);
      boton.disabled = false;
    }
  });

  // "Olvidé mi contraseña": Firebase manda un correo para crear una nueva.
  $("#btn-olvide").addEventListener("click", async () => {
    const email = $("#form-login").email.value.trim();
    const error = $("#error-login");
    const info = $("#info-login");
    error.textContent = "";
    info.textContent = "";
    if (!email) {
      error.textContent = "Escribí tu email arriba y volvé a tocar “Olvidé mi contraseña”.";
      return;
    }
    try {
      await datos.restablecerClave(email);
      info.textContent = "Listo. Si ese email tiene una cuenta, te enviamos un correo para crear una contraseña nueva. Revisá también la carpeta de spam.";
    } catch (e) {
      console.error(e);
      error.textContent = mensajeLogin(e);
    }
  });
}

function mensajeLogin(e) {
  switch (e?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email o contraseña incorrectos.";
    case "auth/invalid-email":
    case "auth/missing-email":
      return "El email no es válido.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    case "auth/network-request-failed":
      return "No hay conexión. Probá de nuevo.";
    case "auth/operation-not-allowed":
      return "El ingreso con email y contraseña no está activado en Firebase (Authentication → Sign-in method).";
    case "auth/user-disabled":
      return "Esta cuenta está deshabilitada en Firebase.";
    case "auth/unauthorized-domain":
      return "Este sitio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "La configuración de Firebase de la app no es válida.";
    default:
      // Se muestra el código técnico para poder diagnosticar el problema.
      return `No se pudo ingresar (${e?.code ?? e?.message ?? "error desconocido"}). Probá de nuevo.`;
  }
}

function pintarError() {
  cerrarDialogos();
  const sinPermiso = errorNube?.code === "permission-denied";
  contenido.innerHTML = sinPermiso
    ? `
    <div class="tarjeta">
      <h2>Cuenta no autorizada</h2>
      <p>Ingresaste como <strong>${esc(usuario?.email ?? "")}</strong>, pero esa cuenta no tiene permiso para ver los gastos.</p>
      <p class="nota">Si es tu cuenta: el email tiene que estar escrito igual (en minúsculas) en las reglas de Firebase, y las reglas tienen que estar publicadas. Si usaste otra cuenta, tocá “Salir” y entrá con la correcta. Si no sos el dueño, pedile acceso.</p>
    </div>`
    : `
    <div class="tarjeta">
      <h2>No se pudieron cargar los gastos</h2>
      <p>Revisá la conexión y recargá la página.</p>
      <p class="nota">Detalle técnico: ${esc(errorNube?.code ?? errorNube?.message ?? "desconocido")}</p>
    </div>`;
}

/** ¿El gasto pasa el texto de la lupa y el filtro por rubro? */
function coincide(gasto) {
  return coincideBusqueda(gasto, busqueda) && coincideRubro(gasto, rubroSel);
}

/** Gastos del mes elegido (con los impagos de meses anteriores arrastrados) o todos. */
function itemsDelMes(hoy) {
  if (mesSel === "todos") return ordenar(gastos).map((gasto) => ({ gasto, arrastradoDe: null }));
  return gastosDelMes(gastos, mesSel, hoy);
}

function listaMeses(hoy) {
  return mesesDisponibles(gastos, hoy, mesSel === "todos" ? [] : [mesSel]);
}

function pintarLista() {
  const hoy = hoyISO();
  const items = itemsDelMes(hoy).filter(({ gasto }) => coincide(gasto));
  const t = totalesDelMes(items, hoy);
  const cuenta = { todos: items.length, estimado: 0, a_pagar: 0, vencido: 0, pagado: 0 };
  for (const { gasto } of items) cuenta[estadoEfectivo(gasto, hoy)] += 1;
  const visibles = items.filter(({ gasto }) => filtro === "todos" || estadoEfectivo(gasto, hoy) === filtro);

  const meses = listaMeses(hoy);
  const pos = meses.indexOf(mesSel); // -1 si se eligió "Todos los meses"
  const barraMes = `
    <div class="mes">
      <button type="button" data-mes-mover="-1" aria-label="Mes anterior" ${pos <= 0 ? "disabled" : ""}>‹</button>
      <select id="sel-mes" aria-label="Mes">
        <option value="todos"${mesSel === "todos" ? " selected" : ""}>Todos los meses</option>
        ${meses.map((m) => `<option value="${m}"${m === mesSel ? " selected" : ""}>${nombreMes(m)}${m === mesDe(hoy) ? " (actual)" : ""}</option>`).join("")}
      </select>
      <button type="button" data-mes-mover="1" aria-label="Mes siguiente" ${pos < 0 || pos >= meses.length - 1 ? "disabled" : ""}>›</button>
    </div>`;

  const chips = [["todos", "Todos"], ["vencido", "Vencido"], ["a_pagar", "A pagar"], ["estimado", "Estimado"], ["pagado", "Pagado"]]
    .map(([clave, texto]) => `<button type="button" data-filtro="${clave}" aria-pressed="${filtro === clave}">${texto} (${cuenta[clave]})</button>`)
    .join("");

  const hayFiltro = busqueda.trim() !== "" || rubroSel !== "";
  let vacio = "No hay gastos en este estado.";
  if (gastos.length === 0) {
    vacio = "Todavía no hay gastos cargados. Tocá “+ Nuevo gasto”.";
  } else if (hayFiltro && items.length === 0) {
    // La búsqueda respeta el mes elegido; si hay coincidencias en otros meses, se ofrece verlas.
    const enOtrosMeses = mesSel === "todos" ? 0 : gastos.filter(coincide).length;
    vacio = enOtrosMeses
      ? `No hay resultados en ${esc(nombreMes(mesSel))}.<br><button type="button" class="enlace" data-accion="ver-todos">Buscar en todos los meses (${enOtrosMeses})</button>`
      : "No hay gastos que coincidan con la búsqueda.";
  } else if (mesSel !== "todos" && items.length === 0) {
    vacio = `No hay gastos que venzan en ${esc(nombreMes(mesSel))}.`;
  }
  const resultados = hayFiltro && visibles.length
    ? `<p class="nota resultados">${visibles.length} ${visibles.length === 1 ? "resultado" : "resultados"}</p>`
    : "";

  contenido.innerHTML = `
    ${barraMes}
    <section class="resumen" aria-label="Resumen">
      <div class="dato"><span>Saldo a pagar</span><strong>${formatoPesos(t.saldo)}</strong></div>
      <div class="dato"><span>Pagado</span><strong>${formatoPesos(t.pagado)}</strong></div>
      <div class="dato rojo"><span>Vencido</span><strong>${formatoPesos(t.saldoVencido)}</strong><small>${t.cantidadVencidos} ${t.cantidadVencidos === 1 ? "gasto" : "gastos"}</small></div>
    </section>
    <nav class="filtros" aria-label="Filtrar por estado">${chips}</nav>
    ${resultados}
    ${visibles.length
      ? `<ul class="lista">${visibles.map(({ gasto, arrastradoDe }) => tarjeta(gasto, hoy, arrastradoDe)).join("")}</ul>`
      : `<p class="vacio">${vacio}</p>`}`;
}

function tarjeta(g, hoy, arrastradoDe) {
  const ef = estadoEfectivo(g, hoy);
  const rel = textoVencimiento(g, hoy);
  const etiquetas = [
    g.rubro && etiquetaRubro(g.rubro),
    g.formaPago && etiquetaForma(g.formaPago),
    g.recurrente && "↻ Mensual",
  ].filter(Boolean);
  const forma = etiquetas.length ? `<div class="forma">${etiquetas.map(esc).join(" · ")}</div>` : "";
  const parcial = (g.pagos ?? []).length
    ? `<div class="parcial">Pagado ${formatoPesos(pagadoDe(g))} · Saldo ${formatoPesos(saldoDe(g))}</div>`
    : "";
  const arrastre = arrastradoDe
    ? `<div class="arrastrado">↪ Impago de ${esc(nombreMes(arrastradoDe).toLowerCase())}, pasa a este mes</div>`
    : "";
  return `
    <li>
      <button type="button" class="gasto estado-${ef}${venceHoy(g, hoy) ? " vence-hoy" : ""}" data-id="${esc(g.id)}">
        <div class="fila"><span class="desc">${esc(g.descripcion)}</span><span class="monto">${formatoPesos(g.monto)}</span></div>
        <div class="fila">
          <span class="fecha">${formatoFecha(g.fechaPago)}${rel ? ` · ${rel}` : ""}</span>
          <span class="badge estado-${ef}">${ETIQUETAS[ef]}</span>
        </div>
        ${forma}
        ${parcial}
        ${arrastre}
      </button>
    </li>`;
}

contenido.addEventListener("click", (ev) => {
  if (ev.target.closest('[data-accion="ver-todos"]')) {
    mesSel = "todos";
    pintarLista();
    return;
  }
  const mover = ev.target.closest("[data-mes-mover]");
  if (mover) {
    const meses = listaMeses(hoyISO());
    const nuevo = meses[meses.indexOf(mesSel) + Number(mover.dataset.mesMover)];
    if (nuevo) {
      mesSel = nuevo;
      pintarLista();
    }
    return;
  }
  const chip = ev.target.closest("[data-filtro]");
  if (chip) {
    filtro = chip.dataset.filtro;
    pintarLista();
    return;
  }
  const item = ev.target.closest("[data-id]");
  if (item) abrirDetalle(item.dataset.id);
});

contenido.addEventListener("change", (ev) => {
  if (ev.target.id !== "sel-mes") return;
  mesSel = ev.target.value;
  pintarLista();
});

// ---- Detalle: estado y pagos parciales -----------------------------------------------------

function abrirDetalle(id) {
  detalleId = id;
  pintarDetalle();
}

function pintarDetalle() {
  const g = gastos.find((x) => x.id === detalleId);
  if (!g) {
    cerrarDetalle();
    return;
  }
  const hoy = hoyISO();
  const ef = estadoEfectivo(g, hoy);
  const rel = textoVencimiento(g, hoy);
  const pagos = g.pagos ?? [];
  const serie = g.recurrente ? series.find((s) => s.id === g.serieId) : null;
  const seguiraRepitiendo = g.recurrente && (!serie?.hasta || serie.hasta > g.mes);

  // Si llega un cambio de otro celular mientras se escribe un pago, no se pierde lo escrito.
  const montoEscrito = $("#pago-monto")?.value ?? "";
  const fechaEscrita = $("#pago-fecha")?.value || hoy;

  $("#detalle-cuerpo").innerHTML = `
    <div class="det-cab">
      <h2>${esc(g.descripcion)}</h2>
      <span class="badge estado-${ef}">${ETIQUETAS[ef]}</span>
    </div>
    <dl class="datos">
      <div><dt>Monto</dt><dd>${formatoPesos(g.monto)}</dd></div>
      <div><dt>Fecha de pago</dt><dd>${formatoFecha(g.fechaPago)}${rel ? `<br><small>${rel}</small>` : ""}</dd></div>
      <div><dt>Total pagado</dt><dd>${formatoPesos(pagadoDe(g))}</dd></div>
      <div><dt>Saldo a pagar</dt><dd>${formatoPesos(saldoDe(g))}</dd></div>
      <div><dt>Rubro</dt><dd>${esc(etiquetaRubro(g.rubro))}</dd></div>
      <div><dt>Forma de pago</dt><dd>${esc(etiquetaForma(g.formaPago))}</dd></div>
    </dl>
    ${g.recurrente
      ? `<p class="nota repite">↻ Se repite todos los meses${serie?.hasta ? ` · termina en ${esc(nombreMes(serie.hasta))}` : ""}. Si lo editás, el cambio vale para este mes y los siguientes.</p>`
      : ""}

    <h3>Cambiar estado</h3>
    <div class="estados fila-botones">
      ${ESTADOS.map((e) => `<button type="button" class="estado-btn estado-${e}" data-estado="${e}" aria-pressed="${g.estado === e}">${ETIQUETAS[e]}</button>`).join("")}
    </div>
    <p class="nota">“Vencido” se marca solo cuando pasa la fecha de pago y el gasto no está pagado.</p>

    <h3>Pagos parciales</h3>
    ${pagos.length
      ? `<ul class="pagos">${pagos.map((p, i) => `
          <li><span>${formatoFecha(p.fecha)}</span><strong>${formatoPesos(p.monto)}</strong>
          <button type="button" data-quitar="${i}" aria-label="Quitar el pago del ${formatoFecha(p.fecha)}">Quitar</button></li>`).join("")}</ul>`
      : `<p class="nota">Todavía no hay pagos registrados.</p>`}
    <form id="form-pago" class="pago-form" novalidate>
      <label>Monto del pago ($)<input id="pago-monto" inputmode="numeric" autocomplete="off" placeholder="Ej. 50000" value="${esc(montoEscrito)}"></label>
      <label>Fecha<input id="pago-fecha" type="date" value="${esc(fechaEscrita)}"></label>
      <button class="primario">Registrar pago</button>
    </form>
    <p class="error" id="error-pago" role="alert"></p>

    <div class="acciones">
      <button type="button" class="peligro" data-accion="eliminar">${g.recurrente ? "Eliminar todo" : "Eliminar"}</button>
      ${seguiraRepitiendo ? `<button type="button" data-accion="dejar">Dejar de repetir</button>` : ""}
      <button type="button" data-accion="editar">Editar</button>
      <button type="button" data-accion="cerrar">Cerrar</button>
    </div>`;
  if (!dlgDetalle.open) dlgDetalle.showModal();
}

function cerrarDetalle() {
  detalleId = null;
  if (dlgDetalle.open) dlgDetalle.close();
}

function cerrarDialogos() {
  detalleId = null;
  if (dlgDetalle.open) dlgDetalle.close();
  if (dlgForm.open) dlgForm.close();
}

dlgDetalle.addEventListener("close", () => {
  detalleId = null;
});

dlgDetalle.addEventListener("click", (ev) => {
  const g = gastos.find((x) => x.id === detalleId);
  if (!g) return;

  const estado = ev.target.closest("[data-estado]")?.dataset.estado;
  if (estado) return guardar({ ...g, estado });

  const quitar = ev.target.closest("[data-quitar]")?.dataset.quitar;
  if (quitar !== undefined) return guardar(quitarPago(g, Number(quitar)));

  const accion = ev.target.closest("[data-accion]")?.dataset.accion;
  if (accion === "cerrar") cerrarDetalle();
  if (accion === "editar") {
    cerrarDetalle();
    abrirFormulario(g);
  }
  if (accion === "dejar") {
    const serie = series.find((s) => s.id === g.serieId);
    const texto = `¿Dejar de repetir “${g.descripcion}” después de ${nombreMes(g.mes)}? Los meses siguientes dejan de aparecer; este mes y los anteriores se conservan.`;
    if (serie && confirm(texto)) datos.guardarSerie(dejarDeRepetir(serie, g.mes)).catch(falloAlGuardar);
  }
  if (accion === "eliminar") {
    const texto = g.recurrente
      ? `¿Eliminar “${g.descripcion}” y TODOS sus meses (anteriores y siguientes)? No se puede deshacer. Si solo querés que deje de repetirse, usá “Dejar de repetir”.`
      : `¿Eliminar “${g.descripcion}”? No se puede deshacer.`;
    if (confirm(texto)) {
      cerrarDetalle();
      (g.recurrente ? datos.borrarSerie(g.serieId) : datos.borrar(g.id)).catch(falloAlGuardar);
    }
  }
});

dlgDetalle.addEventListener("submit", (ev) => {
  if (ev.target.id !== "form-pago") return;
  ev.preventDefault();
  const g = gastos.find((x) => x.id === detalleId);
  if (!g) return;
  const pago = { monto: parseMonto($("#pago-monto").value), fecha: $("#pago-fecha").value };
  const error = validarPago(g, pago);
  if (error) {
    $("#error-pago").textContent = error;
    return;
  }
  $("#pago-monto").value = "";
  guardar(agregarPago(g, pago));
});

// ---- Alta y edición ------------------------------------------------------------------------

function abrirFormulario(gasto) {
  editando = gasto;
  const esRecurrente = Boolean(gasto?.recurrente);
  $("#form-titulo").textContent = gasto ? (esRecurrente ? "Editar gasto recurrente" : "Editar gasto") : "Nuevo gasto";
  $("#error-gasto").textContent = "";
  // En un gasto que ya se repite, la fecha solo puede cambiar de día dentro de su mes, y la casilla queda marcada.
  formGasto.recurrente.checked = esRecurrente;
  formGasto.recurrente.disabled = esRecurrente;
  $("#nota-recurrente").hidden = !esRecurrente;
  formGasto.fechaPago.min = esRecurrente ? `${gasto.mes}-01` : "";
  formGasto.fechaPago.max = esRecurrente ? `${gasto.mes}-${String(diasDelMes(gasto.mes)).padStart(2, "0")}` : "";
  formGasto.descripcion.value = gasto?.descripcion ?? "";
  formGasto.monto.value = gasto ? String(gasto.monto) : "";
  formGasto.fechaPago.value = gasto?.fechaPago ?? hoyISO();
  formGasto.rubro.value = gasto?.rubro ?? "";
  formGasto.formaPago.value = gasto?.formaPago ?? "";
  formGasto.estado.value = gasto?.estado ?? "estimado";
  dlgForm.showModal();
}

$("#btn-nuevo").addEventListener("click", () => abrirFormulario(null));
$("#form-cancelar").addEventListener("click", () => dlgForm.close());
// El mensaje de error desaparece en cuanto se corrige el dato.
formGasto.addEventListener("input", () => ($("#error-gasto").textContent = ""));
dlgDetalle.addEventListener("input", () => {
  const error = $("#error-pago");
  if (error) error.textContent = "";
});

formGasto.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const nuevo = {
    descripcion: formGasto.descripcion.value.trim(),
    monto: parseMonto(formGasto.monto.value),
    fechaPago: formGasto.fechaPago.value,
    rubro: formGasto.rubro.value,
    formaPago: formGasto.formaPago.value,
    estado: formGasto.estado.value,
  };
  const error = validarGasto(nuevo);
  if (error) {
    $("#error-gasto").textContent = error;
    return;
  }
  if (editando?.recurrente) return guardarEdicionRecurrente(nuevo);

  const gasto = editando ? { ...editando, ...nuevo } : { ...nuevo, pagos: [] };
  if (!gasto.formaPago) delete gasto.formaPago; // "Sin definir": el campo no se guarda
  if (!gasto.rubro) delete gasto.rubro; // "Sin rubro": el campo no se guarda
  // Se muestra el mes del gasto guardado para que se vea enseguida (antes de guardar: la lista se redibuja al guardar).
  if (mesSel !== "todos") mesSel = mesDe(gasto.fechaPago);
  if (formGasto.recurrente.checked) {
    // "Se repite todos los meses": este gasto pasa a ser el primer mes de una serie nueva.
    const serie = crearSerie(gasto);
    const pedido = editando ? datos.convertirEnRecurrente(editando.id, serie) : datos.guardarSerie(serie);
    pedido.catch(falloAlGuardar);
  } else {
    guardar(gasto);
  }
  dlgForm.close();
});

/** Edita un mes de un gasto recurrente: el cambio vale para ese mes y los siguientes. */
function guardarEdicionRecurrente(nuevo) {
  const g = editando;
  if (mesDe(nuevo.fechaPago) !== g.mes) {
    $("#error-gasto").textContent = `En un gasto recurrente la fecha tiene que ser de ${nombreMes(g.mes)}: solo se puede cambiar el día.`;
    return;
  }
  const serie = series.find((s) => s.id === g.serieId);
  if (!serie) {
    aviso("No se encontró el gasto recurrente. Recargá la página.");
    dlgForm.close();
    return;
  }
  if (mesSel !== "todos") mesSel = g.mes;
  datos.guardarSerie(aplicarEdicion(serie, g.mes, nuevo)).catch(falloAlGuardar);
  dlgForm.close();
}

// ---- Reportes mensuales (Excel) ------------------------------------------------------------
// El mes en curso se descarga al momento (con lo que hay hoy). Cuando un mes termina se guarda solo una copia
// congelada ("cierre") y de ahí sale siempre el mismo Excel. No hay un servidor que lo haga a medianoche del
// último día (en el plan gratuito de Firebase no se puede): lo hace la primera persona que abre la app
// después de que el mes terminó.

const intentosCierre = new Set(); // meses que ya se intentaron cerrar en esta sesión
let cerrando = false;

function cerrarMesesTerminados() {
  const completo = listoGastos && listoRec && listoCierres && !errorNube && !errorRecurrentes && !errorCierres;
  if (!usuario || !completo || cerrando) return;
  const hoy = hoyISO();
  const yaCerrados = new Set(cierres.map((c) => c.mes));
  const nuevos = [];
  for (const mes of mesesDisponibles(gastos, hoy)) {
    if (mes >= mesDe(hoy) || yaCerrados.has(mes) || intentosCierre.has(mes)) continue;
    const filas = filasDelMes(gastos, mes, hoy);
    if (filas.length) nuevos.push({ mes, cerradoEn: new Date().toISOString(), filas });
  }
  if (!nuevos.length) return;
  cerrando = true;
  Promise.all(
    nuevos.map(async (cierre) => {
      intentosCierre.add(cierre.mes);
      try {
        await datos.guardarCierre(cierre);
      } catch (e) {
        // "permission-denied": otro celular lo cerró un instante antes (el mes ya existe). No es un problema.
        if (e?.code === "permission-denied") return;
        console.error(e);
        aviso(`No se pudo guardar el cierre de ${nombreMes(cierre.mes)}. Se reintenta en unos minutos.`);
        setTimeout(() => intentosCierre.delete(cierre.mes), 5 * 60 * 1000);
      }
    }),
  ).finally(() => {
    cerrando = false;
  });
}

function pintarReportes() {
  const actual = mesDe(hoyISO());
  const cerrados = [...cierres].sort((a, b) => (a.mes < b.mes ? 1 : -1));
  const problema = errorCierres
    ? `<p class="error">${errorCierres.code === "permission-denied"
        ? "Los meses cerrados todavía no están disponibles: falta actualizar las reglas de Firebase. El mes en curso se puede descargar igual."
        : "No se pudieron cargar los meses cerrados."}</p>`
    : "";
  $("#reportes-cuerpo").innerHTML = `
    <h2>Reportes mensuales</h2>
    <p class="nota">Excel con el detalle de los gastos del mes, el resumen por estado, rubro y forma de pago, y los pagos parciales.
      Cuando un mes termina se guarda solo y ya no cambia; el mes siguiente arranca su propio reporte.</p>
    ${problema}
    <ul class="reportes">
      <li>
        <div><strong>${esc(nombreMes(actual))}</strong><small>En curso · se actualiza cada vez que lo descargás</small></div>
        <button type="button" class="primario" data-descargar="${actual}" data-tipo="vivo">Descargar Excel</button>
      </li>
      ${cerrados.map((c) => `
      <li>
        <div><strong>${esc(nombreMes(c.mes))}</strong><small>Cerrado el ${esc(fechaCorta(c.cerradoEn))}</small></div>
        <button type="button" data-descargar="${esc(c.mes)}" data-tipo="cerrado">Descargar Excel</button>
      </li>`).join("")}
    </ul>
    ${cerrados.length || errorCierres ? "" : `<p class="nota">Todavía no hay meses cerrados: el primero se guarda cuando termine este mes.</p>`}
    <div class="acciones"><button type="button" data-accion="cerrar-reportes">Cerrar</button></div>`;
}

const esIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Entrega el archivo: en iPhone/iPad abre "Compartir" (para guardarlo en Archivos); en el resto, lo descarga. */
async function entregarArchivo(nombre, bytes) {
  const archivo = new File([bytes], nombre, { type: TIPO_XLSX });
  if (esIOS() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return; // la persona cerró el cuadro de Compartir: no es un error
      // si Compartir falla por otro motivo, se intenta la descarga directa
    }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function descargarReporte(mes, tipo) {
  try {
    let reporte;
    if (tipo === "cerrado") {
      const cierre = cierres.find((c) => c.mes === mes);
      if (!cierre) return aviso("Ese mes todavía no está cerrado.");
      reporte = { mes, filas: cierre.filas, cerradoEn: cierre.cerradoEn };
    } else {
      mezclar();
      reporte = { mes, filas: filasDelMes(gastos, mes, hoyISO()), generadoEn: new Date().toISOString() };
    }
    await entregarArchivo(nombreArchivoReporte(mes), crearReporteXlsx(reporte));
  } catch (e) {
    console.error(e);
    aviso("No se pudo armar el Excel. Probá de nuevo.");
  }
}

$("#btn-reportes").addEventListener("click", () => {
  pintarReportes();
  dlgReportes.showModal();
});

dlgReportes.addEventListener("click", async (ev) => {
  if (ev.target.closest('[data-accion="cerrar-reportes"]')) return dlgReportes.close();
  const boton = ev.target.closest("[data-descargar]");
  if (!boton) return;
  boton.disabled = true;
  try {
    await descargarReporte(boton.dataset.descargar, boton.dataset.tipo);
  } finally {
    boton.disabled = false;
  }
});

// Si la app queda abierta de un día para otro, o vuelve al primer plano, se actualiza y se cierra el mes que terminó.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && usuario) render();
});
let pasadas = 0;
setInterval(() => {
  if (!usuario || cargando) return;
  // Cambió el día (pasó la medianoche con la app abierta): se redibuja para actualizar "Vence hoy", los
  // vencidos y el resaltado de las tarjetas de hoy.
  if (hoyISO() !== diaMostrado) return render();
  // Cada 10 minutos se revisa si hay algún mes terminado para cerrar.
  pasadas += 1;
  if (pasadas % 10 === 0) {
    mezclar();
    cerrarMesesTerminados();
  }
}, 60 * 1000);

// ---- Varios --------------------------------------------------------------------------------

function guardar(gasto) {
  // No se espera la respuesta del servidor: la lista se actualiza sola al llegar el cambio.
  if (gasto.recurrente) return guardarMesRecurrente(gasto);
  datos.guardar(gasto).catch(falloAlGuardar);
}

/** Cambio de estado o de pagos en un mes de un gasto recurrente: solo toca ese mes. */
function guardarMesRecurrente(g) {
  const serie = series.find((s) => s.id === g.serieId);
  if (!serie) return;
  const nueva = conOcurrencia(serie, g.mes, { estado: g.estado, pagos: g.pagos });
  datos.guardarOcurrencia(serie.id, g.mes, nueva.meses[g.mes]).catch(falloAlGuardar);
}

function falloAlGuardar(e) {
  console.error(e);
  aviso(e?.code === "permission-denied"
    ? "No tenés permiso para guardar este cambio. Si es algo nuevo, puede faltar actualizar las reglas de Firebase."
    : "No se pudo guardar. Revisá la conexión.");
}

let temporizadorAviso = null;
function aviso(texto) {
  const toast = $("#toast");
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (toast.hidden = true), 6000);
}

// ---- Lupa: buscar y filtrar por rubro ------------------------------------------------------

$("#btn-buscar").addEventListener("click", () => {
  buscando = !buscando;
  $("#btn-buscar").setAttribute("aria-expanded", String(buscando));
  if (!buscando) {
    // Al cerrar la lupa se borra la búsqueda, para no dejar gastos ocultos sin que se note.
    busqueda = "";
    rubroSel = "";
    $("#buscar").value = "";
    $("#sel-rubro").value = "";
  }
  render();
  if (buscando) $("#buscar").focus();
});

$("#buscar").addEventListener("input", (ev) => {
  busqueda = ev.target.value;
  render();
});

$("#sel-rubro").addEventListener("change", (ev) => {
  rubroSel = ev.target.value;
  render();
});

$("#btn-salir").addEventListener("click", () => datos.salir());

iniciar();
