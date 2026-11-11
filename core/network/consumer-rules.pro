# kotlinx.serialization DTOs of the Google Health API and the OAuth token response.
-keepclassmembers class com.apex.athlete.core.network.** { *** Companion; }
-keepclasseswithmembers class com.apex.athlete.core.network.** { kotlinx.serialization.KSerializer serializer(...); }
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
