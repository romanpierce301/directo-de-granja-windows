package com.example.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.foundation.Canvas as ComposeCanvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.example.ui.theme.OutlineVariant
import com.example.ui.theme.ThermalInkDark
import com.example.ui.theme.ThermalInkMuted

class SignaturePadController {
    val strokes = mutableStateListOf<List<Offset>>()
    private val currentStroke = mutableStateListOf<Offset>()
    var drawTick by mutableIntStateOf(0)
        private set
    var canvasSize by mutableStateOf(IntSize(600, 260))

    val hasSignature: Boolean
        get() = strokes.isNotEmpty() || currentStroke.isNotEmpty()

    fun beginStroke(pos: Offset) {
        currentStroke.clear()
        currentStroke.add(pos)
        drawTick++
    }

    fun addPoint(pos: Offset) {
        currentStroke.add(pos)
        drawTick++
    }

    fun endStroke() {
        if (currentStroke.isNotEmpty()) {
            strokes.add(currentStroke.toList())
            currentStroke.clear()
            drawTick++
        }
    }

    fun currentActivePoints(): List<Offset> = currentStroke

    fun clear() {
        strokes.clear()
        currentStroke.clear()
        drawTick++
    }

    fun renderToBitmap(): Bitmap? {
        if (!hasSignature) return null
        val srcW = canvasSize.width.coerceAtLeast(320)
        val srcH = canvasSize.height.coerceAtLeast(160)
        val outW = 640
        val outH = ((srcH.toFloat() / srcW.toFloat()) * outW).toInt().coerceIn(220, 420)
        val scaleX = outW.toFloat() / srcW.toFloat()
        val scaleY = outH.toFloat() / srcH.toFloat()

        val bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.WHITE)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 6f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }

        val allStrokes = strokes.toList() + if (currentStroke.isNotEmpty()) listOf(currentStroke.toList()) else emptyList()
        for (pts in allStrokes) {
            if (pts.size == 1) {
                canvas.drawPoint(pts[0].x * scaleX, pts[0].y * scaleY, paint)
            } else if (pts.size > 1) {
                val path = Path()
                path.moveTo(pts[0].x * scaleX, pts[0].y * scaleY)
                for (i in 1 until pts.size) {
                    path.lineTo(pts[i].x * scaleX, pts[i].y * scaleY)
                }
                canvas.drawPath(path, paint)
            }
        }
        return bitmap
    }
}

@Composable
fun SignaturePadCanvas(
    controller: SignaturePadController,
    modifier: Modifier = Modifier,
) {
    val tick = controller.drawTick
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(220.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .border(1.5.dp, OutlineVariant, RoundedCornerShape(16.dp))
            .onSizeChanged { controller.canvasSize = it }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset -> controller.beginStroke(offset) },
                    onDragEnd = { controller.endStroke() },
                    onDragCancel = { controller.endStroke() },
                    onDrag = { change, _ ->
                        change.consume()
                        val clamped = Offset(
                            x = change.position.x.coerceIn(0f, size.width.toFloat()),
                            y = change.position.y.coerceIn(0f, size.height.toFloat()),
                        )
                        controller.addPoint(clamped)
                    },
                )
            }
            .testTag("signature_canvas"),
    ) {
        ComposeCanvas(modifier = Modifier.fillMaxSize()) {
            // Re-read tick to trigger redraw cleanly while dragging
            @Suppress("UNUSED_VARIABLE")
            val trigger = tick
            val baseLineY = size.height * 0.78f
            drawLine(
                color = Color(0xFFD6D3D1),
                start = Offset(24.dp.toPx(), baseLineY),
                end = Offset(size.width - 24.dp.toPx(), baseLineY),
                strokeWidth = 1.5.dp.toPx(),
            )
            val allStrokes = controller.strokes + listOf(controller.currentActivePoints())
            allStrokes.forEach { pts ->
                if (pts.size >= 2) {
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(pts.first().x, pts.first().y)
                        for (i in 1 until pts.size) {
                            lineTo(pts[i].x, pts[i].y)
                        }
                    }
                    drawPath(
                        path = path,
                        color = ThermalInkDark,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 3.5.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        ),
                    )
                }
            }
        }

        if (!controller.hasSignature) {
            Text(
                text = "TRAZA TU FIRMA AQUÍ CON EL DEDO",
                style = MaterialTheme.typography.labelMedium,
                color = ThermalInkMuted.copy(alpha = 0.75f),
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(16.dp),
            )
        }
    }
}
