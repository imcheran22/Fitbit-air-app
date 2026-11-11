package org.openstrap.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReleaseNotesTest {
    private val handWritten = """
        **Your day at a glance, without opening the app.** OpenStrap 2.1 brings home screen widgets.

        ## Home screen widgets

        - **Five widgets, three sizes each.** Every widget comes in Small,
          Wide and Large.
        - **Recovery** with your score, see [the docs](https://example.com).

        ## Fixes

        - The app no longer closes on launch.
    """.trimIndent()

    private val generated = "## What's Changed\n* Pairing: step-by-step flow, one-tap pair by @sayed0am in https://github.com/sayed0am/openstrap/pull/2\n\n\n" +
        "**Full Changelog**: https://github.com/sayed0am/openstrap/compare/v1.3.0...v1.4.0"

    @Test fun `hand-written notes read as headings, bullets and paragraphs with bold`() {
        val blocks = ReleaseNotes.parse(handWritten)
        assertEquals(
            listOf(
                NoteBlock.Paragraph(listOf(NoteSpan("Your day at a glance, without opening the app.", bold = true), NoteSpan(" OpenStrap 2.1 brings home screen widgets."))),
                NoteBlock.Heading(listOf(NoteSpan("Home screen widgets"))),
                NoteBlock.Bullet(listOf(NoteSpan("Five widgets, three sizes each.", bold = true), NoteSpan(" Every widget comes in Small, Wide and Large."))),
                NoteBlock.Bullet(listOf(NoteSpan("Recovery", bold = true), NoteSpan(" with your score, see the docs."))),
                NoteBlock.Heading(listOf(NoteSpan("Fixes"))),
                NoteBlock.Bullet(listOf(NoteSpan("The app no longer closes on launch."))),
            ),
            blocks,
        )
    }

    @Test fun `GitHub's generated notes drop the credit and the Full Changelog line`() {
        assertEquals(
            listOf(
                NoteBlock.Heading(listOf(NoteSpan("What's Changed"))),
                NoteBlock.Bullet(listOf(NoteSpan("Pairing: step-by-step flow, one-tap pair"))),
            ),
            ReleaseNotes.parse(generated),
        )
    }

    @Test fun `the notification leads with the first paragraph, else the first bullet`() {
        assertEquals("Your day at a glance, without opening the app. OpenStrap 2.1 brings home screen widgets.", ReleaseNotes.lead(handWritten))
        assertEquals("Pairing: step-by-step flow, one-tap pair", ReleaseNotes.lead(generated))
        assertNull(ReleaseNotes.lead(""))
        assertNull(ReleaseNotes.lead("## Only a heading"))
    }
}
