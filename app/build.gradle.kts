import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

// Application module: Application + DI container, single-activity Compose shell, navigation and the
// screens (written per area under com.apex.athlete.ui.*).
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// --- Build-time configuration -------------------------------------------------------------------
// Nothing secret is committed. Values come from the git-ignored local.properties or the environment.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun configValue(propertyKey: String, envKey: String): String? =
    (localProperties.getProperty(propertyKey) ?: System.getenv(envKey))?.trim()?.takeIf { it.isNotEmpty() }

/** OAuth client ID of the Google Cloud project; empty means "not configured" (see docs/SETUP.md). */
val googleClientId: String = configValue("apex.googleClientId", "APEX_GOOGLE_CLIENT_ID").orEmpty()

/**
 * The redirect scheme Google expects for an installed-app client, derived exactly like
 * `GoogleHealthAuthConfig.redirectScheme` in :core:network: the reversed client ID,
 * `com.googleusercontent.apps.<prefix>` for `<prefix>.apps.googleusercontent.com`. A blank or
 * malformed ID falls back to a harmless placeholder scheme so the manifest always merges.
 */
fun redirectSchemeFor(clientId: String): String {
    val suffix = ".apps.googleusercontent.com"
    val id = clientId.trim()
    if (!id.endsWith(suffix)) return "com.apex.athlete.oauth"
    val prefix = id.removeSuffix(suffix)
    val valid = prefix.isNotEmpty() && prefix.all { it.isLetterOrDigit() || it == '-' || it == '_' }
    return if (valid) "com.googleusercontent.apps.$prefix" else "com.apex.athlete.oauth"
}
val oauthRedirectScheme: String = redirectSchemeFor(googleClientId)

// --- Versioning ---------------------------------------------------------------------------------
// versionCode = major * 10000 + minor * 100 + patch  (0.1.0 -> 100, 1.4.2 -> 10402).
// Each component stays below 100, so codes are monotonic and readable. Bump here only.
val versionMajor = 0
val versionMinor = 1
val versionPatch = 0

android {
    namespace = "com.apex.athlete"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.apex.athlete"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = versionMajor * 10_000 + versionMinor * 100 + versionPatch
        versionName = "$versionMajor.$versionMinor.$versionPatch"

        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"$googleClientId\"")
        buildConfigField("String", "OAUTH_REDIRECT_SCHEME", "\"$oauthRedirectScheme\"")
        manifestPlaceholders["appAuthRedirectScheme"] = oauthRedirectScheme
    }

    // Release signing exists only when the key material is supplied (local.properties or environment).
    // Without it the release build is produced unsigned (CI does this).
    val signingStore = configValue("apex.signing.storeFile", "APEX_SIGNING_STORE_FILE")
    val signingStorePassword = configValue("apex.signing.storePassword", "APEX_SIGNING_STORE_PASSWORD")
    val signingKeyAlias = configValue("apex.signing.keyAlias", "APEX_SIGNING_KEY_ALIAS")
    val signingKeyPassword = configValue("apex.signing.keyPassword", "APEX_SIGNING_KEY_PASSWORD")
    val hasSigning = signingStore != null && signingStorePassword != null && signingKeyAlias != null && signingKeyPassword != null

    signingConfigs {
        if (hasSigning) {
            create("release") {
                storeFile = rootProject.file(signingStore!!)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core:domain"))
    implementation(project(":core:analytics"))
    implementation(project(":core:database"))
    implementation(project(":core:network"))
    implementation(project(":core:data"))
    implementation(project(":core:ui"))

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.viewmodel.savedstate)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.work.runtime.ktx)
    // Only for the permission request contract types handed to registerForActivityResult.
    implementation(libs.androidx.health.connect)
    implementation(libs.androidx.browser)
    implementation(libs.kotlinx.coroutines.android)

    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
