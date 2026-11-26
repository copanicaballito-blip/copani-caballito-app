import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// En GitHub Actions cada compilación sube el número, así el APK nuevo se instala encima del anterior.
val numeroCompilacion = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "ar.copanicaballito.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "ar.copanicaballito.app"
        minSdk = 26
        targetSdk = 36
        versionCode = numeroCompilacion
        versionName = "0.1.$numeroCompilacion"
    }

    signingConfigs {
        // Clave fija en el repo: si cada compilación firmara con una clave distinta, Android
        // obligaría a desinstalar la app (y perder sus datos) para actualizarla.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
}
