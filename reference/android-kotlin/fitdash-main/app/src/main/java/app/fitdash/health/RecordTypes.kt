package app.fitdash.health

import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.WheelchairPushesRecord
import kotlin.reflect.KClass

data class TypeInfo(val label: String, val type: KClass<out Record>)

class DailyTotal<R : Any>(val metric: AggregateMetric<R>, private val convert: (R) -> Double) {
    fun value(result: AggregationResult): Double? = result[metric]?.let(convert)
}

class GenericType<T : Record>(
    val label: String,
    val unit: String,
    val type: KClass<T>,
    val dailyTotal: DailyTotal<*>? = null,
    private val extractSecond: ((T) -> Sample?)? = null,
    private val extract: (T) -> Sample? = { null },
) {
    @Suppress("UNCHECKED_CAST")
    fun sample(record: Record): Sample? = extract(record as T)

    @Suppress("UNCHECKED_CAST")
    fun second(record: Record): Sample? = extractSecond?.invoke(record as T)
}

val DESIGNED_TYPES = listOf(
    TypeInfo("Sleep", SleepSessionRecord::class),
    TypeInfo("Heart rate variability", HeartRateVariabilityRmssdRecord::class),
    TypeInfo("Resting heart rate", RestingHeartRateRecord::class),
    TypeInfo("SpO₂", OxygenSaturationRecord::class),
    TypeInfo("Respiratory rate", RespiratoryRateRecord::class),
    TypeInfo("Skin temperature", SkinTemperatureRecord::class),
    TypeInfo("Steps", StepsRecord::class),
    TypeInfo("Distance", DistanceRecord::class),
    TypeInfo("Total calories", TotalCaloriesBurnedRecord::class),
    TypeInfo("Exercise", ExerciseSessionRecord::class),
    TypeInfo("Heart rate", HeartRateRecord::class),
    TypeInfo("Hydration", HydrationRecord::class),
)

val GENERIC_TYPES: List<GenericType<*>> = listOf(
    GenericType("Weight", "kg", WeightRecord::class) { Sample(it.time, it.weight.inKilograms) },
    GenericType("Height", "m", HeightRecord::class) { Sample(it.time, it.height.inMeters) },
    GenericType("Body fat", "%", BodyFatRecord::class) { Sample(it.time, it.percentage.value) },
    GenericType("Lean body mass", "kg", LeanBodyMassRecord::class) { Sample(it.time, it.mass.inKilograms) },
    GenericType("Bone mass", "kg", BoneMassRecord::class) { Sample(it.time, it.mass.inKilograms) },
    GenericType("Body water mass", "kg", BodyWaterMassRecord::class) { Sample(it.time, it.mass.inKilograms) },
    GenericType("Basal metabolic rate", "kcal/day", BasalMetabolicRateRecord::class) {
        Sample(it.time, it.basalMetabolicRate.inKilocaloriesPerDay)
    },
    GenericType("VO₂ max", "ml/kg/min", Vo2MaxRecord::class) { Sample(it.time, it.vo2MillilitersPerMinuteKilogram) },
    GenericType(
        "Blood pressure", "mmHg", BloodPressureRecord::class,
        extractSecond = { Sample(it.time, it.diastolic.inMillimetersOfMercury) },
    ) { Sample(it.time, it.systolic.inMillimetersOfMercury) },
    GenericType("Blood glucose", "mmol/L", BloodGlucoseRecord::class) { Sample(it.time, it.level.inMillimolesPerLiter) },
    GenericType("Body temperature", "°C", BodyTemperatureRecord::class) { Sample(it.time, it.temperature.inCelsius) },
    GenericType("Basal body temperature", "°C", BasalBodyTemperatureRecord::class) {
        Sample(it.time, it.temperature.inCelsius)
    },
    GenericType("Nutrition", "kcal", NutritionRecord::class, DailyTotal(NutritionRecord.ENERGY_TOTAL) { it.inKilocalories }),
    GenericType("Floors climbed", "floors", FloorsClimbedRecord::class, DailyTotal(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL) { it }),
    GenericType("Elevation gained", "m", ElevationGainedRecord::class, DailyTotal(ElevationGainedRecord.ELEVATION_GAINED_TOTAL) { it.inMeters }),
    GenericType("Active calories", "kcal", ActiveCaloriesBurnedRecord::class, DailyTotal(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) { it.inKilocalories }),
    GenericType("Wheelchair pushes", "pushes", WheelchairPushesRecord::class, DailyTotal(WheelchairPushesRecord.COUNT_TOTAL) { it.toDouble() }),
    GenericType("Power", "W", PowerRecord::class) { r ->
        r.samples.takeIf { it.isNotEmpty() }?.let { s -> Sample(r.startTime, s.map { it.power.inWatts }.average()) }
    },
    GenericType("Speed", "m/s", SpeedRecord::class) { r ->
        r.samples.takeIf { it.isNotEmpty() }?.let { s -> Sample(r.startTime, s.map { it.speed.inMetersPerSecond }.average()) }
    },
)

val ALL_TYPES: List<TypeInfo> = DESIGNED_TYPES + GENERIC_TYPES.map { TypeInfo(it.label, it.type) }
