package app.fitdash.metrics

enum class BmiBand { UNDER, HEALTHY, OVER, OBESE }

fun bmi(weightKg: Double, heightM: Double): Double = weightKg / (heightM * heightM)

fun bmiBand(b: Double): BmiBand = when {
    b < 18.5 -> BmiBand.UNDER
    b < 25.0 -> BmiBand.HEALTHY
    b < 30.0 -> BmiBand.OVER
    else -> BmiBand.OBESE
}
