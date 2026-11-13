package com.apex.athlete.widget

import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.widget.WidgetTestData.DAY
import com.apex.athlete.widget.WidgetTestData.NOW
import com.apex.athlete.widget.WidgetTestData.UTC
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class WidgetStateMapperTest {

    private fun content(snapshot: WidgetSnapshot, now: Long = NOW): WidgetUiState.Content =
        assertIs<WidgetUiState.Content>(WidgetStateMapper.map(snapshot, now, UTC))

    // --- neutral state -----------------------------------------------------------------------

    @Test
    fun noSnapshotIsTheNeutralState() {
        assertEquals(WidgetUiState.OpenApex, WidgetStateMapper.map(null, NOW, UTC))
    }

    @Test
    fun aDemoSnapshotIsRefusedEvenIfOneIsStored() {
        assertEquals(WidgetUiState.OpenApex, WidgetStateMapper.map(WidgetTestData.snapshot(isDemo = true), NOW, UTC))
    }

    // --- recovery bands ----------------------------------------------------------------------

    private fun recoveryTile(score: Double, storedBand: String? = null) =
        content(WidgetTestData.snapshot(recovery = WidgetTestData.value(score, band = storedBand))).recovery as TileState.Value

    @Test
    fun bandsFollowTheAppThresholds() {
        assertEquals(RecoveryBand.RED, recoveryTile(0.0).band)
        assertEquals(RecoveryBand.RED, recoveryTile(33.0).band)
        assertEquals(RecoveryBand.YELLOW, recoveryTile(34.0).band)
        assertEquals(RecoveryBand.YELLOW, recoveryTile(66.0).band)
        assertEquals(RecoveryBand.GREEN, recoveryTile(67.0).band)
        assertEquals(RecoveryBand.GREEN, recoveryTile(100.0).band)
    }

    @Test
    fun theStoredBandWinsAndAnUnknownOneFallsBackToTheScore() {
        assertEquals(RecoveryBand.YELLOW, recoveryTile(80.0, storedBand = "YELLOW").band)
        assertEquals(RecoveryBand.GREEN, recoveryTile(80.0, storedBand = "PURPLE").band)
        assertEquals(RecoveryBand.RED, recoveryTile(10.0, storedBand = null).band)
    }

    @Test
    fun ringFractionsUseTheDialScales() {
        val c = content(WidgetTestData.snapshot(recovery = WidgetTestData.value(74.0), sleep = WidgetTestData.value(50.0), strain = WidgetTestData.value(10.5)))
        assertEquals(0.74f, (c.recovery as TileState.Value).fraction, 1e-6f)
        assertEquals(0.5f, (c.sleep as TileState.Value).fraction, 1e-6f)
        val strain = c.strain as TileState.Value
        assertEquals(0.5f, strain.fraction, 1e-6f)
        assertEquals(1, strain.decimals)
        assertNull(strain.band, "only recovery has a band")
        assertNull((c.sleep as TileState.Value).band)
    }

    @Test
    fun outOfRangeScoresStayInsideTheRing() {
        val c = content(WidgetTestData.snapshot(recovery = WidgetTestData.value(140.0), strain = WidgetTestData.value(25.0)))
        assertEquals(1f, (c.recovery as TileState.Value).fraction)
        assertEquals(1f, (c.strain as TileState.Value).fraction)
    }

    // --- states ------------------------------------------------------------------------------

    @Test
    fun calibratingKeepsTheNightsLeft() {
        val c = content(WidgetTestData.snapshot(recovery = WidgetMetric(WidgetMetricStatus.CALIBRATING, calibrationDaysLeft = 4)))
        assertEquals(TileState.Calibrating(4), c.recovery)
    }

    @Test
    fun calibratingWithoutDaysIsStillCalibratingNotZero() {
        val c = content(WidgetTestData.snapshot(recovery = WidgetMetric(WidgetMetricStatus.CALIBRATING, calibrationDaysLeft = 0)))
        assertEquals(TileState.Calibrating(null), c.recovery)
    }

    @Test
    fun unavailableCarriesItsReasonAndUnknownReasonsAreNoData() {
        val c = content(
            WidgetTestData.snapshot(
                recovery = WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = MetricReason.AWAITING_SLEEP_SYNC.name),
                sleep = WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = "SOMETHING_NEW"),
                strain = WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = null),
            ),
        )
        assertEquals(TileState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC), c.recovery)
        assertEquals(TileState.Unavailable(MetricReason.NO_DATA), c.sleep)
        assertEquals(TileState.Unavailable(MetricReason.NO_DATA), c.strain)
    }

    @Test
    fun aValueWithoutANumberIsNoDataNeverZero() {
        val c = content(WidgetTestData.snapshot(recovery = WidgetMetric(WidgetMetricStatus.VALUE, value = null)))
        assertEquals(TileState.Unavailable(MetricReason.NO_DATA), c.recovery)
        val nan = content(WidgetTestData.snapshot(recovery = WidgetMetric(WidgetMetricStatus.VALUE, value = Double.NaN)))
        assertEquals(TileState.Unavailable(MetricReason.NO_DATA), nan.recovery)
    }

    @Test
    fun provisionalAndProvenancePassThrough() {
        val c = content(WidgetTestData.snapshot(strain = WidgetTestData.value(8.0, prov = "derived", provisional = true), sleep = WidgetTestData.value(80.0, prov = "bogus")))
        val strain = c.strain as TileState.Value
        assertEquals(true, strain.provisional)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, strain.provenance)
        assertNull((c.sleep as TileState.Value).provenance, "an unknown source key is shown as unknown, not guessed")
    }

    @Test
    fun aGenuineZeroStaysZero() {
        val strain = content(WidgetTestData.snapshot(strain = WidgetTestData.value(0.0))).strain as TileState.Value
        assertEquals(0.0, strain.number)
        assertEquals(0f, strain.fraction)
    }

    // --- day rollover ------------------------------------------------------------------------

    @Test
    fun scoresFromAnotherDayAreNotShownAsToday() {
        val yesterday = WidgetTestData.snapshot(epochDay = DAY - 1)
        val c = content(yesterday)
        val none = TileState.Unavailable(MetricReason.NO_DATA)
        assertEquals(none, c.recovery)
        assertEquals(none, c.sleep)
        assertEquals(none, c.strain)
        // The heart rate has its own timestamp and is judged by its age alone.
        assertIs<HeartRateTile.Reading>(c.heartRate)
    }

    @Test
    fun theDayIsJudgedInTheGivenZone() {
        // 23:30 UTC is already tomorrow in Berlin (UTC+1 in November).
        val lateUtc = java.time.LocalDate.ofEpochDay(DAY).atTime(23, 30).atZone(UTC).toInstant().toEpochMilli()
        val berlin = java.time.ZoneId.of("Europe/Berlin")
        val snap = WidgetTestData.snapshot(epochDay = DAY, heartRateAtMillis = lateUtc - 60_000L)
        val inUtc = WidgetStateMapper.map(snap, lateUtc, UTC) as WidgetUiState.Content
        val inBerlin = WidgetStateMapper.map(snap, lateUtc, berlin) as WidgetUiState.Content
        assertIs<TileState.Value>(inUtc.recovery)
        assertIs<TileState.Unavailable>(inBerlin.recovery)
    }

    // --- heart rate --------------------------------------------------------------------------

    private fun hr(atMillis: Long?, bpm: Int? = 72, now: Long = NOW) =
        WidgetStateMapper.heartRate(WidgetTestData.snapshot(heartRateBpm = bpm, heartRateAtMillis = atMillis), now)

    @Test
    fun aRecentReadingShowsItsAgeInWholeMinutes() {
        val tile = assertIs<HeartRateTile.Reading>(hr(NOW - 12 * 60_000L - 59_000L))
        assertEquals(72, tile.bpm)
        assertEquals(12L, tile.ageMinutes)
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, tile.provenance)
    }

    @Test
    fun aReadingExactlySixHoursOldIsStillShown() {
        assertIs<HeartRateTile.Reading>(hr(NOW - WidgetStateMapper.HEART_RATE_MAX_AGE_MILLIS))
    }

    @Test
    fun aReadingOlderThanSixHoursIsNeverANumber() {
        assertEquals(HeartRateTile.NoRecent, hr(NOW - WidgetStateMapper.HEART_RATE_MAX_AGE_MILLIS - 1))
        assertEquals(HeartRateTile.NoRecent, hr(NOW - 24 * 3_600_000L))
    }

    @Test
    fun missingZeroAndFutureReadingsAreNeverANumber() {
        assertEquals(HeartRateTile.NoRecent, hr(null))
        assertEquals(HeartRateTile.NoRecent, hr(NOW - 60_000L, bpm = null))
        assertEquals(HeartRateTile.NoRecent, hr(NOW - 60_000L, bpm = 0))
        assertEquals(HeartRateTile.NoRecent, hr(NOW - 60_000L, bpm = -5))
        assertEquals(HeartRateTile.NoRecent, hr(NOW + 10 * 60_000L), "a reading from the future is not a reading")
    }

    @Test
    fun smallClockSkewCountsAsJustNow() {
        val tile = assertIs<HeartRateTile.Reading>(hr(NOW + 60_000L))
        assertEquals(0L, tile.ageMinutes)
    }

    @Test
    fun ageWordsSwitchAtOneMinuteAndOneHour() {
        assertEquals(AgeLabel(AgeUnit.JUST_NOW, 0), WidgetStateMapper.ageLabel(0))
        assertEquals(AgeLabel(AgeUnit.MINUTES, 1), WidgetStateMapper.ageLabel(1))
        assertEquals(AgeLabel(AgeUnit.MINUTES, 59), WidgetStateMapper.ageLabel(59))
        assertEquals(AgeLabel(AgeUnit.HOURS, 1), WidgetStateMapper.ageLabel(60))
        assertEquals(AgeLabel(AgeUnit.HOURS, 5), WidgetStateMapper.ageLabel(359))
        assertEquals(AgeLabel(AgeUnit.HOURS, 6), WidgetStateMapper.ageLabel(360))
    }

    @Test
    fun theUpdateTimeIsTheSnapshotsOwn() {
        assertEquals(NOW - 60_000L, content(WidgetTestData.snapshot()).updatedAtMillis)
    }
}
