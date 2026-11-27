import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSerie } from "../../docs/logica.js";
import { ejecutar, leerConfigFirebase, tipoDeEjecucion } from "../ejecutar.js";
import { iniciarFirebaseFalso } from "./servidor-falso.js";

const SECRETO = "Proveedor Secreto SA";
const ENTORNO = {
  SMTP_USUARIO: "cartero@ejemplo.com", SMTP_CLAVE: "clave-smtp", DESTINATARIOS: "uno@ejemplo.com, dos@ejemplo.com ,tres@ejemplo.com",
  ROBOT_EMAIL: "robot@ejemplo.com", ROBOT_CLAVE: "clave-robot",
};
const AVISOS_CRON = { PROGRAMACION: "*/5 * * * *" };
const SEMANAL_CRON = { PROGRAMACION: "3 0 * * 6" };
const MENSUAL_CRON = { PROGRAMACION: "5 0 * * *" };
const CONFIG = { apiKey: "clave-publica", proyecto: "proyecto-de-prueba" };

// Hoy (en la prueba) es viernes 4/12/2026 a las 21:03, hora argentina = sábado 5/12 00:03 UTC.
const VIERNES_21 = new Date("2026-12-05T00:03:00Z");
const FIN_DE_NOVIEMBRE_21 = new Date("2026-12-01T00:05:00Z"); // lunes 30/11 21:05 argentinas

function datosDePrueba() {
  const alquiler = crearSerie({ descripcion: "Alquiler", monto: 450000, fechaPago: "2026-11-05", estado: "a_pagar", rubro: "alquiler", formaPago: "manual_galicia", pagos: [] });
  return {
    gastos: {
      g1: { descripcion: SECRETO, monto: 120000, fechaPago: "2026-11-20", estado: "a_pagar", rubro: "compra_insumos", formaPago: "manual_mp", pagos: [{ fecha: "2026-12-02", monto: 20000 }] },
      g2: { descripcion: "Luz", monto: 38500, fechaPago: "2026-12-12", estado: "estimado", pagos: [] },
      g3: { descripcion: "Internet", monto: 25000, fechaPago: "2026-12-02", estado: "pagado", pagos: [{ fecha: "2026-12-02", monto: 25000 }] },
    },
    recurrentes: { s1: alquiler },
    avisos: {
      // en la ventana de la semana (27/11 21:00 a 4/12 21:00) y todavía sin mandar
      a1: { tipo: "pago", creadoEn: "2026-12-02T15:00:00.000Z", descripcion: SECRETO, montoGasto: 120000, monto: 20000, saldo: 100000, fechaPago: "2026-11-20", enviado: false, por: "ana@ejemplo.com" },
      // antes de la ventana
      a2: { tipo: "pago", creadoEn: "2026-11-20T15:00:00.000Z", descripcion: "Pago viejo", montoGasto: 1000, monto: 1000, saldo: 0, fechaPago: "2026-11-20", enviado: true },
      // justo DESPUÉS del cierre del viernes (cuenta para la semana que viene) y todavía sin mandar
      a3: { tipo: "pago", creadoEn: "2026-12-05T00:02:00.000Z", descripcion: "Pago tardío", montoGasto: 9000, monto: 9000, saldo: 0, fechaPago: "2026-12-04", enviado: false },
      // en la ventana y ya mandado
      a4: { tipo: "pago", creadoEn: "2026-12-03T12:00:00.000Z", descripcion: "Internet", montoGasto: 25000, monto: 25000, saldo: 0, fechaPago: "2026-12-02", enviado: true },
    },
  };
}

