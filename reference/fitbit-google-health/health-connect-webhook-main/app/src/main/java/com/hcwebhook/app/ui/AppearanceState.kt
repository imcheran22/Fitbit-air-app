package com.hcwebhook.app.ui

import androidx.compose.runtime.mutableStateOf

/** Appearance settings that the theme reads, so a change applies at once. */
object AppearanceState {
    val dynamicColor = mutableStateOf(false)
}
