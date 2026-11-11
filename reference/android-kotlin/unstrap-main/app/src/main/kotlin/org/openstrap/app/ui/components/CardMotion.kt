package org.openstrap.app.ui.components

/**
 * What a change of a tab's stack shows (spec 3.5). [Grow] is a card opening its detail, the card's surface growing
 * into it; [Shrink] is back from that detail into the same card. Anything else between two screens crossfades:
 * [Crossfade] going deeper or sideways (Related rows, the detail switcher), [CrossfadeBack] coming back. [Idle] while
 * nothing changes, [Jump] when the system's animations are off.
 */
enum class StackMotion { Idle, Grow, Shrink, Crossfade, CrossfadeBack, Jump }

/**
 * The card last pressed on one page of a tab. [source] names the card on its page (a saved random id),
 * [depth] the page (0 the tab's root, 1 a page opened over it, and so on), [number] the one number the card shows,
 * if it shows exactly one. [clicked] once its click ran, [bound] the saved key of the detail that click opened.
 */
data class CardTap(
    val source: Long,
    val depth: Int,
    val number: String?,
    val clicked: Boolean = false,
    val bound: String? = null,
)

/** The pure part of the card to detail motion: which motion a change shows and who takes part in it. */
object CardMotion {
    /** Spring stiffness opening a detail and going back (spec 3.5); every spring here has no bounce. */
    const val STIFFNESS_IN = 500f
    const val STIFFNESS_OUT = 300f

    /** Details in the metric template, whose hero is the surface a card grows into; the rest grow into the page. */
    private val HERO_KINDS = setOf("m", "n", "c", "k")

    /** Whether the detail saved as [key] has a hero for the card to grow into, rather than the whole page. */
    fun surfaceInHero(key: String): Boolean = key.substringBefore(':') in HERO_KINDS

    /** The shared key of the pressed card's surface on page [depth], and of its number. */
    fun surfaceKey(depth: Int) = "card-surface@$depth"
    fun numberKey(depth: Int) = "card-number@$depth"

    /**
     * The motion from stack [from] to stack [to] (saved keys, deepest last), given the cards pressed on each page
     * ([taps], by page depth). [animate] is false when the system's animator scale is 0.
     */
    fun of(from: List<String>, to: List<String>, taps: Map<Int, CardTap>, animate: Boolean): StackMotion = when {
        !animate -> StackMotion.Jump
        from == to -> StackMotion.Idle
        grows(from, to, taps[from.size]) -> StackMotion.Grow
        shrinks(from, to, taps[to.size]) -> StackMotion.Shrink
        to.size >= from.size -> StackMotion.Crossfade
        else -> StackMotion.CrossfadeBack
    }

    /** One page deeper, everything under it unchanged, and the new top is what the card on that page opened. */
    private fun grows(from: List<String>, to: List<String>, tap: CardTap?): Boolean =
        tap != null && to.size == from.size + 1 && to.take(from.size) == from && opened(tap, to.last(), StackMotion.Grow)

    /** One page back to the page whose card opened the detail being closed. */
    private fun shrinks(from: List<String>, to: List<String>, tap: CardTap?): Boolean =
        tap != null && from.size == to.size + 1 && from.take(to.size) == to && opened(tap, from.last(), StackMotion.Shrink)

    /**
     * Whether [tap] opened the detail saved as [key]: bound to it, or, in the frame the detail is pushed (before the
     * binding lands), clicked and not yet bound to anything.
     */
    private fun opened(tap: CardTap, key: String, motion: StackMotion): Boolean =
        tap.bound == key || (motion == StackMotion.Grow && tap.bound == null && tap.clicked)

    /** Whether the card [source] on page [depth] takes part: it's the one pressed, and nothing else is crossfading. */
    fun cardTakesPart(tap: CardTap?, source: Long, depth: Int, motion: StackMotion): Boolean =
        tap != null && tap.source == source && tap.depth == depth && motion.sharing()

    /**
     * Whether the detail on top of stack [page] takes part: the card pressed on the page under it opened it, and
     * the motion is that card growing or shrinking (or nothing is moving, ready for back).
     */
    fun detailTakesPart(taps: Map<Int, CardTap>, page: List<String>, motion: StackMotion): Boolean {
        val key = page.lastOrNull() ?: return false
        val tap = taps[page.size - 1] ?: return false
        return motion.sharing() && opened(tap, key, motion)
    }

    /** The number moves with the surface only if the card's number and the detail's headline are the same text. */
    fun sharesNumber(tap: CardTap?, value: String?): Boolean = tap?.number != null && tap.number == value

    private fun StackMotion.sharing() = this == StackMotion.Idle || this == StackMotion.Grow || this == StackMotion.Shrink

    /** A card on page [depth] pressed: it replaces that page's tap, and the pages above it are gone. */
    fun press(taps: Map<Int, CardTap>, tap: CardTap): Map<Int, CardTap> = taps.filterKeys { it < tap.depth } + (tap.depth to tap)

    /** The pressed card's click ran. */
    fun click(taps: Map<Int, CardTap>, depth: Int, source: Long): Map<Int, CardTap> {
        val tap = taps[depth]?.takeIf { it.source == source } ?: return taps
        return taps + (depth to tap.copy(clicked = true, bound = null))
    }

    /** A click a couple of frames old that opened nothing (an info sheet, a page): it no longer opens what comes next. */
    fun expire(taps: Map<Int, CardTap>, depth: Int, source: Long): Map<Int, CardTap> {
        val tap = taps[depth]?.takeIf { it.source == source && it.clicked && it.bound == null } ?: return taps
        return taps + (depth to tap.copy(clicked = false))
    }

    /**
     * After a frame with stack [keys]: a clicked tap whose page now has a detail on top is bound to it. Once the
     * stack is [settled], taps that can no longer take part are dropped: their page gone or covered by something
     * they didn't open, so a later detail never grows out of a card pressed long ago.
     */
    fun settle(taps: Map<Int, CardTap>, keys: List<String>, settled: Boolean): Map<Int, CardTap> {
        val bound = taps.mapValues { (d, t) ->
            if (t.clicked && t.bound == null && keys.size == d + 1) t.copy(bound = keys[d]) else t
        }
        if (!settled) return bound
        return bound.filter { (d, t) ->
            (keys.size == d && t.bound == null) || (keys.size > d && t.bound == keys[d])
        }
    }

    /** Saves the taps across process death, one per line, fields tab-separated (numbers can hold commas). */
    fun save(taps: Map<Int, CardTap>): String = taps.values.joinToString("\n") { t ->
        listOf(t.source, t.depth, t.number.orEmpty(), t.clicked, t.bound.orEmpty()).joinToString("\t")
    }

    fun restore(s: String): Map<Int, CardTap> = s.lineSequence().mapNotNull { line ->
        val f = line.split('\t')
        if (f.size != 5) return@mapNotNull null
        val source = f[0].toLongOrNull() ?: return@mapNotNull null
        val depth = f[1].toIntOrNull() ?: return@mapNotNull null
        CardTap(source, depth, f[2].ifEmpty { null }, f[3] == "true", f[4].ifEmpty { null })
    }.associateBy { it.depth }

    /** The spring stiffness for [motion]: opening and going deeper at 500, coming back at 300. */
    fun stiffness(motion: StackMotion): Float = when (motion) {
        StackMotion.Shrink, StackMotion.CrossfadeBack -> STIFFNESS_OUT
        else -> STIFFNESS_IN
    }
}
