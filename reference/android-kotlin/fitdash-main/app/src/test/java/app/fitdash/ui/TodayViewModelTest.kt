package app.fitdash.ui

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.health.Availability
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.ReadProgress
import app.fitdash.health.SnapshotStore
import app.fitdash.health.CachedSnapshot
import app.fitdash.health.HealthSource
import app.fitdash.health.SourceStatus
import app.fitdash.settings.Entry
import app.fitdash.settings.JournalStore
import app.fitdash.settings.NutrientKind
import app.fitdash.settings.Settings
import app.fitdash.ui.today.TodayUiState
import app.fitdash.ui.today.TodayViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import app.fitdash.metrics.Tuning
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant
import java.time.ZonedDateTime

private class FakeSource(
    var status: Availability = Availability.AVAILABLE,
    var granted: Set<String> = setOf("read", "x.WRITE_water"),
    var snapshot: HealthSnapshot = HealthSnapshot(sources = listOf(SourceStatus("Sleep", true, true, setOf("com.fitbit.FitbitMobile")))),
    var fail: Boolean = false,
    var gate: CompletableDeferred<Unit>? = null,
    var canWrite: Boolean = true,
    var writeDelay: Long = 0,
) : HealthSource {
    var reads = 0
    val sinces = mutableListOf<Instant?>()
    val waterAdded = mutableListOf<Double>()
    val waterDeleted = mutableListOf<String>()
    val heights = mutableListOf<Double>()
    val stepsAdded = mutableListOf<Long>()
    val nutrientsAdded = mutableListOf<Pair<NutrientKind, Double>>()
    val nutrientTimes = mutableListOf<Instant>()
    // When set, each addNutrient call waits on its own deferred, completed by the test with the record id.
    var gateNutrients = false
    val nutrientGates = mutableListOf<CompletableDeferred<String?>>()
    val nutrientsDeleted = mutableListOf<String>()
    var history: String? = null
    var progress: List<ReadProgress> = emptyList()
    override val allPermissions = setOf("read", "x.WRITE_water")
    override val historyPermission: String? get() = history
    override fun availability() = status
    override suspend fun grantedPermissions() = granted
    override suspend fun read(now: ZonedDateTime, since: Instant?, onProgress: (ReadProgress) -> Unit): HealthSnapshot {
        reads++
        sinces += since
        progress.forEach(onProgress)
        gate?.await()
        if (fail) error("read failed")
        return snapshot
    }
    override suspend fun addWater(liters: Double, at: Instant): String? {
        delay(writeDelay)
        if (!canWrite) return null
        waterAdded += liters
        return "water-${waterAdded.size}"
    }
    override suspend fun deleteWater(id: String): Boolean { waterDeleted += id; return true }
    override suspend fun addSleep(start: Instant, end: Instant): String? = if (canWrite) "sleep" else null
    override suspend fun deleteSleep(id: String): Boolean = true
    override suspend fun addSteps(start: Instant, end: Instant, count: Long): Boolean {
        if (canWrite) stepsAdded += count
        return canWrite
    }
    override suspend fun setHeight(meters: Double, at: Instant): Boolean {
        if (canWrite) heights += meters
        return canWrite
    }
    override suspend fun addNutrient(kind: NutrientKind, amount: Double, at: Instant): String? {
        nutrientTimes += at
        if (gateNutrients) return CompletableDeferred<String?>().also { nutrientGates += it }.await()
        if (!canWrite) return null
        nutrientsAdded += kind to amount
        return "nutrition-${nutrientsAdded.size}"
    }
    override suspend fun deleteNutrient(id: String): Boolean { nutrientsDeleted += id; return true }
}

@OptIn(ExperimentalCoroutinesApi::class)
class TodayViewModelTest {
    private val now = TODAY.atTime(8, 10).atZone(IST)

    @get:Rule val tmp = TemporaryFolder()

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun load(source: FakeSource) = TodayViewModel(source, { now }, work = Dispatchers.Main).also { it.load() }

    @Test fun `Health Connect missing or outdated`() {
        assertEquals(TodayUiState.NeedsHealthConnect(update = false), load(FakeSource(status = Availability.NOT_INSTALLED)).state.value)
        assertEquals(TodayUiState.NeedsHealthConnect(update = true), load(FakeSource(status = Availability.NEEDS_UPDATE)).state.value)
    }

    @Test fun `no permissions`() {
        assertEquals(TodayUiState.NeedsPermission, load(FakeSource(granted = emptySet())).state.value)
    }

