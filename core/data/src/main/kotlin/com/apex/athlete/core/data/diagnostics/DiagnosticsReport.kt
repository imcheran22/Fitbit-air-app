package com.apex.athlete.core.data.diagnostics

import java.time.LocalDate

/*
 * A redacted diagnostics report the owner can paste or share (spec section 14, known-unknowns protocol).
 * Pure: data in, text out. It never receives a health value, token, client ID, account name, user file
 * name or a timestamp finer than a day, and every free-text field is sanitised again on the way out, so
 * a collector bug cannot leak through newlines or odd characters.
 */

data class DeviceDiag(
    val appVersion: String,
    val buildType: String,
    val sdkInt: Int,
    val manufacturer: String,
    val model: String,
    val locale: String,
    val zoneId: String,
    val clock24h: Boolean,
    /** Enum name of the units setting, for example METRIC. */
    val units: String,
)

data class ModeDiag(
    val demo: Boolean,
    val onboardingDone: Boolean,
    val backgroundSync: Boolean,
    val notifications: Boolean,
)

/** One watermark row. [watermarkDay] is the civil day of the read-up-to instant, nothing finer. */
data class StreamMarkDiag(val source: String, val stream: String, val status: String, val watermarkDay: LocalDate?)

data class GoogleDiag(
    val configured: Boolean,
    val signedIn: Boolean,
    /** Scope names (URLs of the documented scopes) only. */
    val grantedScopes: List<String>,
    /** Stable result code of the last sync run, for example `success`. */
    val lastSyncCode: String?,
    val lastSyncDay: LocalDate?,
    val streams: List<StreamMarkDiag>,
)

data class HealthConnectDiag(
    /** Enum name of the SDK status. */
    val sdkStatus: String,
    val granted: List<String>,
    val missing: List<String>,
    val historyGranted: Boolean,
    val backgroundGranted: Boolean,
    /** Record type name to the package names that wrote it; null when the origins could not be read. */
    val origins: Map<String, List<String>>?,
)

/**
 * Heart rate sampling probe. Only one-minute buckets are stored, so the interval is derived from each
 * bucket's sample count (60 s / count) and is an estimate; coverage is buckets present / minutes in the window.
 */
data class HeartRateProbe(
    val windowDays: Int,
    val bucketsPresent: Int,
    val windowMinutes: Int,
    val medianIntervalSeconds: Double?,
)

data class StreamCoverage(val name: String, val rows: Int, val firstDay: LocalDate?, val lastDay: LocalDate?)

data class TakeoutDiag(
    val lastImportDay: LocalDate?,
    /** Rendered, value-free summary of the last import report; null when no import has run. */
    val summaryText: String?,
    /** `TakeoutLayoutReport.toRedactedText()` of the last import; null when none was kept. */
    val layoutText: String?,
)

data class DatabaseDiag(val schemaVersion: Int?, val encrypted: Boolean)

data class DiagnosticsInput(
    val device: DeviceDiag,
    val mode: ModeDiag,
    val google: GoogleDiag,
    val healthConnect: HealthConnectDiag,
    val heartRate: HeartRateProbe?,
    val streams: List<StreamCoverage>,
    val takeout: TakeoutDiag,
    val database: DatabaseDiag,
)

object DiagnosticsReport {
    const val HEADER = "Apex diagnostics (redacted, contains no health values)"
    private const val NONE = "none"
    private const val UNKNOWN = "unknown"

