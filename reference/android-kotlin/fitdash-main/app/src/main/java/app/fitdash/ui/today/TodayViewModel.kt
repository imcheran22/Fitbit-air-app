package app.fitdash.ui.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fitdash.health.Availability
import app.fitdash.health.HealthSource
import app.fitdash.health.HealthSnapshot
import java.time.Instant
import app.fitdash.health.readFresh
import app.fitdash.health.ReadProgress
import app.fitdash.health.SnapshotStore
import app.fitdash.health.CachedSnapshot
import app.fitdash.metrics.Goals
import app.fitdash.metrics.Tuning
import java.time.Duration
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.buildToday
import app.fitdash.metrics.withEstimatedRestingHr
import app.fitdash.settings.Entry
import app.fitdash.settings.JournalStore
import app.fitdash.settings.NutrientKind
import app.fitdash.settings.Settings
import app.fitdash.ui.aiSummary
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZonedDateTime
import kotlin.coroutines.cancellation.CancellationException

// Whether Health Connect lets fitdash read while it is closed, for background refresh and widgets.
enum class BackgroundAccess { UNSUPPORTED, NOT_GRANTED, GRANTED }

sealed interface TodayUiState {
    data object Loading : TodayUiState
    data class NeedsHealthConnect(val update: Boolean) : TodayUiState
    data object NeedsPermission : TodayUiState
    data object NoData : TodayUiState
    data object Failed : TodayUiState
    data class Ready(
        val data: TodayData,
        val aiText: String = "",
        val refreshing: Boolean = false,
        val error: Boolean = false,
        // True when this build can ask for the "read older data" permission and it is not granted yet.
        val canAskHistory: Boolean = false,
        val background: BackgroundAccess = BackgroundAccess.UNSUPPORTED,
    ) : TodayUiState
}