/** Prepara un Firebase de mentira, un "buzón" que guarda los mails y un registro que guarda lo que se imprimiría. */
async function escenario() {
  const servidor = await iniciarFirebaseFalso({ colecciones: datosDePrueba() });
  process.env.AUTH_BASE = servidor.url;
  process.env.FIRESTORE_BASE = servidor.url;
  const correos = [];
  const registro = [];
  const transporte = { async sendMail(mensaje) { correos.push(mensaje); } };
  const correr = (extra, ahora) => ejecutar({ env: { ...ENTORNO, ...extra }, ahora, transporte, config: CONFIG, log: (t) => registro.push(t) });
  const cerrar = async () => {
    delete process.env.AUTH_BASE;
    delete process.env.FIRESTORE_BASE;
    await servidor.cerrar();
  };
  return { servidor, correos, registro, correr, cerrar };
}

test("qué hacer según la programación (o lo que se elige a mano)", () => {
  assert.equal(tipoDeEjecucion({ programacion: "*/5 * * * *" }), "avisos");
  assert.equal(tipoDeEjecucion({ programacion: "3 0 * * 6" }), "semanal");
  assert.equal(tipoDeEjecucion({ programacion: "5 0 * * *" }), "mensual");
  assert.equal(tipoDeEjecucion({ programacion: "9 9 * * *" }), null);
  assert.equal(tipoDeEjecucion({ programacion: "", tipo: "mensual" }), "mensual"); // a mano
});

test("la apiKey y el proyecto salen del mismo archivo que usa la app", () => {
  const config = leerConfigFirebase();
  assert.match(config.apiKey, /^AIza/);
  assert.equal(config.proyecto, "copani-caballito-v02");
});

test("avisos de pago: un mail por cada pago nuevo, a las 3 personas, y se marcan como enviados", async () => {
  const e = await escenario();
  try {
    const r = await e.correr(AVISOS_CRON, new Date("2026-12-05T12:00:00Z"));
    assert.deepEqual({ estado: r.estado, enviados: r.enviados, pendientes: r.pendientes }, { estado: "ok", enviados: 2, pendientes: 0 });
    assert.equal(e.correos.length, 2);
    // el más viejo primero
    assert.match(e.correos[0].subject, new RegExp(`^Pago registrado: ${SECRETO} · \\$ 20\\.000$`));
    assert.match(e.correos[1].subject, /^Pago registrado: Pago tardío · \$ 9\.000$/);
    for (const c of e.correos) assert.deepEqual(c.to, ["uno@ejemplo.com", "dos@ejemplo.com", "tres@ejemplo.com"]); // sin espacios de más
    assert.match(e.correos[0].from, /"Copani Caballito" <cartero@ejemplo\.com>/);
    assert.match(e.correos[0].text, /Saldo pendiente: \$ 100\.000/);
    assert.match(e.correos[1].text, /Saldo pendiente: Sin saldo: el gasto quedó pagado/);
    assert.equal(e.servidor.datos.avisos.a1.enviado, true);
    assert.equal(e.servidor.datos.avisos.a3.enviado, true);
    assert.ok(e.servidor.datos.avisos.a1.enviadoEn);
    assert.equal(e.servidor.datos.avisos.a2.enviadoEn, undefined); // los ya mandados no se tocan

    // una segunda pasada no manda nada de nuevo
    const otra = await e.correr(AVISOS_CRON, new Date("2026-12-05T12:05:00Z"));
    assert.equal(otra.enviados, 0);
    assert.equal(e.correos.length, 2);
  } finally {
    await e.cerrar();
  }
});

test("avisos de pago: si el correo falla, el aviso NO se marca y se reintenta en la próxima corrida", async () => {
  const e = await escenario();
  try {
    const roto = { async sendMail() { throw Object.assign(new Error("servidor de correo caído"), { code: "ECONNECTION" }); } };
    await assert.rejects(ejecutar({ env: { ...ENTORNO, ...AVISOS_CRON }, ahora: VIERNES_21, transporte: roto, config: CONFIG, log: () => {} }), /caído/);
    assert.equal(e.servidor.datos.avisos.a1.enviado, false);
    const luego = await e.correr(AVISOS_CRON, VIERNES_21); // ahora funciona
    assert.equal(luego.enviados, 2);
  } finally {
    await e.cerrar();
  }
});

