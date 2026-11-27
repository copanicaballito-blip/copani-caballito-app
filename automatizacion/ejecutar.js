// Programa principal de los mails automáticos. Lo corre GitHub Actions (ver .github/workflows/correos.yml):
//   avisos  -> cada 5 minutos: manda un mail por cada pago nuevo registrado en la app
//   semanal -> viernes 21 h (Argentina): cierre de semana
//   mensual -> todos los días 21 h (Argentina); solo manda si es el último día del mes
//
// IMPORTANTE: los registros de GitHub Actions de un repositorio público los puede ver cualquiera. Por eso este programa
// NUNCA escribe en el registro nombres de gastos, montos ni emails: solo cantidades y estados.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { conectar, igual, mayorOIgual, menor } from "./firestore.js";
import { ahoraAR, mesDelInformeMensual, ventanaSemanal, ZONA } from "./fechas.js";
import { datosMensual, datosSemanal, juntarGastos } from "./informes.js";
import { correoAviso, correoMensual, correoSemanal } from "./correos.js";
import { crearTransporte, enviar } from "./enviar.js";

const RUTA_CONFIG = fileURLToPath(new URL("../docs/firebase-config.js", import.meta.url));
const MAXIMO_AVISOS_POR_VEZ = 20; // si se juntaron muchos (ej. después de un corte), el resto sale en la corrida siguiente
const OBLIGATORIAS = ["SMTP_USUARIO", "SMTP_CLAVE", "DESTINATARIOS", "ROBOT_EMAIL", "ROBOT_CLAVE"];

// El texto de cada programación es el de .github/workflows/correos.yml (GitHub lo pasa tal cual en `github.event.schedule`).
const PROGRAMACIONES = { "*/5 * * * *": "avisos", "3 0 * * 6": "semanal", "5 0 * * *": "mensual" };

/** apiKey y proyecto de Firebase: son los mismos datos públicos que usa la app (docs/firebase-config.js). */
export function leerConfigFirebase(ruta = RUTA_CONFIG) {
  const texto = readFileSync(ruta, "utf8");
  const dato = (campo) => texto.match(new RegExp(`${campo}:\\s*"([^"]*)"`))?.[1];
  const config = { apiKey: dato("apiKey"), proyecto: dato("projectId") };
  if (!config.apiKey || !config.proyecto) throw new Error("docs/firebase-config.js no tiene apiKey y projectId.");
  return config;
}

/** Qué hay que hacer: lo que se eligió a mano al ejecutar, o lo que corresponde a la programación que disparó la corrida. */
export function tipoDeEjecucion({ programacion, tipo }) {
  return tipo || PROGRAMACIONES[programacion] || null;
}

const porFecha = (a, b) => a.creadoEn.localeCompare(b.creadoEn);

// Un aviso inventado, para la prueba de "avisos" (así se puede probar el correo sin tener que registrar un pago).
const AVISO_DE_EJEMPLO = {
  tipo: "pago", creadoEn: new Date().toISOString(), descripcion: "Gasto de ejemplo", fechaPago: "2026-01-15",
  montoGasto: 100000, monto: 40000, saldo: 60000, por: "prueba",
};

/**
 * Ejecuta un tipo de envío. Devuelve un resumen ({ tipo, ... }) y no escribe datos sensibles en el registro.
 * `transporte` y `config` se pueden pasar para las pruebas automáticas.
 */
