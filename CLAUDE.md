# Copani Caballito

App Android de gestión interna de Copani Caballito. Uso exclusivo del equipo.
Módulos previstos (a definir con el dueño): stock, ventas, caja y empleados.

## Decisiones
- Mismo método que la app Lavanda Suite (repo agusialvarez-bot/lavanda-suite): Kotlin + Jetpack Compose,
  GitHub Actions compila y publica el APK. Solo Android (no hay versión iOS).
- `core/` es Kotlin/JVM puro (sin Android) y tiene toda la lógica testeable; `app/` la usa.
- Montos en pesos enteros (Long), sin punto flotante.
- Base de datos / login: todavía no. Previsto Firebase (Auth con Google + Firestore) como en Lavanda,
  cuando el dueño defina qué guardar. Al agregarlo: `app/google-services.json` va en el repo (no es
  secreto, lo protegen las reglas de Firestore, `firebase/firestore.rules`) y el SHA-1 a registrar
  es el de `app/debug.keystore`.
- Datos personales de empleados/clientes (Ley 25.326): nada de eso en el repo; van en la base de datos.

## App Android (app/)
- Compose + Material 3. Versiones: AGP 8.13.2, Kotlin 2.3.21, Compose BOM 2025.09.00, compileSdk 36, minSdk 26.
- `:app` se incluye solo si hay SDK de Android (settings.gradle.kts). Los plugins van en el
  buildscript del proyecto raíz para poder omitir AGP sin SDK.
- Firma: `app/debug.keystore` fijo en el repo para que cada APK se instale encima del anterior.
- versionCode = número de corrida de GitHub Actions; versionName = 0.1.<número>.

## Comandos y CI
- Tests del dominio: `./gradlew :core:test`
- En el entorno web de Claude no hay acceso a dl.google.com / maven.google.com: la app se compila
  solo en GitHub Actions (`.github/workflows/ci.yml`). Cada push a main publica un release con el APK.
- Los logs de Actions no se pueden descargar desde ese entorno; los errores se leen como anotaciones:
  `GET https://api.github.com/repos/copanicaballito-blip/copani-caballito-app/check-runs/<job_id>/annotations`.
- Maven Central a veces responde 429: reintentar con espera.

## Pendiente
- Definir con el dueño la primera función de la app (qué se carga y qué se consulta).
- Pasar el repo a privado antes de publicar APKs en Releases (hoy es público).
- Firebase (login con Google + base de datos) cuando haya datos que guardar.
