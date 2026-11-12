package com.apex.athlete.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.shell.rememberGroundBrush
import com.apex.athlete.core.ui.theme.ApexSpacing

/** Progress while the separate demo store is being filled through the real ingest and analytics path. */
@Composable
fun PreparingDemoScreen(done: Int, total: Int, modifier: Modifier = Modifier) {
    val ground = rememberGroundBrush()
    val fraction = if (total > 0) (done.toFloat() / total).coerceIn(0f, 1f) else 0f
    Box(
        modifier
            .fillMaxSize()
            .background(ground)
            .pointerInput(Unit) { detectTapGestures { } },
        contentAlignment = Alignment.Center,
    ) {
        ConnectionBanner(
            kind = BannerKind.Importing,
            title = stringResource(R.string.preparing_demo_title),
            description = stringResource(R.string.preparing_demo_body, (fraction * 100).toInt()),
            progress = fraction,
            modifier = Modifier.safeDrawingPadding().padding(ApexSpacing.xl),
        )
    }
}
