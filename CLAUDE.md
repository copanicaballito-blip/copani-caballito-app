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
- Reporte mensual en Excel descargable. Cada mes terminado se guarda solo y queda congelado; el mes siguiente
  arranca su propio reporte (el mes en curso se descarga siempre actualizado).
- Gastos recurrentes (Alquiler, Empleados, Expensas…): se repiten todos los meses con los mismos datos; al editar
  un mes, el cambio vale para ese mes y los siguientes (los anteriores no cambian).
- Rubro de cada gasto (opcional): Productos, Servicios, Alquiler, Compra insumos, Tarjeta, Gastos Bancarios,
  Impuesto, Socios, Préstamos, Empleados.
- Lupa en la barra: busca por descripción, rubro, forma de pago o monto, y filtra por rubro.
- Las tarjetas de los gastos que vencen HOY (y siguen sin pagar) se resaltan con un celeste claro; el resto queda en blanco.

## Decisiones
- "Vencido" NO se elige: se calcula (no pagado + fecha de pago anterior a hoy). El dueño dijo "tres estados"
  y listó cuatro; se interpretó así. Si lo quiere elegible a mano, cambiar `estadoEfectivo` en `docs/logica.js`.
- Estado guardado: `estimado` | `a_pagar` | `pagado`. "Pagado" a mano cuenta el monto completo;
  un pago parcial que completa el monto pasa el gasto a "Pagado" solo (`agregarPago`).
- Gastos recurrentes (`logica.js`, sección "Gastos recurrentes", con tests; colección `recurrentes`): una SERIE por
  gasto, guardada una sola vez: `desde`/`hasta` (meses "aaaa-mm"), `cambios` (plantilla: descripcion, monto,
  `dia`, rubro, formaPago, `estado` inicial, vigente desde cada mes en adelante) y `meses` (por mes: `estado`,
  `pagos` y, si estaba pagado cuando se cambió la plantilla de un mes anterior, `datos` = copia de lo que se pagó).
  Los gastos de cada mes (instancias, id `<serieId>~<aaaa-mm>`, con `recurrente: true`, `serieId`, `mes`) se
  CALCULAN (`expandirRecurrentes`) desde el primer mes hasta el mes siguiente al actual: no se guardan, así no
  hay copias duplicadas ni hace falta ningún proceso que las cree. `app.js` junta `unicos` + instancias en `gastos`
  (`mezclar()`), por eso mes, arrastre, lupa, rubros y totales funcionan igual para los dos tipos.
  Reglas del producto: (1) editar un mes = `aplicarEdicion`: agrega una plantilla desde ese mes y BORRA las
  posteriores ("y así sucesivamente"); los meses siguientes ya pagados guardan `datos` para no reescribir lo pagado;
  (2) estado y pagos son de cada mes (`conOcurrencia`; en la nube `updateDoc` con `FieldPath("meses", mes)`, para no
  pisar lo que otra persona cambie en otro mes); un mes que vuelve de Pagado a impago vuelve a seguir la plantilla;
  (3) cada mes nuevo nace con el estado inicial de la plantilla (Estimado o A pagar; "Pagado" no es inicial);
  (4) en la edición de un recurrente la fecha solo puede cambiar de día dentro de su mes; un día 31 cae el último
  día de los meses cortos; (5) "Dejar de repetir" fija `hasta` en ese mes; "Eliminar todo" borra la serie entera
  (todos los meses); no hay "eliminar solo un mes" ni "editar solo este mes" (no se pidió: agregarlo si hace falta);
  (6) un gasto común se convierte en recurrente tildando "Se repite todos los meses" al editarlo
  (`convertirEnRecurrente`: `writeBatch` que crea la serie y borra el gasto), y no se puede revertir desde la app.
  Si la colección `recurrentes` deniega (reglas sin actualizar), NO es un error fatal: se muestra un aviso rojo y los
  gastos comunes siguen funcionando (`errorRecurrentes` vs `errorNube`).
