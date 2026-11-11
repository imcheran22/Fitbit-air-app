package app.fitdash.ui.share

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.ReadinessResult
import app.fitdash.metrics.TodayData
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.Orb
import app.fitdash.ui.formatDate
import app.fitdash.ui.formatDuration
import app.fitdash.ui.formatSteps
import app.fitdash.ui.clock
import app.fitdash.ui.pages.TrioStat
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.ThemedBackground
import app.fitdash.ui.theme.Type
import java.io.File
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException

private const val WIDTH = 1080
private const val HEIGHT = 1350
private const val SCALE = 3f

fun clearShareCache(context: Context) {
    File(context.cacheDir, "share").listFiles()?.forEach { it.delete() }
}

@Composable
fun ShareRender(data: TodayData, onDone: () -> Unit) {
    val context = LocalContext.current
    val layer = rememberGraphicsLayer()
    val density = LocalDensity.current

    LaunchedEffect(Unit) {
        try {
            withFrameNanos { }
            withFrameNanos { }
            val bitmap = layer.toImageBitmap().asAndroidBitmap()
            val uri = shareFile(context, "fitdash-${data.date}.png") { f ->
                f.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            val send = Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(Intent.createChooser(send, "Share your day"))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Toast.makeText(context, "Couldn't create the image", Toast.LENGTH_SHORT).show()
        } finally {
            onDone()
        }
    }

    Box(
        Modifier
            .requiredSize(with(density) { WIDTH.toDp() }, with(density) { HEIGHT.toDp() })
            .drawWithContent {
                layer.record(IntSize(WIDTH, HEIGHT)) { this@drawWithContent.drawContent() }
            },
    ) {
        CompositionLocalProvider(LocalDensity provides Density(SCALE, 1f)) {
            ShareCard(data)
        }
    }
}

@Composable
fun ShareCard(data: TodayData) {
    val zone = ZoneId.systemDefault()
    val score = (data.readiness as? ReadinessResult.Ready)?.score
    Box(Modifier.requiredSize((WIDTH / SCALE).dp, (HEIGHT / SCALE).dp)) {
        ThemedBackground()
        Column(
            Modifier.fillMaxSize().padding(horizontal = Space.xl, vertical = Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(formatDate(data.date).uppercase(), style = Type.label, color = Palette.Muted)
            Orb(score, diameter = 168.dp, frozen = true) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(score?.toString() ?: "—", style = Type.hero)
                    Text("RECOVERY", style = Type.label)
                }
            }
            Row(Modifier.fillMaxWidth()) {
                TrioStat("Sleep", data.sleep?.score, data.previous.sleep, Modifier.weight(1f))
                TrioStat("Recovery", score, data.previous.readiness, Modifier.weight(1f))
                TrioStat("Movement", data.movementScore, data.previous.movement, Modifier.weight(1f))
            }
            if (data.sleep != null || data.activity != null) RowGroup {
                data.sleep?.let {
                    ListRow(NavIcons.bed, "Sleep", "${formatDuration(it.asleep)} · ${clock(it.start, zone)} – ${clock(it.end, zone)}")
                }
                data.activity?.let {
                    ListRow(NavIcons.walk, "Steps", "${formatSteps(it.steps)} of ${formatSteps(data.goals.steps.toLong())} · ${it.goalPercent}%", divider = data.sleep != null)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("fitdash".uppercase(), style = Type.label, color = Palette.Text, textAlign = TextAlign.Center)
                Text("fitdash · health connect dashboard".uppercase(), style = Type.tiny, color = Palette.Muted, textAlign = TextAlign.Center)
            }
        }
    }
}
