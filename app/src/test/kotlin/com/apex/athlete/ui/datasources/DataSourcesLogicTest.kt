package com.apex.athlete.ui.datasources

import com.apex.athlete.core.data.healthconnect.HcFamily
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.healthconnect.HealthConnectStatus
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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DataSourcesLogicTest {
    private fun mark(
        source: SyncSource = SyncSource.GOOGLE_HEALTH_API,
        stream: String = "heart-rate",
        status: SyncStatus = SyncStatus.SUCCESS,
        synced: Long = 1_000L,
        error: String? = null,
        failures: Int = 0,
        attempt: Long? = 2_000L,
        success: Long? = 1_500L,
    ) = SyncWatermarkEntity(
        source = source, stream = stream, lastSyncedEpochMillis = synced, status = status, lastError = error,
        consecutiveFailures = failures, lastAttemptEpochMillis = attempt, lastSuccessEpochMillis = success,
    )

    @Test fun aBackgroundRefusedHealthConnectReadIsNotAMissingPermission() {
        val row = watermarkRow(
            mark(source = SyncSource.HEALTH_CONNECT, status = SyncStatus.FAILED, error = "HealthConnectBackgroundReadException", failures = 1),
        )
        assertEquals(FailureKind.BACKGROUND_READ_UNAVAILABLE, row.failure)
        assertEquals(FailureKind.BACKGROUND_READ_UNAVAILABLE, failureKind(com.apex.athlete.core.data.source.HealthConnectBackgroundReadException::class.java.simpleName))
        // A real missing permission is unchanged.
        assertEquals(FailureKind.PERMISSION, watermarkRow(mark(status = SyncStatus.PERMISSION_MISSING)).failure)
    }

    @Test fun airRowMapsEachResultAndNeverInventsValues() {
        assertEquals(AirRowKind.LOADING, airRowUi(null).kind)
        assertEquals(AirRowKind.NO_DEVICE, airRowUi(com.apex.athlete.core.data.source.AirStatusResult.NoDevice).kind)
        assertEquals(AirRowKind.NOT_SIGNED_IN, airRowUi(com.apex.athlete.core.data.source.AirStatusResult.NotSignedIn).kind)
        assertEquals(AirRowKind.RECONNECT, airRowUi(com.apex.athlete.core.data.source.AirStatusResult.ScopeMissing).kind)
        assertEquals(AirRowKind.UNAVAILABLE, airRowUi(com.apex.athlete.core.data.source.AirStatusResult.Unavailable).kind)
        val found = airRowUi(
            com.apex.athlete.core.data.source.AirStatusResult.Found(com.apex.athlete.core.data.source.FitbitAirStatus("Fitbit Air", 80, "High", 5_000L)),
        )
        assertEquals(AirRowKind.FOUND, found.kind)
        assertEquals("Fitbit Air", found.model); assertEquals(80, found.batteryPercent); assertEquals(5_000L, found.lastSyncMillis)
        val sparse = airRowUi(com.apex.athlete.core.data.source.AirStatusResult.Found(com.apex.athlete.core.data.source.FitbitAirStatus(null, null, null, null)))
        assertEquals(AirRowKind.FOUND, sparse.kind)
        assertNull(sparse.model); assertNull(sparse.batteryPercent); assertNull(sparse.batteryStatus); assertNull(sparse.lastSyncMillis)
    }

    @Test fun neverSyncedStreamHasNoTimes() {
        val row = watermarkRow(mark(status = SyncStatus.NEVER_SYNCED, synced = 0L, attempt = null, success = null))
        assertEquals(WatermarkHealth.NEVER, row.health)
        assertNull(row.windowEndMillis)
        assertNull(row.lastSuccessMillis)
        assertNull(row.lastAttemptMillis)
        assertEquals(FailureKind.NONE, row.failure)
    }

    @Test fun successKeepsTimesAndDropsStaleError() {
        val row = watermarkRow(mark(error = "rate_limited"))
        assertEquals(WatermarkHealth.OK, row.health)
        assertEquals(1_000L, row.windowEndMillis)
        assertEquals(FailureKind.NONE, row.failure)
    }

    @Test fun failureCodesMapAndUnknownIsOther() {
        assertEquals(FailureKind.RATE_LIMITED, watermarkRow(mark(status = SyncStatus.PARTIAL, error = "rate_limited")).failure)
        assertEquals(FailureKind.SIGN_IN_EXPIRED, watermarkRow(mark(status = SyncStatus.FAILED, error = "sign_in_expired")).failure)
        assertEquals(FailureKind.OTHER, watermarkRow(mark(status = SyncStatus.FAILED, error = "IOException")).failure)
        assertEquals(FailureKind.OTHER, watermarkRow(mark(status = SyncStatus.FAILED, error = null)).failure)
        assertEquals(FailureKind.PERMISSION, watermarkRow(mark(status = SyncStatus.PERMISSION_MISSING, error = "permission")).failure)
    }

    @Test fun sectionsAreOrderedAndEmptySourcesDropped() {
        val sections = watermarkSections(
            listOf(
                mark(SyncSource.HEALTH_CONNECT, "steps"),
                mark(SyncSource.GOOGLE_HEALTH_API, "sleep"),
                mark(SyncSource.GOOGLE_HEALTH_API, "heart-rate"),
            ),
        )
        assertEquals(listOf(SyncSource.GOOGLE_HEALTH_API, SyncSource.HEALTH_CONNECT), sections.map { it.source })
        assertEquals(listOf("heart-rate", "sleep"), sections[0].rows.map { it.stream })
        assertTrue(watermarkSections(emptyList()).isEmpty())
    }

    @Test fun notConfiguredWinsOverAuth() {
        val m = googleCardModel(false, AuthState.SignedIn(emptySet()), SignInUiState.Idle)
        assertEquals(GoogleConnection.NOT_CONFIGURED, m.connection)
        assertFalse(m.canConnect)
    }

    @Test fun signedOutCanConnectButNotDisconnect() {
        val m = googleCardModel(true, AuthState.SignedOut, SignInUiState.Idle)
        assertTrue(m.canConnect)
        assertFalse(m.canDisconnect)
    }

    @Test fun signedInCanDisconnectButNotConnect() {
        val m = googleCardModel(true, AuthState.SignedIn(setOf("a")), SignInUiState.Idle)
        assertEquals(GoogleConnection.SIGNED_IN, m.connection)
        assertFalse(m.canConnect)
        assertTrue(m.canDisconnect)
    }

    @Test fun needsReauthCarriesReasonAndBothActions() {
        val m = googleCardModel(true, AuthState.NeedsReauth(ReauthReason.CLIENT_CHANGED), SignInUiState.Idle)
        assertEquals(ReauthReason.CLIENT_CHANGED, m.reauth)
        assertTrue(m.canConnect)
        assertTrue(m.canDisconnect)
    }

    @Test fun connectIsHiddenWhileSignInRuns() {
        val m = googleCardModel(true, AuthState.SignedOut, SignInUiState.WaitingForBrowser)
        assertFalse(m.canConnect)
    }

    @Test fun redirectMismatchKeepsBothSchemes() {
        val m = googleCardModel(true, AuthState.SignedOut, SignInUiState.RedirectSchemeMismatch("com.old", "com.new"))
        assertEquals(SignInNotice.REDIRECT_MISMATCH, m.notice)
        assertEquals("com.old", m.manifestScheme)
        assertEquals("com.new", m.neededScheme)
    }

    @Test fun doneCountsMissingScopes() {
        assertEquals(SignInNotice.DONE, googleCardModel(true, null, SignInUiState.Done(emptySet())).notice)
        val m = googleCardModel(true, null, SignInUiState.Done(setOf("x", "y")))
        assertEquals(SignInNotice.DONE_MISSING_SCOPES, m.notice)
        assertEquals(2, m.missingScopeCount)
        assertEquals(GoogleConnection.LOADING, m.connection)
    }

    @Test fun failedOutcomesMap() {
        fun notice(o: AuthorizationOutcome) = googleCardModel(true, AuthState.SignedOut, SignInUiState.Failed(o)).notice
        assertEquals(SignInNotice.DENIED, notice(AuthorizationOutcome.Denied("access_denied", null)))
        assertEquals(SignInNotice.NETWORK, notice(AuthorizationOutcome.NetworkFailure))
        assertEquals(SignInNotice.REFUSED, notice(AuthorizationOutcome.StateMismatch))
    }

    @Test fun rateLimitUsedIsLimitMinusRemaining() {
        val ui = rateLimitUi(RateLimitState(150, 108, 10_000L, null, false), nowMillis = 5_000L)
        assertEquals(42, ui.used)
        assertEquals(150, ui.limit)
        assertEquals(0.28f, ui.fraction!!, 0.001f)
        assertEquals(10_000L, ui.resetAtMillis)
    }

    @Test fun rateLimitUnknownStaysUnknown() {
        val ui = rateLimitUi(RateLimitState(null, null, null, null, false), nowMillis = 0L)
        assertNull(ui.used)
        assertNull(ui.fraction)
    }

    @Test fun rateLimitPastTimesAreDropped() {
        val ui = rateLimitUi(RateLimitState(150, 150, 1_000L, 2_000L, false), nowMillis = 5_000L)
        assertNull(ui.resetAtMillis)
        assertNull(ui.coolDownUntilMillis)
    }

    @Test fun rateLimitCoolDownKept() {
        val ui = rateLimitUi(RateLimitState(150, 0, 9_000L, 8_000L, true), nowMillis = 5_000L)
        assertEquals(150, ui.used)
        assertEquals(8_000L, ui.coolDownUntilMillis)
        assertTrue(ui.reportedByServer)
    }

    @Test fun minutesLeftRoundsUpAndNeverShowsZero() {
        assertEquals(1, minutesLeft(1_000L, 0L))
        assertEquals(1, minutesLeft(60_000L, 0L))
        assertEquals(2, minutesLeft(60_001L, 0L))
        assertEquals(1, minutesLeft(0L, 5_000L))
    }

    private fun hcStatus(
        sdk: HcSdkStatus = HcSdkStatus.AVAILABLE,
        granted: Set<String> = HealthConnectPermissions.recordPermissions,
        missing: Set<String> = emptySet(),
        history: Boolean = true,
        historyAvailable: Boolean = true,
        background: Boolean = true,
        backgroundAvailable: Boolean = true,
    ) = HealthConnectStatus(sdk, granted, missing, history, historyAvailable, background, backgroundAvailable, true)

    @Test fun healthConnectFullyPermittedCannotRequest() {
        val ui = healthConnectUi(hcStatus())
        assertTrue(ui.missing.isEmpty())
        assertFalse(ui.canRequest)
        assertEquals(FeatureState.GRANTED, ui.history)
    }

    @Test fun healthConnectMissingPermissionsListedInFamilyOrder() {
        val missing = setOf(HealthConnectPermissions.vo2Max, HealthConnectPermissions.heartRate)
        val ui = healthConnectUi(hcStatus(granted = emptySet(), missing = missing, history = false, background = false, backgroundAvailable = false))
        assertEquals(listOf(HcFamily.HEART_RATE, HcFamily.VO2_MAX), ui.missing)
        assertTrue(ui.canRequest)
        assertEquals(FeatureState.NOT_GRANTED, ui.history)
        assertEquals(FeatureState.UNSUPPORTED, ui.background)
    }

    @Test fun healthConnectNotInstalledCannotRequest() {
        val ui = healthConnectUi(hcStatus(sdk = HcSdkStatus.UNAVAILABLE, granted = emptySet(), missing = HealthConnectPermissions.recordPermissions, history = false, historyAvailable = false, background = false, backgroundAvailable = false))
        assertFalse(ui.canRequest)
        assertEquals(HealthConnectPermissions.recordPermissions.size, ui.missing.size)
    }

    @Test fun syncMapsEachRunState() {
        assertEquals(SyncKind.LOADING, syncUi(null, null, false).kind)
        assertEquals(SyncKind.IDLE, syncUi(SyncRunState.Idle, null, false).kind)
        assertEquals(99L, syncUi(SyncRunState.Succeeded(99L), 50L, false).succeededAtMillis)
        assertEquals(SyncKind.NEEDS_SIGN_IN, syncUi(SyncRunState.NeedsSignIn, null, false).kind)
        assertEquals(SyncFailure.RATE_LIMITED, syncUi(SyncRunState.Failed("rate_limited"), null, false).failure)
        assertEquals(SyncFailure.OTHER, syncUi(SyncRunState.Failed("weird"), null, false).failure)
    }

    @Test fun syncNowIsOffInDemoAndWhileRunning() {
        assertTrue(syncUi(SyncRunState.Idle, null, demo = false).canSyncNow)
        assertFalse(syncUi(SyncRunState.Idle, null, demo = true).canSyncNow)
        assertFalse(syncUi(SyncRunState.Running, null, demo = false).canSyncNow)
    }

    @Test fun syncKeepsNeverAsNull() {
        assertNull(syncUi(SyncRunState.Idle, null, false).lastSyncMillis)
    }

    private val day = 24L * 60 * 60 * 1000

    @Test fun takeoutNeverImportedWithReminderIsOverdue() {
        val t = takeoutUi(AppSettings(takeoutNudgeDays = 30), demo = false, nowMillis = 100 * day)
        assertTrue(t.overdue)
        assertNull(t.lastImportMillis)
        assertTrue(t.canImport)
    }

    @Test fun takeoutReminderOffIsNeverOverdue() {
        assertFalse(takeoutUi(AppSettings(takeoutNudgeDays = 0), false, 100 * day).overdue)
    }

    @Test fun takeoutRecentImportIsNotOverdue() {
        val s = AppSettings(takeoutNudgeDays = 30, lastTakeoutImportMillis = 90 * day)
        assertFalse(takeoutUi(s, false, 100 * day).overdue)
        assertTrue(takeoutUi(s, false, 130 * day + 1).overdue)
    }

    @Test fun takeoutIsHiddenInDemo() {
        val t = takeoutUi(AppSettings(takeoutNudgeDays = 30), demo = true, nowMillis = 100 * day)
        assertFalse(t.canImport)
        assertFalse(t.overdue)
    }
}
