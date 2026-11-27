import { test } from "node:test";
import assert from "node:assert/strict";
import { correoAviso, correoMensual, correoSemanal } from "../correos.js";
import { crearTransporte, enviar } from "../enviar.js";
import { filasDelMes, resumenDeFilas } from "../../docs/logica.js";
import { iniciarSmtpFalso } from "./servidor-falso.js";

const AVISO = {
  tipo: "pago", creadoEn: "2026-12-02T15:00:00.000Z", descripcion: "Proveedor <b>X</b> & Cía", montoGasto: 120000, monto: 20000, saldo: 100000,
  fechaPago: "2026-11-20", rubro: "compra_insumos", formaPago: "manual_mp", por: "ana@ejemplo.com", enviado: false,
};

const SEMANAL = {
  desde: "2026-11-28T00:00:00.000Z", hasta: "2026-12-05T00:00:00.000Z", mes: "2026-12",
  pagos: [{ creadoEn: "2026-12-02T15:00:00.000Z", descripcion: "Luz", monto: 8000, saldo: 0 }, { creadoEn: "2026-12-03T15:00:00.000Z", descripcion: "Alquiler", monto: 100000, saldo: 350000 }],
  vencidos: [{ fechaPago: "2026-11-05", descripcion: "Expensas", saldo: 70000, diasDeAtraso: 1 }],
  totalPagado: 108000, saldo: 420000, saldoVencido: 70000,
};

