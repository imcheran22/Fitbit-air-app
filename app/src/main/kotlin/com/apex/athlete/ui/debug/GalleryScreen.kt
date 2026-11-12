package com.apex.athlete.ui.debug

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ComponentGallery
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.navigation.ApexNavigator

/** Hosts the component gallery. Only registered in debug builds (see ApexNavHost). */
@Composable
fun GalleryScreen(navigator: ApexNavigator) {
    Column(Modifier.fillMaxSize()) {
        DetailHeader(stringResource(R.string.gallery_title), { navigator.back() }, stringResource(R.string.common_back))
        ComponentGallery(Modifier.weight(1f))
    }
}
