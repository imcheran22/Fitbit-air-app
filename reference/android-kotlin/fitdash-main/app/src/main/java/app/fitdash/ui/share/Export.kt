package app.fitdash.ui.share

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import app.fitdash.health.HealthSnapshot
import app.fitdash.metrics.Goals
import app.fitdash.metrics.dailyCsv
import app.fitdash.metrics.heartRateCsv
import app.fitdash.metrics.journalCsv
import app.fitdash.metrics.sleepStagesCsv
import app.fitdash.metrics.workoutsCsv
import app.fitdash.settings.DayJournal
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

suspend fun shareFile(context: Context, name: String, write: (File) -> Unit): Uri {
    val file = withContext(Dispatchers.IO) {
        clearShareCache(context)
        File(context.cacheDir, "share").apply { mkdirs() }.resolve(name).also(write)
    }
    return FileProvider.getUriForFile(context, "${context.packageName}.share", file)
}

suspend fun exportDaily(context: Context, snapshot: HealthSnapshot, goals: Goals, journal: Map<LocalDate, DayJournal>, now: ZonedDateTime): Uri =
    shareFile(context, "fitdash-daily-${now.toLocalDate()}.csv") { it.writeText(dailyCsv(snapshot, now, goals, journal)) }

suspend fun exportRaw(context: Context, snapshot: HealthSnapshot, journal: Map<LocalDate, DayJournal>, zone: ZoneId): Uri =
    shareFile(context, "fitdash-raw-${LocalDate.now(zone)}.zip") { f ->
        ZipOutputStream(f.outputStream()).use { zip ->
            val files = mapOf(
                "heart_rate.csv" to heartRateCsv(snapshot, zone),
                "sleep_stages.csv" to sleepStagesCsv(snapshot, zone),
                "workouts.csv" to workoutsCsv(snapshot, zone),
                "journal.csv" to journalCsv(journal),
            )
            for ((name, text) in files) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(text.toByteArray())
                zip.closeEntry()
            }
        }
    }
