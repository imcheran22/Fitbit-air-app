package com.apex.athlete.ui.common

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.recovery.RecoveryResult
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.data.pipeline.MissingReason
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS")
class StateMappersTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val now = 1_800_000_000_000L
    private val mapper = MetricStateMapper(ApexFormatter(context, UnitSystem.METRIC, true, { ZoneOffset.UTC }, { now }))

    private fun recovery(status: RecoveryStatus, percent: Int? = null, daysLeft: Int? = null) = RecoveryResult(
        status = status, score = percent?.toDouble(), scorePercent = percent, category = null, recommendation = null,
        contributions = emptyList(), positiveContributors = emptyList(), negativeContributors = emptyList(),
        missingComponents = emptyList(), calibrationDaysRemaining = daysLeft, provenance = DataProvenance.MATHEMATICALLY_DERIVED,
    )

    @Test
    fun scoredRecoveryKeepsProvenance() {
        val s = assertIs<MetricState.Value>(mapper.recovery(recovery(RecoveryStatus.SCORED, 72)))
        assertEquals(72.0, s.value)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, s.provenance)
    }

    @Test
    fun calibratingRecoveryCarriesDaysLeftAndNoNumber() {
        val s = assertIs<MetricState.Calibrating>(mapper.recovery(recovery(RecoveryStatus.CALIBRATING, daysLeft = 4)))
        assertEquals(4, s.daysLeft)
    }

    @Test
    fun unavailableRecoveryIsNotZero() {
        assertIs<MetricState.Unavailable>(mapper.recovery(recovery(RecoveryStatus.UNAVAILABLE)))
        // A "scored" result without a percentage must not become 0 either.
        assertIs<MetricState.Unavailable>(mapper.recovery(recovery(RecoveryStatus.SCORED, null)))
    }

    @Test
    fun missingReasonsMapToUnavailableOrCalibrating() {
        assertEquals(MetricReason.INSUFFICIENT_HR_DATA, assertIs<MetricState.Unavailable>(mapper.missing(MissingReason.NO_HEART_RATE_DATA)).reason)
        assertEquals(MetricReason.AWAITING_SLEEP_SYNC, assertIs<MetricState.Unavailable>(mapper.missing(MissingReason.NO_SLEEP_DATA)).reason)
        assertIs<MetricState.Calibrating>(mapper.missing(MissingReason.CALIBRATING))
        assertEquals(MetricReason.NO_DATA, assertIs<MetricState.Unavailable>(mapper.missing(null)).reason)
        assertTrue(assertIs<MetricState.Unavailable>(mapper.missing(MissingReason.NEEDS_MAX_HEART_RATE)).detail != null)
    }

    @Test
    fun valueRules() {
        assertIs<MetricState.Unavailable>(mapper.value(null, 0, "bpm", null))
        assertIs<MetricState.Unavailable>(mapper.value(Double.NaN, 0, "bpm", null))
        val fresh = assertIs<MetricState.Value>(mapper.value(52.0, 0, "bpm", DataProvenance.IMPORTED_HEALTH_CONNECT, now - 60 * 60_000L, isProvisional = true))
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, fresh.provenance)
        assertTrue(fresh.isProvisional)
        val stale = assertIs<MetricState.Stale>(mapper.value(52.0, 0, "bpm", null, now - 37 * 3_600_000L))
        assertEquals("1 d ago", stale.since)
        // Exactly at the threshold is still current.
        assertIs<MetricState.Value>(mapper.value(52.0, 0, "bpm", null, now - 36 * 3_600_000L))
    }

    @Test
    fun heartRateWithoutBpmIsUnavailable() {
        assertIs<MetricState.Unavailable>(mapper.heartRate(null))
        assertIs<MetricState.Unavailable>(mapper.heartRate(HeartRateTick(now, null)))
        assertIs<MetricState.Value>(mapper.heartRate(HeartRateTick(now - 60_000, 61.0)))
    }

    @Test
    fun intelligenceWithoutReadingIsUnavailableNotZero() {
        val day = 20_000L
        val empty = MetricTrendAnalyzer.analyze(emptyList(), day, BaselineSpecs.HRV)
        assertIs<MetricState.Unavailable>(mapper.intelligence(empty, MetricType.HRV_RMSSD, null))
        assertTrue((mapper.calibrationDaysLeft(empty) ?: 0) > 0)
        val withReading = MetricTrendAnalyzer.analyze(listOf(DailyValue(day, 48.0)), day, BaselineSpecs.HRV)
        val v = assertIs<MetricState.Value>(mapper.intelligence(withReading, MetricType.HRV_RMSSD, DataProvenance.IMPORTED_HEALTH_CONNECT))
        assertEquals(48.0, v.value)
        assertEquals("ms", v.unit)
        assertTrue((mapper.calibrationDaysLeft(withReading) ?: 0) > 0)
    }

    @Test
    fun sleepDurationIsShownInHours() {
        val day = 20_000L
        val i = MetricTrendAnalyzer.analyze(listOf(DailyValue(day, 450.0)), day, BaselineSpecs.SLEEP_DURATION)
        val v = assertIs<MetricState.Value>(mapper.intelligence(i, MetricType.SLEEP_DURATION, null))
        assertEquals(7.5, v.value)
        assertEquals("h", v.unit)
    }
}
