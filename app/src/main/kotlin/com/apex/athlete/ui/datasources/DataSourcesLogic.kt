package com.apex.athlete.ui.datasources

import com.apex.athlete.core.data.diagnostics.GoogleAuthSnapshot
import com.apex.athlete.core.data.healthconnect.HcFamily
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.healthconnect.HealthConnectStatus
import com.apex.athlete.core.data.repository.DataSourcesState
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.worker.SyncRunState
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.AuthorizationOutcome
import com.apex.athlete.core.network.auth.ReauthReason
import com.apex.athlete.core.network.rate.RateLimitState
import com.apex.athlete.di.SignInUiState

// Pure mapping from repository and controller state to UI models. No Android classes, no copy:
// the composables turn these enums and numbers into strings (strings_datasources.xml).

private const val DAY_MILLIS = 24L * 60 * 60 * 1000

// --- Watermarks ------------------------------------------------------------------------------------

enum class WatermarkHealth { NEVER, OK, PARTIAL, FAILED, PERMISSION_MISSING }

enum class FailureKind { NONE, PERMISSION, RATE_LIMITED, SIGN_IN_EXPIRED, OTHER }

/** One stream of one source. Times are epoch millis; null means "never", shown as `--` or "Never". */
data class WatermarkRow(
    val source: SyncSource,
    val stream: String,
    val health: WatermarkHealth,
    /** Everything up to this instant has been ingested; null when the stream never synced. */
    val windowEndMillis: Long?,
    val lastSuccessMillis: Long?,
    val lastAttemptMillis: Long?,
    val failure: FailureKind,
    val consecutiveFailures: Int,
)

data class SourceSection(val source: SyncSource, val rows: List<WatermarkRow>)

/** The orchestrator stores short codes (or an exception class name); anything unknown is [FailureKind.OTHER]. */
fun failureKind(code: String?): FailureKind = when (code) {
    null -> FailureKind.OTHER
    "permission", "permission_missing" -> FailureKind.PERMISSION
    "rate_limited" -> FailureKind.RATE_LIMITED
    "sign_in_expired" -> FailureKind.SIGN_IN_EXPIRED
    else -> FailureKind.OTHER
}

fun watermarkRow(e: SyncWatermarkEntity): WatermarkRow {
    val health = when (e.status) {
        SyncStatus.NEVER_SYNCED -> WatermarkHealth.NEVER
        SyncStatus.SUCCESS -> WatermarkHealth.OK
        SyncStatus.PARTIAL -> WatermarkHealth.PARTIAL
        SyncStatus.FAILED -> WatermarkHealth.FAILED
        SyncStatus.PERMISSION_MISSING -> WatermarkHealth.PERMISSION_MISSING
    }
    val failure = when (health) {
        WatermarkHealth.NEVER, WatermarkHealth.OK -> FailureKind.NONE
        WatermarkHealth.PERMISSION_MISSING -> FailureKind.PERMISSION
        else -> failureKind(e.lastError)
    }
    return WatermarkRow(
        source = e.source,
        stream = e.stream,
        health = health,
        windowEndMillis = e.lastSyncedEpochMillis.takeIf { it > 0L },
        lastSuccessMillis = e.lastSuccessEpochMillis?.takeIf { it > 0L },
        lastAttemptMillis = e.lastAttemptEpochMillis?.takeIf { it > 0L },
        failure = failure,
        consecutiveFailures = e.consecutiveFailures.coerceAtLeast(0),
    )
}

/** Sources in enum order, streams alphabetical; sources without rows are left out. */
fun watermarkSections(entities: List<SyncWatermarkEntity>): List<SourceSection> =
    SyncSource.entries.mapNotNull { source ->
        val rows = entities.filter { it.source == source }.map(::watermarkRow).sortedBy { it.stream }
        if (rows.isEmpty()) null else SourceSection(source, rows)
    }

enum class CountKind { HEART_RATE_MINUTES, DAILY_VALUES, SAMPLES }

data class CountRow(val kind: CountKind, val count: Int)

fun countRows(ds: DataSourcesState): List<CountRow> = listOf(
    CountRow(CountKind.HEART_RATE_MINUTES, ds.heartRateMinutes),
    CountRow(CountKind.DAILY_VALUES, ds.dailyValues),
    CountRow(CountKind.SAMPLES, ds.samples),
)

// --- Google Health ---------------------------------------------------------------------------------

enum class GoogleConnection { LOADING, NOT_CONFIGURED, SIGNED_OUT, SIGNED_IN, NEEDS_REAUTH }

