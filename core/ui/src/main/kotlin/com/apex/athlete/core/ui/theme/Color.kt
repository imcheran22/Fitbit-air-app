package com.apex.athlete.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * Apex colour tokens.
 *
 * Values are translated one-for-one from the design reference (Pulse Mobile 0.5.0, `global.css` and
 * `src/ui/palette.ts`), which is the shipped source of truth for that look. Names keep the reference's
 * token names in camelCase so `docs/design/DESIGN_SYSTEM.md` can be read side by side with the code.
 *
 * Rules (see DESIGN_SYSTEM.md §2):
 * - Components use tokens, never raw hex.
 * - Chrome is neutral (white/grey). Data colours carry data meaning only.
 * - A `*Text` variant exists where the fill colour fails 4.5:1 as text on a card; use it for text.
 */
@Immutable
data class ApexColors(
    val isDark: Boolean,

    // Ground and surfaces
    val backgroundTop: Color,
    val backgroundMid: Color,
    val background: Color,
    val card: Color,
    val cardTop: Color,
    val cardHover: Color,
    val cardEdge: Color,
    val popover: Color,
    val popoverTop: Color,
    val secondary: Color,
    val accent: Color,
    val muted: Color,
    val inset: Color,
    val field: Color,
    val border: Color,
    val input: Color,

    // Text tiers
    val foreground: Color,
    val foregroundSecondary: Color,
    val foregroundBody: Color,
    val mutedForeground: Color,
    val primary: Color,
    val primaryForeground: Color,

    // Data: recovery bands
    val recoveryGreen: Color,
    val recoveryYellow: Color,
    val recoveryRed: Color,
    val recoveryRedText: Color,

    // Data: strain and sleep
    val strain: Color,
    val strainText: Color,
    val strainDeep: Color,
    val strainBand1: Color,
    val strainBand2: Color,
    val strainBand3: Color,
    val strainBand4: Color,
    val sleep: Color,
    val sleepDeep: Color,

    // Data: status
    val optimal: Color,
    val optimalText: Color,
    val warning: Color,
    val warningText: Color,
    val destructive: Color,
    val stressLow: Color,
    val stressMedium: Color,
    val stressHigh: Color,

    // Coach / insight
    val coach: Color,
    val coachText: Color,
    val insightFrom: Color,
    val insightTo: Color,
    val bannerFrom: Color,
    val bannerTo: Color,

    // Dials
    val dialTrack: Color,
    val dialTarget: Color,

    // Charts
    val chartGrid: Color,
    val chartBand: Color,
    val chartCursor: Color,
    val chartHighlight: Color,
    val chart1: Color,
    val chart2: Color,
    val chart3: Color,
    val chart4: Color,
    val chart5: Color,

    // Hypnogram stages
    val stageAwake: Color,
    val stageRem: Color,
    val stageLight: Color,
    val stageDeep: Color,

    // Glass chrome (tab bar, floating action) - chrome only, never content
    val glassTop: Color,
    val glassBottom: Color,
    val glassEdge: Color,
    val glassRim: Color,
    val glassLens: Color,
    val glassActionTop: Color,
    val glassActionBottom: Color,
    val actionRimFrom: Color,
    val actionRimTo: Color,

    // Overlays and interaction fills
    val dim: Color,
    val dimStrong: Color,
    val fillFaint: Color,
    val fillHover: Color,
    val fillPressed: Color,
    val skeleton: Color,
    val focusRing: Color,
    val patternHatch: Color,
    val switchThumb: Color,
)