- Reporte mensual en Excel (`docs/reporte.js` arma el libro, `docs/xlsx.js` es un escritor .xlsx propio sin
  dependencias: ZIP sin comprimir + XML con estilos; botón de la tabla en la barra → cuadro "Reportes mensuales").
  Tres hojas: Resumen (del mes / impagos arrastrados / total; por estado, rubro y forma de pago), Gastos (detalle,
  filtros, fila de Total con SUBTOTAL que se recalcula al filtrar, fechas reales de Excel, colores de estado) y Pagos
  (pagos parciales). Las "filas" de un mes (`filasDelMes`, `resumenDeFilas` en `logica.js`, con tests) son lo mismo
  que muestra la pantalla de ese mes (los que vencen + impagos arrastrados), ya con el estado calculado.
  MES EN CURSO: se arma al descargar, con lo que hay en ese momento. MES TERMINADO: se guarda UNA vez una copia
  congelada en la colección `cierres` (documento = `aaaa-mm`: `{ mes, cerradoEn, filas }`) y de ahí sale siempre el
  mismo Excel (el archivo es idéntico byte a byte), aunque después se paguen o editen gastos de ese mes.
  CUÁNDO SE CIERRA: no hay servidor que corra a medianoche del último día (las funciones programadas y Cloud Storage
  exigen el plan Blaze; el proyecto usa Spark): `cerrarMesesTerminados()` (en `app.js`) cierra cada mes ya terminado
  sin cierre la primera vez que alguien abre la app después de que el mes terminó (también al volver al primer plano y
  cada 10 min). Se cierra el mes terminado y no el último día para incluir todos los cambios de ese día. El estado
  guardado es el del momento del cierre (no se puede reconstruir el de la medianoche: marcar "Pagado" no guarda fecha).
  Solo cierra con las 3 colecciones (gastos, recurrentes, cierres) ya leídas y sin errores, para no guardar un mes al
  que le falten los gastos recurrentes que todavía no cargaron. Las reglas solo permiten crear el cierre (no
  modificarlo ni borrarlo desde la app; para corregir uno, borrarlo a mano en la consola de Firebase y se vuelve a
  generar). Si dos celulares cierran el mismo mes a la vez, el segundo recibe permission-denied y se ignora. Un mes
  terminado sin gastos no se cierra. Al estrenar la función se cierran de una vez todos los meses anteriores con
  datos (con el estado de ese momento). Descarga: en iPhone/iPad se abre "Compartir" (para guardar en Archivos; la
  descarga directa suele perderse con la app instalada); en el resto, descarga normal. Si la colección `cierres`
  deniega (reglas sin actualizar) NO es fatal: aviso rojo (`#aviso-reglas`), el mes en curso se sigue pudiendo descargar.
  Verificación de los archivos: se abrieron con openpyxl y con LibreOffice (headless) en el entorno de Claude.
- Forma de pago: campo `formaPago` del GASTO (claves `manual_mp`, `debito_mp`, `manual_galicia`,
  `debito_galicia`, `efectivo`; ver `FORMAS_PAGO` en `docs/logica.js`). Es opcional: "Sin definir" = el campo
  no se guarda. Se interpretó "los pagos" del dueño como los gastos por pagar; los pagos parciales no
  llevan forma de pago propia (si se quiere, agregar `formaPago` dentro de cada elemento de `pagos`).
  Las reglas de Firestore (`firebase/firestore.rules`) deben permitir ese campo: hay que republicarlas.
- Rubro: campo `rubro` del gasto (claves `productos`, `servicio`, `alquiler`, `compra_insumos`, `tarjeta`,
  `gasto_bancario`, `impuesto`, `socios`, `prestamos`, `empleados`; ver `RUBROS` en `docs/logica.js`).
  Opcional: "Sin rubro" = el campo no se guarda. Los desplegables (formulario y lupa) muestran los rubros
  en orden alfabético por nombre (`rubrosOrdenados`), así que un rubro nuevo queda en su lugar solo; la
  forma de pago, en cambio, va en el orden que pidió el dueño. Renombrar un rubro = cambiar SOLO su etiqueta en
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
- Resaltado de hoy (`venceHoy` en `logica.js`, clase CSS `.vence-hoy`, con tests): solo `fechaPago === hoy` y no pagado; un gasto de hoy
  ya pagado NO se resalta (tampoco dice "Vence hoy"). Aplica por igual a gastos comunes y a meses de gastos recurrentes; los
  impagos arrastrados de meses anteriores no (su fecha no es hoy). El borde izquierdo conserva el color del estado y el texto
  "Vence hoy" va en negrita azul (no depende solo del color). Cada minuto `app.js` detecta el cambio de día (`diaMostrado`) y
  redibuja, para que el resaltado y los textos "Vence hoy"/"Venció ayer" sigan bien si la app queda abierta pasada la medianoche.
- Ícono de la app = el logo de Copani Caballito (PNG cuadrado 1920x1920 de fondo rojo liso #E62822, original en
  `assets/logo-original.png`, que Pages NO publica). Se generaron con Pillow desde ese original: `docs/logo-180.png`
  (iPhone, `apple-touch-icon`), `logo-192.png` y `logo-512.png` (logo completo, `purpose: any`) y
  `logo-maskable-192.png` / `-512.png` (logo escalado al 82 % centrado sobre el mismo rojo, `purpose: maskable`: Android
  recorta con círculo/cuadrado redondeado y el dibujo original llega al 47 % del ancho desde el centro; con el margen
  llega al 39 %, dentro de la zona segura del 40 %). `background_color` (pantalla de arranque en Android) = el rojo del
  logo; `theme_color` sigue marrón porque es el color de la barra de la app. Si se cambia el logo: regenerar los 5 PNG con
  esos tamaños y el mismo margen, y cambiar los nombres de archivo para evitar que el navegador muestre el ícono viejo en
  caché. `test/manifiesto.test.js` verifica que cada ícono exista y mida lo que declara.
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
- `docs/reporte.js` y `docs/xlsx.js`: el Excel mensual (diseño del reporte y escritor de archivos .xlsx).
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
