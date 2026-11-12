package com.apex.athlete.core.data.takeout

import java.time.DateTimeException
import java.time.LocalDate

/**
 * Decides, from the entry name alone, whether an archive entry is one of the files the engine may
 * read. This is the whitelist: an entry that matches nothing here is never opened for parsing, so
 * profile, location, messages and every other part of a Takeout archive stay unread.
 *
 * Matching uses the file name only (the last path segment), case-insensitively, so a moved or
 * renamed folder does not hide the data. All names are UNVERIFIED against a real archive
 * (docs/OPEN_POINTS.md); the inspector's report shows what did not match.
 */
object TakeoutEntryRouter {

    private const val DATE = """(\d{4}-\d{2}-\d{2})"""

    private class Rule(
        pattern: String,
        val category: TakeoutCategory,
        val layout: TakeoutLayout,
        val format: TakeoutFormat,
    ) {
        val regex = Regex(pattern, RegexOption.IGNORE_CASE)
    }

    private val rules = listOf(
        // Classic layout ("Global Export Data" and the per-feature folders).
        Rule("""resting_heart_rate-$DATE\.json""", TakeoutCategory.RESTING_HEART_RATE, TakeoutLayout.CLASSIC, TakeoutFormat.JSON),
        Rule("""heart_rate-$DATE\.json""", TakeoutCategory.HEART_RATE, TakeoutLayout.CLASSIC, TakeoutFormat.JSON),
        Rule("""steps-$DATE\.json""", TakeoutCategory.STEPS, TakeoutLayout.CLASSIC, TakeoutFormat.JSON),
        Rule("""sleep-$DATE\.json""", TakeoutCategory.SLEEP, TakeoutLayout.CLASSIC, TakeoutFormat.JSON),
        Rule("""exercise-\d{1,9}\.json""", TakeoutCategory.EXERCISE, TakeoutLayout.CLASSIC, TakeoutFormat.JSON),
        Rule("""Heart Rate Variability Details\s*-\s*$DATE\.csv""", TakeoutCategory.HRV_DETAILS, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Daily Heart Rate Variability Summary\s*-\s*$DATE\.csv""", TakeoutCategory.HRV_DAILY, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Daily Respiratory Rate Summary\s*-\s*$DATE\.csv""", TakeoutCategory.RESPIRATORY_RATE, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Minute SpO2\s*-\s*$DATE\.csv""", TakeoutCategory.SPO2_MINUTE, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Daily SpO2\s*-\s*$DATE(?:\s*-\s*\d{4}-\d{2}-\d{2})?\.csv""", TakeoutCategory.SPO2_DAILY, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Device Temperature\s*-\s*$DATE\.csv""", TakeoutCategory.DEVICE_TEMPERATURE, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        Rule("""Computed Temperature\s*-\s*$DATE\.csv""", TakeoutCategory.COMPUTED_TEMPERATURE, TakeoutLayout.CLASSIC, TakeoutFormat.CSV),
        // Google layout (one CSV per data type; daily types in a single undated file).
        Rule("""heart_rate_$DATE\.csv""", TakeoutCategory.HEART_RATE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""steps_$DATE\.csv""", TakeoutCategory.STEPS, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""oxygen_saturation_$DATE\.csv""", TakeoutCategory.SPO2_MINUTE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""daily_resting_heart_rate\.csv""", TakeoutCategory.RESTING_HEART_RATE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""daily_heart_rate_variability\.csv""", TakeoutCategory.HRV_DAILY, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""daily_oxygen_saturation\.csv""", TakeoutCategory.SPO2_DAILY, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""daily_respiratory_rate\.csv""", TakeoutCategory.RESPIRATORY_RATE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
        Rule("""daily_sleep_temperature_derivations\.csv""", TakeoutCategory.COMPUTED_TEMPERATURE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV),
    )

    /** The route for an entry, or null when the entry is not on the whitelist. */
    fun route(entryName: String): TakeoutRoute? {
        if (entryName.isEmpty() || entryName.length > MAX_NAME_CHARS) return null
        val normalised = entryName.replace('\\', '/')
        if (normalised.endsWith("/")) return null
        val fileName = normalised.substringAfterLast('/').trim()
        if (fileName.isEmpty() || fileName.startsWith(".")) return null
        for (rule in rules) {
            val match = rule.regex.matchEntire(fileName) ?: continue
            val day = match.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }?.let(::epochDay)
            // A dated pattern with an impossible date (month 13) is not one of our files.
            if (match.groupValues.size > 1 && match.groupValues[1].isNotEmpty() && day == null) return null
            return TakeoutRoute(rule.category, rule.layout, rule.format, fileName.lowercase(), day)
        }
        return null
    }

    private fun epochDay(text: String): Long? = try {
        LocalDate.parse(text).toEpochDay()
    } catch (_: DateTimeException) {
        null
    }

    private const val MAX_NAME_CHARS = 1_024
}

/**
 * Makes entry paths safe to show in a diagnostic report that the owner may pass on.
 *
 * Export paths can contain the account holder's name as a folder, and unknown files can be named
 * after anything. Each path is rewritten token by token: a word is kept only if it is in a fixed
 * vocabulary of export and health terms, dates become `YYYY-MM-DD`, other digit runs become `#`,
 * and every other word becomes `*`. The structure of the layout stays readable
 * (`Global Export Data/heart_rate-YYYY-MM-DD.json` below a folder shown as a single star), the personal part does not.
 */
object TakeoutRedaction {

    fun redactPath(path: String): String {
        val segments = path.replace('\\', '/').split('/').filter { it.isNotEmpty() }
        if (segments.isEmpty()) return ""
        return segments.take(MAX_SEGMENTS).joinToString("/") { redactSegment(it.take(MAX_SEGMENT_CHARS)) }
    }

    private val datePattern = Regex("""\d{4}-\d{2}-\d{2}""")

    private fun redactSegment(segment: String): String {
        val out = StringBuilder(segment.length)
        var i = 0
        while (i < segment.length) {
            val c = segment[i]
            when {
                c.isDigit() -> {
                    val date = datePattern.matchAt(segment, i)
                    if (date != null && (i + 10 >= segment.length || !segment[i + 10].isDigit())) {
                        out.append("YYYY-MM-DD")
                        i += 10
                    } else {
                        while (i < segment.length && segment[i].isDigit()) i++
                        out.append('#')
                    }
                }
                c.isLetter() -> {
                    // One word: a run of letters, ended early at a lower-to-upper change (camelCase).
                    val start = i
                    i++
                    while (i < segment.length && segment[i].isLetter() && !(segment[i].isUpperCase() && segment[i - 1].isLowerCase())) i++
                    val word = segment.substring(start, i)
                    out.append(if (word.lowercase() in VOCABULARY) word else "*")
                }
                else -> {
                    out.append(if (c in SAFE_PUNCTUATION) c else '_')
                    i++
                }
            }
        }
        return out.toString()
    }

    private const val MAX_SEGMENTS = 12
    private const val MAX_SEGMENT_CHARS = 120
    private const val SAFE_PUNCTUATION = " -_.()"

    private val VOCABULARY: Set<String> = """
        takeout fitbit myfitbitdata google googledata health fitness data global export physical activity
        heart rate variability details daily summary histogram respiratory oxygen saturation spo minute
        temperature device computed sleep score stress readiness active zone minutes azm resting steps
        calories distance altitude sedentary lightly moderately very exercise demographic vo max run
        estimated variation time in zones of and the profile account badge trophy social friends messages
        biometrics glucose menstrual weight height body fat bmi food water log logs nutrition journal
        mindfulness sessions eda ecg afib irregular rhythm notifications snore noise detection swim lengths
        cardio load acute chronic workload ratio observed interval level speed energy burned gps location
        micro motion stillness live pace period user stages scores exercises records personal settings
        application applications devices tracker scale subscription premium coach programs challenges
        archive browser index readme json csv txt html pdf xml tcx zip png jpg jpeg
        """.trim().split(Regex("""\s+""")).toSet()
}
