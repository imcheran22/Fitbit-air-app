package app.fitdash.ui.pages

import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.ReadProgress
import android.content.Intent
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import app.fitdash.settings.JournalStore
import app.fitdash.settings.NutrientKind
import app.fitdash.settings.Settings
import app.fitdash.settings.SettingsStore
import app.fitdash.ui.PreviewData
import app.fitdash.ui.components.BottomBar
import app.fitdash.ui.components.LocalRevealed
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.NavItem
import app.fitdash.ui.components.ScoreChips
import app.fitdash.ui.sleepChips
import androidx.compose.foundation.layout.width
import app.fitdash.ui.theme.FitdashTheme
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.share.ShareRender
import app.fitdash.ui.theme.ThemedBackground
import app.fitdash.health.Workout
import app.fitdash.metrics.ReadinessResult
import app.fitdash.metrics.TagEffect
import app.fitdash.settings.Tag
import app.fitdash.metrics.TodayData
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.today.TodayUiState
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant
import java.time.LocalDate

private val NAV = listOf(
    NavItem("Today", NavIcons.today),
    NavItem("Sleep", NavIcons.sleep),
    NavItem("Activity", NavIcons.activity),
    NavItem("Log", NavIcons.log),
    NavItem("Trends", NavIcons.trends),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PagerScreen(
    state: TodayUiState.Ready,
    store: SettingsStore,
    progress: StateFlow<ReadProgress?> = MutableStateFlow(null),
    rawSnapshot: StateFlow<HealthSnapshot?> = MutableStateFlow(null),
    onRefresh: () -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onAddWater: (Int) -> Unit,
    onUndoWater: () -> Unit,
    onAddNutrient: (NutrientKind, Double) -> Unit,
    onRemoveNutrient: (NutrientKind, Instant) -> Unit,
    onSetHeight: (Int) -> Unit,
    onPhoneOnly: (Boolean) -> Unit = {},
    onAddSleep: (Instant, Instant) -> Unit = { _, _ -> },
    onRemoveSleep: () -> Unit = {},
    onAskHistory: () -> Unit = {},
    onSync: (String) -> Unit = {},
    onAskBackground: () -> Unit = {},
    // A page a widget tap asked for; cleared once the pager is there.
    openPage: Int? = null,
    onPageOpened: () -> Unit = {},
) {
    val data = state.data
    val pager = rememberPagerState { NAV.size }
    val scope = rememberCoroutineScope()
    val revealed = remember { mutableSetOf<String>() }
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    var showInfo by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var sharing by remember { mutableStateOf(false) }
    var showCalendar by remember { mutableStateOf(false) }
    var metric by remember { mutableStateOf<MetricRef?>(null) }
    var workout by remember { mutableStateOf<Workout?>(null) }
    val settings by store.flow.collectAsState()
    val journal = remember { JournalStore.get(context) }
    val today = if (data.isToday) data.date else LocalDate.now()

    LaunchedEffect(openPage) {
        openPage?.let { pager.scrollToPage(it.coerceIn(0, NAV.size - 1)); onPageOpened() }
    }
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.drop(1).collect { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    }
    val goTo: (Int) -> Unit = { page -> scope.launch { pager.animateScrollToPage(page, animationSpec = tween(Motion.PAGE, easing = Motion.ease)) } }
    val topColour = LocalTheme.current.bgTop
    val askAi = {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, state.aiText)
        context.startActivity(Intent.createChooser(send, "Ask AI about my data"))
    }
    val chrome = PageChrome(
        date = data.date,
        today = today,
        error = state.error,
        daysBack = data.daysBack,
        onPrev = { onSelectDate(data.date.minusDays(1)) },
        onNext = { onSelectDate(data.date.plusDays(1)) },
        onPickDate = { showCalendar = true },
        onMenu = { showSettings = true },
        onInfo = { showInfo = true },
        onRetry = onRefresh,
    )

    CompositionLocalProvider(LocalRevealed provides revealed, LocalOpenMetric provides { metric = it }, LocalMiles provides settings.miles, LocalPrefs provides settings) {
        val refreshState = rememberPullToRefreshState()
        val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        // The spinner only for a pull; a background refresh shows its progress in the sync row instead.
        var pulled by remember { mutableStateOf(false) }
        LaunchedEffect(refreshState, settings.haptics) {
            if (settings.haptics) snapshotFlow { refreshState.distanceFraction >= 1f }.drop(1).filter { it }.collect { haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate) }
        }
        LaunchedEffect(state.refreshing) { if (!state.refreshing) pulled = false }
        PullToRefreshBox(
            isRefreshing = state.refreshing && pulled,
            onRefresh = { pulled = true; onRefresh() },
            modifier = Modifier.fillMaxSize().background(Palette.Background),
            state = refreshState,
            // Sits under the status bar and the top bar instead of over the date.
            indicator = {
                PullToRefreshDefaults.Indicator(
                    state = refreshState,
                    isRefreshing = state.refreshing && pulled,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = statusTop + 8.dp),
                    containerColor = LocalTheme.current.bgMid,
                    color = Palette.Accent,
                )
            },
        ) {
            Box(Modifier.fillMaxSize()) {
                ThemedBackground()
                HorizontalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1) { page ->
                    when (page) {
                        0 -> TodayPage(data, chrome, goTo, onSelectDate, { sharing = true }, askAi, settings.miles, { workout = it }, onSync, state.refreshing, progress) { store.update { it.copy(weekReviewSeen = today) } }
                        1 -> SleepPage(data, chrome)
                        2 -> ActivityPage(data, chrome, settings.miles, { workout = it })
                        3 -> LogPage(data, chrome, journal, onAddWater, onUndoWater, onAddNutrient, onRemoveNutrient, onAddSleep, onRemoveSleep)
                        else -> TrendsPage(data, chrome)
                    }
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 24.dp)
                    .align(Alignment.TopCenter)
                    .background(Brush.verticalGradient(listOf(topColour, topColour.copy(alpha = 0.85f), Color.Transparent))),
            )
            BottomBar(
                NAV,
                pager,
                onSelect = { i ->
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    goTo(i)
                },
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 22.dp).padding(bottom = 22.dp),
            )
        }
        if (sharing) ShareRender(data, onDone = { sharing = false })
        if (showSettings) SettingsSheet(store, data, rawSnapshot.collectAsState().value, data.sources, data.heightMeters, onSetHeight, onPhoneOnly, state.canAskHistory, onAskHistory, state.background, onAskBackground, onDismiss = { showSettings = false })
        if (showInfo) InfoSheet(data.sources, onDismiss = { showInfo = false })
        metric?.let { ref ->
            if (ref is MetricRef.Fitness) FitnessSheet(ref.card, data, onDismiss = { metric = null })
            else MetricDetailSheet(ref, data, settings.miles, onDismiss = { metric = null })
        }
        workout?.let { WorkoutSheet(it, data.workoutHr[it.start].orEmpty(), settings.miles, onDismiss = { workout = null }) }
        if (showCalendar) DatePickerSheet(data.date, today, data.daysBack, onSelectDate, onDismiss = { showCalendar = false })
    }
}