class TodayViewModel(
    private val source: HealthSource,
    private val clock: () -> ZonedDateTime = { ZonedDateTime.now() },
    private val settings: StateFlow<Settings> = MutableStateFlow(Settings()),
    private val work: CoroutineDispatcher = Dispatchers.Default,
    // Where a failed read is reported; the activity passes the Android logger, tests leave it silent.
    private val onReadFailed: (Throwable) -> Unit = {},
    // Last snapshot on disk, shown instantly on a cold start while the fresh read runs.
    private val store: SnapshotStore? = null,
    // After each save, so home-screen widgets redraw from the new cache.
    private val onCacheSaved: suspend () -> Unit = {},
    private val journal: JournalStore? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<TodayUiState>(TodayUiState.Loading)
    val state: StateFlow<TodayUiState> = _state
    // How far the running Health Connect read has got; null when no read is running.
    private val _progress = MutableStateFlow<ReadProgress?>(null)
    val progress: StateFlow<ReadProgress?> = _progress

    private var job: Job? = null
    private var rebuildJob: Job? = null
    private var retryJob: Job? = null
    // Nutrient adds whose own write is still running; their entries have no id yet but must not be retried.
    private val adding = mutableSetOf<Pair<NutrientKind, Instant>>()
    private var snapshot: HealthSnapshot? = null
    // The un-augmented snapshot: what incremental reads merge into, what the cache stores and what the export writes.
    private val raw = MutableStateFlow<HealthSnapshot?>(null)
    val rawSnapshot: StateFlow<HealthSnapshot?> = raw
    private var lastNow: ZonedDateTime? = null
    private var lastRead: Instant? = null
    private var lastFullRead: Instant? = null
    private var syncPending = false

    val selectedDate = MutableStateFlow<LocalDate?>(null)

    private val permissionRequests = Channel<Unit>(Channel.CONFLATED)
    val permissionNeeded: Flow<Unit> = permissionRequests.receiveAsFlow()
    private val messageChannel = Channel<String>(Channel.CONFLATED)
    val messages: Flow<String> = messageChannel.receiveAsFlow()
    // The latest water add, its write possibly still running, so Undo always deletes the record it names.
    private var lastWater: Deferred<String?>? = null
    private var undoneWater: Deferred<String?>? = null
    private var lastWaterLiters = 0.0
    // Water written or undone since the last read, shown at once instead of waiting for Health Connect.
    private var pendingWater = 0.0
    // The part of pendingWater Health Connect has confirmed; a read started after that already includes it.
    private var confirmedWater = 0.0

    // The night typed in this session, so it can be removed again.
    private var lastSleep: String? = null

    init {
        viewModelScope.launch { settings.map { it.goals() }.distinctUntilChanged().drop(1).collect { rebuild() } }
        journal?.let { j -> viewModelScope.launch { j.flow.drop(1).collect { rebuild() } } }
    }

    fun select(date: LocalDate) {
        selectedDate.value = date.takeUnless { it == clock().toLocalDate() }
        rebuild()
    }

    private fun rebuild() {
        val snapshot = snapshot ?: return
        // Past midnight the stored "now" is yesterday; refreshing it keeps "today" meaning today until the next read.
        val now = lastNow?.let { if (it.toLocalDate() == clock().toLocalDate()) it else clock().also { n -> lastNow = n } } ?: return
        val goals = currentGoals()
        val date = selectedDate.value ?: now.toLocalDate()
        val water = pendingWater
        rebuildJob?.cancel()
        rebuildJob = viewModelScope.launch {
            val (data, text) = withContext(work) { build(snapshot, now, date, goals, water) }
            val prev = _state.value as? TodayUiState.Ready
            _state.value = TodayUiState.Ready(data, text, prev?.refreshing ?: false, prev?.error ?: false, prev?.canAskHistory ?: false, prev?.background ?: BackgroundAccess.UNSUPPORTED)
        }
    }

    private fun currentGoals() = settings.value.goals()

    private fun Settings.goals() = Goals(stepGoal, sleepHours, waterGoalMl / 1000.0, activeGoal, birthYear, gender, bedtimeTarget)

    private fun build(read: HealthSnapshot, now: ZonedDateTime, date: LocalDate, goals: Goals, water: Double = 0.0): Pair<TodayData, String> {
        val today = now.toLocalDate()
        val snapshot = if (water == 0.0) read else read.copy(waterDaily = read.waterDaily + (today to (read.waterDaily[today] ?: 0.0) + water))
        val data = buildToday(snapshot, now, date, goals, augmented = true, journal = journal?.flow?.value.orEmpty())
        return data to aiSummary(snapshot, data, now)
    }

    val permissions: Set<String> get() = source.allPermissions

    private suspend fun writeFailed() {
        val granted = source.grantedPermissions()
        if (source.allPermissions.any { ".WRITE_" in it && it !in granted }) permissionRequests.trySend(Unit)
        else messageChannel.trySend("Couldn't save to Health Connect")
    }

    fun addWater(ml: Int) {
        val liters = ml / 1000.0
        pendingWater += liters
        rebuild()
        val add = viewModelScope.async { source.addWater(liters, clock().toInstant()) }
        lastWater = add
        lastWaterLiters = liters
        viewModelScope.launch {
            if (add.await() != null) {
                confirmedWater += liters
            } else if (undoneWater !== add) {
                if (lastWater === add) lastWater = null
                pendingWater -= liters
                rebuild()
                writeFailed()
            }
        }
    }

    fun undoWater() {
        val add = lastWater
        if (add == null) {
            messageChannel.trySend("Nothing to undo")
            return
        }
        val liters = lastWaterLiters
        lastWater = null
        undoneWater = add
        pendingWater -= liters
        rebuild()
        viewModelScope.launch {
            val id = add.await() ?: return@launch
            if (source.deleteWater(id)) {
                confirmedWater -= liters
            } else {
                pendingWater += liters
                rebuild()
                messageChannel.trySend("Couldn't save to Health Connect")
            }
        }
    }

    fun addNutrient(kind: NutrientKind, amount: Double) {
        val journal = journal ?: return
        val now = clock()
        val date = now.toLocalDate()
        val at = now.toInstant()
        adding += kind to at
        journal.add(date, kind, Entry(at, amount, null))
        viewModelScope.launch {
            val id = try { source.addNutrient(kind, amount, at) } finally { adding -= kind to at }
            val kept = journal.flow.value[date]?.entries(kind).orEmpty().any { it.at == at }
            if (id == null) {
                writeFailed()
            } else if (kept) {
                journal.setRecordId(date, kind, at, id)
            } else {
                // Removed while the write was running: the record it named must go too.
                source.deleteNutrient(id)
            }
        }
    }

    fun removeNutrient(kind: NutrientKind, at: Instant) {
        val journal = journal ?: return
        val date = at.atZone(clock().zone).toLocalDate()
        val entry = journal.flow.value[date]?.entries(kind).orEmpty().firstOrNull { it.at == at }
        journal.remove(date, kind, at)
        val id = entry?.recordId ?: return
        viewModelScope.launch {
            if (!source.deleteNutrient(id)) messageChannel.trySend("Couldn't save to Health Connect")
        }
    }

    fun addSleep(start: Instant, end: Instant) {
        viewModelScope.launch {
            val id = source.addSleep(start, end)
            if (id != null) {
                lastSleep = id
                load()
            } else writeFailed()
        }
    }
    fun removeSleep() {
        val id = lastSleep ?: return
        viewModelScope.launch {
            if (source.deleteSleep(id)) {
                lastSleep = null
                load()
            } else messageChannel.trySend("Couldn't save to Health Connect")
        }
    }
    fun setHeight(cm: Int) {
        viewModelScope.launch {
            if (source.setHeight(cm / 100.0, clock().toInstant())) load() else writeFailed()
        }
    }

    // The user opened their wearable's app to sync; the next resume reads regardless of the reload window.
    fun syncRequested() {
        syncPending = true
    }

    // Resuming within RELOAD_SECONDS of a successful read keeps the snapshot; `force` (pull to refresh, writes) always reads.
    fun load(force: Boolean = true) {
        if (!force && !syncPending) {
            val last = lastRead
            val ready = _state.value as? TodayUiState.Ready
            if (last != null && ready != null && !ready.error && Duration.between(last, clock().toInstant()).seconds < Tuning.RELOAD_SECONDS) {
                rebuild()
                return
            }
        }
        syncPending = false
        job?.cancel()
        rebuildJob?.cancel()
        job = viewModelScope.launch {
            var fresh = false
            when (source.availability()) {
                Availability.NOT_INSTALLED -> {
                    _state.value = TodayUiState.NeedsHealthConnect(update = false)
                    return@launch
                }
                Availability.NEEDS_UPDATE -> {
                    _state.value = TodayUiState.NeedsHealthConnect(update = true)
                    return@launch
                }
                Availability.AVAILABLE -> Unit
            }
            val now = clock()
            val back = snapshot?.windowDays?.minus(1) ?: (Tuning.BASELINE_DAYS - 1)
            if (selectedDate.value?.isBefore(now.toLocalDate().minusDays(back)) == true) selectedDate.value = null
            // Cold start: put the cached dashboard up first, then refresh it.
            if (raw.value == null && store != null && _state.value !is TodayUiState.Ready) {
                val cached = withContext(work) { store.load() }
                if (cached != null && cached.snapshot.sources.any { it.hasData }) {
                    raw.value = cached.snapshot
                    lastRead = cached.readAt
                    lastFullRead = cached.fullReadAt
                    val date = selectedDate.value ?: now.toLocalDate()
                    val (augmented, built) = withContext(work) {
                        val augmented = withEstimatedRestingHr(cached.snapshot, now.zone, now.toLocalDate())
                        augmented to build(augmented, now, date, currentGoals())
                    }
                    snapshot = augmented
                    lastNow = now
                    _state.value = TodayUiState.Ready(built.first, built.second, refreshing = true)
                }
            }
            val previous = _state.value as? TodayUiState.Ready
            if (previous != null) _state.value = previous.copy(refreshing = true)
            _state.value = try {
                val granted = source.grantedPermissions()
                if (granted.none { it in source.allPermissions }) {
                    TodayUiState.NeedsPermission
                } else {
                    // Straight after the permission sheet there is nothing to show yet; the Welcome button must not look stuck.
                    if (_state.value !is TodayUiState.Ready) _state.value = TodayUiState.Loading
                    val seen = confirmedWater
                    val result = readFresh(source, raw.value, lastRead, lastFullRead, now) { _progress.value = it }
                    val read = result.snapshot
                    if (result.full) lastFullRead = now.toInstant()
                    val canAskHistory = source.historyPermission?.let { it !in granted } ?: false
                    val background = source.backgroundPermission()?.let { if (it in granted) BackgroundAccess.GRANTED else BackgroundAccess.NOT_GRANTED } ?: BackgroundAccess.UNSUPPORTED
                    val date = selectedDate.value ?: now.toLocalDate()
                    val goals = currentGoals()
                    val (augmented, built) = withContext(work) {
                        val augmented = withEstimatedRestingHr(read, now.zone, now.toLocalDate())
                        augmented to build(augmented, now, date, goals, pendingWater - seen)
                    }
                    raw.value = read
                    snapshot = augmented
                    pendingWater -= seen
                    confirmedWater -= seen
                    lastNow = now
                    lastRead = now.toInstant()
                    store?.let { st ->
                        withContext(work) { st.save(CachedSnapshot(read, now.toInstant(), lastFullRead ?: now.toInstant())) }
                        onCacheSaved()
                    }
                    if (read.selectedDateOutOfWindow(selectedDate.value, now)) selectedDate.value = null
                    fresh = true
                    if (read.sources.none { it.hasData } && !settings.value.phoneOnly) TodayUiState.NoData
                    else TodayUiState.Ready(built.first, built.second, canAskHistory = canAskHistory, background = background)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onReadFailed(e)
                (_state.value as? TodayUiState.Ready)?.copy(refreshing = false, error = true) ?: TodayUiState.Failed
            } finally {
                _progress.value = null
            }
            val journal = journal
            if (fresh && journal != null && retryJob?.isActive != true) retryJob = viewModelScope.launch {
                for ((date, day) in journal.flow.value) for (kind in NutrientKind.entries) for (entry in day.entries(kind)) {
                    // The loop walks a copy taken at the start; the entry may have changed during an earlier write.
                    val live = journal.flow.value[date]?.entries(kind).orEmpty().firstOrNull { it.at == entry.at }
                    if (live == null || live.recordId != null || (kind to live.at) in adding) continue
                    val id = source.addNutrient(kind, live.amount, live.at) ?: return@launch
                    if (journal.flow.value[date]?.entries(kind).orEmpty().any { it.at == entry.at }) journal.setRecordId(date, kind, entry.at, id)
                    else source.deleteNutrient(id)
                }
            }
        }
    }
}

private fun HealthSnapshot.selectedDateOutOfWindow(date: LocalDate?, now: ZonedDateTime) =
    date != null && date.isBefore(now.toLocalDate().minusDays(windowDays - 1))