    @Test fun `granted but nothing written`() {
        val empty = HealthSnapshot(sources = listOf(SourceStatus("Sleep", true, false, emptySet())))
        assertEquals(TodayUiState.NoData, load(FakeSource(snapshot = empty)).state.value)
    }

    @Test fun `phone only goes ready with nothing written`() {
        val empty = HealthSnapshot(sources = listOf(SourceStatus("Sleep", true, false, emptySet())))
        val vm = TodayViewModel(FakeSource(snapshot = empty), { now }, settings = MutableStateFlow(Settings(phoneOnly = true)), work = Dispatchers.Main).also { it.load() }
        assertTrue(vm.state.value is TodayUiState.Ready)
    }

    @Test fun `data becomes ready`() {
        assertTrue(load(FakeSource()).state.value is TodayUiState.Ready)
    }

    @Test fun `a failed refresh keeps the previous page and flags the error`() {
        val source = FakeSource()
        val vm = load(source)
        source.fail = true
        vm.load()
        val s = vm.state.value as TodayUiState.Ready
        assertTrue(s.error)
        assertEquals(false, s.refreshing)
    }

    @Test fun `a failed first load`() {
        assertEquals(TodayUiState.Failed, load(FakeSource(fail = true)).state.value)
    }

    @Test fun `granting permissions shows the loading screen while the first read runs`() {
        val source = FakeSource(granted = emptySet(), gate = CompletableDeferred())
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main)
        vm.load()
        assertEquals(TodayUiState.NeedsPermission, vm.state.value)
        source.granted = setOf("read")
        vm.load()
        assertEquals(TodayUiState.Loading, vm.state.value)
        source.gate!!.complete(Unit)
        assertTrue(vm.state.value is TodayUiState.Ready)
    }

    @Test fun `read progress shows while the read runs and clears when it ends`() {
        val source = FakeSource(gate = CompletableDeferred())
        source.progress = listOf(ReadProgress(1, 2, "Steps"), ReadProgress(2, 2, "Sleep"))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main)
        vm.load()
        assertEquals(ReadProgress(2, 2, "Sleep"), vm.progress.value)
        source.gate!!.complete(Unit)
        assertEquals(null, vm.progress.value)
    }

    @Test fun `an overlapping load replaces the one in flight`() {
        val source = FakeSource(gate = CompletableDeferred())
        val first = source.gate!!
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main)
        vm.load()
        source.gate = null
        vm.load()
        assertTrue(vm.state.value is TodayUiState.Ready)
        first.completeExceptionally(IllegalStateException("stale"))
        assertTrue(vm.state.value is TodayUiState.Ready)
    }

    @Test fun `selecting a date rebuilds without reading again`() {
        val source = FakeSource()
        val vm = load(source)
        vm.select(TODAY.minusDays(2))
        assertEquals(1, source.reads)
        assertEquals(TODAY.minusDays(2), (vm.state.value as TodayUiState.Ready).data.date)
    }

    @Test fun `settings change rebuilds with the new goal`() {
        val settings = MutableStateFlow(Settings())
        val vm = TodayViewModel(FakeSource(), { now }, settings, Dispatchers.Main).also { it.load() }
        settings.value = Settings(stepGoal = 5000)
        assertEquals(5000, (vm.state.value as TodayUiState.Ready).data.goals.steps)
    }

    @Test fun `selecting a date keeps the error flag from a failed refresh`() {
        val source = FakeSource()
        val vm = load(source)
        source.fail = true
        vm.load()
        vm.select(TODAY.minusDays(1))
        val s = vm.state.value as TodayUiState.Ready
        assertTrue(s.error)
    }

    @Test fun `a stale selected date is cleared on load`() {
        var current = now
        val vm = TodayViewModel(FakeSource(), { current }, work = Dispatchers.Main).also { it.load() }
        vm.select(TODAY.minusDays(10))
        current = now.plusDays(40)
        vm.load()
        assertEquals(null, vm.selectedDate.value)
    }

    @Test fun `resuming soon after a read does not read again, but refresh does`() {
        var current = now
        val source = FakeSource()
        val vm = TodayViewModel(source, { current }, work = Dispatchers.Main).also { it.load() }
        assertEquals(1, source.reads)
        vm.load(force = false)
        assertEquals(1, source.reads)
        current = now.plusSeconds(Tuning.RELOAD_SECONDS + 1)
        vm.load(force = false)
        assertEquals(2, source.reads)
        vm.load()
        assertEquals(3, source.reads)
    }

    @Test fun `a resume before any read still reads`() {
        val source = FakeSource()
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main)
        vm.load(force = false)
        assertEquals(1, source.reads)
    }

    @Test fun `selecting today after midnight still means today`() {
        var current = now
        val vm = TodayViewModel(FakeSource(), { current }, work = Dispatchers.Main).also { it.load() }
        current = now.plusDays(1).withHour(0).withMinute(30)
        vm.select(current.toLocalDate())
        val s = vm.state.value as TodayUiState.Ready
        assertTrue(s.data.isToday)
        assertEquals(current.toLocalDate(), s.data.date)
    }

    @Test fun `history flag is set only when declared and not granted`() {
        assertFalse((load(FakeSource()).state.value as TodayUiState.Ready).canAskHistory)
        val declared = FakeSource().apply { history = "x.HISTORY" }
        assertTrue((load(declared).state.value as TodayUiState.Ready).canAskHistory)
        val granted = FakeSource(granted = setOf("read", "x.HISTORY")).apply { history = "x.HISTORY" }
        assertFalse((load(granted).state.value as TodayUiState.Ready).canAskHistory)
    }

    @Test fun `a selected date inside a long window survives the load`() {
        val source = FakeSource(snapshot = HealthSnapshot(sources = listOf(SourceStatus("Sleep", true, true, setOf("app"))), windowDays = 180))
        val vm = load(source)
        vm.select(TODAY.minusDays(100))
        vm.load()
        assertEquals(TODAY.minusDays(100), vm.selectedDate.value)
        assertEquals(179L, (vm.state.value as TodayUiState.Ready).data.daysBack)
    }

    private class MemoryStore(var cached: CachedSnapshot? = null) : SnapshotStore {
        var saves = 0
        override fun load() = cached
        override fun save(cached: CachedSnapshot) { this.cached = cached; saves++ }
        override fun clear() { cached = null }
    }

    private val withData = HealthSnapshot(sources = listOf(SourceStatus("Sleep", true, true, setOf("com.fitbit.FitbitMobile"))))

    @Test fun `a cold start shows the cache at once, then reads since two days before the last read`() {
        val yesterday = now.minusDays(1).toInstant()
        val store = MemoryStore(CachedSnapshot(withData, yesterday, yesterday))
        val source = FakeSource(gate = CompletableDeferred())
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, store = store)
        vm.load()
        val shown = vm.state.value as TodayUiState.Ready
        assertTrue(shown.refreshing)
        source.gate!!.complete(Unit)
        assertEquals(false, (vm.state.value as TodayUiState.Ready).refreshing)
        assertEquals(listOf(TODAY.minusDays(3).atStartOfDay(IST).toInstant()), source.sinces)
        assertEquals(1, store.saves)
        assertEquals(now.toInstant(), store.cached!!.readAt)
    }

    @Test fun `without a cache the first read is full and is saved`() {
        val store = MemoryStore()
        val source = FakeSource()
        TodayViewModel(source, { now }, work = Dispatchers.Main, store = store).load()
        assertEquals(listOf<Instant?>(null), source.sinces)
        assertEquals(now.toInstant(), store.cached!!.fullReadAt)
    }

    @Test fun `a full read is due again after a day`() {
        val old = now.minusHours(30).toInstant()
        val store = MemoryStore(CachedSnapshot(withData, old, old))
        val source = FakeSource()
        TodayViewModel(source, { now }, work = Dispatchers.Main, store = store).load()
        assertEquals(listOf<Instant?>(null), source.sinces)
    }

    @Test fun `a sync request makes the next resume read`() {
        val source = FakeSource()
        val vm = load(source)
        vm.load(force = false)
        assertEquals(1, source.reads)
        vm.syncRequested()
        vm.load(force = false)
        assertEquals(2, source.reads)
        vm.load(force = false)
        assertEquals(2, source.reads)
    }

    @Test fun `adding water writes and shows the new total without reading again`() {
        val source = FakeSource()
        val vm = load(source)
        vm.addWater(250)
        assertEquals(listOf(0.25), source.waterAdded)
        assertEquals(1, source.reads)
        assertEquals(0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
    }

    @Test fun `addWater shows the new total at once and rolls back on failure`() = runTest {
        val source = FakeSource(canWrite = false, writeDelay = 100)
        val vm = TodayViewModel(source, clock = { now }, work = UnconfinedTestDispatcher(testScheduler))
        vm.load(); advanceUntilIdle()
        val before = (vm.state.value as TodayUiState.Ready).data.waterLiters
        vm.addWater(250)
        assertEquals(before + 0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
        advanceUntilIdle()
        assertEquals(before, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
        vm.undoWater()
        assertEquals(before, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
    }

    @Test fun `undo deletes the entry that was just added`() {
        val source = FakeSource()
        val vm = load(source)
        vm.addWater(500)
        vm.undoWater()
        assertEquals(listOf("water-1"), source.waterDeleted)
        assertEquals(1, source.reads)
        assertEquals(0.0, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
        vm.undoWater()
        assertEquals(listOf("water-1"), source.waterDeleted)
    }

    @Test fun `undo during a pending add deletes that add, not the one before`() = runTest {
        val source = FakeSource()
        val vm = TodayViewModel(source, clock = { now }, work = UnconfinedTestDispatcher(testScheduler))
        vm.load(); advanceUntilIdle()
        vm.addWater(250); advanceUntilIdle()
        source.writeDelay = 100
        vm.addWater(500)
        vm.undoWater()
        assertEquals(0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
        advanceUntilIdle()
        assertEquals(listOf("water-2"), source.waterDeleted)
        assertEquals(0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
    }

    @Test fun `a read that finishes before a pending add lands keeps the add`() = runTest {
        val source = FakeSource()
        val vm = TodayViewModel(source, clock = { now }, work = UnconfinedTestDispatcher(testScheduler))
        vm.load(); advanceUntilIdle()
        source.gate = CompletableDeferred()
        source.writeDelay = 100
        vm.load()
        vm.addWater(250)
        source.gate!!.complete(Unit)
        assertEquals(0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
        advanceUntilIdle()
        assertEquals(0.25, (vm.state.value as TodayUiState.Ready).data.waterLiters, 1e-9)
    }

    @Test fun `undo with nothing to undo says so`() = runBlocking {
        val vm = load(FakeSource())
        vm.undoWater()
        assertEquals("Nothing to undo", withTimeoutOrNull(1000) { vm.messages.first() })
    }

    @Test fun `saving height writes metres then reads again`() {
        val source = FakeSource()
        val vm = load(source)
        vm.setHeight(175)
        assertEquals(listOf(1.75), source.heights)
        assertEquals(2, source.reads)
    }

    @Test fun `a write without permission asks for the permission once`() = runBlocking {
        val source = FakeSource(canWrite = false, granted = setOf("read"))
        val vm = load(source)
        vm.addWater(250)
        vm.permissionNeeded.first()
        vm.setHeight(175)
        vm.permissionNeeded.first()
        assertEquals(1, source.reads)
        assertTrue(source.waterAdded.isEmpty())
    }

    @Test fun `a failed write with permission shows a message`() = runBlocking {
        val source = FakeSource(canWrite = false)
        val vm = load(source)
        vm.addWater(250)
        assertEquals("Couldn't save to Health Connect", vm.messages.first())
    }

    @Test fun `adding protein journals the entry with its record id, removing deletes both`() {
        val source = FakeSource()
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        vm.addNutrient(NutrientKind.PROTEIN, 25.0)
        assertEquals(listOf(NutrientKind.PROTEIN to 25.0), source.nutrientsAdded)
        assertEquals(listOf(Entry(now.toInstant(), 25.0, "nutrition-1")), journal.flow.value[TODAY]!!.protein)
        vm.removeNutrient(NutrientKind.PROTEIN, now.toInstant())
        assertEquals(listOf("nutrition-1"), source.nutrientsDeleted)
        assertEquals(null, journal.flow.value[TODAY])
    }

    @Test fun `a failed nutrient write keeps the entry without an id and shows a message`() = runBlocking {
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val vm = TodayViewModel(FakeSource(canWrite = false), { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        vm.addNutrient(NutrientKind.CAFFEINE, 95.0)
        assertEquals("Couldn't save to Health Connect", vm.messages.first())
        assertEquals(listOf(Entry(now.toInstant(), 95.0, null)), journal.flow.value[TODAY]!!.caffeine)
    }

    @Test fun `entries saved without permission are written once it is granted`() {
        val source = FakeSource()
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val at = now.minusHours(2).toInstant()
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(at, 30.0, null))
        TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).load()
        assertEquals(listOf(NutrientKind.PROTEIN to 30.0), source.nutrientsAdded)
        assertEquals(listOf(at), source.nutrientTimes)
        assertEquals(listOf(Entry(at, 30.0, "nutrition-1")), journal.flow.value[TODAY]!!.protein)
    }

    @Test fun `entries with an id are never rewritten`() {
        val source = FakeSource()
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        journal.add(TODAY, NutrientKind.CAFFEINE, Entry(now.minusHours(2).toInstant(), 95.0, "r1"))
        TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).load()
        assertTrue(source.nutrientsAdded.isEmpty())
    }

    @Test fun `a failed retry leaves the entry as it was`() = runBlocking {
        val source = FakeSource(canWrite = false)
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val entry = Entry(now.minusHours(2).toInstant(), 30.0, null)
        journal.add(TODAY, NutrientKind.PROTEIN, entry)
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        assertEquals(listOf(entry), journal.flow.value[TODAY]!!.protein)
        assertEquals(null, withTimeoutOrNull(200) { vm.messages.first() })
    }

    @Test fun `a refused retry ends the pass at the first entry`() {
        val source = FakeSource(canWrite = false)
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(now.minusHours(3).toInstant(), 30.0, null))
        journal.add(TODAY, NutrientKind.CAFFEINE, Entry(now.minusHours(2).toInstant(), 95.0, null))
        TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).load()
        assertEquals(1, source.nutrientTimes.size)
    }

    @Test fun `a load during an add does not write that entry again`() {
        val source = FakeSource()
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        source.gateNutrients = true
        vm.addNutrient(NutrientKind.PROTEIN, 25.0)
        vm.load()
        source.nutrientGates[0].complete("r1")
        assertEquals(listOf(now.toInstant()), source.nutrientTimes)
        assertEquals(listOf(Entry(now.toInstant(), 25.0, "r1")), journal.flow.value[TODAY]!!.protein)
    }

    @Test fun `overlapping loads retry each entry once`() {
        val source = FakeSource()
        source.gateNutrients = true
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val protein = now.minusHours(3).toInstant()
        val caffeine = now.minusHours(2).toInstant()
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(protein, 30.0, null))
        journal.add(TODAY.minusDays(1), NutrientKind.CAFFEINE, Entry(caffeine, 95.0, null))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal)
        vm.load()
        vm.load()
        source.nutrientGates[0].complete("r1")
        source.nutrientGates[1].complete("r2")
        assertEquals(listOf(protein, caffeine).sorted(), source.nutrientTimes.sorted())
    }

    @Test fun `an add that lands while the retry runs is not written again`() {
        val source = FakeSource()
        source.gateNutrients = true
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val a = now.minusHours(2).toInstant()
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(a, 30.0, null))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal)
        vm.addNutrient(NutrientKind.PROTEIN, 25.0)
        vm.load()
        assertEquals(listOf(now.toInstant(), a), source.nutrientTimes)
        source.nutrientGates[0].complete("r1")
        source.nutrientGates[1].complete("rA")
        assertEquals(listOf(now.toInstant(), a), source.nutrientTimes)
        assertEquals(listOf(Entry(a, 30.0, "rA"), Entry(now.toInstant(), 25.0, "r1")), journal.flow.value[TODAY]!!.protein)
    }

    @Test fun `an entry removed before the retry reaches it is not written`() {
        val source = FakeSource()
        source.gateNutrients = true
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val a = now.minusHours(3).toInstant()
        val b = now.minusHours(2).toInstant()
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(a, 30.0, null))
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(b, 20.0, null))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        vm.removeNutrient(NutrientKind.PROTEIN, b)
        source.nutrientGates[0].complete("rA")
        assertEquals(listOf(a), source.nutrientTimes)
        assertEquals(listOf(Entry(a, 30.0, "rA")), journal.flow.value[TODAY]!!.protein)
    }

    @Test fun `an entry removed while its retry write runs has its record deleted`() {
        val source = FakeSource()
        source.gateNutrients = true
        val journal = JournalStore(tmp.newFile(), CoroutineScope(UnconfinedTestDispatcher()))
        val a = now.minusHours(2).toInstant()
        journal.add(TODAY, NutrientKind.PROTEIN, Entry(a, 30.0, null))
        val vm = TodayViewModel(source, { now }, work = Dispatchers.Main, journal = journal).also { it.load() }
        vm.removeNutrient(NutrientKind.PROTEIN, a)
        source.nutrientGates[0].complete("r1")
        assertEquals(listOf("r1"), source.nutrientsDeleted)
        assertEquals(null, journal.flow.value[TODAY])
    }
}
