package org.openstrap.app.ui.components

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/** The moments the app answers with touch (spec 3.6). Ordinary taps and the pull to sync ratchet aren't here. */
enum class HapticEvent {
    /** A scrub lands on a new point: a day, an hour, a stage. Throttled, see [Haptics.SCRUB_INTERVAL_MS]. */
    ScrubStep,

    /** A scrub crosses into or out of your normal, or reaches the highest or lowest point. */
    ScrubMark,

    /** The heart rate zone changes. Throttled, see [Haptics.ZONE_INTERVAL_MS]. */
    ZoneChange,

    /** A kilometre is done during a GPS workout, as its split line shows. */
    KmSplit,

    /** A strength set is done. */
    SetDone,

    WorkoutStart,

    /** The hold to end a workout completes. */
    WorkoutEnd,

    PairingDone,

    /** A manual sync can't start, or fails. */
    SyncFailed,

    /** A range handle passes the detected start or end of a workout. */
    RangeMark,

    /** A personal best shows on the summary right after a workout, with its glow swell. */
    PersonalBest,
}

/** The feedback for each [HapticEvent]. */
fun HapticEvent.feedbackType(): HapticFeedbackType = when (this) {
    HapticEvent.ScrubStep -> HapticFeedbackType.SegmentFrequentTick
    HapticEvent.ScrubMark, HapticEvent.ZoneChange, HapticEvent.KmSplit, HapticEvent.SetDone, HapticEvent.RangeMark,
    HapticEvent.PersonalBest -> HapticFeedbackType.SegmentTick
    HapticEvent.WorkoutStart, HapticEvent.WorkoutEnd, HapticEvent.PairingDone -> HapticFeedbackType.Confirm
    HapticEvent.SyncFailed -> HapticFeedbackType.Reject
}

/** Lets a tick through at most once every [intervalMs]; times are any monotonic milliseconds. */
class TickThrottle(private val intervalMs: Long) {
    private var last: Long? = null

    /** Whether a tick at [nowMs] may play; if so, it counts as the last one. */
    fun allow(nowMs: Long): Boolean {
        val prev = last
        if (prev != null && nowMs - prev < intervalMs) return false
        last = nowMs
        return true
    }
}

/**
 * Plays [HapticEvent]s, throttling scrub steps so a fast scrub doesn't turn into a buzz, and zone changes so a heart
 * rate sitting on a zone's edge doesn't tick every second.
 */
class Haptics(private val feedback: HapticFeedback, private val now: () -> Long = SystemClock::uptimeMillis) {
    private val scrub = TickThrottle(SCRUB_INTERVAL_MS)
    private val zone = TickThrottle(ZONE_INTERVAL_MS)

    fun perform(event: HapticEvent) {
        if (event == HapticEvent.ScrubStep && !scrub.allow(now())) return
        if (event == HapticEvent.ZoneChange && !zone.allow(now())) return
        feedback.performHapticFeedback(event.feedbackType())
    }

    companion object {
        /** Scrub steps play at most this often. */
        const val SCRUB_INTERVAL_MS = 40L

        /** Zone changes play at most this often. */
        const val ZONE_INTERVAL_MS = 10_000L
    }
}

/** [Haptics] for this composition, on the platform's haptic feedback. */
@Composable
fun rememberHaptics(): Haptics {
    val feedback = LocalHapticFeedback.current
    return remember(feedback) { Haptics(feedback) }
}

/**
 * Which tick a scrub plays as the finger moves (spec 3.6): [HapticEvent.ScrubStep] when it lands on a new point, and
 * [HapticEvent.ScrubMark] when that point crosses into or out of your normal ([next]'s band) or is the highest or
 * lowest. Pure: the chart plays what it returns. One per chart, reset by a release (a null index).
 */
class ScrubTicks {
    private var last: Int? = null

    /**
     * The tick for the finger on [index] of [values] (null on release, which plays nothing). [band] is your normal when
     * the chart draws one. [lowMarks] false leaves the lowest point unmarked, for bars where many hours sit at zero.
     */
    fun next(index: Int?, values: List<Float?>, band: ClosedFloatingPointRange<Float>? = null, lowMarks: Boolean = true): HapticEvent? {
        val prev = last
        last = index
        if (index == null || index == prev) return null
        val v = values.getOrNull(index) ?: return HapticEvent.ScrubStep
        val known = values.filterNotNull()
        val extreme = known.size >= 2 && known.max() > known.min() && (v == known.max() || (lowMarks && v == known.min()))
        val before = prev?.let { values.getOrNull(it) }
        val crossed = band != null && before != null && (before in band) != (v in band)
        return if (extreme || crossed) HapticEvent.ScrubMark else HapticEvent.ScrubStep
    }
}

/** A [ScrubTicks] for this chart, playing through [rememberHaptics]: call it with each index the scrub lands on. */
@Composable
fun rememberScrubHaptics(): (Int?, List<Float?>, ClosedFloatingPointRange<Float>?, Boolean) -> Unit {
    val haptics = rememberHaptics()
    val ticks = remember { ScrubTicks() }
    return remember(haptics, ticks) { { i, values, band, low -> ticks.next(i, values, band, low)?.let(haptics::perform) } }
}
