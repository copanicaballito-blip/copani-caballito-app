// Conexión a la base de datos (Firestore) desde un programa, por la API REST. No usa claves de administrador: entra
// con una cuenta "robot" (email y contraseña), igual que una persona, y las reglas de seguridad también le aplican.

const URL_LOGIN = () => process.env.AUTH_BASE ?? "https://identitytoolkit.googleapis.com";
const URL_FIRESTORE = () => process.env.FIRESTORE_BASE ?? "https://firestore.googleapis.com";

// ---- Valores de Firestore <-> valores comunes ----------------------------------------------

/** Un valor de Firestore ({ stringValue: "x" }, { integerValue: "5" }…) a un valor común. */
export function decodificar(valor) {
  if ("stringValue" in valor) return valor.stringValue;
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return valor.doubleValue;
  if ("booleanValue" in valor) return valor.booleanValue;
  if ("nullValue" in valor) return null;
  if ("timestampValue" in valor) return valor.timestampValue;
  if ("arrayValue" in valor) return (valor.arrayValue.values ?? []).map(decodificar);
  if ("mapValue" in valor) return decodificarCampos(valor.mapValue.fields ?? {});
  throw new Error(`Tipo de dato de Firestore no soportado: ${Object.keys(valor)[0]}`);
}

export function decodificarCampos(campos) {
  return Object.fromEntries(Object.entries(campos).map(([nombre, valor]) => [nombre, decodificar(valor)]));
}

/** Un documento de Firestore a un objeto común, con su `id` (el nombre del documento). */
export function decodificarDocumento(documento) {
  return { id: documento.name.split("/").pop(), ...decodificarCampos(documento.fields ?? {}) };
}

/** Un valor común al formato de Firestore. */
export function codificar(valor) {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === "string") return { stringValue: valor };
  if (typeof valor === "boolean") return { booleanValue: valor };
  if (typeof valor === "number") return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(codificar) } };
  if (typeof valor === "object") return { mapValue: { fields: codificarCampos(valor) } };
  throw new Error(`No se puede guardar un dato de tipo ${typeof valor}`);
}

export function codificarCampos(objeto) {
  return Object.fromEntries(Object.entries(objeto).map(([nombre, valor]) => [nombre, codificar(valor)]));
}

// ---- Filtros --------------------------------------------------------------------------------

export const igual = (campo, valor) => ({ campo, op: "EQUAL", valor });
export const mayorOIgual = (campo, valor) => ({ campo, op: "GREATER_THAN_OR_EQUAL", valor });
export const menor = (campo, valor) => ({ campo, op: "LESS_THAN", valor });

const filtroDeFirestore = (f) => ({ fieldFilter: { field: { fieldPath: f.campo }, op: f.op, value: codificar(f.valor) } });

// ---- Cliente --------------------------------------------------------------------------------

/** Mensaje claro para los errores más comunes (sin datos sensibles). */
function errorDeApi(que, estado, cuerpo) {
  const detalle = cuerpo?.error?.message ?? cuerpo?.error?.status ?? "";
  let ayuda = "";
  if (estado === 403) ayuda = " Falta actualizar las reglas de Firebase o agregar el email de la cuenta robot en `autorizado`.";
  if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD/.test(detalle)) ayuda = " Revisá ROBOT_EMAIL y ROBOT_CLAVE (el usuario tiene que existir en Firebase → Authentication).";
  if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(detalle)) ayuda = " Falta activar el ingreso con email y contraseña en Firebase.";
  const error = new Error(`${que}: HTTP ${estado}${detalle ? ` (${String(detalle).slice(0, 80)})` : ""}.${ayuda}`);
  error.estado = estado;
  return error;
}

/** Inicia sesión como la cuenta robot y devuelve las operaciones sobre la base. */
export async function conectar({ apiKey, proyecto, email, clave }) {
  const login = await fetch(`${URL_LOGIN()}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: clave, returnSecureToken: true }),
  });
  const sesion = await login.json().catch(() => ({}));
  if (!login.ok) throw errorDeApi("No se pudo iniciar sesión con la cuenta robot", login.status, sesion);

  const base = `${URL_FIRESTORE()}/v1/projects/${encodeURIComponent(proyecto)}/databases/(default)/documents`;
  const pedir = async (ruta, opciones = {}) => {
    const respuesta = await fetch(base + ruta, {
      ...opciones,
      headers: { Authorization: `Bearer ${sesion.idToken}`, "Content-Type": "application/json" },
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, estado: respuesta.status, cuerpo };
  };

  return {
    /** Todos los documentos de una colección. */
    async listar(coleccion) {
      const documentos = [];
      let pagina = "";
      do {
        const r = await pedir(`/${coleccion}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`);
        if (!r.ok) throw errorDeApi(`No se pudo leer "${coleccion}"`, r.estado, r.cuerpo);
        documentos.push(...(r.cuerpo.documents ?? []).map(decodificarDocumento));
        pagina = r.cuerpo.nextPageToken ?? "";
      } while (pagina);
      return documentos;
    },

    /** Los documentos que cumplen todos los filtros (igual / mayorOIgual / menor). */
    async consultar(coleccion, filtros, limite = 500) {
      const where = filtros.length === 1
        ? filtroDeFirestore(filtros[0])
        : { compositeFilter: { op: "AND", filters: filtros.map(filtroDeFirestore) } };
      const r = await pedir(":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coleccion }], where, limit: limite } }),
      });
      if (!r.ok) throw errorDeApi(`No se pudo consultar "${coleccion}"`, r.estado, r.cuerpo);
      return (r.cuerpo ?? []).filter((x) => x.document).map((x) => decodificarDocumento(x.document));
    },

    async existe(coleccion, id) {
      const r = await pedir(`/${coleccion}/${encodeURIComponent(id)}`);
      if (r.estado === 404) return false;
      if (!r.ok) throw errorDeApi(`No se pudo leer "${coleccion}/${id}"`, r.estado, r.cuerpo);
      return true;
    },

    /** Crea un documento con ese id. Devuelve false si ya existía. */
    async crear(coleccion, id, datos) {
      const r = await pedir(`/${coleccion}?documentId=${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ fields: codificarCampos(datos) }),
      });
      if (r.estado === 409) return false;
      if (!r.ok) throw errorDeApi(`No se pudo guardar "${coleccion}/${id}"`, r.estado, r.cuerpo);
      return true;
    },

    /** Cambia solo esos campos de un documento que ya existe. */
    async actualizar(coleccion, id, datos) {
      const mascara = Object.keys(datos).map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join("&");
      const r = await pedir(`/${coleccion}/${encodeURIComponent(id)}?${mascara}&currentDocument.exists=true`, {
        method: "PATCH",
        body: JSON.stringify({ fields: codificarCampos(datos) }),
      });
      if (!r.ok) throw errorDeApi(`No se pudo actualizar "${coleccion}/${id}"`, r.estado, r.cuerpo);
    },
  };
}
