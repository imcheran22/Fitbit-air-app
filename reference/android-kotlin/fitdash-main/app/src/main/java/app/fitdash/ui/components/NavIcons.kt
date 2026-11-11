package app.fitdash.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import app.fitdash.metrics.WorkoutIcon
import androidx.compose.ui.unit.dp

private fun lineIcon(name: String, vararg strokes: String, fills: List<String> = emptyList()): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        strokes.forEach {
            addPath(
                pathData = addPathNodes(it),
                stroke = SolidColor(Color.White),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        fills.forEach { addPath(pathData = addPathNodes(it), fill = SolidColor(Color.White)) }
    }.build()

object NavIcons {
    val today = lineIcon(
        "today",
        "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0 -14z",
        fills = listOf("M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0 -5z"),
    )
    val sleep = lineIcon("sleep", "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")
    val activity = lineIcon("activity", "M3 12h4l3-7 4 14 3-7h4")
    val trends = lineIcon("trends", "M4 19V5M4 19h16M8 15l4-4 3 3 5-6")
    val log = lineIcon("log", "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0 -16z", "M12 8.5v7M8.5 12h7")
    val bed = lineIcon("bed", "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01")
    val walk = lineIcon("walk", "M13 3a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0 -3z", "m9 21 3-7 3 3v4M7 11l3-3 4 1 3 3")
    val bolt = lineIcon("bolt", "M13 3 5 13h6l-1 8 8-10h-6z")
    val cup = lineIcon("cup", "M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M9 3v2M13 3v2")
    val moonSmall = lineIcon("moonSmall", "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")
    val calendar = lineIcon("calendar", "M6 5.5h12a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7A1.5 1.5 0 0 1 6 5.5z", "M4.5 10h15M8.5 3.5v4M15.5 3.5v4")
    val clock = lineIcon("clock", "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0 -16z", "M12 8v4l3 2")
    val heart = lineIcon("heart", "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z")
    val share = lineIcon("share", "M12 15V4M8 8l4-4 4 4M5 13v6h14v-6")
    val sparkle = lineIcon("sparkle", "M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z")
    val back = lineIcon("back", "m14 6-6 6 6 6")
    val menu = lineIcon("menu", "M5 8h14M5 12h14M5 16h14")
    val drop = lineIcon("drop", "M12 3.5C9 7.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-2.5-6.5-5.5-10.5z")
    val info = lineIcon("info", "M12 11v6M12 7.5v.01")
    val chevronLeft = lineIcon("chevronLeft", "m14.5 6-6 6 6 6")
    val chevronRight = lineIcon("chevronRight", "m9.5 6 6 6-6 6")
    val chevronDown = lineIcon("chevronDown", "m6 9.5 6 6 6-6")
    val check = lineIcon("check", "m5 12.5 4.5 4.5L19 7.5")
    val sun = lineIcon(
        "sun",
        "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0 -8z",
        "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
    )
    val run = lineIcon("run", "M14 3.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0 -3z", "M6 21l4-6 3 2 1-5-3-3-4 3M11 9l3-1 2 3 3 1M14 15l3 6")
    val bike = lineIcon("bike", "M5.5 17.5a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM18.5 17.5a3 3 0 1 0 0-6a3 3 0 1 0 0 6z", "M5.5 14.5 9 8h5l4.5 6.5M12 14.5 9 8M14 8l-1-3h2.5")
    val swim = lineIcon("swim", "M3 17c2 0 2 1.5 4.5 1.5S10 17 12 17s2 1.5 4.5 1.5S19 17 21 17", "M3 12.5c2 0 2 1.5 4.5 1.5S10 12.5 12 12.5", "M16 7.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0 -3z", "M6 12 10 6l5 3")
    val strength = lineIcon("strength", "M4 10v4M20 10v4M6.5 8v8M17.5 8v8M9 12h6M6.5 12h-2.5M17.5 12h2.5")
    val yoga = lineIcon("yoga", "M12 3.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0 -3z", "M12 8v6M5 20c3-1 5-2 7-5 2 3 4 4 7 5M4 12l8 2 8-2")
    val wine = lineIcon("wine", "M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8.5 21h7")
    val meal = lineIcon("meal", "M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M17 21V3c-2 1.5-3 4-3 7h3")
    val thermometer = lineIcon("thermometer", "M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 9v8")
    val plane = lineIcon("plane", "M21 15.5 13 11V5a1 1 0 0 0-2 0v6l-8 4.5v1.5l8-2v4l-2 1.5V22l3-1 3 1v-1.5L13 19v-4l8 2z")
    val phone = lineIcon("phone", "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2")
    val stress = lineIcon("stress", "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0 -16z", "M8.5 15.5c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8M9 9.5v.01M15 9.5v.01")
    val flame = lineIcon("flame", "M12 3c1 3 4 5 4 9.5a4 4 0 0 1-8 0c0-1.5.5-2.5 1.2-3.5.3 1 .8 1.8 1.8 2.2C11 8 10.5 5.5 12 3z")
}

fun workoutIconVector(icon: WorkoutIcon): ImageVector = when (icon) {
    WorkoutIcon.RUN -> NavIcons.run
    WorkoutIcon.WALK -> NavIcons.walk
    WorkoutIcon.BIKE -> NavIcons.bike
    WorkoutIcon.SWIM -> NavIcons.swim
    WorkoutIcon.STRENGTH -> NavIcons.strength
    WorkoutIcon.YOGA -> NavIcons.yoga
    WorkoutIcon.GENERIC -> NavIcons.flame
}
