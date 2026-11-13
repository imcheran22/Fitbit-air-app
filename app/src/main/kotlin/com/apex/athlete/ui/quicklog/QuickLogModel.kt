package com.apex.athlete.ui.quicklog

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.extras.ExtrasLimits
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind

/** The symptom chips. The stable [key] is what is stored as the entry label; the words come from strings.xml. */
enum class Symptom(val key: String, @StringRes val label: Int) {
    HEADACHE("headache", R.string.quicklog_symptom_headache),
    FATIGUE("fatigue", R.string.quicklog_symptom_fatigue),
    SORE_MUSCLES("sore_muscles", R.string.quicklog_symptom_sore),
    NAUSEA("nausea", R.string.quicklog_symptom_nausea),
    COLD("cold_flu", R.string.quicklog_symptom_cold),
    DIZZY("dizzy", R.string.quicklog_symptom_dizzy),
    PAIN("pain", R.string.quicklog_symptom_pain),
    STRESS("stressed", R.string.quicklog_symptom_stress),
    ;

    companion object {
        fun fromKey(key: String?): Symptom? = entries.firstOrNull { it.key == key }
    }
}

/** What the sheet has collected so far. Water is kept as typed text; the other parts are already typed values. */
data class QuickLogDraft(
    val water: String = "",
    val mood: Int? = null,
    val symptoms: Set<String> = emptySet(),
    val note: String = "",
)

sealed interface QuickLogAction {
    data class Water(val ml: Int) : QuickLogAction
    data class Mood(val value: Int) : QuickLogAction
    data class SymptomEntry(val key: String) : QuickLogAction
    data class Note(val text: String) : QuickLogAction
}

/** [waterInvalid] is true when water text was typed but is not a whole number of ml from 1 to 10 000. */
data class QuickLogPlan(val actions: List<QuickLogAction>, val waterInvalid: Boolean) {
    val canSave: Boolean get() = actions.isNotEmpty() && !waterInvalid
}

object QuickLogForm {
    const val MAX_NOTE_CHARS: Int = ExtrasLimits.MAX_NOTE_CHARS
    const val MOOD_MIN = 1
    const val MOOD_MAX = 5
    const val MAX_WATER_ML = 10_000
    val WATER_PRESETS_ML: List<Int> = listOf(150, 250, 500)

    /** Digits only, at most five. */
    fun sanitizeWater(raw: String): String = raw.filter { it.isDigit() }.take(5)

    fun waterMl(raw: String): Int? = raw.trim().toIntOrNull()?.takeIf { it in 1..MAX_WATER_ML }

    /** Typing past the limit is cut in the field, so a save never rejects a note for length. */
    fun capNote(raw: String): String = raw.take(MAX_NOTE_CHARS)

    fun plan(draft: QuickLogDraft): QuickLogPlan {
        val waterText = draft.water.trim()
        val water = waterMl(waterText)
        val actions = ArrayList<QuickLogAction>()
        if (water != null) actions += QuickLogAction.Water(water)
        draft.mood?.takeIf { it in MOOD_MIN..MOOD_MAX }?.let { actions += QuickLogAction.Mood(it) }
        // Symptoms in the chip order, not the order they were tapped, so the result does not depend on tapping order.
        Symptom.entries.filter { it.key in draft.symptoms }.forEach { actions += QuickLogAction.SymptomEntry(it.key) }
        draft.note.trim().takeIf { it.isNotEmpty() }?.let { actions += QuickLogAction.Note(it.take(MAX_NOTE_CHARS)) }
        return QuickLogPlan(actions, waterInvalid = waterText.isNotEmpty() && water == null)
    }

    /** The draft with the part of [action] removed: used after each successful write so a retry never duplicates it. */
    fun without(draft: QuickLogDraft, action: QuickLogAction): QuickLogDraft = when (action) {
        is QuickLogAction.Water -> draft.copy(water = "")
        is QuickLogAction.Mood -> draft.copy(mood = null)
        is QuickLogAction.SymptomEntry -> draft.copy(symptoms = draft.symptoms - action.key)
        is QuickLogAction.Note -> draft.copy(note = "")
    }
}

/** One logged entry as the list shows it. Entries whose required value is missing are dropped, never shown as zero. */
sealed interface QuickLogEntryUi {
    val id: String
    val epochMillis: Long

    data class Water(override val id: String, override val epochMillis: Long, val ml: Int) : QuickLogEntryUi
    data class Mood(override val id: String, override val epochMillis: Long, val value: Int) : QuickLogEntryUi

    /** [symptom] is the known chip, or null with [rawLabel] for a label from an import. */
    data class SymptomLine(override val id: String, override val epochMillis: Long, val symptom: Symptom?, val rawLabel: String) : QuickLogEntryUi
    data class Note(override val id: String, override val epochMillis: Long, val text: String) : QuickLogEntryUi
}

fun toEntryUi(e: QuickLogEntity): QuickLogEntryUi? = when (e.kind) {
    QuickLogKind.WATER_ML -> e.numericValue?.takeIf { it.isFinite() && it > 0 }?.let { QuickLogEntryUi.Water(e.id, e.epochMillis, Math.round(it).toInt()) }
    QuickLogKind.MOOD -> e.numericValue?.takeIf { it.isFinite() }?.let { QuickLogEntryUi.Mood(e.id, e.epochMillis, Math.round(it).toInt()) }
    QuickLogKind.SYMPTOM -> e.label?.takeIf { it.isNotBlank() }?.let { QuickLogEntryUi.SymptomLine(e.id, e.epochMillis, Symptom.fromKey(it), it) }
    QuickLogKind.NOTE -> e.text?.takeIf { it.isNotBlank() }?.let { QuickLogEntryUi.Note(e.id, e.epochMillis, it) }
}
