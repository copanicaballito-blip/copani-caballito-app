pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "copani-caballito"

// La app Android necesita el SDK de Android. Donde no está (p. ej. el entorno web de Claude, que no
// llega a dl.google.com) se compila y testea solo :core; la app se compila en GitHub Actions.
val hayAndroidSdk = System.getenv("ANDROID_HOME") != null ||
    System.getenv("ANDROID_SDK_ROOT") != null ||
    file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }
gradle.extra["hayAndroidSdk"] = hayAndroidSdk

include(":core")
if (hayAndroidSdk) include(":app")
