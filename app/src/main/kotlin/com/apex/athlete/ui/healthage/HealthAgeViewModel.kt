package com.apex.athlete.ui.healthage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.analytics.healthage.HealthAge
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import java.time.LocalDate

private const val STOP_TIMEOUT_MS = 5_000L

/** Days of history behind each factor (the engine's baselines are 30-day windows). */
internal const val HEALTH_AGE_WINDOW_DAYS = 30

/**
 * Computes the experimental health age while the Settings switch is on; reads nothing while it is off.
 * [enabled] and [sources] are injected so a test can feed any flow; a null source means "store not ready".
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HealthAgeViewModel(
    enabled: Flow<Boolean>,
    sources: Flow<HealthAgeSources?>,
) : ViewModel() {

    val state: StateFlow<HealthAgeLoad> = enabled
        .distinctUntilChanged()
        .flatMapLatest { on ->
            if (!on) {
                flowOf<HealthAgeLoad>(HealthAgeLoad.Off)
            } else {
                sources
                    .map<HealthAgeSources?, HealthAgeLoad> { s ->
                        if (s == null) HealthAgeLoad.Loading
                        else HealthAgeLoad.Ready(HealthAge.estimate(buildHealthAgeInput(s)), s.isDemo)
                    }
                    .onStart { emit(HealthAgeLoad.Loading) }
                    .catch { emit(HealthAgeLoad.Failed) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), HealthAgeLoad.Pending)
}

/**
 * The repository reads behind the input: the last 30 complete days of the daily series (ending yesterday, because today's steps
 * are still accumulating), the latest VO2 max and BMI, and the 30-night Sleep Regularity Index. Null until every read has arrived.
 */
fun healthAgeSources(repository: AthleteRepository, profile: Flow<UserProfile>): Flow<HealthAgeSources?> {
    val today = repository.today()
    val last = today - 1
    return combine(
        repository.trends(last, HEALTH_AGE_WINDOW_DAYS),
        repository.fitness(today),
        repository.body(today),
        repository.sleepRegularity(last, HEALTH_AGE_WINDOW_DAYS),
        profile,
    ) { trends, fitness, body, sri, p ->
        if (trends == null || fitness == null || body == null || sri == null) return@combine null
        fun days(metric: MetricType): List<Double?> =
            trends.trends.firstOrNull { it.metric == metric }?.points?.map { it.value }.orEmpty()
        HealthAgeSources(
            isDemo = trends.isDemo,
            ageYears = p.ageOn(LocalDate.ofEpochDay(today).year),
            sex = p.sex,
            vo2MaxDays = days(MetricType.VO2_MAX),
            vo2Fallback = fitness.vo2Max?.let { Vo2Fallback(it.value, derivedFromRestingHr = it.epochDay == null) },
            restingHeartRateDays = days(MetricType.RESTING_HEART_RATE),
            sleepMinutesDays = days(MetricType.SLEEP_DURATION),
            stepsDays = days(MetricType.STEPS),
            sleepRegularityIndex = sri.index,
            sleepRegularityNights = sri.coveredNights,
            bmi = body.bmi.value,
        )
    }
}
