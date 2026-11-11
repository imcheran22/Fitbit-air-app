# Consumer ProGuard rules for synheart-wear consumers.
# Applied automatically when an app using this library runs R8/ProGuard
# on a release build.

# ── Public facade ────────────────────────────────────────────────────
-keep class ai.synheart.wear.SynheartWear { *; }
-keep class ai.synheart.wear.SynheartWearException { *; }

# ── Public configuration ─────────────────────────────────────────────
-keep class ai.synheart.wear.config.** { *; }

# ── Public models / enums / sealed classes ───────────────────────────
-keep class ai.synheart.wear.models.** { *; }

# ── Public providers (accessed via sdk.whoop / .garmin / .fitbit /
#    .oura / .bleHrm / .garminHealth and via getProvider()) ───────────
-keep class ai.synheart.wear.adapters.WearableProvider { *; }
-keep class ai.synheart.wear.adapters.WhoopProvider { *; }
-keep class ai.synheart.wear.adapters.GarminProvider { *; }
-keep class ai.synheart.wear.adapters.FitbitProvider { *; }
-keep class ai.synheart.wear.adapters.OuraProvider { *; }
-keep class ai.synheart.wear.adapters.BleHrmProvider { *; }
-keep class ai.synheart.wear.adapters.HealthConnectAdapter { *; }
-keep class ai.synheart.wear.adapters.HealthConnectAvailability { *; }
-keep class ai.synheart.wear.adapters.HealthConnectAvailability$* { *; }
-keep class ai.synheart.wear.adapters.GarminHealth { *; }

# ── Public consent + cache surfaces ──────────────────────────────────
-keep class ai.synheart.wear.consent.ConsentManager { *; }
-keep class ai.synheart.wear.consent.ConsentException { *; }
-keep class ai.synheart.wear.cache.LocalCache { *; }

# ── Serialization & enums ────────────────────────────────────────────
-keepattributes *Annotation*, InnerClasses, Signature
-keepclassmembers class ai.synheart.wear.models.** {
    *** Companion;
}
-keepclassmembers enum ai.synheart.wear.models.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers enum ai.synheart.wear.adapters.BleHrmErrorCode {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── kotlinx.serialization companions inside our public models ───────
-keepclassmembers class ai.synheart.wear.models.** {
    public static *** Companion;
    *** serializer(...);
}
