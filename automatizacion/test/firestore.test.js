import { test } from "node:test";
import assert from "node:assert/strict";
import { codificar, codificarCampos, conectar, decodificar, decodificarCampos, decodificarDocumento, igual, mayorOIgual, menor } from "../firestore.js";
import { iniciarFirebaseFalso } from "./servidor-falso.js";

test("datos de Firestore: ida y vuelta, con números, listas y mapas", () => {
  const original = {
    descripcion: "Alquiler ñ", monto: 450000, pagado: false, nota: null, factor: 1.5,
    pagos: [{ fecha: "2026-12-03", monto: 100000 }, { fecha: "2026-12-04", monto: 5 }],
    meses: { "2026-12": { estado: "pagado", pagos: [] } },
  };
  assert.deepEqual(codificar(450000), { integerValue: "450000" }); // Firestore manda los enteros como texto
  assert.deepEqual(codificar(1.5), { doubleValue: 1.5 });
  assert.deepEqual(decodificarCampos(codificarCampos(original)), original);
  assert.equal(decodificar({ timestampValue: "2026-12-01T00:00:00Z" }), "2026-12-01T00:00:00Z");
  assert.throws(() => decodificar({ geoPointValue: {} }), /no soportado/);
  assert.throws(() => codificar(() => 1), /No se puede guardar/);
});

test("un documento de Firestore se convierte en un objeto con su id", () => {
  const doc = {
    name: "projects/p/databases/(default)/documents/avisos/abc123",
    fields: { monto: { integerValue: "2500" }, enviado: { booleanValue: false } },
  };
  assert.deepEqual(decodificarDocumento(doc), { id: "abc123", monto: 2500, enviado: false });
  assert.deepEqual(decodificarDocumento({ name: "x/y" }), { id: "y" }); // sin campos
});

test("cliente: inicia sesión, lista (con varias páginas), consulta, crea y actualiza", async () => {
  const servidor = await iniciarFirebaseFalso({
    tamanoPagina: 2,
    colecciones: {
      gastos: { a: { monto: 1 }, b: { monto: 2 }, c: { monto: 3 }, d: { monto: 4 }, e: { monto: 5 } },
      avisos: {
        x: { creadoEn: "2026-12-01T10:00:00Z", enviado: false, monto: 10 },
        y: { creadoEn: "2026-12-02T10:00:00Z", enviado: true, monto: 20 },
        z: { creadoEn: "2026-12-03T10:00:00Z", enviado: false, monto: 30 },
      },
    },
  });
  process.env.AUTH_BASE = servidor.url;
  process.env.FIRESTORE_BASE = servidor.url;
  try {
    const cliente = await conectar({ apiKey: "k", proyecto: "p", email: "robot@ejemplo.com", clave: "clave-robot" });
    assert.deepEqual((await cliente.listar("gastos")).map((g) => g.monto), [1, 2, 3, 4, 5]); // 3 páginas de 2
    assert.deepEqual((await cliente.listar("vacia")).length, 0);
    assert.deepEqual((await cliente.consultar("avisos", [igual("enviado", false)])).map((a) => a.id).sort(), ["x", "z"]);
    const entre = await cliente.consultar("avisos", [mayorOIgual("creadoEn", "2026-12-02T00:00:00Z"), menor("creadoEn", "2026-12-03T00:00:00Z")]);
    assert.deepEqual(entre.map((a) => a.id), ["y"]);
    assert.deepEqual(await cliente.consultar("avisos", [igual("enviado", "nunca")]), []); // sin resultados
    assert.equal(await cliente.existe("informes", "semanal-1"), false);
    assert.equal(await cliente.crear("informes", "semanal-1", { tipo: "semanal", enviadoEn: "ahora" }), true);
    assert.equal(await cliente.crear("informes", "semanal-1", { tipo: "semanal" }), false); // ya existía
    assert.equal(await cliente.existe("informes", "semanal-1"), true);
    await cliente.actualizar("avisos", "x", { enviado: true, enviadoEn: "2026-12-04T00:00:00Z" });
    assert.deepEqual(servidor.datos.avisos.x, { creadoEn: "2026-12-01T10:00:00Z", enviado: true, monto: 10, enviadoEn: "2026-12-04T00:00:00Z" });
    await assert.rejects(cliente.actualizar("avisos", "no-existe", { enviado: true }), /HTTP 404/);
  } finally {
    delete process.env.AUTH_BASE;
    delete process.env.FIRESTORE_BASE;
    await servidor.cerrar();
  }
});

test("cliente: errores claros cuando la contraseña es mala o las reglas no dejan pasar", async () => {
  const servidor = await iniciarFirebaseFalso({ colecciones: { gastos: { a: { monto: 1 } } } });
  const rechazado = await iniciarFirebaseFalso({ denegar: true });
  try {
    process.env.AUTH_BASE = servidor.url;
    process.env.FIRESTORE_BASE = servidor.url;
    await assert.rejects(
      conectar({ apiKey: "k", proyecto: "p", email: "robot@ejemplo.com", clave: "mala" }),
      (e) => /INVALID_LOGIN_CREDENTIALS/.test(e.message) && /ROBOT_EMAIL y ROBOT_CLAVE/.test(e.message) && !/mala/.test(e.message), // no se filtra la contraseña
    );
    // La cuenta robot inicia sesión bien, pero las reglas la rechazan (no está en `autorizado`): Firestore responde 403
    process.env.AUTH_BASE = rechazado.url;
    process.env.FIRESTORE_BASE = rechazado.url;
    const cliente = await conectar({ apiKey: "k", proyecto: "p", email: "robot@ejemplo.com", clave: "clave-robot" });
    await assert.rejects(cliente.listar("gastos"), (e) => e.estado === 403 && /HTTP 403/.test(e.message) && /reglas de Firebase/.test(e.message));
    await assert.rejects(cliente.consultar("avisos", [igual("enviado", false)]), /HTTP 403/);
  } finally {
    delete process.env.AUTH_BASE;
    delete process.env.FIRESTORE_BASE;
    await servidor.cerrar();
    await rechazado.cerrar();
  }
});
