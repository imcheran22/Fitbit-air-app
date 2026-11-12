# kotlinx.serialization: keep generated serializers for the export and archive DTOs.
-keepclassmembers class com.apex.athlete.core.data.** { *** Companion; }
-keepclasseswithmembers class com.apex.athlete.core.data.** { kotlinx.serialization.KSerializer serializer(...); }

# Anthropic Java SDK (Ask Apex). The SDK reads and writes its models through Jackson with Kotlin
# reflection; shrinking or renaming them breaks request/response mapping at runtime.
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault
-keep class com.anthropic.** { *; }
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keepclassmembers class * { @com.fasterxml.jackson.annotation.* <fields>; @com.fasterxml.jackson.annotation.* <methods>; @com.fasterxml.jackson.annotation.* <init>(...); }
-keep @com.fasterxml.jackson.annotation.JsonCreator class * { *; }
-dontwarn java.beans.**
-dontwarn javax.annotation.**
-dontwarn org.slf4j.**
-dontwarn io.opentelemetry.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn io.swagger.v3.oas.annotations.**
-dontwarn com.networknt.**
-dontwarn com.github.victools.**
-dontwarn com.standardwebhooks.**

# The Anthropic SDK's structured-output helper references java.lang.reflect.AnnotatedType, which is
# not on Android's runtime classpath. Apex never uses structured outputs, so the reference is dead.
-dontwarn java.lang.reflect.AnnotatedType
