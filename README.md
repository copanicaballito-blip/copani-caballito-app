# Copani Caballito · Gastos

App web para llevar los **gastos por pagar**, sus **fechas de vencimiento** y los **pagos parciales**.
Funciona igual en iPhone y Android: se abre desde el navegador y se instala en la pantalla de inicio.

## Estados

| Estado | Color | Cómo se asigna |
|---|---|---|
| Estimado | amarillo | a mano |
| A pagar | naranja | a mano |
| Pagado | verde | a mano, o solo cuando los pagos parciales completan el monto |
| Vencido | rojo | solo: pasó la fecha de pago y el gasto no está pagado |

## Reportes mensuales (Excel)

El ícono de la tabla (arriba, junto a la lupa) abre **Reportes mensuales**. Cada reporte es un Excel con tres
hojas: **Resumen** (totales por estado, rubro y forma de pago), **Gastos** (el detalle, con filtros) y **Pagos**
(los pagos parciales).

- **Mes en curso:** se descarga siempre con los datos de ese momento.
- **Meses terminados:** se guardan solos la primera vez que alguien abre la app después de que termina el mes, y
  quedan **congelados**: el Excel de un mes cerrado no cambia aunque después se modifiquen gastos. El mes siguiente
  arranca su propio reporte.
- En iPhone, al tocar **Descargar Excel** se abre "Compartir": elegí **Guardar en Archivos**.

## Gastos recurrentes

Para un gasto que se paga **todos los meses** (Alquiler, Empleados, Expensas, servicios…) se tilda
**"Se repite todos los meses"** al cargarlo, o al editarlo si ya existía. Cada mes aparece solo, con los
mismos datos. El estado (Estimado / A pagar / Pagado) y los pagos parciales son de cada mes.

- **Editar** un mes cambia ese mes y **los siguientes**; los meses anteriores no cambian. Los meses
  siguientes que ya estaban pagados tampoco (se conserva lo que se pagó).
- **Dejar de repetir:** este mes y los anteriores se conservan; desde el mes siguiente ya no aparece.
- **Eliminar todo:** borra el gasto recurrente completo, con todos sus meses.

## Gastos de hoy

Las tarjetas de los gastos que **vencen hoy** y todavía no están pagos se ven en **celeste claro** (con "Vence hoy" en
negrita). Los vencidos y los que vencen otro día quedan en blanco.

## Filtro por mes

Arriba de la lista se elige el mes (o **Todos los meses**). Se muestra lo que **vence ese mes**. Los gastos
**impagos de meses anteriores pasan al mes siguiente en rojo** hasta que se pagan.

## Forma de pago

Cada gasto puede tener una forma de pago (opcional): Manual - MP, Débito Automático - MP,
Manual - Galicia, Débito Automático - Galicia o Efectivo.

## Rubros y lupa

Cada gasto puede tener un rubro (opcional): Productos, Servicios, Alquiler, Compra insumos, Tarjeta,
Gastos Bancarios, Impuesto, Socios, Préstamos o Empleados.

La **lupa** (arriba a la derecha) abre el buscador: se puede escribir parte de la descripción, el rubro,
la forma de pago o el monto, y filtrar por rubro. La búsqueda respeta el mes elegido; si no hay
resultados ahí, ofrece buscar en todos los meses.

## Mails automáticos

Llegan a las 3 cuentas del equipo:

| Mail | Cuándo | Qué dice |
|---|---|---|
| **Aviso de pago** | Cada pago registrado (pago parcial, "Pagado", gasto cargado como pagado) | Gasto, monto pagado y saldo pendiente. Llega a los **5-15 minutos**, no al segundo (se revisa cada 5 min). |
| **Cierre de semana** | Viernes 21 hs | Pagos realizados en la semana, pagos vencidos, total pagado y saldo. |
| **Informe mensual** | Último día del mes, 21 hs | Resumen del mes y el Excel adjunto. |

No hay servidor: los manda GitHub (gratis) con el archivo [`correos.yml`](.github/workflows/correos.yml).
Hay que prepararlo **una sola vez**:

1. **Reglas de Firebase:** pegar de nuevo [`firebase/firestore.rules`](firebase/firestore.rules) (con los emails reales) y Publicar. Incluye `avisos` e `informes`.
2. **Cuenta "robot":** Firebase → Authentication → Agregar usuario (puede ser un email inventado, ej. `robot@copani.com`, con una contraseña larga). Agregar ese email a la lista `autorizado()` de las reglas y publicar.
3. **Cuenta que envía los mails** (por ejemplo un Gmail): activar la *Verificación en 2 pasos* y crear una **contraseña de aplicación** ([ayuda de Google](https://support.google.com/accounts/answer/185833)).
4. **GitHub → Settings → Secrets and variables → Actions → New repository secret**, cargar:
   `SMTP_USUARIO` (el Gmail que envía), `SMTP_CLAVE` (la contraseña de aplicación), `DESTINATARIOS` (los 3 emails separados por coma), `ROBOT_EMAIL` y `ROBOT_CLAVE` (la cuenta del paso 2). Si no es Gmail, también `SMTP_SERVIDOR`.
5. **Fusionar a `main`:** GitHub solo corre los horarios (y muestra el botón de prueba) del archivo que está en la rama principal.
6. **Probar:** GitHub → Actions → *Correos automáticos* → **Run workflow** → tipo `semanal`, prueba ✔. Llega un mail con `[PRUEBA]`.

Cosas a saber: GitHub puede **atrasar** los horarios unos minutos; si el repositorio pasa **60 días sin cambios**
desactiva los horarios (se reactivan en Actions → *Enable workflow*); el repositorio tiene que seguir **público**.

## Instalar en el celular

- **iPhone:** abrir el link en **Safari** → botón Compartir → **Agregar a pantalla de inicio**.
- **Android:** abrir el link en Chrome → menú ⋮ → **Instalar app** (o *Agregar a pantalla de inicio*).

## Puesta en marcha (una sola vez)

La app ya funciona en **modo demo** (datos de ejemplo, solo en el navegador). Para que los 3 usuarios
compartan los mismos datos hay que conectarla a Firebase:

1. En [Firebase](https://console.firebase.google.com): crear un proyecto.
2. **Authentication** → Comenzar → habilitar **Correo electrónico/contraseña**. En *Usuarios* → Agregar usuario: crear los 3 usuarios del equipo.
3. **Firestore Database** → Crear base de datos (modo producción).
4. Firestore → **Reglas** → pegar el contenido de [`firebase/firestore.rules`](firebase/firestore.rules), cambiar los 3 emails de ejemplo por los reales (en minúsculas) y **Publicar**.
5. Configuración del proyecto → Tus apps → **Web** (`</>`) → copiar los datos de configuración y pasarlos a Claude, que los carga en `docs/firebase-config.js` (**ya hecho**: proyecto `copani-caballito-v02`).
6. En GitHub: **Settings → Pages** → *Deploy from a branch* → carpeta `/docs` (hoy publica desde la rama `chore/base-del-repo`; después de fusionar, elegir `main`).

El link de la app queda en `https://copanicaballito-blip.github.io/copani-caballito-app/`.

## Para quien desarrolla

Detalles técnicos en [CLAUDE.md](CLAUDE.md). Tests: `npm ci --prefix automatizacion` (una vez) y `npm test`.
