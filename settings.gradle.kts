pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Apex"

include(":app")
include(":core:domain")
include(":core:analytics")
include(":core:database")
include(":core:network")
include(":core:data")
include(":core:ui")
