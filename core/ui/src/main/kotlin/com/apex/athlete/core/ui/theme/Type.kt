package com.apex.athlete.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.apex.athlete.core.ui.R

/*
 * Typography (DESIGN_SYSTEM.md §3).
 *
 * Two bundled faces, both SIL Open Font License 1.1 (licenses in core/ui/fonts-licenses/):
 * - Figtree (variable, wght 300-900) for text: labels, body, buttons.
 * - Barlow (static 500/600/700) for numerals. Every number that can change uses tabular figures.
 *
 * Fonts are bundled, never downloaded at runtime (privacy invariant: no network except data sources).
 */

// Variable-font settings are still marked experimental in Compose; the API has been stable in practice since 1.3.
@OptIn(ExperimentalTextApi::class)
private fun figtree(weight: FontWeight) = Font(
    resId = R.font.figtree_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val FigtreeFamily = FontFamily(
    figtree(FontWeight.Normal),
    figtree(FontWeight.Medium),
    figtree(FontWeight.SemiBold),
    figtree(FontWeight.Bold),
)

/** Barlow is bundled from 500 up, so a request for 400 resolves to the medium face. */
val BarlowFamily = FontFamily(
    Font(R.font.barlow_medium, FontWeight.Normal),
    Font(R.font.barlow_medium, FontWeight.Medium),
    Font(R.font.barlow_semibold, FontWeight.SemiBold),
    Font(R.font.barlow_bold, FontWeight.Bold),
)

/** OpenType feature string for tabular (fixed-width) figures. */
const val TABULAR_NUMS = "tnum"

private val tightLines = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)

private fun numeric(size: Int, line: Int, weight: FontWeight = FontWeight.Bold, tracking: Double = 0.0) = TextStyle(
    fontFamily = BarlowFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.em,
    fontFeatureSettings = TABULAR_NUMS,
    lineHeightStyle = tightLines,
)

private fun text(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
    fontFamily = FigtreeFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.em,
    lineHeightStyle = tightLines,
)

/**
 * Named type roles. "Caps" roles expect the caller to pass the string through `uppercase()`
 * (source copy stays sentence case so TalkBack reads it normally).
 * Sizes are in sp so they follow the system font scale (200% must not clip - layouts must allow wrapping).
 */
@Immutable
data class ApexTypography(
    /** Detail-screen hero dial value, e.g. "94" in the Recovery hero. Unit "%" renders at 0.55x. */
    val dialHero: TextStyle = numeric(64, 64, tracking = -0.01),
    /** Overview hero dial value (Recovery, centre dial). */
    val dialHomeLarge: TextStyle = numeric(30, 30, tracking = -0.01),
    /** Overview side dial value (Sleep, Strain). */
    val dialHome: TextStyle = numeric(26, 26, tracking = -0.01),
    /** Small stat dial value. */
    val dialSmall: TextStyle = numeric(16, 16),
    /** Label under/inside a dial: "RECOVERY". Caps. */
    val dialLabel: TextStyle = text(12, 16, FontWeight.Bold, tracking = 0.08),
    /** "APEX" wordmark above the Overview dials. Caps. */
    val wordmark: TextStyle = text(13, 16, FontWeight.SemiBold, tracking = 0.35),
    /** Top-bar title. Caps. */
    val topBarTitle: TextStyle = text(13, 16, FontWeight.Bold, tracking = 0.1),
    /** Detail header title (the date, "TODAY"). Caps. */
    val detailTitle: TextStyle = text(15, 20, FontWeight.Bold, tracking = 0.1),
    /** Section title, e.g. "My Day". Sentence case. */
    val sectionTitle: TextStyle = text(22, 28, FontWeight.SemiBold, tracking = -0.01),
    /** Card title: "HEART RATE". Caps. */
    val cardTitle: TextStyle = text(13, 16, FontWeight.Bold, tracking = 0.08),
    /** Row label: "HEART RATE VARIABILITY". Caps. */
    val statLabel: TextStyle = text(12, 16, FontWeight.Bold, tracking = 0.08),
    /** Value in a stat row. */
    val statValue: TextStyle = numeric(20, 24),
    /** Large value in a tile or card ("149" bpm). */
    val statValueLarge: TextStyle = numeric(36, 40, tracking = -0.01),
    /** Unit after a value ("bpm", "ms"). */
    val statUnit: TextStyle = text(13, 16, FontWeight.SemiBold),
    /** Sub-value such as the 30-day average under a row value. */
    val statSubValue: TextStyle = numeric(13, 16, weight = FontWeight.Medium),
    /** Body copy, max ~65 characters per line. */
    val body: TextStyle = text(15, 22, FontWeight.Normal),
    /** Insight title / strong body. */
    val bodyStrong: TextStyle = text(16, 22, FontWeight.SemiBold),
    /** Captions, timestamps, provenance lines. */
    val caption: TextStyle = text(12, 16, FontWeight.Medium),
    /** Link action inside insight cards: "EXPLORE YOUR RECOVERY INSIGHTS". Caps. */
    val linkAction: TextStyle = text(12, 16, FontWeight.Bold, tracking = 0.08),
    /** Button label. Caps. */
    val button: TextStyle = text(13, 16, FontWeight.Bold, tracking = 0.06),
    /** Primary button inside a sheet ("SAVE"). Caps. */
    val sheetButton: TextStyle = text(15, 20, FontWeight.Bold, tracking = 0.08),
    /** Status tag ("PROVISIONAL", "CALIBRATING"). Caps. */
    val tag: TextStyle = text(11, 14, FontWeight.Bold, tracking = 0.06),
    /** Bottom tab label. */
    val tabLabel: TextStyle = text(11, 13, FontWeight.SemiBold),
    /** Sheet title. */
    val sheetTitle: TextStyle = text(18, 24, FontWeight.SemiBold, tracking = -0.01),
    /** Info card title. Caps. */
    val infoTitle: TextStyle = text(15, 20, FontWeight.Bold, tracking = 0.08),
    /** Date pill label ("TODAY"). Caps. */
    val datePill: TextStyle = text(13, 16, FontWeight.Bold, tracking = 0.1).copy(fontFeatureSettings = TABULAR_NUMS),
    /** Header sync text ("1m"). */
    val headerSync: TextStyle = numeric(15, 20, weight = FontWeight.SemiBold),
    /** Chart ticks, tooltips and labels. */
    val chart: TextStyle = numeric(12, 16, weight = FontWeight.Medium),
)
