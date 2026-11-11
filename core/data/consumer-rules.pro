# kotlinx.serialization: keep generated serializers for the export and archive DTOs.
-keepclassmembers class com.apex.athlete.core.data.** { *** Companion; }
-keepclasseswithmembers class com.apex.athlete.core.data.** { kotlinx.serialization.KSerializer serializer(...); }