val ApexLightColors = ApexColors(
    isDark = false,
    backgroundTop = Color(0xFFF6F8F9),
    backgroundMid = Color(0xFFEFF2F4),
    background = Color(0xFFE9EDF0),
    card = Color(0xFFFFFFFF),
    cardTop = Color(0xFFFFFFFF),
    cardHover = Color(0xFFF5F7F8),
    cardEdge = Color(0x00FFFFFF),
    popover = Color(0xFFFFFFFF),
    popoverTop = Color(0xFFFFFFFF),
    secondary = Color(0xFFE4E8EB),
    accent = Color(0xFFDDE2E6),
    muted = Color(0xFFEEF1F3),
    inset = Color(0xFFEEF1F3),
    field = Color(0xFFEDF0F2),
    border = Color(0x1A101518),
    input = Color(0x29101518),

    foreground = Color(0xFF101518),
    foregroundSecondary = Color(0xFF49535A),
    foregroundBody = Color(0xD9101518),
    mutedForeground = Color(0xFF5A646B),
    primary = Color(0xFF101518),
    primaryForeground = Color(0xFFFFFFFF),

    recoveryGreen = Color(0xFF12C805),
    recoveryYellow = Color(0xFFE5C300),
    recoveryRed = Color(0xFFF20024),
    recoveryRedText = Color(0xFFD7001F),

    strain = Color(0xFF0093E7),
    // Reference value #0077BF is 4.49:1 on backgroundTop; lifted one step to 4.6:1 (ColorContrastTest).
    strainText = Color(0xFF0075BB),
    strainDeep = Color(0xFF0D48BE),
    strainBand1 = Color(0xFF0093E7),
    strainBand2 = Color(0xFF38ABEC),
    strainBand3 = Color(0xFF6BC0F1),
    strainBand4 = Color(0xFF99D4F5),
    sleep = Color(0xFF6690AD),
    sleepDeep = Color(0xFF39597B),

    optimal = Color(0xFF00B377),
    optimalText = Color(0xFF007A52),
    warning = Color(0xFFD97900),
    warningText = Color(0xFFA85A00),
    destructive = Color(0xFFFF0026),
    stressLow = Color(0xFF3F92D3),
    stressMedium = Color(0xFF00B377),
    stressHigh = Color(0xFFD97900),

    coach = Color(0xFF4F6FE0),
    coachText = Color(0xFF3D5BD9),
    insightFrom = Color(0xFFE6E2FB),
    insightTo = Color(0xFFDCEEF7),
    bannerFrom = Color(0xFFE9E8F7),
    bannerTo = Color(0xFFE3ECF3),

    dialTrack = Color(0xFFE2E6E9),
    dialTarget = Color(0xFFB3BBC1),

    chartGrid = Color(0x14101518),
    chartBand = Color(0x0A101518),
    chartCursor = Color(0x59101518),
    chartHighlight = Color(0x12101518),
    chart1 = Color(0xFF0093E7),
    chart2 = Color(0xFF00B377),
    chart3 = Color(0xFF6690AD),
    chart4 = Color(0xFFD97900),
    chart5 = Color(0xFF3F92D3),

    stageAwake = Color(0xFF8A939C),
    stageRem = Color(0xFF8236D4),
    stageLight = Color(0xFF5F5AD6),
    stageDeep = Color(0xFFC93B9F),

    glassTop = Color(0xD1FFFFFF),
    glassBottom = Color(0xE6F6F8F9),
    glassEdge = Color(0xE6FFFFFF),
    glassRim = Color(0x0F101518),
    glassLens = Color(0x0D101518),
    glassActionTop = Color(0xE6F0F1FC),
    glassActionBottom = Color(0xF0E6E9F8),
    actionRimFrom = Color(0xFF7778DD),
    actionRimTo = Color(0xFF4C94DB),

    dim = Color(0x73101518),
    dimStrong = Color(0xB3101518),
    fillFaint = Color(0x0F101518),
    fillHover = Color(0x14101518),
    fillPressed = Color(0x1A101518),
    skeleton = Color(0x99EEF1F3),
    focusRing = Color(0xB3101518),
    patternHatch = Color(0x14101518),
    switchThumb = Color(0xFFFFFFFF),
)

