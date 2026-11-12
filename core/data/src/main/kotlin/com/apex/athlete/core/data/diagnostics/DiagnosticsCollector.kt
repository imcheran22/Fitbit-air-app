package com.apex.athlete.core.data.diagnostics

import android.content.Context
import android.os.Build
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HealthConnectAvailability
import com.apex.athlete.core.data.healthconnect.HealthConnectDataSource
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.healthconnect.HcFamily
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.data.worker.SyncRunStatusStore
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

/** What the screen knows about Google sign-in; scope names only, never a token or account. */
data class GoogleAuthSnapshot(val configured: Boolean, val signedIn: Boolean, val grantedScopes: Set<String>)

/**
 * Gathers the inputs of [DiagnosticsReport] by reading: the database through its existing read queries,
 * the settings, the last-sync record, Health Connect permissions and record origins. It writes nothing
 * anywhere (Health Connect reads are read-only) and returns the finished text.
 */
class DiagnosticsCollector(
    private val context: Context,
    private val stores: ApexStores,
    private val settings: SettingsStore,
    private val healthConnect: HealthConnectAvailability,
    private val healthConnectData: HealthConnectDataSource,
    private val appVersion: String,
    private val buildType: String,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun report(google: GoogleAuthSnapshot): String = withContext(io) {
        DiagnosticsReport.build(collect(google))
    }

    suspend fun collect(google: GoogleAuthSnapshot): DiagnosticsInput {
        val s = settings.currentSettings()
        val z = zone()
        val store = (stores.status.value as? StoreStatus.Ready)?.store
        val hc = healthConnect.status()
        return DiagnosticsInput(
            device = DeviceDiag(
                appVersion = appVersion,
                buildType = buildType,
                sdkInt = Build.VERSION.SDK_INT,
                manufacturer = Build.MANUFACTURER.orEmpty(),
                model = Build.MODEL.orEmpty(),
                locale = Locale.getDefault().toLanguageTag(),
                zoneId = z.id,
                clock24h = s.clock24h,
                units = s.units.name,
            ),
            mode = modeOf(s),
            google = googleOf(google, store, z),
            healthConnect = HealthConnectDiag(
                sdkStatus = hc.sdk.name,
                granted = hc.grantedRecordPermissions.toList(),
                missing = hc.missingRecordPermissions.toList(),
                historyGranted = hc.historyGranted,
                backgroundGranted = hc.backgroundGranted,
                origins = if (hc.sdk == HcSdkStatus.AVAILABLE) origins(hc.grantedRecordPermissions) else null,
            ),
            heartRate = store?.let { heartRate(it) },
            streams = store?.let { streams(it, z) }.orEmpty(),
            takeout = TakeoutDiagnosticsStore(context).read()
                ?: TakeoutDiag(s.lastTakeoutImportMillis?.let { day(it, z) }, null, null),
            database = DatabaseDiag(
                schemaVersion = store?.let { runCatching { it.db.openHelper.readableDatabase.version }.getOrNull() },
                encrypted = store != null && !store.isDemo,
            ),
        )
    }

    private fun modeOf(s: AppSettings) = ModeDiag(
        demo = s.demoMode,
        onboardingDone = s.onboardingDone,
        backgroundSync = s.backgroundSync,
        notifications = s.notificationsEnabled,
    )

    private suspend fun googleOf(g: GoogleAuthSnapshot, store: ActiveStore?, z: ZoneId): GoogleDiag {
        val last = SyncRunStatusStore(context).last()
        val marks = if (store == null || store.isDemo) {
            emptyList()
        } else {
            SyncSource.entries.flatMap { store.db.syncWatermarkDao().forSource(it) }.map {
                StreamMarkDiag(
                    source = it.source.storageKey,
                    stream = it.stream,
                    status = it.status.name,
                    watermarkDay = it.lastSyncedEpochMillis.takeIf { m -> m > 0L }?.let { m -> day(m, z) },
                )
            }
        }
        return GoogleDiag(
            configured = g.configured,
            signedIn = g.signedIn,
            grantedScopes = g.grantedScopes.toList(),
            lastSyncCode = last?.code,
            lastSyncDay = last?.atMillis?.takeIf { it > 0L }?.let { day(it, z) },
            streams = marks,
        )
    }

    /** Package names that wrote the first page of each granted record type in the last 7 days. Read-only. */
    private suspend fun origins(granted: Set<String>): Map<String, List<String>> {
        val now = nowMillis()
        val from = now - WINDOW_DAYS * DAY_MILLIS
        val out = sortedMapOf<String, List<String>>()
        for (family in HcFamily.entries) {
            if (HealthConnectPermissions.forFamily(family) !in granted) continue
            try {
                val page = healthConnectData.readPage(family, from, now, null)
                val pkgs = page.records.map { it.origin }.distinct()
                if (pkgs.isNotEmpty()) out[family.name] = pkgs
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // A permission change or a provider hiccup: this type is simply left out.
            }
        }
        return out
    }

    private suspend fun heartRate(store: ActiveStore): HeartRateProbe? = try {
        val now = nowMillis()
        val minuteNow = now - now % MINUTE_MILLIS
        val from = minuteNow - WINDOW_DAYS * DAY_MILLIS
        val counts = store.db.intradayHeartRateDao().range(from, minuteNow).map { it.sampleCount }
        DiagnosticsProbes.heartRateProbe(counts, WINDOW_DAYS.toInt())
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    private suspend fun streams(store: ActiveStore, z: ZoneId): List<StreamCoverage> {
        val db = store.db
        val out = ArrayList<StreamCoverage>()
        val hrDao = db.intradayHeartRateDao()
        val hrCount = hrDao.count()
        if (hrCount > 0) {
            out += StreamCoverage("heart_rate_minutes", hrCount, hrDao.earliestTimestamp()?.let { day(it, z) }, hrDao.latestTimestamp()?.let { day(it, z) })
        }
        val daily = db.dailyBiometricSummaryDao()
        for (m in MetricType.entries) {
            val first = daily.firstDay(m) ?: continue
            val last = daily.lastDay(m) ?: continue
            out += StreamCoverage("daily:${m.storageKey}", daily.range(m, first, last).size, LocalDate.ofEpochDay(first), LocalDate.ofEpochDay(last))
        }
        val samples = db.metricSampleDao()
        for (m in MetricType.entries) {
            if (m.isDerived) continue
            val n = samples.stats(m, Long.MIN_VALUE, Long.MAX_VALUE).n
            if (n <= 0) continue
            // Only the newest sample's day is cheap to read with the existing queries; the first day is not reported.
            out += StreamCoverage("samples:${m.storageKey}", n, null, samples.latest(m)?.timestampEpochMillis?.let { day(it, z) })
        }
        val workouts = db.workoutDao().all()
        if (workouts.isNotEmpty()) {
            out += StreamCoverage("workouts", workouts.size, LocalDate.ofEpochDay(workouts.minOf { it.epochDay }), LocalDate.ofEpochDay(workouts.maxOf { it.epochDay }))
        }
        val sleeps = db.sleepDao().allSessions()
        if (sleeps.isNotEmpty()) {
            out += StreamCoverage("sleep_sessions", sleeps.size, LocalDate.ofEpochDay(sleeps.minOf { it.epochDay }), LocalDate.ofEpochDay(sleeps.maxOf { it.epochDay }))
        }
        return out
    }

    private fun day(millis: Long, z: ZoneId): LocalDate = Instant.ofEpochMilli(millis).atZone(z).toLocalDate()

    private companion object {
        const val WINDOW_DAYS = 7L
        const val DAY_MILLIS = 24L * 60 * 60 * 1000
        const val MINUTE_MILLIS = 60_000L
    }
}
