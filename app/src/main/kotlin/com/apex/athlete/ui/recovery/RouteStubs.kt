package com.apex.athlete.ui.recovery

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.navigation.ApexNavigator
import java.time.LocalDate

// TEMPORARY build scaffold so :app compiles before this area's screen exists.
// The screen builder for this area deletes this file and implements the routes below.

@Suppress("UNUSED_PARAMETER")
@Composable
fun RecoveryRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) = Unit
