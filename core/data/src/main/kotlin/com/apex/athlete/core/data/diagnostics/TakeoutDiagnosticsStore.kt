package com.apex.athlete.core.data.diagnostics

import android.content.Context
import android.content.SharedPreferences
import com.apex.athlete.core.data.takeout.TakeoutImportReport
import java.time.Instant
import java.time.ZoneId

/**
 * Keeps the value-free text of the last archive import so the diagnostics report can include it after
 * the work has finished. Holds only [DiagnosticsProbes.takeoutSummary] and the redacted layout text
 * (counts, enum names and name patterns), never a file name, URI or health value.
 */
class TakeoutDiagnosticsStore(context: Context) {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun save(report: TakeoutImportReport, zone: ZoneId = ZoneId.systemDefault()) {
        val day = Instant.ofEpochMilli(report.finishedAtMillis).atZone(zone).toLocalDate().toEpochDay()
        prefs.edit()
            .putString(SUMMARY, DiagnosticsProbes.takeoutSummary(report))
            .putString(LAYOUT, report.layout.toRedactedText())
            .putLong(DAY, day)
            .apply()
    }

    fun read(): TakeoutDiag? {
        val summary = prefs.getString(SUMMARY, null) ?: return null
        val day = if (prefs.contains(DAY)) prefs.getLong(DAY, 0L) else null
        return TakeoutDiag(DiagnosticsProbes.epochDay(day), summary, prefs.getString(LAYOUT, null))
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val FILE = "apex_takeout_diagnostics"
        const val SUMMARY = "summary"
        const val LAYOUT = "layout"
        const val DAY = "day"
    }
}
