package com.hcwebhook.app

/** The Health Connect categories, in the order Health Connect shows them. */
enum class DataCategory(val titleResId: Int) {
    ACTIVITY(R.string.category_activity),
    BODY(R.string.category_body),
    CYCLE(R.string.category_cycle),
    NUTRITION(R.string.category_nutrition),
    SLEEP(R.string.category_sleep),
    VITALS(R.string.category_vitals),
    WELLNESS(R.string.category_wellness),
}

val HealthDataType.category: DataCategory
    get() = when (this) {
        HealthDataType.STEPS, HealthDataType.DISTANCE, HealthDataType.ACTIVE_CALORIES,
        HealthDataType.TOTAL_CALORIES, HealthDataType.EXERCISE, HealthDataType.VO2_MAX -> DataCategory.ACTIVITY
        HealthDataType.WEIGHT, HealthDataType.HEIGHT, HealthDataType.BASAL_METABOLIC_RATE,
        HealthDataType.BODY_FAT, HealthDataType.LEAN_BODY_MASS, HealthDataType.BODY_WATER_MASS,
        HealthDataType.BONE_MASS -> DataCategory.BODY
        HealthDataType.MENSTRUATION_FLOW, HealthDataType.MENSTRUATION_PERIOD,
        HealthDataType.INTERMENSTRUAL_BLEEDING, HealthDataType.OVULATION_TEST,
        HealthDataType.CERVICAL_MUCUS, HealthDataType.SEXUAL_ACTIVITY,
        HealthDataType.BASAL_BODY_TEMPERATURE -> DataCategory.CYCLE
        HealthDataType.HYDRATION, HealthDataType.NUTRITION -> DataCategory.NUTRITION
        HealthDataType.SLEEP -> DataCategory.SLEEP
        HealthDataType.HEART_RATE, HealthDataType.HEART_RATE_VARIABILITY, HealthDataType.BLOOD_PRESSURE,
        HealthDataType.BLOOD_GLUCOSE, HealthDataType.OXYGEN_SATURATION, HealthDataType.BODY_TEMPERATURE,
        HealthDataType.SKIN_TEMPERATURE, HealthDataType.RESPIRATORY_RATE,
        HealthDataType.RESTING_HEART_RATE -> DataCategory.VITALS
        HealthDataType.MINDFULNESS -> DataCategory.WELLNESS
    }
