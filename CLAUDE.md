# Copani Caballito · Gastos

App web (PWA) de gastos por pagar de Copani Caballito. La usa el equipo: 3 personas (1 Android, 2 iPhone).
Por eso es web y no un APK: el método de Lavanda Suite (APK) solo sirve en Android.

## Qué hace (pedido del dueño)
- Lista los gastos por pagar con su fecha de vencimiento.
- Cada gasto: descripción, monto, fecha de pago y estado.
- Estados y colores: Estimado (amarillo), A pagar (naranja), Pagado (verde), Vencido (rojo).
- Se cargan gastos nuevos y se cambia el estado.
- Algunos gastos admiten pagos parciales: se suman para mostrar total pagado y saldo a pagar.
- Forma de pago de cada gasto (opcional): Manual - MP, Débito Automático - MP, Manual - Galicia,
  Débito Automático - Galicia, Efectivo.
- Filtro por mes: se elige el mes y se ve lo que vence ese mes. Los impagos de meses anteriores
  pasan al mes siguiente, en rojo, hasta que se pagan.
- Rubro de cada gasto (opcional): Productos, Servicios, Alquiler, Compra insumos, Tarjeta, Gastos Bancarios,
  Impuesto, Socios, Préstamos, Empleados.
- Lupa en la barra: busca por descripción, rubro, forma de pago o monto, y filtra por rubro.

## Decisiones
- "Vencido" NO se elige: se calcula (no pagado + fecha de pago anterior a hoy). El dueño dijo "tres estados"
  y listó cuatro; se interpretó así. Si lo quiere elegible a mano, cambiar `estadoEfectivo` en `docs/logica.js`.
- Estado guardado: `estimado` | `a_pagar` | `pagado`. "Pagado" a mano cuenta el monto completo;
  un pago parcial que completa el monto pasa el gasto a "Pagado" solo (`agregarPago`).
- Forma de pago: campo `formaPago` del GASTO (claves `manual_mp`, `debito_mp`, `manual_galicia`,
  `debito_galicia`, `efectivo`; ver `FORMAS_PAGO` en `docs/logica.js`). Es opcional: "Sin definir" = el campo
  no se guarda. Se interpretó "los pagos" del dueño como los gastos por pagar; los pagos parciales no
  llevan forma de pago propia (si se quiere, agregar `formaPago` dentro de cada elemento de `pagos`).
  Las reglas de Firestore (`firebase/firestore.rules`) deben permitir ese campo: hay que republicarlas.
- Rubro: campo `rubro` del gasto (claves `productos`, `servicio`, `alquiler`, `compra_insumos`, `tarjeta`,
  `gasto_bancario`, `impuesto`, `socios`, `prestamos`, `empleados`; ver `RUBROS` en `docs/logica.js`).
  Opcional: "Sin rubro" = el campo no se guarda. Renombrar un rubro = cambiar SOLO su etiqueta en
  `ETIQUETAS_RUBRO` (las claves guardadas en la base no se tocan: "Servicios" sigue siendo la clave `servicio`
  y "Gastos Bancarios" la clave `gasto_bancario`).
  Las reglas de Firestore solo lo validan como texto de hasta 40 letras (la lista vive en la app), así que
  agregar un rubro nuevo = editar `RUBROS`/`ETIQUETAS_RUBRO` en `logica.js`, sin republicar reglas.
- Lupa (`coincideBusqueda`, `coincideRubro` en `docs/logica.js`, con tests): todas las palabras escritas deben
  estar (en cualquier orden, sin tildes ni mayúsculas) en descripción, rubro, forma de pago o monto.
  La búsqueda y el rubro se COMBINAN con el mes elegido y el estado; si no hay resultados en el mes pero sí en
  otros, se ofrece "Buscar en todos los meses". Los totales del resumen se calculan sobre lo filtrado
  (mes + búsqueda + rubro, sin el filtro de estado). Al cerrar la lupa se borra la búsqueda.
  El campo de búsqueda vive fuera de `#contenido` para no perder el foco al redibujar la lista.
