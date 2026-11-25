package com.example.directogranja.desktop.ui.overlay // TODO: ajusta al paquete real

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Estados del overlay. */
enum class EggOverlayState { LOADING, SUCCESS, ERROR }

private object EggColors {
    val Navy = Color(0xFF0F3D7A)
    val Blue = Color(0xFF1E5FBF)
    val Yolk = Color(0xFFF6C928)   // relleno amarillo del huevo al cargar
    val Green = Color(0xFF2E9B5B)
    val GreenText = Color(0xFF1F7A44)
    val GreenSoft = Color(0xFFE4F5EB)
    val Red = Color(0xFFD64545)
    val RedText = Color(0xFFB83A3A)
    val Line = Color(0xFFD5DBE3)
}

/**
 * Overlay de carga con tarjeta blanca y huevo animado.
 *  - scrim = true: oscurece y bloquea los clics de lo que hay detrás (gris neutro, no azul).
 *  - scrim = false: solo la tarjeta flotando.
 * Ponlo encima de la pantalla (ver EggOverlayHost en EggOverlayController.kt).
 */
@Composable
fun EggOverlay(
    state: EggOverlayState,
    modifier: Modifier = Modifier,
    scrim: Boolean = true,
    loadingText: String = "Cargando",
    successText: String = "Se han sumado mis huevitos también",
    errorText: String = "Se están atorando mis huevos",
    onRetry: () -> Unit = {},
    onCancel: () -> Unit = {},
) {
    Box(
        modifier
            .fillMaxSize()
            .then(if (scrim) Modifier.background(Color(0x66000000)) else Modifier)
            .pointerInput(Unit) { detectTapGestures { } }, // se come los clics del fondo
        contentAlignment = Alignment.Center
    ) {
        val shape = RoundedCornerShape(18.dp)
        Column(
            Modifier
                .width(300.dp)
                .shadow(24.dp, shape)
                .background(Color.White, shape)
                .border(1.dp, EggColors.Line, shape)
                .padding(horizontal = 24.dp, vertical = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when (state) {
                EggOverlayState.LOADING -> {
                    LoadingEgg()
                    Title(loadingText, EggColors.Navy)
                }
                EggOverlayState.SUCCESS -> {
                    SuccessEgg()
                    val a = remember { Animatable(0f) }
                    LaunchedEffect(Unit) { delay(1000); a.animateTo(1f, tween(500)) }
                    Title(successText, EggColors.GreenText, Modifier.alpha(a.value))
                }
                EggOverlayState.ERROR -> {
                    ErrorEgg()
                    Title(errorText, EggColors.RedText)
                    Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Egg3DButton("Reintentar", primary = true, onClick = onRetry)
                        Egg3DButton("Cancelar", primary = false, onClick = onCancel)
                    }
                }
            }
        }
    }
}

