package com.apex.athlete.core.data.diagnostics

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DiagnosticsReportTest {

    private fun input(
        google: GoogleDiag = GoogleDiag(
            configured = true,
            signedIn = true,
            grantedScopes = listOf("https://www.googleapis.com/auth/googlehealth.sleep.readonly", "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"),
            lastSyncCode = "success",
            lastSyncDay = LocalDate.of(2026, 11, 10),
            streams = listOf(
                StreamMarkDiag("ghealth_api", "sleep", "SUCCESS", LocalDate.of(2026, 11, 10)),
                StreamMarkDiag("ghealth_api", "heart-rate", "NEVER_SYNCED", null),
            ),
        ),
        hc: HealthConnectDiag = HealthConnectDiag(
            sdkStatus = "AVAILABLE",
            granted = listOf("android.permission.health.READ_HEART_RATE"),
            missing = listOf("android.permission.health.READ_SLEEP"),
            historyGranted = true,
            backgroundGranted = false,
            origins = mapOf("HEART_RATE" to listOf("com.fitbit.FitbitMobile"), "STEPS" to listOf("com.google.android.apps.fitness", "com.fitbit.FitbitMobile")),
        ),
        takeout: TakeoutDiag = TakeoutDiag(null, null, null),
        device: DeviceDiag = DeviceDiag("1.0.0", "debug", 35, "Google", "Pixel 9", "en-GB", "Europe/London", true, "METRIC"),
    ) = DiagnosticsInput(
        device = device,
        mode = ModeDiag(demo = false, onboardingDone = true, backgroundSync = true, notifications = false),
        google = google,
        healthConnect = hc,
        heartRate = HeartRateProbe(7, 9_000, 10_080, 5.0),
        streams = listOf(StreamCoverage("heart_rate_minutes", 9_000, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 11))),
        takeout = takeout,
        database = DatabaseDiag(3, true),
    )

    @Test
    fun startsWithTheHeaderAndHasEverySection() {
        val text = DiagnosticsReport.build(input())
        assertEquals(DiagnosticsReport.HEADER, text.lines().first())
        assertEquals("Apex diagnostics (redacted, contains no health values)", DiagnosticsReport.HEADER)
        listOf("App and device", "Mode", "Google Health", "Health Connect", "Known-unknowns probes", "Takeout", "Database").forEach {
            assertTrue("== $it ==" in text, it)
        }
        assertTrue("Android SDK level: 35" in text)
        assertTrue("Time zone: Europe/London" in text)
        assertTrue("Data mode: Real" in text)
        assertTrue("Room schema version: 3" in text)
        assertTrue("Encrypted: yes (SQLCipher)" in text)
    }

    @Test
    fun showsScopesWatermarkDaysAndOriginsButNothingFinerThanADay() {
        val text = DiagnosticsReport.build(input())
        assertTrue("googlehealth.sleep.readonly" in text)
        assertTrue("ghealth_api / sleep: SUCCESS, 2026-11-10" in text)
        assertTrue("ghealth_api / heart-rate: NEVER_SYNCED, --" in text)
        assertTrue("HEART_RATE: com.fitbit.FitbitMobile" in text)
        assertTrue("STEPS: com.fitbit.FitbitMobile, com.google.android.apps.fitness" in text)
        assertTrue("- READ_SLEEP" in text && "android.permission.health.READ_SLEEP" !in text)
        assertTrue("Last sync result: success" in text)
        // No ISO instant or clock time anywhere.
        assertFalse(Regex("\\d{2}:\\d{2}").containsMatchIn(text))
        assertFalse("T" in Regex("\\d{4}-\\d{2}-\\d{2}(.)?").findAll(text).mapNotNull { it.groupValues[1].takeIf { c -> c.isNotEmpty() } }.joinToString(""))
    }

    @Test
    fun heartRateProbeReportsEstimateAndCoverage() {
        val text = DiagnosticsReport.build(input())
        assertTrue("Median sample interval: 5.0 s" in text)
        assertTrue("Coverage: 9000 of 10080 minutes (89.3 %)" in text)
        assertTrue("one-minute buckets only" in text)
        assertTrue("heart_rate_minutes: 9000, 2026-11-04, 2026-11-11" in text)
    }

    @Test
    fun freeTextCannotInjectLinesOrInvalidPackageNames() {
        val text = DiagnosticsReport.build(
            input(
                device = DeviceDiag("1.0", "debug", 35, "Evil\nInjected: yes", "M\u0000odel", "en", "UTC", false, "IMPERIAL"),
                hc = HealthConnectDiag("AVAILABLE", emptyList(), emptyList(), false, false, mapOf("STEPS" to listOf("not a package\nname", "com.ok.app"))),
            ),
        )
        assertFalse(text.lines().any { it.startsWith("Injected") })
        assertTrue("Device: EvilInjected: yes Model" in text)
        assertTrue("(invalid name)" in text && "com.ok.app" in text)
        assertTrue("Clock: 12 hour" in text)
    }

    @Test
    fun missingThingsAreSaidNotInvented() {
        val text = DiagnosticsReport.build(
            input(
                google = GoogleDiag(false, false, emptyList(), null, null, emptyList()),
                hc = HealthConnectDiag("UNAVAILABLE", emptyList(), emptyList(), false, false, null),
            ),
        )
        assertTrue("Signed in: no" in text)
        assertTrue("Granted scopes: none" in text)
        assertTrue("Last sync result: never" in text)
        assertTrue("Stream watermarks: none" in text)
        assertTrue("Data origins (writing apps): not available" in text)
        assertTrue("Last import: none recorded" in text)
    }

    @Test
    fun takeoutTextsAreIncluded() {
        val text = DiagnosticsReport.build(input(takeout = TakeoutDiag(LocalDate.of(2026, 11, 9), "Import outcome: COMPLETED\nFiles imported: 3", "Archive layout (names redacted, nothing parsed)")))
        assertTrue("Last import day: 2026-11-09" in text)
        assertTrue("Import outcome: COMPLETED" in text)
        assertTrue("Archive layout (names redacted, nothing parsed)" in text)
    }

    @Test
    fun heartRateProbeMedianAndEmpty() {
        val p = DiagnosticsProbes.heartRateProbe(listOf(12, 12, 6, 0), windowDays = 7)
        assertEquals(4, p.bucketsPresent)
        assertEquals(10_080, p.windowMinutes)
        assertEquals(5.0, assertNotNull(p.medianIntervalSeconds), 1e-9)
        val even = DiagnosticsProbes.heartRateProbe(listOf(60, 12), windowDays = 1)
        assertEquals(3.0, assertNotNull(even.medianIntervalSeconds), 1e-9)
        assertNull(DiagnosticsProbes.heartRateProbe(emptyList(), 7).medianIntervalSeconds)
    }
}
