package com.apex.athlete.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.shell.rememberGroundBrush
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Shown over the whole app when the encrypted database cannot be opened (damaged file, or the
 * Keystore key that wraps its passphrase is gone, for example after a device restore).
 *
 * It explains, and offers a clean start only after an explicit second confirmation. Nothing is ever
 * deleted automatically. [causeName] is the exception class name only, never its message (messages
 * can contain file paths).
 *
 * In Demo mode the failure concerns the in-memory demo store, so the way out is leaving Demo mode
 * instead of deleting the real database.
 */
@Composable
fun StoreFailedScreen(
    isDemo: Boolean,
    causeName: String?,
    onCleanStart: () -> Unit,
    onLeaveDemo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = ApexTheme.colors
    val type = ApexTheme.type
    var confirming by rememberSaveable { mutableStateOf(false) }
    val ground = rememberGroundBrush()

    Box(
        modifier
            .fillMaxSize()
            .background(ground)
            // Swallow touches so nothing underneath the overlay can be used while the store is unusable.
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(ApexSpacing.xl),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg, Alignment.CenterVertically),
        ) {
            Text(
                text = stringResource(R.string.store_failed_title),
                style = type.sectionTitle,
                color = colors.foreground,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(if (isDemo) R.string.store_failed_demo_body else R.string.store_failed_body),
                style = type.body,
                color = colors.foregroundBody,
            )
            ApexCard(Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.store_failed_reassure),
                    style = type.body,
                    color = colors.foregroundSecondary,
                )
            }
            if (!causeName.isNullOrBlank()) {
                Text(
                    text = stringResource(R.string.store_failed_detail, causeName),
                    style = type.caption,
                    color = colors.mutedForeground,
                )
            }

            if (isDemo) {
                ApexButton(
                    text = stringResource(R.string.store_failed_leave_demo),
                    onClick = onLeaveDemo,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else if (!confirming) {
                ApexButton(
                    text = stringResource(R.string.store_failed_start_clean),
                    onClick = { confirming = true },
                    style = ApexButtonStyle.Destructive,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                ApexCard(Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.store_failed_confirm_title),
                        style = type.bodyStrong,
                        color = colors.foreground,
                    )
                    Text(
                        text = stringResource(R.string.store_failed_confirm_body),
                        style = type.body,
                        color = colors.foregroundSecondary,
                        modifier = Modifier.padding(vertical = ApexSpacing.sm),
                    )
                    ApexButton(
                        text = stringResource(R.string.store_failed_confirm_delete),
                        onClick = onCleanStart,
                        style = ApexButtonStyle.Destructive,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    ApexButton(
                        text = stringResource(R.string.common_cancel),
                        onClick = { confirming = false },
                        style = ApexButtonStyle.Secondary,
                        modifier = Modifier.fillMaxWidth().padding(top = ApexSpacing.sm),
                    )
                }
            }
        }
    }
}
