import java.util.Base64

plugins {
    id("com.android.library") version "9.0.0-rc02"
    id("com.android.application") version "9.0.0-rc02" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.0"
    id("org.jetbrains.dokka") version "2.0.0"
    id("com.google.protobuf") version "0.10.0"
    id("maven-publish")
    id("signing")
    id("io.github.gradle-nexus.publish-plugin") version "2.0.0"
}

group = (findProperty("GROUP") as String?) ?: "ai.synheart"
version = (findProperty("VERSION_NAME") as String?) ?: "0.3.0"
val pomArtifactId: String = (findProperty("POM_ARTIFACT_ID") as String?) ?: "synheart-wear"

android {
    namespace = "ai.synheart.wear"
    compileSdk = 34

    lint {
        // CI runs `lint` separately; don't fail `build`/publishing on lint issues.
        abortOnError = false
    }

    defaultConfig {
        minSdk = 21

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }

    // Wire protobuf-gradle-plugin's generated sources into AGP 9.
    // The plugin emits .java + .kt under build/generated/java/<task>/{java,kotlin,grpc,grpckt}
    // but doesn't auto-register them with AGP 9's source-set model.
    //
    // IMPORTANT: each variant's generated dir must go into ONLY that
    // variant's source set. Putting both into `main` causes
    // Redeclaration / Conflicting overloads errors on `assembleRelease`
    // because debug + release proto outputs land on the same compile
    // classpath.
    sourceSets {
        getByName("debug") {
            java.srcDirs(
                "build/generated/java/generateDebugProto/java",
                "build/generated/java/generateDebugProto/grpc"
            )
            kotlin.srcDirs(
                "build/generated/java/generateDebugProto/kotlin",
                "build/generated/java/generateDebugProto/grpckt"
            )
        }
        getByName("release") {
            java.srcDirs(
                "build/generated/java/generateReleaseProto/java",
                "build/generated/java/generateReleaseProto/grpc"
            )
            kotlin.srcDirs(
                "build/generated/java/generateReleaseProto/kotlin",
                "build/generated/java/generateReleaseProto/grpckt"
            )
        }
    }
}

dependencies {
    // Core library desugaring for Java 8+ APIs on older Android versions
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")

    // Kotlin
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // AndroidX
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")

    // Health Connect
    implementation("androidx.health.connect:connect-client:1.1.0-alpha07")

    // Encryption
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // JSON
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")

    // HTTP Client (Retrofit + OkHttp)
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")

    // gRPC + Protobuf (RAMEN real-time event streaming)
    implementation("io.grpc:grpc-okhttp:1.62.2")
    implementation("io.grpc:grpc-stub:1.62.2")
    implementation("io.grpc:grpc-protobuf-lite:1.62.2")
    implementation("io.grpc:grpc-kotlin-stub:1.4.1")
    implementation("com.google.protobuf:protobuf-kotlin-lite:3.25.3")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test:2.3.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("io.mockk:mockk:1.13.8")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.mockito:mockito-core:5.14.2")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}

protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:3.25.3"
    }
    plugins {
        create("grpc") {
            artifact = "io.grpc:protoc-gen-grpc-java:1.62.2"
        }
        create("grpckt") {
            artifact = "io.grpc:protoc-gen-grpc-kotlin:1.4.1:jdk8@jar"
        }
    }
    generateProtoTasks {
        all().forEach { task ->
            task.builtins {
                create("java") { option("lite") }
                create("kotlin") { option("lite") }
            }
            task.plugins {
                create("grpc") { option("lite") }
                create("grpckt") { option("lite") }
            }
        }
    }
}

