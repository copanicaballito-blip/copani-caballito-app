// Servidores de mentira para probar el programa de mails sin tocar Firebase ni ningún correo real.
//  - iniciarFirebaseFalso(): imita el ingreso con email/contraseña y la API REST de Firestore (en memoria).
//  - iniciarSmtpFalso(): imita un servidor de correo y guarda los mensajes que recibe.
import http from "node:http";
import net from "node:net";
import { codificarCampos, decodificarCampos } from "../firestore.js";

const leerCuerpo = (req) => new Promise((resolver) => {
  let texto = "";
  req.on("data", (c) => (texto += c));
  req.on("end", () => resolver(texto));
});

/** `colecciones`: { avisos: { id1: { ...campos }, ... }, gastos: {...} }. Devuelve { url, datos, pedidos, cerrar }. */
export async function iniciarFirebaseFalso({ usuarios = { "robot@ejemplo.com": "clave-robot" }, colecciones = {}, tamanoPagina = 300, denegar = false } = {}) {
  const datos = structuredClone(colecciones);
  const pedidos = [];
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const cuerpo = await leerCuerpo(req);
    pedidos.push({ metodo: req.method, ruta: url.pathname });
    const responder = (estado, objeto) => {
      res.writeHead(estado, { "Content-Type": "application/json" });
      res.end(JSON.stringify(objeto));
    };

    if (url.pathname === "/v1/accounts:signInWithPassword") {
      const { email, password } = JSON.parse(cuerpo);
      return usuarios[email] === password
        ? responder(200, { idToken: `token-${email}` })
        : responder(400, { error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" } });
    }
    const m = url.pathname.match(/^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents(.*)$/);
    if (!m) return responder(404, {});
    if (!req.headers.authorization?.startsWith("Bearer token-")) return responder(403, { error: { status: "PERMISSION_DENIED" } });
    if (denegar) return responder(403, { error: { status: "PERMISSION_DENIED" } }); // como si las reglas rechazaran a la cuenta robot

    const nombreCompleto = (coleccion, id) => `projects/${m[1]}/databases/(default)/documents/${coleccion}/${id}`;
    const documento = (coleccion, id) => ({ name: nombreCompleto(coleccion, id), fields: codificarCampos(datos[coleccion][id]) });
    const ruta = m[2];

    if (ruta === ":runQuery" && req.method === "POST") {
      const consulta = JSON.parse(cuerpo).structuredQuery;
      const coleccion = consulta.from[0].collectionId;
      const filtros = consulta.where.compositeFilter ? consulta.where.compositeFilter.filters : [consulta.where];
      const cumple = (doc) => filtros.every(({ fieldFilter: f }) => {
        const valor = doc[f.field.fieldPath];
        const buscado = Object.values(f.value)[0];
        const esperado = "integerValue" in f.value ? Number(buscado) : buscado;
        if (f.op === "EQUAL") return valor === esperado;
        if (f.op === "GREATER_THAN_OR_EQUAL") return valor >= esperado;
        if (f.op === "LESS_THAN") return valor < esperado;
        throw new Error(`Operador no soportado: ${f.op}`);
      });
      const ids = Object.keys(datos[coleccion] ?? {}).filter((id) => cumple(datos[coleccion][id]));
      return responder(200, ids.length ? ids.map((id) => ({ document: documento(coleccion, id), readTime: "x" })) : [{ readTime: "x" }]);
    }

    const [, coleccion, id] = ruta.split("/");
    if (!id && req.method === "GET") {
      const ids = Object.keys(datos[coleccion] ?? {});
      const desde = Number(url.searchParams.get("pageToken") ?? 0);
      const pagina = ids.slice(desde, desde + tamanoPagina);
      const siguiente = desde + tamanoPagina < ids.length ? String(desde + tamanoPagina) : undefined;
      return responder(200, { documents: pagina.map((i) => documento(coleccion, i)), nextPageToken: siguiente });
    }
    if (!id && req.method === "POST") {
      const nuevo = url.searchParams.get("documentId");
      datos[coleccion] ??= {};
      if (datos[coleccion][nuevo]) return responder(409, { error: { status: "ALREADY_EXISTS" } });
      datos[coleccion][nuevo] = decodificarCampos(JSON.parse(cuerpo).fields);
      return responder(200, documento(coleccion, nuevo));
    }
    if (id && req.method === "GET") {
      return datos[coleccion]?.[id] ? responder(200, documento(coleccion, id)) : responder(404, { error: { status: "NOT_FOUND" } });
    }
    if (id && req.method === "PATCH") {
      if (!datos[coleccion]?.[id]) return responder(404, { error: { status: "NOT_FOUND" } });
      const cambios = decodificarCampos(JSON.parse(cuerpo).fields);
      for (const campo of url.searchParams.getAll("updateMask.fieldPaths")) datos[coleccion][id][campo] = cambios[campo];
      return responder(200, documento(coleccion, id));
    }
    return responder(404, {});
  });
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const url = `http://127.0.0.1:${servidor.address().port}`;
  return { url, datos, pedidos, cerrar: () => new Promise((r) => servidor.close(r)) };
}