- Filtro por mes (`mesesDisponibles`, `gastosDelMes`, `totalesDelMes` en `docs/logica.js`, con tests):
  empieza en el mes actual; también hay "Todos los meses". Un mes muestra lo que vence en él más los
  impagos de meses anteriores ("arrastrados", siempre vencidos = rojo). El arrastre llega hasta el mes actual:
  en meses futuros solo se ve lo que vence ese mes. En "Pagado" del resumen no se cuenta lo arrastrado
  (esos pagos parciales fueron de otro mes). La lista de meses va del más antiguo con gastos hasta el mes
  siguiente al actual (o el último con gastos); al guardar un gasto la vista salta a su mes.
- Montos en pesos enteros, sin decimales. Fechas como texto "aaaa-mm-dd".
- Sin build ni dependencias: HTML + JS (módulos ES) + CSS en `docs/`. Se publica con GitHub Pages
  (rama `main`, carpeta `/docs`). Se instala desde el navegador (manifest + íconos PNG; sin service worker).
- Datos: Firebase (Auth con email y contraseña + Firestore, plan Spark). Se eligió email y contraseña y no
  Google porque los popups/redirect de Google fallan seguido en apps de iPhone agregadas al inicio.
  Los 3 usuarios se crean a mano en la consola; la autorización real la hacen las reglas (`firebase/firestore.rules`),
  no el alta de usuarios: una fuente secundaria indica que desactivar el sign-up en la consola no frena el alta por API
  (no verificado en la doc oficial), así que no se depende de eso.
- Login: los mensajes de error son específicos (`mensajeLogin` en `docs/app.js`); si el código es desconocido se
  muestra entre paréntesis para poder diagnosticar. "Cuenta no autorizada" muestra con qué email se ingresó
  (causa típica: ese email no está igual, en minúsculas, en las reglas, o las reglas no se publicaron).
  "Olvidé mi contraseña" usa `sendPasswordResetEmail` de Firebase Auth. Con la protección de enumeración de
  emails de Firebase, usuario inexistente y contraseña mala dan el mismo error (`auth/invalid-credential`).
- Repo público: los emails reales NO van en el repo (solo en las reglas publicadas en la consola).
  `docs/firebase-config.js` no es secreto y sí va.
- SDK de Firebase por CDN, versión 12.19.0 (la misma que usa el formulario web de Lavanda Suite).
- Sin `apiKey` en `docs/firebase-config.js` la app corre en modo demo (datos de ejemplo en localStorage).

## Archivos
- `docs/logica.js`: reglas puras (estados, saldos, pagos, totales, orden, formato, validación). Con tests.
- `docs/datos.js`: acceso a datos (modo nube y modo demo, misma interfaz).
- `docs/app.js`, `docs/index.html`, `docs/estilos.css`: pantallas.
- `firebase/firestore.rules`: reglas (se publican a mano; con emails de ejemplo).
- `test/logica.test.js`: tests con el runner de Node (`npm test`, Node 22, sin dependencias).

## Comandos
- Tests: `npm test`
- Ver la app local: `python3 -m http.server 8765 --directory docs` y abrir http://localhost:8765
- En el entorno web de Claude, Playwright sirve para probar la app en modo demo.

## Pendiente
- Firebase: proyecto `copani-caballito-v02`; su configuración ya está en `docs/firebase-config.js`
  (la app corre en modo nube). Falta confirmar con el dueño: 3 usuarios creados en Authentication, base
  Firestore `(default)` creada y reglas publicadas con los emails reales.
- Probar con Firebase real: el login y las reglas no se pudieron probar desde el entorno web de Claude
  (no llega a Firebase ni a gstatic). El flujo se probó con un Firebase simulado (Playwright, rutas a gstatic).
- GitHub Pages hoy publica desde la rama `chore/base-del-repo`, carpeta `/docs` (`main` no tiene la app todavía).
  Al fusionar a `main`, cambiar la fuente en Settings > Pages.
- Probar en un iPhone real (instalación desde Safari).
- Opcional: restringir la API key de Firebase por dominio (referrer) en Google Cloud Console.
