package com.apex.athlete.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.apex.athlete.di.AppContainer

/** The application container, provided once at the root by MainActivity. */
val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("LocalAppContainer is provided by MainActivity")
}

/**
 * Creates (or finds) a ViewModel scoped to the current navigation entry, handing it the container
 * and a [SavedStateHandle] so view state survives process death.
 *
 *     val vm = apexViewModel { container, handle -> RecoveryViewModel(container.repository, handle) }
 *
 * [create] runs only when no instance exists for the entry. Pass [key] when one entry needs more
 * than one instance of the same class.
 */
@Composable
inline fun <reified VM : ViewModel> apexViewModel(
    key: String? = null,
    crossinline create: (AppContainer, SavedStateHandle) -> VM,
): VM {
    val container = LocalAppContainer.current
    return viewModel<VM>(
        key = key,
        factory = viewModelFactory {
            initializer<VM> { create(container, createSavedStateHandle()) }
        },
    )
}
