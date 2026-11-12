# App-level R8 rules. Library modules ship their own consumer-rules.pro (SQLCipher JNI classes,
# kotlinx-serialization serializers for core.data / core.network DTOs, OkHttp platform dontwarns);
# the rules here cover what only the final app knows about. Every rule says why it exists.
# Proof that the set is sufficient is the release smoke test (docs/VERIFICATION.md), not this file.

# Keep line numbers for readable (non-sensitive) stack traces; drop the original file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# WorkManager instantiates workers by class name from its database (Class.forName). The androidx.work
# consumer rules keep ListenableWorker subclasses' constructors; these keep the names stable for work
# that is queued across app updates, including every worker in :core:data.
-keep class com.apex.athlete.core.data.worker.** extends androidx.work.ListenableWorker { *; }
-keep class com.apex.athlete.core.data.alerts.** extends androidx.work.ListenableWorker { *; }

# Activities named in the manifest (the merged manifest rules from AGP keep these automatically;
# listed so a manifest/Kotlin rename mismatch fails loudly in review rather than silently at launch).
-keep class com.apex.athlete.MainActivity
-keep class com.apex.athlete.OAuthRedirectActivity

# Room: generated *_Impl classes are loaded reflectively by Room.databaseBuilder. Room's own consumer
# rules (room-runtime) keep RoomDatabase subclasses and their _Impl; assumption to confirm with the
# minified release launch (OPEN_POINTS).
-keep class * extends androidx.room.RoomDatabase

# kotlinx.serialization: @Serializable classes in :app (none today) would need their Companion
# serializer() kept; the library modules' consumer rules cover core.data and core.network.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

# OkHttp / Okio: optional TLS providers are referenced but absent on Android.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Health Connect client (androidx.health.connect:connect-client): protobuf-lite generated messages are
# resolved by the library's own consumer rules; nothing extra is kept here. Compose and Navigation ship
# consumer rules; navigation routes here are plain strings, so no route classes need keeping.
