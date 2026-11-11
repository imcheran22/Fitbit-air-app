package app.fitdash.metrics

// The formulas in Fitness.kt come from studies that grouped people by sex at birth; the setting says so.
enum class Gender { FEMALE, MALE }

fun genderLabel(g: Gender?): String = when (g) {
    Gender.FEMALE -> "Female"
    Gender.MALE -> "Male"
    null -> "Not set"
}
