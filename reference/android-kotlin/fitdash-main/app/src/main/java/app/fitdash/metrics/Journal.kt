package app.fitdash.metrics

import app.fitdash.settings.DayJournal
import app.fitdash.settings.Tag
import java.time.LocalDate
import kotlin.math.abs

// How the night after a tagged day differs from the night after an untagged one; deepShare is a fraction of sleep.
data class TagEffect(val tag: Tag, val days: Int, val hrvMs: Double?, val restingHrBpm: Double?, val sleepScore: Double?, val deepShare: Double?)

// Each side needs this many days before a difference is worth showing.
const val MIN_TAG_DAYS = 5

// Insights stay hidden until this many days carry any tag.
const val MIN_TAGGED_DAYS = 10

fun tagEffects(journal: Map<LocalDate, DayJournal>, series: Map<MetricKind, List<DayValue>>, days: List<LocalDate>): List<TagEffect> {
    if (days.count { !journal[it]?.tags.isNullOrEmpty() } < MIN_TAGGED_DAYS) return emptyList()
    val values = listOf(MetricKind.HRV, MetricKind.RESTING_HR, MetricKind.SLEEP_SCORE, MetricKind.DEEP, MetricKind.SLEEP_HOURS)
        .associateWith { kind -> series[kind].orEmpty().mapNotNull { v -> v.value?.let { v.date to it } }.toMap() }
    val deep = values.getValue(MetricKind.DEEP).mapNotNull { (d, v) -> values.getValue(MetricKind.SLEEP_HOURS)[d]?.takeIf { it > 0 }?.let { d to v / 60 / it } }.toMap()
    val metrics = listOf(values.getValue(MetricKind.HRV), values.getValue(MetricKind.RESTING_HR), values.getValue(MetricKind.SLEEP_SCORE), deep)
    val untagged = days.filter { d -> journal[d]?.tags.isNullOrEmpty() && metrics.any { d.plusDays(1) in it } }
    return Tag.entries.mapNotNull { tag ->
        val tagged = days.filter { d -> tag in journal[d]?.tags.orEmpty() && metrics.any { d.plusDays(1) in it } }
        if (tagged.size < MIN_TAG_DAYS || untagged.size < MIN_TAG_DAYS) return@mapNotNull null
        val diffs = metrics.map { m ->
            val withTag = tagged.mapNotNull { m[it.plusDays(1)] }
            val without = untagged.mapNotNull { m[it.plusDays(1)] }
            if (withTag.isEmpty() || without.isEmpty()) null else withTag.average() - without.average()
        }
        TagEffect(tag, tagged.size, diffs[0], diffs[1], diffs[2], diffs[3])
    }.sortedByDescending { abs(it.hrvMs ?: 0.0) }
}
