package com.apex.athlete.core.database.entity

/*
 * Kinds of the local-only logging tables (schema v4). Each is stored by its stable [storageKey], never by name
 * or ordinal (same rule as the enums in `:core:domain`), so renaming a constant cannot corrupt rows.
 * Add entries at the end; never reuse or change a key.
 */

enum class BehaviourKind(val storageKey: String) {
    /** Done / not done: stored value 1.0 or 0.0. */
    YES_NO("yes_no"),

    /** Intensity 0 to 4: stored value 0.0 to 4.0 in whole steps. */
    SCALE_0_4("scale_0_4");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): BehaviourKind = byKey[key] ?: throw IllegalArgumentException("Unknown behaviour kind: $key")
        fun fromStorageKeyOrNull(key: String): BehaviourKind? = byKey[key]
    }
}

enum class QuickLogKind(val storageKey: String) {
    WATER_ML("water_ml"),
    MOOD("mood"),
    SYMPTOM("symptom"),
    NOTE("note");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): QuickLogKind = byKey[key] ?: throw IllegalArgumentException("Unknown quick log kind: $key")
        fun fromStorageKeyOrNull(key: String): QuickLogKind? = byKey[key]
    }
}

enum class GoalKind(val storageKey: String) {
    DAILY_STEPS("daily_steps"),
    DAILY_SLEEP_MINUTES("daily_sleep_minutes"),
    WEEKLY_ACTIVE_MINUTES("weekly_active_minutes"),
    WEEKLY_AZM("weekly_azm"),
    WEEKLY_RECOVERED_DAYS("weekly_recovered_days");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): GoalKind = byKey[key] ?: throw IllegalArgumentException("Unknown goal kind: $key")
        fun fromStorageKeyOrNull(key: String): GoalKind? = byKey[key]
    }
}

enum class MealKind(val storageKey: String) {
    BREAKFAST("breakfast"),
    LUNCH("lunch"),
    DINNER("dinner"),
    SNACK("snack");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): MealKind = byKey[key] ?: throw IllegalArgumentException("Unknown meal kind: $key")
        fun fromStorageKeyOrNull(key: String): MealKind? = byKey[key]
    }
}

enum class FoodSource(val storageKey: String) {
    MANUAL("manual"),
    AI_ESTIMATE("ai_estimate"),
    HEALTH_CONNECT("health_connect");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): FoodSource = byKey[key] ?: throw IllegalArgumentException("Unknown food source: $key")
        fun fromStorageKeyOrNull(key: String): FoodSource? = byKey[key]
    }
}

enum class BloodPressureSource(val storageKey: String) {
    MANUAL("manual"),
    HEALTH_CONNECT("health_connect");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): BloodPressureSource = byKey[key] ?: throw IllegalArgumentException("Unknown blood pressure source: $key")
        fun fromStorageKeyOrNull(key: String): BloodPressureSource? = byKey[key]
    }
}

enum class CoachTopic(val storageKey: String) {
    GENERAL("general"),
    RECOVERY("recovery"),
    SLEEP("sleep"),
    WORKOUT("workout"),
    ACTIVITY("activity");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): CoachTopic = byKey[key] ?: throw IllegalArgumentException("Unknown coach topic: $key")
        fun fromStorageKeyOrNull(key: String): CoachTopic? = byKey[key]
    }
}

enum class CoachRole(val storageKey: String) {
    USER("user"),
    COACH("coach");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }
        fun fromStorageKey(key: String): CoachRole = byKey[key] ?: throw IllegalArgumentException("Unknown coach role: $key")
        fun fromStorageKeyOrNull(key: String): CoachRole? = byKey[key]
    }
}
