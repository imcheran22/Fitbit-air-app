import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Pure-Kotlin sports-science engine. Every formula here is documented in docs/FORMULAS.md.
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
    api(project(":core:domain"))

    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
}