test("informe semanal: pagos de la ventana, vencidos, total y saldo; y no se manda dos veces", async () => {
  const e = await escenario();
  try {
    const r = await e.correr(SEMANAL_CRON, VIERNES_21);
    assert.deepEqual({ estado: r.estado, marca: r.marca, pagos: r.pagos, vencidos: r.vencidos }, { estado: "ok", marca: "semanal-2026-12-04", pagos: 2, vencidos: 2 });
    assert.equal(e.correos.length, 1);
    const c = e.correos[0];
    assert.equal(c.subject, "Cierre de semana · 27/11 al 04/12");
    assert.match(c.text, /Total pagado en la semana: \$ 45\.000/); // 20.000 (a1) + 25.000 (a4)
    assert.match(c.text, /Saldo a pagar \(Diciembre 2026\): \$ 1\.038\.500/);
    assert.match(c.text, /Saldo vencido: \$ 550\.000/);
    assert.ok(c.text.includes(SECRETO) && c.text.includes("Internet"));
    assert.ok(!c.text.includes("Pago tardío") && !c.text.includes("Pago viejo"), "los pagos fuera de la ventana no cuentan");
    assert.match(c.text, /Alquiler · saldo \$ 450\.000 · 29 días de atraso/);
    assert.ok(e.servidor.datos.informes["semanal-2026-12-04"], "queda la marca de enviado");

    const otra = await e.correr(SEMANAL_CRON, new Date("2026-12-05T00:30:00Z")); // el programa corre otra vez más tarde
    assert.equal(otra.estado, "ya-enviado");
    assert.equal(e.correos.length, 1);
  } finally {
    await e.cerrar();
  }
});

test("informe mensual: solo el último día del mes, con el Excel adjunto, y una sola vez", async () => {
  const e = await escenario();
  try {
    const no = await e.correr(MENSUAL_CRON, new Date("2026-11-20T00:05:00Z"));
    assert.equal(no.estado, "no-toca");
    assert.equal(e.correos.length, 0);

    const r = await e.correr(MENSUAL_CRON, FIN_DE_NOVIEMBRE_21);
    assert.deepEqual({ estado: r.estado, marca: r.marca }, { estado: "ok", marca: "mensual-2026-11" });
    assert.equal(e.correos.length, 1);
    const c = e.correos[0];
    assert.equal(c.subject, "Informe mensual · Noviembre 2026");
    assert.match(c.text, /Gastos: \d+ · Pagado: \$ [\d.]+ · Saldo a pagar: \$ [\d.]+/);
    assert.equal(c.attachments.length, 1);
    assert.equal(c.attachments[0].filename, "Gastos-Copani-Caballito-2026-11.xlsx");
    assert.equal(c.attachments[0].content.subarray(0, 2).toString(), "PK"); // es un archivo xlsx (zip)
    assert.ok(c.attachments[0].content.length > 5000);
    assert.ok(e.servidor.datos.informes["mensual-2026-11"]);

    assert.equal((await e.correr(MENSUAL_CRON, FIN_DE_NOVIEMBRE_21)).estado, "ya-enviado");
    // si el programa se atrasó y corre el día 1, no repite lo que ya salió
    assert.equal((await e.correr(MENSUAL_CRON, new Date("2026-12-01T03:30:00Z"))).estado, "ya-enviado");
    assert.equal(e.correos.length, 1);
  } finally {
    await e.cerrar();
  }
});

test("informe mensual atrasado: si no salió el último día, sale el día 1", async () => {
  const e = await escenario();
  try {
    const r = await e.correr(MENSUAL_CRON, new Date("2026-12-01T03:30:00Z")); // 00:30 del 1/12 en Argentina
    assert.deepEqual({ estado: r.estado, marca: r.marca }, { estado: "ok", marca: "mensual-2026-11" });
  } finally {
    await e.cerrar();
  }
});