nexusPublishing {
    repositories {
        sonatype {
            // OSSRH was shut down (2025-06-30). Use the Central Portal OSSRH Staging API compatibility service.
            nexusUrl.set(uri("https://ossrh-staging-api.central.sonatype.com/service/local/"))
            snapshotRepositoryUrl.set(uri("https://central.sonatype.com/repository/maven-snapshots/"))

            // Prefer Central Portal token credentials, but accept legacy env var names too.
            username.set(
                (findProperty("sonatypeUsername") as String?)
                    ?: (findProperty("SONATYPE_USERNAME") as String?)
                    ?: (findProperty("OSSRH_USERNAME") as String?)
                    ?: System.getenv("SONATYPE_USERNAME")
                    ?: System.getenv("OSSRH_USERNAME")
                    ?: ""
            )
            password.set(
                (findProperty("sonatypePassword") as String?)
                    ?: (findProperty("SONATYPE_PASSWORD") as String?)
                    ?: (findProperty("OSSRH_PASSWORD") as String?)
                    ?: System.getenv("SONATYPE_PASSWORD")
                    ?: System.getenv("OSSRH_PASSWORD")
                    ?: ""
            )
        }
    }
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])

                groupId = project.group.toString()
                artifactId = pomArtifactId
                version = project.version.toString()

                pom {
                    name.set("Synheart Wear Android")
                    description.set("Unified wearable SDK for Android - Stream biometric data from multiple devices")
                    url.set("https://github.com/synheart-ai/synheart-wear-kotlin")

                    licenses {
                        license {
                            name.set("Apache-2.0")
                            url.set("https://www.apache.org/licenses/LICENSE-2.0")
                        }
                    }

                    developers {
                        developer {
                            id.set("israel-goytom")
                            name.set("Israel Goytom")
                            email.set("israel@synheart.ai")
                        }
                        developer {
                            id.set("synheart-ai")
                            name.set("Synheart AI Team")
                            email.set("dev@synheart.ai")
                        }
                    }

                    scm {
                        connection.set("scm:git:git://github.com/synheart-ai/synheart-wear-kotlin.git")
                        developerConnection.set("scm:git:ssh://github.com/synheart-ai/synheart-wear-kotlin.git")
                        url.set("https://github.com/synheart-ai/synheart-wear-kotlin")
                    }
                }
            }
        }
    }

    signing {
        // Support both `GPG_*` and `SIGNING_*` naming (CI commonly uses ORG_GRADLE_PROJECT_SIGNING_*).
        var signingKey: String =
            (findProperty("GPG_PRIVATE_KEY") as String?)
                ?: (findProperty("SIGNING_KEY") as String?)
                ?: System.getenv("GPG_PRIVATE_KEY")
                ?: System.getenv("SIGNING_KEY")
                ?: ""
        val signingKeyBase64: String =
            (findProperty("GPG_PRIVATE_KEY_BASE64") as String?)
                ?: (findProperty("SIGNING_KEY_BASE64") as String?)
                ?: System.getenv("GPG_PRIVATE_KEY_BASE64")
                ?: System.getenv("SIGNING_KEY_BASE64")
                ?: ""
        val signingPassword: String =
            (findProperty("GPG_PASSPHRASE") as String?)
                ?: (findProperty("SIGNING_PASSWORD") as String?)
                ?: System.getenv("GPG_PASSPHRASE")
                ?: System.getenv("SIGNING_PASSWORD")
                ?: ""

        // Prefer base64 when provided (robust for CI / dotenv / shells).
        if (signingKeyBase64.isNotEmpty()) {
            val normalized = signingKeyBase64.replace(Regex("\\s+"), "")
            signingKey = String(Base64.getMimeDecoder().decode(normalized), Charsets.UTF_8)
        }

        // Support `.env`-style single-line values with escaped newlines.
        signingKey = signingKey
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace("\\n", "\n")
            .trim()

        val hasSigning = signingKey.isNotEmpty() && signingPassword.isNotEmpty()

        if (hasSigning) {
            useInMemoryPgpKeys(signingKey, signingPassword)
        }

        // Don't require signing for local `publishToMavenLocal` tests.
        // Require signing when publishing to Sonatype (Maven Central requirement).
        setRequired {
            hasSigning && gradle.taskGraph.allTasks.any { t ->
                val n = t.name.lowercase()
                n.contains("sonatype") || n.contains("close") || n.contains("release")
            }
        }
        sign(publishing.publications["release"])
    }
}
