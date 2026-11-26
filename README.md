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

## Filtro por mes

Arriba de la lista se elige el mes (o **Todos los meses**). Se muestra lo que **vence ese mes**. Los gastos
**impagos de meses anteriores pasan al mes siguiente en rojo** hasta que se pagan.

## Forma de pago

Cada gasto puede tener una forma de pago (opcional): Manual - MP, Débito Automático - MP,
Manual - Galicia, Débito Automático - Galicia o Efectivo.

## Rubros y lupa

Cada gasto puede tener un rubro (opcional): Productos, Servicio, Alquiler, Compra insumos, Tarjeta,
Gasto Bancario o Impuesto.

La **lupa** (arriba a la derecha) abre el buscador: se puede escribir parte de la descripción, el rubro,
la forma de pago o el monto, y filtrar por rubro. La búsqueda respeta el mes elegido; si no hay
resultados ahí, ofrece buscar en todos los meses.

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

Detalles técnicos en [CLAUDE.md](CLAUDE.md). Tests de las reglas: `npm test`.
