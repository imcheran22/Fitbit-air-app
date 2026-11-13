package com.apex.athlete.ui.behaviours

import com.apex.athlete.core.data.extras.Behaviour
import com.apex.athlete.core.data.extras.ExtrasLimits
import com.apex.athlete.core.database.entity.BehaviourKind

/** One line of the behaviours list. [hidden] behaviours keep their logged values; they only leave the daily list. */
data class BehaviourRowUi(
    val id: String,
    val name: String,
    val kind: BehaviourKind,
    val builtIn: Boolean,
    val hidden: Boolean,
) {
    /** Built-in behaviours feed the journal analysis and can only be hidden. */
    val canDelete: Boolean get() = !builtIn
}

enum class BehaviourNameError { EMPTY, TOO_LONG }

object BehaviourForm {
    const val MAX_NAME_CHARS: Int = ExtrasLimits.MAX_NAME_CHARS

    fun nameError(raw: String): BehaviourNameError? {
        val clean = raw.trim()
        return when {
            clean.isEmpty() -> BehaviourNameError.EMPTY
            clean.length > MAX_NAME_CHARS -> BehaviourNameError.TOO_LONG
            else -> null
        }
    }
}

/** Built-in and custom behaviours in the owner's order; null while the store has not answered (the list is never empty once it has). */
fun toRows(behaviours: List<Behaviour>): List<BehaviourRowUi>? =
    if (behaviours.isEmpty()) {
        null
    } else {
        behaviours.map { BehaviourRowUi(it.id, it.name, it.kind, it.builtIn, it.archived) }
    }
