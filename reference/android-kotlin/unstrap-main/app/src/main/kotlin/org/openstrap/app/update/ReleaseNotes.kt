package org.openstrap.app.update

/** A run of release-note text, bold or not. */
data class NoteSpan(val text: String, val bold: Boolean = false)

/** One block of release notes: a heading, a bullet or a paragraph. */
sealed interface NoteBlock {
    val spans: List<NoteSpan>
    data class Heading(override val spans: List<NoteSpan>) : NoteBlock
    data class Bullet(override val spans: List<NoteSpan>) : NoteBlock
    data class Paragraph(override val spans: List<NoteSpan>) : NoteBlock
}

/**
 * Reads the Markdown of a release's notes: the hand-written ones in docs/releases, or GitHub's generated list of
 * merged pull requests. Only what those use is kept: headings, bullets, paragraphs and bold. Links become their text,
 * code its letters, and the generated list's "by @someone in <url>" and Full Changelog line are left out.
 */
object ReleaseNotes {
    private val heading = Regex("^#{1,6}\\s+(.*?)\\s*#*$")
    private val bullet = Regex("^[-*+]\\s+(.*)$")
    private val link = Regex("\\[([^\\]]*)]\\([^)]*\\)")
    private val generatedCredit = Regex("\\s+by @[\\w-]+(?:\\[bot])? in https?://\\S+$")
    private val comment = Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL)

    fun parse(markdown: String): List<NoteBlock> {
        val blocks = mutableListOf<NoteBlock>()
        // The lines of the block being read, and which kind it is.
        var lines = mutableListOf<String>()
        var isBullet = false
        fun flush() {
            if (lines.isNotEmpty()) {
                val text = lines.joinToString(" ")
                blocks += if (isBullet) NoteBlock.Bullet(spans(text.replace(generatedCredit, ""))) else NoteBlock.Paragraph(spans(text))
            }
            lines = mutableListOf()
        }
        for (raw in markdown.replace(comment, "").replace("\r\n", "\n").lines()) {
            val line = raw.trim()
            when {
                line.isEmpty() -> flush()
                line.startsWith("**Full Changelog**") || line.startsWith("Full Changelog:") -> flush()
                heading.matches(line) -> {
                    flush()
                    blocks += NoteBlock.Heading(spans(heading.find(line)!!.groupValues[1]))
                }
                bullet.matches(line) -> {
                    flush()
                    isBullet = true
                    lines += bullet.find(line)!!.groupValues[1]
                }
                // A line under a bullet carries it on; any other line starts or carries on a paragraph.
                else -> {
                    if (lines.isEmpty()) isBullet = false
                    lines += line
                }
            }
        }
        flush()
        return blocks.filter { b -> b.spans.any { it.text.isNotBlank() } }
    }

    /** [text] split at its `**` marks into plain and bold runs, links and code made plain. */
    fun spans(text: String): List<NoteSpan> {
        val plain = text.replace(link, "$1").replace("`", "")
        val out = mutableListOf<NoteSpan>()
        var bold = false
        for (part in plain.split("**")) {
            if (part.isNotEmpty()) out += NoteSpan(part, bold)
            bold = !bold
        }
        return out
    }

    /** All of a block's words, without the bold. */
    fun text(block: NoteBlock): String = block.spans.joinToString("") { it.text }.trim()

    /**
     * What a notification says about a release: its first paragraph, or else its first bullet, in plain words. Null
     * when the notes have neither.
     */
    fun lead(markdown: String): String? {
        val blocks = parse(markdown)
        val first = blocks.firstOrNull { it is NoteBlock.Paragraph } ?: blocks.firstOrNull { it is NoteBlock.Bullet }
        return first?.let(::text)?.takeIf { it.isNotEmpty() }
    }
}