enum class SignInNotice {
    NONE, WAITING_FOR_BROWSER, COMPLETING, DONE, DONE_MISSING_SCOPES, NO_BROWSER,
    DENIED, NETWORK, REFUSED, UNEXPECTED, REDIRECT_MISMATCH,
}

data class GoogleCardModel(
    val connection: GoogleConnection,
    val notice: SignInNotice,
    val reauth: ReauthReason?,
    val missingScopeCount: Int,
    val manifestScheme: String?,
    val neededScheme: String?,
) {
    val canConnect: Boolean
        get() = (connection == GoogleConnection.SIGNED_OUT || connection == GoogleConnection.NEEDS_REAUTH) &&
            notice != SignInNotice.WAITING_FOR_BROWSER && notice != SignInNotice.COMPLETING
    val canDisconnect: Boolean
        get() = connection == GoogleConnection.SIGNED_IN || connection == GoogleConnection.NEEDS_REAUTH
}

fun googleCardModel(configured: Boolean, auth: AuthState?, signIn: SignInUiState): GoogleCardModel {
    val connection = when {
        !configured -> GoogleConnection.NOT_CONFIGURED
        auth == null -> GoogleConnection.LOADING
        auth is AuthState.SignedIn -> GoogleConnection.SIGNED_IN
        auth is AuthState.NeedsReauth -> GoogleConnection.NEEDS_REAUTH
        else -> GoogleConnection.SIGNED_OUT
    }
    var missing = 0
    var manifest: String? = null
    var needed: String? = null
    val notice = when (signIn) {
        SignInUiState.Idle, SignInUiState.NotConfigured -> SignInNotice.NONE
        SignInUiState.WaitingForBrowser -> SignInNotice.WAITING_FOR_BROWSER
        SignInUiState.Completing -> SignInNotice.COMPLETING
        is SignInUiState.Done -> {
            missing = signIn.missingScopes.size
            if (missing > 0) SignInNotice.DONE_MISSING_SCOPES else SignInNotice.DONE
        }
        is SignInUiState.RedirectSchemeMismatch -> {
            manifest = signIn.manifestScheme
            needed = signIn.neededScheme
            SignInNotice.REDIRECT_MISMATCH
        }
        SignInUiState.NoBrowser -> SignInNotice.NO_BROWSER
        is SignInUiState.Failed -> when (signIn.outcome) {
            is AuthorizationOutcome.Denied -> SignInNotice.DENIED
            AuthorizationOutcome.NetworkFailure -> SignInNotice.NETWORK
            else -> SignInNotice.REFUSED
        }
        SignInUiState.Unexpected -> SignInNotice.UNEXPECTED
    }
    val reauth = (auth as? AuthState.NeedsReauth)?.reason
    return GoogleCardModel(connection, notice, reauth, missing, manifest, needed)
}

// --- Rate limit ------------------------------------------------------------------------------------

data class RateLimitUi(
    /** Requests used in this window; null when the limit or remaining count is not known. */
    val used: Int?,
    val limit: Int?,
    /** Share of the budget used, 0..1, for the bar. */
    val fraction: Float?,
    val resetAtMillis: Long?,
    val coolDownUntilMillis: Long?,
    val reportedByServer: Boolean,
)

fun rateLimitUi(s: RateLimitState, nowMillis: Long): RateLimitUi {
    val limit = s.limit?.takeIf { it > 0 }
    val remaining = s.remaining
    val used = if (limit != null && remaining != null) (limit - remaining).coerceIn(0, limit) else null
    return RateLimitUi(
        used = used,
        limit = limit,
        fraction = if (used != null && limit != null) used.toFloat() / limit else null,
        resetAtMillis = s.resetAtMillis?.takeIf { it > nowMillis },
        coolDownUntilMillis = s.blockedUntilMillis?.takeIf { it > nowMillis },
        reportedByServer = s.reportedByServer,
    )
}

/** Whole minutes left of a cool-down, rounded up, at least 1. */
fun minutesLeft(untilMillis: Long, nowMillis: Long): Int =
    (((untilMillis - nowMillis).coerceAtLeast(0L) + 59_999L) / 60_000L).toInt().coerceAtLeast(1)

// --- Health Connect --------------------------------------------------------------------------------

enum class FeatureState { GRANTED, NOT_GRANTED, UNSUPPORTED }

data class HealthConnectUi(
    val sdk: HcSdkStatus,
    val missing: List<HcFamily>,
    val grantedCount: Int,
    val history: FeatureState,
    val background: FeatureState,
    /** True when the permission dialog has something to ask for. */
    val canRequest: Boolean,
)

