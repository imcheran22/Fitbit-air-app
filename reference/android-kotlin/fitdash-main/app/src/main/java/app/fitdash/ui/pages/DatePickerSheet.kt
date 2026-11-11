package app.fitdash.ui.pages

import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.graphics.Color
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private fun LocalDate.toUtcMillis() = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toUtcDate() = Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerSheet(selected: LocalDate, today: LocalDate, daysBack: Long, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val earliest = today.minusDays(daysBack)
    val state = rememberDatePickerState(
        initialSelectedDateMillis = selected.toUtcMillis(),
        initialDisplayedMonthMillis = selected.toUtcMillis(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis.toUtcDate() in earliest..today
            override fun isSelectableYear(year: Int) = year in earliest.year..today.year
        },
    )
    LaunchedEffect(state) {
        snapshotFlow { state.selectedDateMillis }.collect { millis ->
            val date = millis?.toUtcDate()
            if (date != null && date != selected) {
                onPick(date)
                onDismiss()
            }
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = LocalTheme.current.bgMid) {
        DatePicker(
            state,
            title = null,
            showModeToggle = false,
            colors = DatePickerDefaults.colors(
                containerColor = Color.Transparent,
                headlineContentColor = Palette.Text,
                weekdayContentColor = Palette.Muted,
                subheadContentColor = Palette.Muted,
                navigationContentColor = Palette.Text,
                yearContentColor = Palette.Text,
                currentYearContentColor = Palette.Accent,
                selectedYearContentColor = Palette.Background,
                selectedYearContainerColor = Palette.Accent,
                dayContentColor = Palette.Text,
                disabledDayContentColor = Palette.Faint,
                selectedDayContentColor = Palette.Background,
                selectedDayContainerColor = Palette.Accent,
                todayContentColor = Palette.Accent,
                todayDateBorderColor = Palette.Accent,
                dividerColor = Palette.Divider,
            ),
        )
        Box(Modifier.fillMaxWidth().padding(bottom = Space.l), contentAlignment = Alignment.Center) {
            TextButton(onClick = { onPick(today); onDismiss() }) {
                Text("TODAY", style = Type.label, color = Palette.Accent)
            }
        }
    }
}
