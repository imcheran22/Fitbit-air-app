# kotlinx.serialization DTOs of the Google Health API and the OAuth token response.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.apex.athlete.core.network.** { *** Companion; }
-keepclasseswithmembers class com.apex.athlete.core.network.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.apex.athlete.core.network.**$$serializer { *; }
-keepclassmembers @kotlinx.serialization.Serializable class com.apex.athlete.core.network.** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
# Custom serializer objects referenced by @Serializable(with = ...)
-keep class com.apex.athlete.core.network.LenientLongSerializer { *; }
-keep class com.apex.athlete.core.network.LenientDoubleSerializer { *; }
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