@Composable
private fun Title(text: String, color: Color, modifier: Modifier = Modifier) {
    BasicText(
        text,
        modifier.padding(top = 14.dp),
        style = TextStyle(color = color, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    )
}

// ---------- Formas (coordenadas del diseño: viewBox 120 x 150) ----------

private fun eggPath() = Path().apply {
    moveTo(60f, 6f)
    cubicTo(90f, 6f, 112f, 58f, 112f, 92f)
    cubicTo(112f, 124f, 90f, 144f, 60f, 144f)
    cubicTo(30f, 144f, 8f, 124f, 8f, 92f)
    cubicTo(8f, 58f, 30f, 6f, 60f, 6f)
    close()
}

private fun poly(vararg p: Float, closed: Boolean) = Path().apply {
    moveTo(p[0], p[1])
    for (i in 2 until p.size step 2) lineTo(p[i], p[i + 1])
    if (closed) close()
}

private val ZIG = floatArrayOf(0f, 74f, 18f, 82f, 34f, 70f, 50f, 82f, 66f, 70f, 84f, 82f, 100f, 70f, 120f, 78f)

private fun wavePath() = Path().apply {
    moveTo(-60f, 0f)
    var x = -60f
    for (i in 0 until 8) {
        quadraticBezierTo(x + 15f, if (i % 2 == 0) -9f else 9f, x + 30f, 0f)
        x += 30f
    }
    lineTo(x, 220f); lineTo(-60f, 220f); close()
}

private val EggSize = Modifier.size(132.dp, 165.dp) // 120 x 150 escalado a 1.1

// ---------- CARGANDO: el huevo se balancea, se llena de amarillo y se agrieta ----------

@Composable
private fun LoadingEgg() {
    val egg = remember { eggPath() }
    val wave = remember { wavePath() }
    val crack = remember { poly(44f, 50f, 55f, 66f, 45f, 80f, 60f, 96f, closed = false) }
    val inf = rememberInfiniteTransition(label = "egg")
    val tilt by inf.animateFloat(
        -4f, 4f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tilt"
    )
    val level by inf.animateFloat(
        0f, 1f, infiniteRepeatable(keyframes { durationMillis = 3200; 0f at 0; 1f at 2720; 1f at 3200 }), label = "level"
    )
    val waveX by inf.animateFloat(0f, 60f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "wave")
    val shadowX by inf.animateFloat(
        1f, .82f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "shadow"
    )

    Canvas(EggSize) {
        scale(size.width / 120f, size.width / 120f, pivot = Offset.Zero) {
            scale(shadowX, 1f, pivot = Offset(60f, 146f)) {
                drawOval(Color(0x26000000), Offset(26f, 141f), Size(68f, 10f))
            }
            rotate(tilt, pivot = Offset(60f, 140f)) {
                drawPath(egg, Color.White)
                clipPath(egg) {
                    val y = 150f - 124f * FastOutSlowInEasing.transform(level)
                    translate(-waveX, y) { drawPath(wave, EggColors.Yolk) }
                }
                drawPath(egg, EggColors.Navy, style = Stroke(4f))
                val p = ((level - 0.353f) / 0.647f).coerceIn(0f, 1f)
                if (p > 0f) {
                    val pm = PathMeasure().apply { setPath(crack, false) }
                    val seg = Path()
                    pm.getSegment(0f, pm.length * p, seg, true)
                    drawPath(seg, EggColors.Navy, style = Stroke(3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}

// ---------- ÉXITO: el huevo se abre y aparece la palomita verde ----------

@Composable
private fun SuccessEgg() {
    val egg = remember { eggPath() }
    val zig = remember { poly(*ZIG, closed = false) }
    val topCut = remember { poly(0f, 0f, 120f, 0f, 120f, 78f, 100f, 70f, 84f, 82f, 66f, 70f, 50f, 82f, 34f, 70f, 18f, 82f, 0f, 74f, closed = true) }
    val bottomCut = remember { poly(*ZIG, 120f, 150f, 0f, 150f, closed = true) }
    val tick = remember { poly(48f, 108f, 57f, 117f, 74f, 97f, closed = false) }
    val open = remember { Animatable(0f) }
    val check = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        launch { delay(200); open.animateTo(1f, tween(900, easing = CubicBezierEasing(.2f, 1.4f, .4f, 1f))) }
        launch { delay(600); check.animateTo(1f, tween(500, easing = CubicBezierEasing(.2f, 1.6f, .4f, 1f))) }
    }
    Canvas(EggSize) {
        scale(size.width / 120f, size.width / 120f, pivot = Offset.Zero) {
            drawOval(Color(0x26000000), Offset(26f, 141f), Size(68f, 10f))
            clipPath(bottomCut) {
                drawPath(egg, EggColors.GreenSoft)
                drawPath(egg, EggColors.Navy, style = Stroke(4f))
            }
            clipPath(egg) { drawPath(zig, EggColors.Navy, style = Stroke(3f, join = StrokeJoin.Round)) }
            val c = check.value
            scale(c, c, pivot = Offset(60f, 108f)) {
                drawCircle(EggColors.Green, 24f, Offset(60f, 108f))
                drawPath(tick, Color.White, style = Stroke(6f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            val o = open.value
            translate(-24f * o, -34f * o) {
                rotate(-34f * o, pivot = Offset(100f, 76f)) {
                    clipPath(topCut) {
                        drawPath(egg, Color.White)
                        drawPath(egg, EggColors.Navy, style = Stroke(4f))
                    }
                    clipPath(egg) { drawPath(zig, EggColors.Navy, style = Stroke(3f, join = StrokeJoin.Round)) }
                }
            }
        }
    }
}

// ---------- ERROR: el huevo tiembla, grieta roja y aviso ----------

@Composable
private fun ErrorEgg() {
    val egg = remember { eggPath() }
    val crackA = remember { poly(40f, 44f, 52f, 62f, 42f, 76f, 58f, 92f, 48f, 108f, 60f, 124f, closed = false) }
    val crackB = remember { poly(58f, 92f, 76f, 86f, closed = false) }
    val shake = remember { Animatable(0f) }
    val badge = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        launch { shake.animateTo(1f, tween(1400, easing = LinearEasing)) }
        launch { delay(500); badge.animateTo(1f, spring(dampingRatio = .55f, stiffness = 300f)) }
    }
    Canvas(EggSize) {
        scale(size.width / 120f, size.width / 120f, pivot = Offset.Zero) {
            drawOval(Color(0x26000000), Offset(26f, 141f), Size(68f, 10f))
            val damp = 1f - shake.value
            val wob = sin(shake.value * 2f * PI.toFloat() * 4f) * damp
            translate(wob * 5f, 0f) {
                rotate(wob * 3f, pivot = Offset(60f, 140f)) {
                    drawPath(egg, Color.White)
                    drawPath(egg, EggColors.Navy, style = Stroke(4f))
                    drawPath(crackA, EggColors.Red, style = Stroke(4f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    drawPath(crackB, EggColors.Red, style = Stroke(3f, cap = StrokeCap.Round))
                }
            }
            val b = badge.value
            val center = Offset(98f, 118f)
            scale(b, b, pivot = center) {
                drawCircle(EggColors.Red, 17f, center)
                drawCircle(Color.White, 17f, center, style = Stroke(3f))
                drawLine(Color.White, Offset(98f, 108f), Offset(98f, 120f), strokeWidth = 4f, cap = StrokeCap.Round)
                drawCircle(Color.White, 2.4f, Offset(98f, 127f))
            }
        }
    }
}

// ---------- Botón 3D (se hunde al presionar) ----------

@Composable
private fun Egg3DButton(text: String, primary: Boolean, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val shape = RoundedCornerShape(10.dp)
    val edge = if (primary) EggColors.Navy else Color(0xFF9AA6B5)
    val top = if (primary) Color(0xFF3A7BD5) else Color.White
    val bottom = if (primary) EggColors.Blue else Color(0xFFE3E8EF)
    val textColor = if (primary) Color.White else Color(0xFF1F2933)
    Box(
        Modifier
            .clip(shape)
            .background(edge)
            .padding(top = if (pressed) 2.dp else 0.dp, bottom = if (pressed) 1.dp else 3.dp)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(top, bottom)))
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(horizontal = 22.dp, vertical = 11.dp),
        contentAlignment = Alignment.Center
    ) {
        BasicText(text, style = TextStyle(color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold))
    }
}