const sinRastros = (correo) => {
  for (const campo of [correo.asunto, correo.texto, correo.html]) assert.ok(!/undefined|NaN|\[object/.test(campo), `hay un valor roto en: ${campo.slice(0, 200)}`);
};

test("aviso de pago: gasto, monto pagado y saldo pendiente (o 'pagado' si no queda saldo)", () => {
  const c = correoAviso(AVISO);
  assert.equal(c.asunto, "Pago registrado: Proveedor <b>X</b> & Cía · $ 20.000");
  for (const dato of ["Gasto: Proveedor <b>X</b> & Cía", "Monto pagado: $ 20.000", "Saldo pendiente: $ 100.000", "Monto del gasto: $ 120.000", "Vence: 20/11/2026", "Rubro: Compra insumos", "Forma de pago: Manual - MP", "por ana@ejemplo.com"]) {
    assert.ok(c.texto.includes(dato), `falta "${dato}" en:\n${c.texto}`);
  }
  assert.ok(c.html.includes("Proveedor &lt;b&gt;X&lt;/b&gt; &amp; Cía"), "el HTML escapa lo que escribió la persona");
  assert.ok(!c.html.includes("<b>X</b>"));
  sinRastros(c);

  const completo = correoAviso({ ...AVISO, saldo: 0, monto: 100000, rubro: undefined, formaPago: undefined, por: undefined });
  assert.ok(completo.texto.includes("Saldo pendiente: Sin saldo: el gasto quedó pagado"));
  assert.ok(!completo.texto.includes("Rubro:") && !completo.texto.includes("Forma de pago:") && !completo.texto.includes(" por "));
  sinRastros(completo);
});

test("la prueba se marca en el asunto", () => {
  assert.ok(correoAviso(AVISO, true).asunto.startsWith("[PRUEBA] Pago registrado"));
  assert.ok(correoSemanal(SEMANAL, true).asunto.startsWith("[PRUEBA] Cierre de semana"));
  assert.ok(!correoSemanal(SEMANAL).asunto.includes("PRUEBA"));
});

test("cierre de semana: pagos realizados, vencidos, total pagado y saldo", () => {
  const c = correoSemanal(SEMANAL);
  assert.equal(c.asunto, "Cierre de semana · 27/11 al 04/12");
  for (const dato of [
    "Total pagado en la semana: $ 108.000", "Saldo a pagar (Diciembre 2026): $ 420.000", "Saldo vencido: $ 70.000",
    "PAGOS REALIZADOS (2)", "Luz · pagado $ 8.000 · sin saldo", "Alquiler · pagado $ 100.000 · saldo $ 350.000",
    "PAGOS VENCIDOS (1)", "Expensas · saldo $ 70.000 · 1 días de atraso",
  ]) assert.ok(c.texto.includes(dato), `falta "${dato}" en:\n${c.texto}`);
  assert.ok(c.html.includes("Pagos realizados (2)") && c.html.includes("Pagos vencidos (1)"));
  assert.ok(c.html.includes("1 día<"), "singular en el HTML");
  assert.ok(c.html.includes("$ 108.000"), "el $ y el número no se separan");
  sinRastros(c);
});

test("cierre de semana sin movimientos: lo dice, no queda vacío", () => {
  const c = correoSemanal({ ...SEMANAL, pagos: [], vencidos: [], totalPagado: 0, saldoVencido: 0 });
  assert.ok(c.texto.includes("PAGOS REALIZADOS (0)\n- Ninguno."));
  assert.ok(c.texto.includes("PAGOS VENCIDOS (0)\n- Ninguno."));
  assert.ok(c.html.includes("No se registraron pagos en la semana.") && c.html.includes("No hay gastos vencidos."));
  sinRastros(c);
});

test("informe mensual: resumen en el cuerpo y el Excel adjunto, que es un .xlsx de verdad", () => {
  const gastos = [
    { id: "a", descripcion: "Alquiler", monto: 450000, fechaPago: "2026-11-05", estado: "pagado", rubro: "alquiler", pagos: [] },
    { id: "b", descripcion: "Luz", monto: 38500, fechaPago: "2026-11-12", estado: "a_pagar", rubro: "servicio", pagos: [{ fecha: "2026-11-10", monto: 10000 }] },
  ];
  const filas = filasDelMes(gastos, "2026-11", "2026-11-30");
  const resumen = resumenDeFilas(filas);
  const c = correoMensual({ mes: "2026-11", filas, resumen, generadoEn: "2026-11-30T21:05:00-03:00" });
  assert.equal(c.asunto, "Informe mensual · Noviembre 2026");
  assert.ok(c.texto.includes("Gastos: 2 · Pagado: $ 460.000 · Saldo a pagar: $ 28.500"), c.texto);
  assert.equal(c.adjuntos.length, 1);
  const [adjunto] = c.adjuntos;
  assert.equal(adjunto.filename, "Gastos-Copani-Caballito-2026-11.xlsx");
  assert.equal(adjunto.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(Buffer.from(adjunto.content).subarray(0, 4).toString("latin1"), "PK\u0003\u0004");
  sinRastros(c);
});

test("por SMTP de verdad: se autentica, llega a las 3 personas y el Excel viaja adjunto", async () => {
  const smtp = await iniciarSmtpFalso();
  try {
    const transporte = await crearTransporte({
      SMTP_SERVIDOR: "127.0.0.1", SMTP_PUERTO: String(smtp.puerto), SMTP_SIN_TLS: "1", SMTP_USUARIO: smtp.usuario, SMTP_CLAVE: smtp.clave,
    });
    const gastos = [{ id: "a", descripcion: "Alquiler", monto: 450000, fechaPago: "2026-11-05", estado: "a_pagar", pagos: [] }];
    const filas = filasDelMes(gastos, "2026-11", "2026-11-30");
    const correo = correoMensual({ mes: "2026-11", filas, resumen: resumenDeFilas(filas), generadoEn: "2026-11-30T21:05:00-03:00" });
    const para = ["uno@ejemplo.com", "dos@ejemplo.com", "tres@ejemplo.com"];
    await enviar(transporte, { de: '"Copani Caballito" <cartero@ejemplo.com>', para, correo });
    await enviar(transporte, { de: '"Copani Caballito" <cartero@ejemplo.com>', para, correo: correoAviso(AVISO) });
    transporte.close?.();

    assert.equal(smtp.mensajes.length, 2);
    const [mensual, aviso] = smtp.mensajes;
    assert.deepEqual(mensual.para.sort(), [...para].sort());
    assert.match(mensual.datos, /Subject: Informe mensual · Noviembre 2026|Subject: =\?UTF-8\?/); // el asunto lleva tilde: puede ir codificado
    assert.match(mensual.datos, /Content-Disposition: attachment;\s+filename="?Gastos-Copani-Caballito-2026-11\.xlsx/); // nodemailer parte el encabezado en dos renglones
    assert.match(mensual.datos, /multipart\/mixed/);
    assert.match(mensual.datos, /text\/html/);
    // el contenido del adjunto, ya decodificado, es el mismo archivo
    const parte = mensual.datos.split(/\r\n--[^\r\n]+\r\n/).find((p) => /filename=/.test(p));
    const base64 = parte.split(/\r\n\r\n/)[1].replace(/\r\n/g, "").replace(/--.*$/, "");
    assert.equal(Buffer.from(base64, "base64").subarray(0, 2).toString(), "PK");
    assert.deepEqual(aviso.para.sort(), [...para].sort());
    assert.ok(!/filename=/.test(aviso.datos), "el aviso de pago no lleva adjunto");
  } finally {
    await smtp.cerrar();
  }
});

test("por SMTP: una contraseña de correo equivocada da error (no se pierde en silencio)", async () => {
  const smtp = await iniciarSmtpFalso();
  try {
    const transporte = await crearTransporte({
      SMTP_SERVIDOR: "127.0.0.1", SMTP_PUERTO: String(smtp.puerto), SMTP_SIN_TLS: "1", SMTP_USUARIO: smtp.usuario, SMTP_CLAVE: "equivocada",
    });
    await assert.rejects(enviar(transporte, { de: "cartero@ejemplo.com", para: ["uno@ejemplo.com"], correo: correoAviso(AVISO) }), (e) => e.code === "EAUTH");
    assert.equal(smtp.mensajes.length, 0);
    transporte.close?.();
  } finally {
    await smtp.cerrar();
  }
});