fun healthConnectUi(s: HealthConnectStatus): HealthConnectUi {
    val missing = HcFamily.entries.filter { HealthConnectPermissions.forFamily(it) in s.missingRecordPermissions }
    fun feature(available: Boolean, granted: Boolean) = when {
        granted -> FeatureState.GRANTED
        !available -> FeatureState.UNSUPPORTED
        else -> FeatureState.NOT_GRANTED
    }
    return HealthConnectUi(
        sdk = s.sdk,
        missing = missing,
        grantedCount = s.grantedRecordPermissions.size,
        history = feature(s.historyFeatureAvailable, s.historyGranted),
        background = feature(s.backgroundFeatureAvailable, s.backgroundGranted),
        canRequest = s.sdk == HcSdkStatus.AVAILABLE && s.toRequest().isNotEmpty(),
    )
}

// --- Sync ------------------------------------------------------------------------------------------

enum class SyncKind { LOADING, IDLE, RUNNING, SUCCEEDED, FAILED, NEEDS_SIGN_IN }

enum class SyncFailure { NETWORK, RATE_LIMITED, PERMISSION_MISSING, NO_SOURCE, STORE_UNAVAILABLE, OTHER }

data class SyncUi(
    val kind: SyncKind,
    val succeededAtMillis: Long?,
    val failure: SyncFailure?,
    /** [AppSettings.lastSyncMillis]; null means never. */
    val lastSyncMillis: Long?,
    val canSyncNow: Boolean,
)

fun syncFailure(reason: String): SyncFailure = when (reason) {
    "network" -> SyncFailure.NETWORK
    "rate_limited" -> SyncFailure.RATE_LIMITED
    "permission_missing" -> SyncFailure.PERMISSION_MISSING
    "no_source" -> SyncFailure.NO_SOURCE
    "store_unavailable" -> SyncFailure.STORE_UNAVAILABLE
    else -> SyncFailure.OTHER
}

fun syncUi(run: SyncRunState?, lastSyncMillis: Long?, demo: Boolean): SyncUi {
    val kind = when (run) {
        null -> SyncKind.LOADING
        SyncRunState.Idle -> SyncKind.IDLE
        SyncRunState.Running -> SyncKind.RUNNING
        is SyncRunState.Succeeded -> SyncKind.SUCCEEDED
        is SyncRunState.Failed -> SyncKind.FAILED
        SyncRunState.NeedsSignIn -> SyncKind.NEEDS_SIGN_IN
    }
    return SyncUi(
        kind = kind,
        succeededAtMillis = (run as? SyncRunState.Succeeded)?.atMillis,
        failure = (run as? SyncRunState.Failed)?.let { syncFailure(it.reason) },
        lastSyncMillis = lastSyncMillis,
        canSyncNow = !demo && kind != SyncKind.RUNNING,
    )
}

// --- Takeout ---------------------------------------------------------------------------------------

data class TakeoutUi(
    val lastImportMillis: Long?,
    /** 0 means no reminder. */
    val reminderDays: Int,
    val overdue: Boolean,
    val canImport: Boolean,
)

fun takeoutUi(settings: AppSettings, demo: Boolean, nowMillis: Long): TakeoutUi {
    val days = settings.takeoutNudgeDays.coerceAtLeast(0)
    val last = settings.lastTakeoutImportMillis
    val overdue = days > 0 && (last == null || nowMillis - last > days * DAY_MILLIS)
    return TakeoutUi(last, days, overdue && !demo, canImport = !demo)
}

// --- Whole screen ----------------------------------------------------------------------------------

data class DataSourcesUiState(
    val nowMillis: Long,
    val demo: Boolean,
    val google: GoogleCardModel,
    /** Null when Google Health is not configured. */
    val rateLimit: RateLimitUi?,
    /** Null until the first check has finished. */
    val healthConnect: HealthConnectUi?,
    val sync: SyncUi,
    /** Null until the repository has answered. */
    val sections: List<SourceSection>?,
    val counts: List<CountRow>?,
    val earliestDay: Long?,
    val takeout: TakeoutUi,
)

// --- Diagnostics -----------------------------------------------------------------------------------

/** The report preview: [text] is null until built; [failed] when building threw. */
data class DiagnosticsUi(val text: String? = null, val loading: Boolean = false, val failed: Boolean = false)

/** Reduces the auth state to what the report may show: signed in or not, and scope names. No account data. */
fun googleAuthSnapshot(configured: Boolean, auth: AuthState?): GoogleAuthSnapshot = when (auth) {
    is AuthState.SignedIn -> GoogleAuthSnapshot(configured, signedIn = true, grantedScopes = auth.grantedScopes)
    else -> GoogleAuthSnapshot(configured, signedIn = false, grantedScopes = emptySet())
}
