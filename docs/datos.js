// Acceso a los datos. Dos modos con la misma interfaz:
//  - "nube": Firebase (login con email y contraseña + Firestore). Se usa si firebase-config.js tiene apiKey.
//  - "demo": datos de ejemplo en este navegador, sin login. Se usa mientras no haya apiKey.
import { firebaseConfig } from "./firebase-config.js";
import { hoyISO } from "./logica.js";

const VERSION_FIREBASE = "12.19.0"; // la misma que usa el formulario web de Lavanda Suite
const CLAVE_DEMO = "copani-demo-gastos-v1";

export async function crearDatos() {
  return firebaseConfig.apiKey ? crearNube() : crearDemo();
}

// ---- Nube (Firebase) -----------------------------------------------------------------------

async function crearNube() {
  const base = `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}`;
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const db = fs.getFirestore(app);
  const coleccion = fs.collection(db, "gastos");

  return {
    modo: "nube",
    alCambiarSesion(cb) {
      auth.onAuthStateChanged(a, (u) => cb(u ? { email: u.email } : null));
    },
    ingresar(email, clave) {
      return auth.signInWithEmailAndPassword(a, email, clave);
    },
    salir() {
      return auth.signOut(a);
    },
    escucharGastos(cb, cbError) {
      return fs.onSnapshot(
        coleccion,
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        cbError,
      );
    },
    async guardar(gasto) {
      const { id, ...datos } = gasto; // el id es el nombre del documento, no un campo
      const ref = id ? fs.doc(db, "gastos", id) : fs.doc(coleccion);
      await fs.setDoc(ref, datos);
      return ref.id;
    },
    borrar(id) {
      return fs.deleteDoc(fs.doc(db, "gastos", id));
    },
  };
}

// ---- Demo (solo este navegador) ------------------------------------------------------------

function ejemplos() {
  const desdeHoy = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return hoyISO(d);
  };
  return [
    { id: "ej1", descripcion: "Alquiler (ejemplo)", monto: 450000, fechaPago: desdeHoy(-3), estado: "a_pagar", pagos: [{ fecha: desdeHoy(-10), monto: 150000 }] },
    { id: "ej2", descripcion: "Proveedor (ejemplo)", monto: 120000, fechaPago: desdeHoy(4), estado: "a_pagar", pagos: [] },
    { id: "ej3", descripcion: "Electricidad (ejemplo)", monto: 38000, fechaPago: desdeHoy(12), estado: "estimado", pagos: [] },
    { id: "ej4", descripcion: "Internet (ejemplo)", monto: 25000, fechaPago: desdeHoy(-8), estado: "pagado", pagos: [{ fecha: desdeHoy(-8), monto: 25000 }] },
  ];
}

function crearDemo() {
  let gastos;
  try {
    const guardado = localStorage.getItem(CLAVE_DEMO);
    gastos = guardado ? JSON.parse(guardado) : ejemplos();
  } catch {
    gastos = ejemplos();
  }
  const oyentes = new Set();
  const copia = () => JSON.parse(JSON.stringify(gastos));
  const cambiaron = () => {
    try {
      localStorage.setItem(CLAVE_DEMO, JSON.stringify(gastos));
    } catch {
      // sin almacenamiento: los datos de la demo viven solo mientras la página está abierta
    }
    oyentes.forEach((cb) => cb(copia()));
  };

  return {
    modo: "demo",
    alCambiarSesion(cb) {
      cb({ email: "demo" });
    },
    async ingresar() {},
    async salir() {},
    escucharGastos(cb) {
      oyentes.add(cb);
      cb(copia());
      return () => oyentes.delete(cb);
    },
    async guardar(gasto) {
      const { id, ...datos } = gasto;
      const nuevoId = id ?? `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      gastos = [...gastos.filter((g) => g.id !== nuevoId), { id: nuevoId, ...datos }];
      cambiaron();
      return nuevoId;
    },
    async borrar(id) {
      gastos = gastos.filter((g) => g.id !== id);
      cambiaron();
    },
  };
}
