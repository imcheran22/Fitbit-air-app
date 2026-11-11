plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val keystorePath: String? = System.getenv("FITDASH_KEYSTORE")

android {
    namespace = "app.fitdash"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.fitdash"
        minSdk = 26
        targetSdk = 36
        versionCode = 10
        versionName = "0.9.0"
    }

    flavorDimensions += "store"
    productFlavors {
        create("github") {
            dimension = "store"
            buildConfigField("boolean", "SHOW_SUPPORT", "true")
        }
        create("play") {
            dimension = "store"
            buildConfigField("boolean", "SHOW_SUPPORT", "false")
        }
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("FITDASH_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FITDASH_KEY_ALIAS")
                keyPassword = System.getenv("FITDASH_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.coroutines.android)
    implementation(libs.core.splashscreen)
    implementation(libs.health.connect)
    implementation(libs.glance.appwidget)
    implementation(libs.work.runtime)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation("org.json:json:20240303")
}
