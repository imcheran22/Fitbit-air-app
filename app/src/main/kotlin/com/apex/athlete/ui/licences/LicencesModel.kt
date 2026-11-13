package com.apex.athlete.ui.licences

import androidx.annotation.RawRes
import androidx.annotation.StringRes
import com.apex.athlete.R

/** The licences actually used by the entries below. A licence with a bundled text has [rawText]. */
internal enum class LicenceKind(
    @StringRes val displayName: Int,
    @StringRes val textTitle: Int,
    @RawRes val rawText: Int?,
    @StringRes val inlineText: Int?,
) {
    APACHE_2(R.string.licences_name_apache, R.string.licences_text_apache_title, R.raw.licences_apache_2_0, null),
    SIL_OFL_1_1(R.string.licences_name_ofl, R.string.licences_text_ofl_title, R.raw.licences_ofl_1_1, null),
    SQLCIPHER_BSD(R.string.licences_name_bsd, R.string.licences_text_bsd_title, null, R.string.licences_text_bsd_body),
}

/** [notice] is an optional copyright line shown under the name (the OFL asks for it to be kept). */
internal class LicenceEntry(
    @StringRes val name: Int,
    val licence: LicenceKind,
    @StringRes val notice: Int? = null,
)

/** The libraries the app builds in (see gradle/libs.versions.toml and the module build files). */
internal val libraryEntries: List<LicenceEntry> = listOf(
    LicenceEntry(R.string.licences_lib_androidx_core, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_androidx_activity, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_androidx_lifecycle, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_androidx_navigation, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_compose, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_room, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_work, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_datastore, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_healthconnect, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_browser, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_glance, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_splashscreen, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_kotlin, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_coroutines, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_serialization, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_okhttp, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_anthropic, LicenceKind.APACHE_2),
    LicenceEntry(R.string.licences_lib_sqlcipher, LicenceKind.SQLCIPHER_BSD),
)

internal val fontEntries: List<LicenceEntry> = listOf(
    LicenceEntry(R.string.licences_font_barlow, LicenceKind.SIL_OFL_1_1, R.string.licences_copyright_barlow),
    LicenceEntry(R.string.licences_font_figtree, LicenceKind.SIL_OFL_1_1, R.string.licences_copyright_figtree),
)

/** Licences to show a text for: only those some entry uses, once each, in first-use order. */
internal fun usedLicences(entries: List<LicenceEntry> = libraryEntries + fontEntries): List<LicenceKind> =
    entries.map { it.licence }.distinct()