@Preview(heightDp = 1500)
@Composable
private fun TodayFull() = PagePreview(0)

@Preview(heightDp = 1500)
@Composable
private fun TodayNoSleep() = PagePreview(0, PreviewData.today(21, 30).copy(sleep = null))

@Preview(heightDp = 1500)
@Composable
private fun TodayNoData() = PagePreview(0, PreviewData.today(21, 30).copy(sleep = null, activity = null))

@Preview(heightDp = 1500)
@Composable
private fun TodayWeekReview() = PagePreview(0, PreviewData.today(21, 30).copy(date = LocalDate.of(2026, 10, 12)))

@Preview(heightDp = 1500)
@Composable
private fun TodayAlert() = CompositionLocalProvider(LocalPrefs provides Settings(morningAlert = true)) {
    PagePreview(0, PreviewData.today(8, 0).let { d -> d.copy(heart = d.heart?.copy(restingHr = 76.0)) })
}

@Preview(heightDp = 900)
@Composable
private fun TodayTimeline() = PagePreview(0, PreviewData.today(14, 0))

@Preview(heightDp = 900, fontScale = 1.3f)
@Composable
private fun TodayTimelineLargeText() = PagePreview(0, PreviewData.today(14, 0))

@Preview(heightDp = 1500)
@Composable
private fun TodayPastDate() = PagePreview(0, PreviewData.today(21, 30).copy(isToday = false))

@Preview(heightDp = 1500)
@Composable
private fun TodayCalibrating() = PagePreview(0, PreviewData.today(21, 30).copy(readiness = ReadinessResult.Calibrating(3)))

@Preview(heightDp = 1500, fontScale = 1.3f)
@Composable
private fun TodayLargeText() = PagePreview(0)

@Preview(heightDp = 900)
@Composable
private fun SleepLook() = PagePreview(1)

@Preview(heightDp = 900)
@Composable
private fun LogWater() = PagePreview(3)

@Preview(heightDp = 900, fontScale = 1.3f)
@Composable
private fun LogWaterLargeText() = PagePreview(3)

@Preview(heightDp = 900)
@Composable
private fun LogTags() = PagePreview(3, initialSegment = 3)

@Preview(heightDp = 1500)
@Composable
private fun TrendsInsights() = PagePreview(4, PreviewData.today(21, 30).copy(tagEffects = listOf(
    TagEffect(Tag.ALCOHOL, 8, -9.0, 4.0, -6.0, -0.05),
    TagEffect(Tag.STRESS, 6, -3.0, null, null, null),
)))

@Preview(heightDp = 1500)
@Composable
private fun TrendsInsightsEmpty() = PagePreview(4, PreviewData.today(21, 30).copy(taggedDays = 3))

@Preview(widthDp = 320, fontScale = 1.3f, showBackground = true)
@Composable
private fun ChipsWrapped() {
    val data = PreviewData.today(21, 30)
    FitdashTheme { ScoreChips(sleepChips(data.sleep!!, data.goals.sleepHours).take(4), Modifier.width(320.dp).padding(16.dp)) }
}

@Composable
private fun PagePreview(page: Int, data: TodayData = PreviewData.today(21, 30), initialSegment: Int = 0) {
    val chrome = PageChrome(data.date, data.date, false, 29, {}, {}, {}, {}, {}, {})
    FitdashTheme {
        Box(Modifier.fillMaxSize()) {
            ThemedBackground()
            when (page) {
                0 -> TodayPage(data, chrome, {}, {}, {}, {})
                3 -> LogPage(data, chrome, JournalStore(File("journal-preview.json")), {}, {}, { _, _ -> }, { _, _ -> }, initialSegment = initialSegment)
                4 -> TrendsPage(data, chrome)
                else -> SleepPage(data, chrome)
            }
        }
    }
}
