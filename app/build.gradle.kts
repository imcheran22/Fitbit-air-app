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
val googleClientId: String = configValue("apex.googleClientId", "APEX_GOOGLE_CLIENT_ID").orEmpty().let { raw ->
    // A real client ID is letters, digits, dot, dash and underscore. Anything else (a stray quote from a
    // bad paste, for example) would break the generated BuildConfig, so it counts as "not configured".
    if (raw.isEmpty() || Regex("[A-Za-z0-9._-]+").matches(raw)) {
        raw
    } else {
        logger.warn("APEX_GOOGLE_CLIENT_ID has unexpected characters and was ignored (the build has no sign-in).")
        ""
    }
}

/** The application ID. Also the redirect scheme of an Android-type client. Keep in step with `defaultConfig`. */
val apexApplicationId = "com.apex.athlete"

/**
 * Which Google OAuth client type this build is for: `ios` (default; redirect scheme is the reversed client ID,
 * `com.googleusercontent.apps.<id>:/oauth2redirect`) or `android` (the documented fallback; redirect scheme is the
 * package name, `com.apex.athlete:/oauth2redirect`). Set `apex.oauthClientType` in local.properties or the
 * environment variable `APEX_OAUTH_CLIENT_TYPE`. Anything else falls back to `ios`.
 */
val oauthClientType: String =
    if (configValue("apex.oauthClientType", "APEX_OAUTH_CLIENT_TYPE")?.lowercase() == "android") "android" else "ios"

/**
 * The redirect scheme for the manifest placeholder, computed exactly like
 * `GoogleHealthAuthConfig.redirectScheme` in :core:network (`OAuthSchemeConsistencyTest` in :app checks they
 * agree). `ios` (default): the reversed client ID, `com.googleusercontent.apps.<prefix>`
 * for `<prefix>.apps.googleusercontent.com`. `android`: the application ID. A blank or malformed ID (ios) gives a harmless placeholder scheme so the
 * manifest always merges (the runtime then reports "not configured"). Never throws.
 */
fun redirectSchemeFor(clientId: String, clientType: String, applicationId: String): String {
    val placeholder = "$applicationId.oauth"
    if (clientType == "android") return applicationId
    val suffix = ".apps.googleusercontent.com"
    val id = clientId.trim()
    if (!id.endsWith(suffix)) return placeholder
    val prefix = id.removeSuffix(suffix)
    val valid = prefix.isNotEmpty() && prefix.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '-' || it == '_' }
    return if (valid) "com.googleusercontent.apps.$prefix" else placeholder
}
val oauthRedirectScheme: String = redirectSchemeFor(googleClientId, oauthClientType, apexApplicationId)

// --- Versioning ---------------------------------------------------------------------------------
// versionCode = major * 10000 + minor * 100 + patch  (0.1.0 -> 100, 1.4.2 -> 10402).
// Each component stays below 100, so codes are monotonic and readable. Bump here only.
val versionMajor = 0
val versionMinor = 2
val versionPatch = 1

android {
    namespace = "com.apex.athlete"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = apexApplicationId
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = versionMajor * 10_000 + versionMinor * 100 + versionPatch
        versionName = "$versionMajor.$versionMinor.$versionPatch"

        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"$googleClientId\"")
        buildConfigField("String", "OAUTH_REDIRECT_SCHEME", "\"$oauthRedirectScheme\"")
        buildConfigField("String", "OAUTH_CLIENT_TYPE", "\"$oauthClientType\"")
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
    // Home-screen widgets (Jetpack Glance) and the tolerant JSON tree reader for the widget snapshot file.
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.kotlinx.serialization.json)
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