val ApexDarkColors = ApexColors(
    isDark = true,
    backgroundTop = Color(0xFF1D2529),
    backgroundMid = Color(0xFF151B1F),
    background = Color(0xFF101518),
    card = Color(0xFF232629),
    cardTop = Color(0xFF272A2D),
    cardHover = Color(0xFF2C3033),
    cardEdge = Color(0x0FFFFFFF),
    popover = Color(0xFF252C32),
    popoverTop = Color(0xFF2A373F),
    secondary = Color(0xFF3B4244),
    accent = Color(0xFF41484B),
    muted = Color(0xFF22282C),
    inset = Color(0xFF111619),
    field = Color(0xFF32393E),
    border = Color(0x1AFFFFFF),
    input = Color(0x26FFFFFF),

    foreground = Color(0xFFFFFFFF),
    foregroundSecondary = Color(0xFFBABAC0),
    foregroundBody = Color(0xD9FFFFFF),
    mutedForeground = Color(0xFFA9AEB3),
    primary = Color(0xFFFFFFFF),
    primaryForeground = Color(0xFF101518),

    recoveryGreen = Color(0xFF16EC06),
    recoveryYellow = Color(0xFFFFDE00),
    recoveryRed = Color(0xFFFF0026),
    recoveryRedText = Color(0xFFFF5A6A),

    strain = Color(0xFF0093E7),
    strainText = Color(0xFF1FA0F0),
    strainDeep = Color(0xFF0D48BE),
    strainBand1 = Color(0xFF0093E7),
    strainBand2 = Color(0xFF087BBD),
    strainBand3 = Color(0xFF0F6597),
    strainBand4 = Color(0xFF155275),
    sleep = Color(0xFF7BA1BB),
    sleepDeep = Color(0xFF39597B),

    optimal = Color(0xFF00F19F),
    optimalText = Color(0xFF00F19F),
    warning = Color(0xFFFFA722),
    warningText = Color(0xFFFFA722),
    destructive = Color(0xFFFF0026),
    stressLow = Color(0xFF67AEE6),
    stressMedium = Color(0xFF00F19F),
    stressHigh = Color(0xFFFFA722),

    coach = Color(0xFF7095FE),
    coachText = Color(0xFF7095FE),
    insightFrom = Color(0xFF4B418C),
    insightTo = Color(0xFF346E8C),
    bannerFrom = Color(0xFF2E2C4F),
    bannerTo = Color(0xFF2B3F50),

    dialTrack = Color(0xFF33383C),
    dialTarget = Color(0xFF5A5E61),

    chartGrid = Color(0x14FFFFFF),
    chartBand = Color(0x0DFFFFFF),
    chartCursor = Color(0x66FFFFFF),
    chartHighlight = Color(0x12FFFFFF),
    chart1 = Color(0xFF0093E7),
    chart2 = Color(0xFF00F19F),
    chart3 = Color(0xFF7BA1BB),
    chart4 = Color(0xFFFFA722),
    chart5 = Color(0xFF67AEE6),

    stageAwake = Color(0xFFDFE3E8),
    stageRem = Color(0xFFA35CF0),
    stageLight = Color(0xFFA9A6F4),
    stageDeep = Color(0xFFF39AE4),

    glassTop = Color(0xCC22272D),
    glassBottom = Color(0xE0161B1F),
    glassEdge = Color(0x1AFFFFFF),
    glassRim = Color(0x0FFFFFFF),
    glassLens = Color(0x12FFFFFF),
    glassActionTop = Color(0xD1232735),
    glassActionBottom = Color(0xE61E2333),
    actionRimFrom = Color(0xFF7778DD),
    actionRimTo = Color(0xFF4C94DB),

    dim = Color(0xA6000000),
    dimStrong = Color(0xD9000000),
    fillFaint = Color(0x0FFFFFFF),
    fillHover = Color(0x14FFFFFF),
    fillPressed = Color(0x1AFFFFFF),
    skeleton = Color(0x0FFFFFFF),
    focusRing = Color(0xB3FFFFFF),
    patternHatch = Color(0x17FFFFFF),
    switchThumb = Color(0xFFFFFFFF),
)

/** Recovery band thresholds (DESIGN_SYSTEM.md §2.3): green ≥ 67, yellow 34-66, red ≤ 33. */
enum class RecoveryBand { GREEN, YELLOW, RED }

fun recoveryBandOf(score: Int): RecoveryBand = when {
    score >= 67 -> RecoveryBand.GREEN
    score >= 34 -> RecoveryBand.YELLOW
    else -> RecoveryBand.RED
}

/** Fill colour for a recovery band (rings, bars). For text use [recoveryTextColor]. */
fun ApexColors.recoveryFill(band: RecoveryBand): Color = when (band) {
    RecoveryBand.GREEN -> recoveryGreen
    RecoveryBand.YELLOW -> recoveryYellow
    RecoveryBand.RED -> recoveryRed
}

/** Text colour for a recovery band; red uses the contrast-lifted text variant. */
fun ApexColors.recoveryTextColor(band: RecoveryBand): Color = when (band) {
    RecoveryBand.GREEN -> recoveryGreen
    RecoveryBand.YELLOW -> recoveryYellow
    RecoveryBand.RED -> recoveryRedText
}
