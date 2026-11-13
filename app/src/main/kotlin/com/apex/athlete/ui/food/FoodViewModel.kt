package com.apex.athlete.ui.food

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.extras.FoodRepository
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.quicklog.WriteOutcome
import com.apex.athlete.ui.quicklog.runExtrasWrite
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.ZoneId

/** The form is open for a new meal ([editingId] null) or for editing one. The draft survives process death. */
data class FoodEditor(val editingId: String?, val draft: FoodDraft, val showErrors: Boolean = false)

@OptIn(ExperimentalCoroutinesApi::class)
class FoodViewModel internal constructor(
    private val today: () -> Long,
    private val nowMillis: () -> Long,
    private val zone: () -> ZoneId,
    private val loadMeals: (Long) -> Flow<List<FoodLogEntity>>,
    loadBurned: (Long) -> Flow<EnergyBurned>,
    private val insert: suspend (ParsedMeal, Long) -> Unit,
    private val replace: suspend (FoodLogEntity) -> Unit,
    private val remove: suspend (String) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(extras: LocalExtras, repository: AthleteRepository, handle: SavedStateHandle) : this(
        today = repository::today,
        nowMillis = System::currentTimeMillis,
        zone = ZoneId::systemDefault,
        loadMeals = extras.food::observeDay,
        loadBurned = { day ->
            repository.activityDay(day).map { s ->
                val r = s?.readings?.get(MetricType.CALORIES_TOTAL)
                if (s == null || r == null || r.value == null) EnergyBurned.NONE else EnergyBurned(r.value, r.provenance, s.isProvisional)
            }
        },
        insert = { m, millis ->
            extras.food.add(m.mealKind, m.name, millis, m.kcal, m.proteinG, m.carbsG, m.fatG, m.fibreG, FoodSource.MANUAL)
        },
        replace = extras.food::update,
        remove = extras.food::delete,
        handle = handle,
    )

    private val dayFlow = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: today())
    val day: StateFlow<Long> = dayFlow.asStateFlow()

    private val keyed: StateFlow<FoodDayUi?> = dayFlow
        .flatMapLatest { d ->
            combine(loadMeals(d), loadBurned(d)) { meals, burned -> FoodDayUi.of(d, meals, burned) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The selected day's data; null while loading, and never the previous day's data after a day change. */
    val state: StateFlow<FoodDayUi?> = combine(keyed, dayFlow) { k, d -> k?.takeIf { it.day == d } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _editor = MutableStateFlow(readEditor())
    val editor: StateFlow<FoodEditor?> = _editor.asStateFlow()

    private val _outcome = MutableStateFlow(WriteOutcome.IDLE)
    val outcome: StateFlow<WriteOutcome> = _outcome.asStateFlow()

    fun todayDay(): Long = today()

    fun setDay(epochDay: Long) {
        if (dayFlow.value == epochDay) return
        handle[KEY_DAY] = epochDay
        _outcome.value = WriteOutcome.IDLE
        dayFlow.value = epochDay
    }

    fun startAdd() = setEditor(FoodEditor(null, FoodDraft()))

    fun startEdit(meal: MealUi) = setEditor(FoodEditor(meal.id, FoodForm.draftOf(meal)))

    fun closeEditor() = setEditor(null)

    fun updateDraft(change: (FoodDraft) -> FoodDraft) {
        val e = _editor.value ?: return
        setEditor(e.copy(draft = change(e.draft)))
    }

    fun save() {
        val e = _editor.value ?: return
        if (_outcome.value == WriteOutcome.SAVING) return
        val parsed = FoodForm.parse(e.draft)
        val meal = parsed.meal
        if (meal == null) {
            setEditor(e.copy(showErrors = true))
            return
        }
        val day = dayFlow.value
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch {
            val existing = e.editingId?.let { id -> state.value?.meals?.firstOrNull { it.id == id } }
            val result = runExtrasWrite {
                if (e.editingId != null && existing != null) {
                    replace(existing.toEntity(meal))
                } else {
                    insert(meal, FoodForm.mealMillis(day, today(), nowMillis(), zone()))
                }
            }
            if (result == WriteOutcome.SAVED) setEditor(null)
            _outcome.value = result
        }
    }

    fun delete(id: String) {
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch { _outcome.value = runExtrasWrite { remove(id) } }
    }

    private fun MealUi.toEntity(m: ParsedMeal): FoodLogEntity {
        // The edited entry keeps its id, time, source and provenance (the repository sets the provenance again from the source).
        return FoodLogEntity(
            id = id,
            epochMillis = epochMillis,
            mealKind = m.mealKind,
            name = m.name,
            kcal = m.kcal,
            proteinG = m.proteinG,
            carbsG = m.carbsG,
            fatG = m.fatG,
            fibreG = m.fibreG,
            source = source,
            provenance = FoodRepository.provenanceOf(source),
        )
    }

    private fun setEditor(e: FoodEditor?) {
        _editor.value = e
        handle[KEY_OPEN] = e != null
        handle[KEY_EDIT_ID] = e?.editingId
        handle[KEY_DRAFT] = e?.draft?.let { arrayListOf(it.mealKind.storageKey, it.name, it.kcal, it.protein, it.carbs, it.fat, it.fibre) }
        if (_outcome.value != WriteOutcome.SAVING) _outcome.value = WriteOutcome.IDLE
    }

    private fun readEditor(): FoodEditor? {
        if (handle.get<Boolean>(KEY_OPEN) != true) return null
        val f = handle.get<ArrayList<String>>(KEY_DRAFT) ?: return null
        if (f.size != 7) return null
        val kind = MealKind.entries.firstOrNull { it.storageKey == f[0] } ?: MealKind.BREAKFAST
        return FoodEditor(handle.get<String>(KEY_EDIT_ID), FoodDraft(kind, f[1], f[2], f[3], f[4], f[5], f[6]))
    }

    private companion object {
        const val KEY_DAY = "food.day"
        const val KEY_OPEN = "food.editor.open"
        const val KEY_EDIT_ID = "food.editor.id"
        const val KEY_DRAFT = "food.editor.draft"
    }
}
