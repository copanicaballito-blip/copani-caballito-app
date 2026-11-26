// Los plugins van en el classpath del proyecto raíz (y no en bloques plugins {} con versión) para
// poder dejar afuera el plugin de Android cuando no hay SDK. Kotlin tiene que ver las clases del
// plugin de Android, por eso ambos se cargan acá.
buildscript {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath(libs.kotlin.gradle.plugin)
        classpath(libs.compose.compiler.gradle.plugin)
        if (gradle.extra["hayAndroidSdk"] as Boolean) {
            classpath(libs.android.gradle.plugin)
        }
    }
}
