# Copani Caballito · Gastos

App web (PWA) de gastos por pagar de Copani Caballito. La usa el equipo: 3 personas (1 Android, 2 iPhone).
Por eso es web y no un APK: el método de Lavanda Suite (APK) solo sirve en Android.

## Qué hace (pedido del dueño)
- Lista los gastos por pagar con su fecha de vencimiento.
- Cada gasto: descripción, monto, fecha de pago y estado.
- Estados y colores: Estimado (amarillo), A pagar (naranja), Pagado (verde), Vencido (rojo).
- Se cargan gastos nuevos y se cambia el estado.
- Algunos gastos admiten pagos parciales: se suman para mostrar total pagado y saldo a pagar.

## Decisiones
- "Vencido" NO se elige: se calcula (no pagado + fecha de pago anterior a hoy). El dueño dijo "tres estados"
  y listó cuatro; se interpretó así. Si lo quiere elegible a mano, cambiar `estadoEfectivo` en `docs/logica.js`.
- Estado guardado: `estimado` | `a_pagar` | `pagado`. "Pagado" a mano cuenta el monto completo;
  un pago parcial que completa el monto pasa el gasto a "Pagado" solo (`agregarPago`).
- Montos en pesos enteros, sin decimales. Fechas como texto "aaaa-mm-dd".
- Sin build ni dependencias: HTML + JS (módulos ES) + CSS en `docs/`. Se publica con GitHub Pages
  (rama `main`, carpeta `/docs`). Se instala desde el navegador (manifest + íconos PNG; sin service worker).
- Datos: Firebase (Auth con email y contraseña + Firestore, plan Spark). Se eligió email y contraseña y no
  Google porque los popups/redirect de Google fallan seguido en apps de iPhone agregadas al inicio.
  Los 3 usuarios se crean a mano en la consola; la autorización real la hacen las reglas (`firebase/firestore.rules`),
  no el alta de usuarios: una fuente secundaria indica que desactivar el sign-up en la consola no frena el alta por API
  (no verificado en la doc oficial), así que no se depende de eso.
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
- Crear el proyecto Firebase y cargar su configuración en `docs/firebase-config.js` (ver README).
- Probar con Firebase real: las reglas de Firestore y el login no se pudieron probar sin proyecto.
- Activar GitHub Pages (Settings > Pages > main, /docs).
- Probar en un iPhone real (instalación desde Safari).