export async function ejecutar({ env = process.env, ahora = new Date(), transporte, config, log = console.log } = {}) {
  process.env.TZ = ZONA; // las horas del Excel salen en hora argentina
  const manual = Boolean(env.TIPO);
  const tipo = tipoDeEjecucion({ programacion: env.PROGRAMACION, tipo: env.TIPO });
  if (!tipo) throw new Error(`Programación desconocida: "${env.PROGRAMACION ?? ""}".`);
  const prueba = manual && env.PRUEBA === "true";

  const faltan = OBLIGATORIAS.filter((nombre) => !env[nombre]?.trim());
  if (faltan.length) return { tipo, estado: "sin-configurar", faltan };

  const destinatarios = env.DESTINATARIOS.split(",").map((e) => e.trim()).filter(Boolean);
  for (const valor of [...destinatarios, env.SMTP_USUARIO.trim(), env.ROBOT_EMAIL.trim()]) log(`::add-mask::${valor}`);

  const cliente = await conectar({ ...(config ?? leerConfigFirebase()), email: env.ROBOT_EMAIL.trim(), clave: env.ROBOT_CLAVE });
  const salida = transporte ?? (await crearTransporte(env));
  const de = `"Copani Caballito" <${(env.REMITENTE || env.SMTP_USUARIO).trim()}>`;
  const mandar = (correo) => enviar(salida, { de, para: destinatarios, correo });
  const hoy = ahoraAR(ahora).fecha;

  // ---- Avisos de pago ----
  if (tipo === "avisos") {
    if (prueba) {
      await mandar(correoAviso(AVISO_DE_EJEMPLO, true));
      log("Prueba de aviso de pago: 1 correo enviado.");
      return { tipo, estado: "prueba", enviados: 1 };
    }
    const pendientes = (await cliente.consultar("avisos", [igual("enviado", false)])).sort(porFecha);
    const aEnviar = pendientes.slice(0, MAXIMO_AVISOS_POR_VEZ);
    for (const aviso of aEnviar) {
      await mandar(correoAviso(aviso));
      await cliente.actualizar("avisos", aviso.id, { enviado: true, enviadoEn: ahora.toISOString() });
    }
    log(`Avisos de pago: ${aEnviar.length} enviados, ${pendientes.length - aEnviar.length} pendientes.`);
    return { tipo, estado: "ok", enviados: aEnviar.length, pendientes: pendientes.length - aEnviar.length };
  }

  // ---- Informe semanal ----
  if (tipo === "semanal") {
    const ventana = ventanaSemanal(ahora);
    const marca = `semanal-${ventana.viernes}`;
    if (!prueba && (await cliente.existe("informes", marca))) {
      log("Informe semanal: ya estaba enviado, no se repite.");
      return { tipo, estado: "ya-enviado", marca };
    }
    const [unicos, series, avisos] = await Promise.all([
      cliente.listar("gastos"),
      cliente.listar("recurrentes"),
      cliente.consultar("avisos", [mayorOIgual("creadoEn", ventana.desde.toISOString()), menor("creadoEn", ventana.cierre.toISOString())]),
    ]);
    const datos = datosSemanal({ gastos: juntarGastos(unicos, series, hoy), avisos, hoy, ventana });
    await mandar(correoSemanal(datos, prueba));
    if (!prueba) await cliente.crear("informes", marca, { tipo: "semanal", enviadoEn: ahora.toISOString() });
    log(`Informe semanal enviado: ${datos.pagos.length} pagos, ${datos.vencidos.length} vencidos${prueba ? " (prueba)" : ""}.`);
    return { tipo, estado: prueba ? "prueba" : "ok", marca, pagos: datos.pagos.length, vencidos: datos.vencidos.length };
  }

  // ---- Informe mensual ----
  const mes = prueba ? hoy.slice(0, 7) : mesDelInformeMensual(ahora);
  if (!mes) {
    log("Informe mensual: hoy no es el último día del mes.");
    return { tipo, estado: "no-toca" };
  }
  const marca = `mensual-${mes}`;
  if (!prueba && (await cliente.existe("informes", marca))) {
    log("Informe mensual: ya estaba enviado, no se repite.");
    return { tipo, estado: "ya-enviado", marca };
  }
  const [unicos, series] = await Promise.all([cliente.listar("gastos"), cliente.listar("recurrentes")]);
  const datos = datosMensual({ gastos: juntarGastos(unicos, series, hoy), mes, hoy });
  await mandar(correoMensual({ ...datos, generadoEn: ahora.toISOString() }, prueba));
  if (!prueba) await cliente.crear("informes", marca, { tipo: "mensual", enviadoEn: ahora.toISOString() });
  log(`Informe mensual enviado: ${datos.filas.length} gastos${prueba ? " (prueba)" : ""}.`);
  return { tipo, estado: prueba ? "prueba" : "ok", marca, gastos: datos.filas.length };
}

// ---- Cuando se corre desde la línea de comandos (GitHub Actions) ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manual = Boolean(process.env.TIPO);
  ejecutar()
    .then((r) => {
      if (r.estado === "sin-configurar") {
        console.log(`::warning::Los correos automáticos todavía no están configurados. Faltan: ${r.faltan.join(", ")}.`);
        process.exitCode = manual ? 1 : 0; // programado: sin falla (no llenar de avisos de error); a mano: se ve en rojo
      }
    })
    .catch((e) => {
      console.error(`::error::${e.message}`);
      // El aviso de pagos corre cada 5 minutos: si falla seguido no se marca como error para no llenar el mail de avisos.
      const silencioso = !manual && tipoDeEjecucion({ programacion: process.env.PROGRAMACION }) === "avisos";
      process.exitCode = silencioso ? 0 : 1;
    });
}
