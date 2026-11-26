// Acceso a los datos. Dos modos con la misma interfaz:
//  - "nube": Firebase (login con email y contraseña + Firestore). Se usa si firebase-config.js tiene apiKey.
//  - "demo": datos de ejemplo en este navegador, sin login. Se usa mientras no haya apiKey.
//
// Dos colecciones: `gastos` (gastos de una sola vez) y `recurrentes` (una serie por cada gasto que se
// repite todos los meses; ver "Gastos recurrentes" en logica.js).
import { firebaseConfig } from "./firebase-config.js";
import { hoyISO, mesDe, crearSerie } from "./logica.js";

const VERSION_FIREBASE = "12.19.0"; // la misma que usa el formulario web de Lavanda Suite
const CLAVE_DEMO = "copani-demo-gastos-v1";
const CLAVE_DEMO_REC = "copani-demo-recurrentes-v1";

export async function crearDatos() {
  return firebaseConfig.apiKey ? crearNube() : crearDemo();
}

// Firestore no acepta campos "undefined": se limpian dando una vuelta por JSON.
const limpio = (objeto) => JSON.parse(JSON.stringify(objeto));

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
  const coleccionRec = fs.collection(db, "recurrentes");
  const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
    restablecerClave(email) {
      return auth.sendPasswordResetEmail(a, email);
    },

    // Gastos de una sola vez
    escucharGastos(cb, cbError) {
      return fs.onSnapshot(coleccion, (snap) => cb(lista(snap)), cbError);
    },
    async guardar(gasto) {
      const { id, ...datos } = gasto; // el id es el nombre del documento, no un campo
      const ref = id ? fs.doc(db, "gastos", id) : fs.doc(coleccion);
      await fs.setDoc(ref, limpio(datos));
      return ref.id;
    },
    borrar(id) {
      return fs.deleteDoc(fs.doc(db, "gastos", id));
    },

    // Gastos recurrentes (una serie por gasto)
    escucharRecurrentes(cb, cbError) {
      return fs.onSnapshot(coleccionRec, (snap) => cb(lista(snap)), cbError);
    },
    async guardarSerie(serie) {
      const { id, ...datos } = serie;
      const ref = id ? fs.doc(db, "recurrentes", id) : fs.doc(coleccionRec);
      await fs.setDoc(ref, limpio(datos));
      return ref.id;
    },
    /** Guarda solo el estado y los pagos de un mes: no pisa lo que otra persona cambie en otros meses. */
    guardarOcurrencia(serieId, mes, ocurrencia) {
      return fs.updateDoc(fs.doc(db, "recurrentes", serieId), new fs.FieldPath("meses", mes), limpio(ocurrencia));
    },
    borrarSerie(id) {
      return fs.deleteDoc(fs.doc(db, "recurrentes", id));
    },
    /** Pasa un gasto de una sola vez a recurrente: crea la serie y borra el gasto, todo junto. */
    async convertirEnRecurrente(gastoId, serie) {
      const { id, ...datos } = serie;
      const lote = fs.writeBatch(db);
      lote.set(fs.doc(coleccionRec), limpio(datos));
      lote.delete(fs.doc(db, "gastos", gastoId));
      await lote.commit();
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
    { id: "ej1", descripcion: "Alquiler (ejemplo)", monto: 450000, fechaPago: desdeHoy(-3), estado: "a_pagar", rubro: "alquiler", formaPago: "manual_galicia", pagos: [{ fecha: desdeHoy(-10), monto: 150000 }] },
    { id: "ej2", descripcion: "Proveedor (ejemplo)", monto: 120000, fechaPago: desdeHoy(4), estado: "a_pagar", rubro: "compra_insumos", formaPago: "manual_mp", pagos: [] },
    { id: "ej3", descripcion: "Electricidad (ejemplo)", monto: 38000, fechaPago: desdeHoy(12), estado: "estimado", rubro: "servicio", formaPago: "debito_galicia", pagos: [] },
    { id: "ej4", descripcion: "Internet (ejemplo)", monto: 25000, fechaPago: desdeHoy(-8), estado: "pagado", rubro: "servicio", formaPago: "debito_mp", pagos: [{ fecha: desdeHoy(-8), monto: 25000 }] },
  ];
}

function ejemplosRecurrentes() {
  const mesPasado = new Date();
  mesPasado.setDate(1);
  mesPasado.setMonth(mesPasado.getMonth() - 1);
  const fecha = `${mesDe(hoyISO(mesPasado))}-10`;
  const serie = crearSerie({
    descripcion: "Expensas (ejemplo)", monto: 85000, fechaPago: fecha, estado: "a_pagar",
    rubro: "servicio", formaPago: "debito_galicia", pagos: [],
  });
  return [{ id: "rec1", ...serie }];
}

function crearDemo() {
  const leer = (clave) => {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  };
  const guardadoGastos = leer(CLAVE_DEMO);
  const guardadoRec = leer(CLAVE_DEMO_REC);
  let gastos = guardadoGastos ? JSON.parse(guardadoGastos) : ejemplos();
  // Los ejemplos recurrentes solo aparecen la primera vez (si ya había gastos guardados, no se agregan).
  let series = guardadoRec ? JSON.parse(guardadoRec) : guardadoGastos ? [] : ejemplosRecurrentes();

  const oyentes = new Set();
  const oyentesRec = new Set();
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const cambiaron = () => {
    try {
      localStorage.setItem(CLAVE_DEMO, JSON.stringify(gastos));
      localStorage.setItem(CLAVE_DEMO_REC, JSON.stringify(series));
    } catch {
      // sin almacenamiento: los datos de la demo viven solo mientras la página está abierta
    }
    oyentes.forEach((cb) => cb(copia(gastos)));
    oyentesRec.forEach((cb) => cb(copia(series)));
  };
  const nuevoId = (prefijo) => `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return {
    modo: "demo",
    alCambiarSesion(cb) {
      cb({ email: "demo" });
    },
    async ingresar() {},
    async salir() {},
    async restablecerClave() {},

    escucharGastos(cb) {
      oyentes.add(cb);
      cb(copia(gastos));
      return () => oyentes.delete(cb);
    },
    async guardar(gasto) {
      const { id, ...datos } = gasto;
      const idFinal = id ?? nuevoId("demo");
      gastos = [...gastos.filter((g) => g.id !== idFinal), { id: idFinal, ...datos }];
      cambiaron();
      return idFinal;
    },
    async borrar(id) {
      gastos = gastos.filter((g) => g.id !== id);
      cambiaron();
    },

    escucharRecurrentes(cb) {
      oyentesRec.add(cb);
      cb(copia(series));
      return () => oyentesRec.delete(cb);
    },
    async guardarSerie(serie) {
      const { id, ...datos } = serie;
      const idFinal = id ?? nuevoId("rec");
      series = [...series.filter((s) => s.id !== idFinal), { id: idFinal, ...copia(datos) }];
      cambiaron();
      return idFinal;
    },
    async guardarOcurrencia(serieId, mes, ocurrencia) {
      series = series.map((s) => (s.id === serieId ? { ...s, meses: { ...s.meses, [mes]: copia(ocurrencia) } } : s));
      cambiaron();
    },
    async borrarSerie(id) {
      series = series.filter((s) => s.id !== id);
      cambiaron();
    },
    async convertirEnRecurrente(gastoId, serie) {
      const { id, ...datos } = serie;
      gastos = gastos.filter((g) => g.id !== gastoId);
      series = [...series, { id: nuevoId("rec"), ...copia(datos) }];
      cambiaron();
    },
  };
}
