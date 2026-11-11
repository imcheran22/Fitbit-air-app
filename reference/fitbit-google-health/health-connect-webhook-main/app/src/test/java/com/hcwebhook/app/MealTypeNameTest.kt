package com.hcwebhook.app

import androidx.health.connect.client.records.MealType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MealTypeNameTest {

    @Test
    fun mapsHealthConnectConstants() {
        assertEquals("breakfast", mealTypeName(MealType.MEAL_TYPE_BREAKFAST))
        assertEquals("lunch", mealTypeName(MealType.MEAL_TYPE_LUNCH))
        assertEquals("dinner", mealTypeName(MealType.MEAL_TYPE_DINNER))
        assertEquals("snack", mealTypeName(MealType.MEAL_TYPE_SNACK))
    }

    @Test
    fun unknownIsNull() {
        assertNull(mealTypeName(MealType.MEAL_TYPE_UNKNOWN))
        assertNull(mealTypeName(99))
    }
}
