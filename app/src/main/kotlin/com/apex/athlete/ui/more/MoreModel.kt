package com.apex.athlete.ui.more

/**
 * Whether the Takeout import row is usable. Demo data must never mix with real data, so while Demo mode is
 * on the row is replaced by an explanation. [demoMode] null means settings have not loaded yet: treat as
 * unavailable rather than offering an import that might be wrong.
 */
fun takeoutImportAllowed(demoMode: Boolean?): Boolean = demoMode == false

/** The debug-only gallery row. */
fun showGalleryRow(isDebugBuild: Boolean): Boolean = isDebugBuild