    fun build(i: DiagnosticsInput): String = buildString {
        line(HEADER)
        line()
        section("App and device")
        kv("App version", i.device.appVersion)
        kv("Build type", i.device.buildType)
        kv("Android SDK level", i.device.sdkInt.toString())
        kv("Device", "${clean(i.device.manufacturer)} ${clean(i.device.model)}".trim())
        kv("Locale", i.device.locale)
        kv("Time zone", i.device.zoneId)
        kv("Clock", if (i.device.clock24h) "24 hour" else "12 hour")
        kv("Units", i.device.units)

        section("Mode")
        kv("Data mode", if (i.mode.demo) "Demo" else "Real")
        kv("Onboarding done", yn(i.mode.onboardingDone))
        kv("Background sync", onOff(i.mode.backgroundSync))
        kv("Notifications", onOff(i.mode.notifications))

        section("Google Health")
        kv("Configured", yn(i.google.configured))
        kv("Signed in", yn(i.google.signedIn))
        kv("Granted scopes", if (i.google.grantedScopes.isEmpty()) NONE else "")
        i.google.grantedScopes.sorted().forEach { line("  - ${clean(it)}") }
        kv("Last sync result", i.google.lastSyncCode?.let(::clean) ?: "never")
        kv("Last sync day", day(i.google.lastSyncDay))
        if (i.google.streams.isEmpty()) {
            kv("Stream watermarks", NONE)
        } else {
            line("Stream watermarks (source, stream, status, read up to day):")
            i.google.streams.sortedWith(compareBy({ it.source }, { it.stream })).forEach {
                line("  ${clean(it.source)} / ${clean(it.stream)}: ${clean(it.status)}, ${day(it.watermarkDay)}")
            }
        }

        section("Health Connect")
        kv("SDK status", clean(i.healthConnect.sdkStatus))
        kv("History permission granted", yn(i.healthConnect.historyGranted))
        kv("Background permission granted", yn(i.healthConnect.backgroundGranted))
        permissionList("Granted permissions", i.healthConnect.granted)
        permissionList("Missing permissions", i.healthConnect.missing)
        val origins = i.healthConnect.origins
        if (origins == null) {
            kv("Data origins (writing apps)", "not available")
        } else if (origins.isEmpty()) {
            kv("Data origins (writing apps)", "no records found in the last 7 days")
        } else {
            line("Data origins (apps that wrote each record type in the last 7 days, first page of records only):")
            origins.toSortedMap().forEach { (type, pkgs) ->
                line("  ${clean(type)}: ${pkgs.map(::packageName).distinct().sorted().joinToString(", ").ifEmpty { NONE }}")
            }
        }

        section("Known-unknowns probes")
        val hr = i.heartRate
        if (hr == null) {
            kv("Heart rate sampling", "not measured")
        } else {
            kv("Heart rate window", "last ${hr.windowDays} days")
            kv("Heart rate storage", "one-minute buckets only, so the interval below is estimated from each bucket's sample count")
            kv("Median sample interval", hr.medianIntervalSeconds?.let { "%.1f s".format(java.util.Locale.ROOT, it) } ?: "no data")
            val pct = if (hr.windowMinutes > 0) 100.0 * hr.bucketsPresent / hr.windowMinutes else 0.0
            kv("Coverage", "${hr.bucketsPresent} of ${hr.windowMinutes} minutes (%.1f %%)".format(java.util.Locale.ROOT, pct))
        }
        if (i.streams.isEmpty()) {
            kv("Stored streams", NONE)
        } else {
            line("Stored streams (rows, first day, last day):")
            i.streams.forEach { line("  ${clean(it.name)}: ${it.rows}, ${day(it.firstDay)}, ${day(it.lastDay)}") }
        }

        section("Takeout")
        kv("Last import day", day(i.takeout.lastImportDay))
        if (i.takeout.summaryText == null) kv("Last import", "none recorded") else block(i.takeout.summaryText)
        if (i.takeout.layoutText != null) block(i.takeout.layoutText)

        section("Database")
        kv("Room schema version", i.database.schemaVersion?.toString() ?: UNKNOWN)
        kv("Encrypted", if (i.database.encrypted) "yes (SQLCipher)" else "no (in-memory demo store)")
    }

    // --- Helpers -----------------------------------------------------------------------------------

    private val packagePattern = Regex("^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)*$")

    /** Package names are public identifiers; anything that does not look like one is dropped. */
    private fun packageName(raw: String): String = raw.trim().takeIf { it.length <= 120 && packagePattern.matches(it) } ?: "(invalid name)"

    /** One line, printable characters only, bounded length. */
    internal fun clean(raw: String, max: Int = 200): String =
        raw.filter { it == ' ' || (!it.isISOControl() && !it.isWhitespace()) }.trim().take(max)

    private fun day(d: LocalDate?): String = d?.toString() ?: "--"
    private fun yn(b: Boolean) = if (b) "yes" else "no"
    private fun onOff(b: Boolean) = if (b) "on" else "off"

    private fun StringBuilder.line(s: String = "") { append(s).append('\n') }
    private fun StringBuilder.section(title: String) { line(); line("== $title ==") }
    private fun StringBuilder.kv(k: String, v: String) { if (v.isEmpty()) line("$k:") else line("$k: $v") }

    /** Multi-line text from our own renderers: control characters other than newline are removed. */
    private fun StringBuilder.block(text: String) {
        text.lineSequence().forEach { l -> line(l.filter { it == ' ' || !it.isISOControl() }.take(300).trimEnd()) }
    }

    private fun StringBuilder.permissionList(title: String, names: List<String>) {
        if (names.isEmpty()) {
            kv(title, NONE)
        } else {
            line("$title:")
            names.map { clean(it).removePrefix("android.permission.health.") }.sorted().forEach { line("  - $it") }
        }
    }
}
