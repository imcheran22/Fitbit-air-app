package com.apex.athlete.core.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.apex.athlete.core.ui.state.MetricState

/**
 * The master prompt's name (§7.3) for the score ring. It is the same component as [ScoreDial],
 * which is the name the design system uses; both exist so either document can be followed.
 */
@Composable
fun ArcGauge(
    state: MetricState,
    variant: DialVariant,
    size: DialSize,
    label: String,
    modifier: Modifier = Modifier,
    strainTarget: ClosedFloatingPointRange<Double>? = null,
    onClick: (() -> Unit)? = null,
) = ScoreDial(
    state = state,
    variant = variant,
    size = size,
    label = label,
    modifier = modifier,
    strainTarget = strainTarget,
    onClick = onClick,
)