/** Servidor SMTP mínimo (sin cifrado) que guarda en `mensajes` el texto crudo de cada correo recibido. */
export async function iniciarSmtpFalso({ usuario = "cartero@ejemplo.com", clave = "clave-smtp" } = {}) {
  const mensajes = [];
  const servidor = net.createServer((socket) => {
    let buffer = "";
    let modo = "comandos"; // comandos | datos | usuario | clave
    let actual = { para: [], de: "", datos: "" };
    let autenticado = false;
    socket.write("220 smtp-falso ESMTP\r\n");
    socket.on("data", (trozo) => {
      buffer += trozo.toString("latin1");
      for (;;) {
        if (modo === "datos") {
          const fin = buffer.indexOf("\r\n.\r\n");
          if (fin < 0) return;
          actual.datos = buffer.slice(0, fin);
          buffer = buffer.slice(fin + 5);
          mensajes.push({ ...actual });
          actual = { para: [], de: "", datos: "" };
          modo = "comandos";
          socket.write("250 2.0.0 recibido\r\n");
          continue;
        }
        const salto = buffer.indexOf("\r\n");
        if (salto < 0) return;
        const linea = buffer.slice(0, salto);
        buffer = buffer.slice(salto + 2);
        const decodificar = (b64) => Buffer.from(b64, "base64").toString();
        if (modo === "usuario") { modo = "clave"; actual.usuarioLogin = decodificar(linea); socket.write("334 UGFzc3dvcmQ6\r\n"); continue; }
        if (modo === "clave") {
          modo = "comandos";
          autenticado = actual.usuarioLogin === usuario && decodificar(linea) === clave;
          socket.write(autenticado ? "235 2.7.0 autenticado\r\n" : "535 5.7.8 credenciales invalidas\r\n");
          continue;
        }
        const comando = linea.toUpperCase();
        if (comando.startsWith("EHLO") || comando.startsWith("HELO")) socket.write("250-smtp-falso\r\n250 AUTH LOGIN\r\n");
        else if (comando === "AUTH LOGIN") { modo = "usuario"; socket.write("334 VXNlcm5hbWU6\r\n"); }
        else if (comando.startsWith("MAIL FROM")) { if (!autenticado) socket.write("530 5.7.0 falta autenticar\r\n"); else { actual.de = linea; socket.write("250 ok\r\n"); } }
        else if (comando.startsWith("RCPT TO")) { actual.para.push(linea.slice(8).replace(/[<>]/g, "").trim()); socket.write("250 ok\r\n"); }
        else if (comando === "DATA") { modo = "datos"; socket.write("354 siga\r\n"); }
        else if (comando === "QUIT") { socket.write("221 chau\r\n"); socket.end(); }
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  return { puerto: servidor.address().port, mensajes, usuario, clave, cerrar: () => new Promise((r) => servidor.close(r)) };
}
