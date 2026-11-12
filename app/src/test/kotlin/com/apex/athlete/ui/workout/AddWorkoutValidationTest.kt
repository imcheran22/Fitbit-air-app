package com.apex.athlete.ui.workout

import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AddWorkoutValidationTest {
    private val zone: ZoneId = ZoneOffset.UTC
    private val day = LocalDate.of(2026, 11, 10)
    private val now = ZonedDateTime.of(2026, 11, 10, 12, 0, 0, 0, zone).toInstant().toEpochMilli()

    private fun input(
        name: String = "Run",
        type: String = "RUNNING",
        start: Int = 7 * 60,
        duration: String = "45",
        rpe: Int? = 6,
    ) = WorkoutFormInput(name, type, start, duration, rpe)

    private fun errors(i: WorkoutFormInput, d: LocalDate = day, nowMillis: Long = now): Set<WorkoutFormError> =
        (validateWorkout(i, d, zone, nowMillis, "Fallback") as? WorkoutValidation.Invalid)?.errors.orEmpty()

    @Test
    fun validInputProducesTheRepositoryArguments() {
        val result = validateWorkout(input(), day, zone, now, "Fallback")
        val valid = assertIs<WorkoutValidation.Valid>(result).workout
        assertEquals(ZonedDateTime.of(2026, 11, 10, 7, 0, 0, 0, zone).toInstant().toEpochMilli(), valid.startMillis)
        assertEquals(45, valid.durationMinutes)
        assertEquals("Run", valid.name)
        assertEquals("RUNNING", valid.type)
        assertEquals(6, valid.rpe)
    }

    @Test
    fun durationBoundsAreOneToSixHundred() {
        assertTrue(errors(input(duration = "1")).isEmpty())
        assertTrue(errors(input(duration = "600")).isEmpty())
        assertEquals(setOf(WorkoutFormError.DURATION_OUT_OF_RANGE), errors(input(duration = "0")))
        assertEquals(setOf(WorkoutFormError.DURATION_OUT_OF_RANGE), errors(input(duration = "601")))
        assertEquals(setOf(WorkoutFormError.DURATION_OUT_OF_RANGE), errors(input(duration = "9999")))
    }

    @Test
    fun durationMustBeAWholeNumber() {
        for (text in listOf("", "  ", "abc", "4.5", "-5", "1e2", "45 min", "12345")) {
            assertEquals(setOf(WorkoutFormError.DURATION_NOT_A_NUMBER), errors(input(duration = text)), "text='$text'")
        }
        assertTrue(errors(input(duration = " 45 ")).isEmpty())
    }

    @Test
    fun startTimeInTheFutureIsRejected() {
        assertEquals(setOf(WorkoutFormError.START_IN_FUTURE), errors(input(start = 12 * 60 + 1)))
        assertEquals(setOf(WorkoutFormError.START_IN_FUTURE), errors(input(start = 23 * 60)))
    }

    @Test
    fun startTimeEqualToNowIsAccepted() {
        assertTrue(errors(input(start = 12 * 60)).isEmpty())
    }

    @Test
    fun aFutureDayIsRejectedAtAnyTime() {
        assertEquals(setOf(WorkoutFormError.START_IN_FUTURE), errors(input(start = 0), d = day.plusDays(1)))
    }

    @Test
    fun anEarlierDayIsAcceptedAtAnyTime() {
        assertTrue(errors(input(start = 23 * 60 + 55), d = day.minusDays(1)).isEmpty())
    }

    @Test
    fun rpeMustBeOneToTen() {
        assertEquals(setOf(WorkoutFormError.RPE_MISSING), errors(input(rpe = null)))
        assertEquals(setOf(WorkoutFormError.RPE_MISSING), errors(input(rpe = 0)))
        assertEquals(setOf(WorkoutFormError.RPE_MISSING), errors(input(rpe = 11)))
        assertTrue(errors(input(rpe = 1)).isEmpty())
        assertTrue(errors(input(rpe = 10)).isEmpty())
    }

    @Test
    fun typeMustBeOneTheAppSupports() {
        assertEquals(setOf(WorkoutFormError.TYPE_UNSUPPORTED), errors(input(type = "QUIDDITCH")))
        SUPPORTED_TYPES.forEach { assertTrue(errors(input(type = it)).isEmpty(), it) }
    }

    @Test
    fun blankNameFallsBackToTheTypeLabel() {
        val valid = assertIs<WorkoutValidation.Valid>(validateWorkout(input(name = "   "), day, zone, now, "Running")).workout
        assertEquals("Running", valid.name)
    }

    @Test
    fun nameIsTrimmedAndLimited() {
        val valid = assertIs<WorkoutValidation.Valid>(validateWorkout(input(name = "  Tempo  "), day, zone, now, "x")).workout
        assertEquals("Tempo", valid.name)
        assertEquals(setOf(WorkoutFormError.NAME_TOO_LONG), errors(input(name = "a".repeat(MAX_NAME_LENGTH + 1))))
        assertTrue(errors(input(name = "a".repeat(MAX_NAME_LENGTH))).isEmpty())
    }

    @Test
    fun severalErrorsAreReportedTogether() {
        val all = errors(input(duration = "", rpe = null, start = 23 * 60))
        assertEquals(
            setOf(WorkoutFormError.DURATION_NOT_A_NUMBER, WorkoutFormError.RPE_MISSING, WorkoutFormError.START_IN_FUTURE),
            all,
        )
    }

    @Test
    fun startMillisUsesTheGivenZone() {
        val berlin = ZoneId.of("Europe/Berlin")
        val millis = startMillisOf(day, 7 * 60, berlin)
        assertEquals(ZonedDateTime.of(2026, 11, 10, 7, 0, 0, 0, berlin).toInstant().toEpochMilli(), millis)
    }

    @Test
    fun defaultStartIsNowRoundedDownToFiveMinutesOnTheSameDay() {
        val at = ZonedDateTime.of(2026, 11, 10, 9, 47, 30, 0, zone).toInstant().toEpochMilli()
        assertEquals(9 * 60 + 45, defaultStartMinute(day, zone, at))
        assertEquals(12 * 60, defaultStartMinute(day.minusDays(1), zone, at))
    }

    @Test
    fun parseDurationRejectsAnythingButDigits() {
        assertEquals(45, parseDuration("45"))
        assertEquals(7, parseDuration("007"))
        assertNull(parseDuration("+5"))
    }
}
