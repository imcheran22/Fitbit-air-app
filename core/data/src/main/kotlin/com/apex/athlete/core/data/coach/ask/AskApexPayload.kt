package com.apex.athlete.core.data.coach.ask

import com.apex.athlete.core.data.coach.CoachBriefing

/** The closed set of computed readings that may be sent, each with a fixed label and unit. */
enum class AskFactKind(val label: String, val unit: String) {
    RECOVERY("Recovery", "%"),
    HRV("Heart rate variability (overnight)", "ms"),
    HRV_USUAL("Heart rate variability, your usual", "ms"),
    RESTING_HR("Resting heart rate", "bpm"),
    RESTING_HR_USUAL("Resting heart rate, your usual", "bpm"),
    SLEEP_ASLEEP("Sleep last night", "min"),
    SLEEP_NEED("Sleep needed", "min"),
    STRAIN("Strain so far today", "0-21"),
    STRAIN_TARGET_LOW("Strain target, low end", "0-21"),
    STRAIN_TARGET_HIGH("Strain target, high end", "0-21"),
}

/** One computed number. [value] must be a plain number (checked when the payload is built). */
data class AskFact(val kind: AskFactKind, val value: String)

/**
 * Exactly what would be sent to the model, and the text that shows it to the owner first.
 *
 * It contains only: the owner's typed question, a handful of already-computed numbers from the
 * closed set [AskFactKind], and the on-device briefing's sentences (which hold computed numbers,
 * no dates and no identifiers). It never contains raw samples, heart-rate series, timestamps,
 * identifiers, dates of birth, names or locations. Build it, show [preview], and send
 * [system] + [userMessage] only if the owner confirms.
 */
class AskApexPayload private constructor(
    val model: String,
    val system: String,
    val userMessage: String,
    /** Numbers present in [userMessage], canonical form: the allow-list for [NumeralCheck]. */
    val allowedNumerals: Set<String>,
) {
    /** The human-readable "what gets sent" text for the confirmation screen. */
    val preview: String = buildString {
        appendLine("This is everything that will be sent to Anthropic (model: $model):")
        appendLine()
        appendLine("Instructions to the model")
        appendLine(system)
        appendLine()
        appendLine("Your message")
        append(userMessage)
        appendLine()
        appendLine()
        append("Nothing else is sent: no raw heart-rate data, no dates, no name, no account details.")
    }

    override fun toString() = "AskApexPayload(model=$model, chars=${userMessage.length})"

    companion object {
        const val DEFAULT_MODEL = "claude-opus-5-5"
        const val MAX_QUESTION_CHARS = 500

        val SYSTEM_PROMPT = """
            You are the explanation layer of Apex, a private fitness dashboard for one athlete.
            The numbers in the user's message were computed on their phone. Rules:
            - Use only numbers that appear in the message. Never calculate, convert, estimate or invent a number.
            - Never diagnose. Do not name medical conditions or say what the readings mean for health; if the user is worried about their health, suggest speaking to a clinician.
            - Give practical training and rest guidance in a calm tone. Say plainly when the data does not answer the question.
            - Answer in plain text, under 150 words.
        """.trimIndent()

        private val plainNumber = Regex("""[-+−]?\d{1,6}(?:\.\d{1,2})?""")

        fun build(
            question: String,
            briefing: CoachBriefing,
            facts: List<AskFact>,
            model: String = DEFAULT_MODEL,
        ): AskApexPayload {
            val q = question.trim().replace(Regex("""\s+"""), " ").take(MAX_QUESTION_CHARS)
            fun render(withUnits: Boolean) = buildString {
                appendLine("Question: ${q.ifEmpty { "Explain today's briefing." }}")
                appendLine()
                appendLine("Computed readings (these are all the numbers you may use):")
                val valid = facts.filter { plainNumber.matches(it.value) }
                if (valid.isEmpty()) appendLine("- none available")
                valid.distinctBy { it.kind }.forEach {
                    appendLine("- ${it.kind.label}: ${it.value}" + if (withUnits) " ${it.kind.unit}" else "")
                }
                appendLine()
                appendLine("The app's own briefing for today:")
                appendLine(briefing.headline)
                briefing.lines.forEach { appendLine("- ${it.text}") }
            }.trimEnd()
            val message = render(withUnits = true)
            // Unit labels such as "0-21" describe a scale; they are not computed readings and must not widen the allow-list.
            val allowed = NumeralCheck.allowedSet(render(withUnits = false))
            return AskApexPayload(model.trim().ifEmpty { DEFAULT_MODEL }, SYSTEM_PROMPT, message, allowed)
        }
    }
}