test("pruebas a mano: el mail dice [PRUEBA], se manda siempre y no deja marcas ni cambia avisos", async () => {
  const e = await escenario();
  try {
    const semanal = await e.correr({ TIPO: "semanal", PRUEBA: "true" }, new Date("2026-12-08T15:00:00Z")); // un martes cualquiera
    assert.equal(semanal.estado, "prueba");
    const mensual = await e.correr({ TIPO: "mensual", PRUEBA: "true" }, new Date("2026-12-08T15:00:00Z")); // no es fin de mes: igual manda
    assert.equal(mensual.estado, "prueba");
    const aviso = await e.correr({ TIPO: "avisos", PRUEBA: "true" }, new Date("2026-12-08T15:00:00Z"));
    assert.equal(aviso.estado, "prueba");
    assert.deepEqual(e.correos.map((c) => c.subject.split(" ")[0]), ["[PRUEBA]", "[PRUEBA]", "[PRUEBA]"]);
    assert.equal(e.servidor.datos.informes, undefined, "las pruebas no dejan marca de enviado");
    assert.equal(e.servidor.datos.avisos.a1.enviado, false, "la prueba de avisos no toca los avisos reales");
    // y una prueba de semanal se puede repetir las veces que haga falta
    assert.equal((await e.correr({ TIPO: "semanal", PRUEBA: "true" }, new Date("2026-12-08T15:00:00Z"))).estado, "prueba");
    // a mano y SIN prueba funciona como el programado: manda una vez
    assert.equal((await e.correr({ TIPO: "semanal", PRUEBA: "false" }, VIERNES_21)).estado, "ok");
    assert.equal((await e.correr({ TIPO: "semanal", PRUEBA: "false" }, VIERNES_21)).estado, "ya-enviado");
  } finally {
    await e.cerrar();
  }
});

test("sin configurar: no intenta conectarse a nada y avisa qué falta", async () => {
  const e = await escenario();
  try {
    const r = await ejecutar({ env: { ...AVISOS_CRON, SMTP_USUARIO: "cartero@ejemplo.com" }, ahora: VIERNES_21, transporte: {}, config: CONFIG, log: () => {} });
    assert.deepEqual(r, { tipo: "avisos", estado: "sin-configurar", faltan: ["SMTP_CLAVE", "DESTINATARIOS", "ROBOT_EMAIL", "ROBOT_CLAVE"] });
    assert.equal(e.servidor.pedidos.length, 0);
    await assert.rejects(ejecutar({ env: { ...ENTORNO, PROGRAMACION: "1 1 * * *" }, ahora: VIERNES_21, transporte: {}, config: CONFIG }), /Programación desconocida/);
  } finally {
    await e.cerrar();
  }
});

test("el registro (que en un repositorio público lo ve cualquiera) no muestra gastos, montos ni emails", async () => {
  const e = await escenario();
  try {
    await e.correr(AVISOS_CRON, VIERNES_21);
    await e.correr(SEMANAL_CRON, VIERNES_21);
    await e.correr(MENSUAL_CRON, FIN_DE_NOVIEMBRE_21);
    const visible = e.registro.filter((linea) => !linea.startsWith("::add-mask::")).join("\n");
    for (const sensible of [SECRETO, "Alquiler", "Internet", "Luz", "ejemplo.com", "clave-", "$", "20.000", "450.000"]) {
      assert.ok(!visible.includes(sensible), `el registro no debe mostrar: ${sensible}\n${visible}`);
    }
    // y los emails sí se declaran como secretos, para que GitHub los tape si aparecieran
    const mascaras = e.registro.filter((l) => l.startsWith("::add-mask::")).map((l) => l.slice(12));
    for (const m of ["cartero@ejemplo.com", "dos@ejemplo.com", "robot@ejemplo.com", "tres@ejemplo.com", "uno@ejemplo.com"]) assert.ok(mascaras.includes(m), `se enmascara ${m}`);
    assert.match(visible, /Avisos de pago: 2 enviados/);
    assert.match(visible, /Informe semanal enviado: 2 pagos, 2 vencidos/);
  } finally {
    await e.cerrar();
  }
});
