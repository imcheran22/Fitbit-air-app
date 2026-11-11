import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Pure-Kotlin module: shared vocabulary (metric types, provenance, source rules).
// No Android dependencies, so it is unit-testable on any JVM.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
}
