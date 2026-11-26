package com.example.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.viewmodel.OverlayState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val OverlayCardBg = Color(0xFF0A141E)
private val OverlayCardBorder = Color(0xFF1B2B3C)
private val EggOutlineBlue = Color(0xFF5B9BEA)
private val EggCrackNavy = Color(0xFF0F3D7A)
private val EggYolkYellow = Color(0xFFF6C928)
private val ErrorCrackRed = Color(0xFFD64545)
private val SuccessCheckGreen = Color(0xFF2E9B5B)
private val SuccessEggBottomMint = Color(0xFFE4F5EB)
private val LoadingTitleBlue = Color(0xFFCFE0FA)
private val ErrorTitleCoral = Color(0xFFFF7A7A)
private val SuccessTitleMint = Color(0xFF5FD08A)
private val OverlaySubtitleColor = Color(0xFF8CA5C4)

@Composable
fun OverlayHost(
    state: OverlayState,
    modifier: Modifier = Modifier,
) {
    if (state is OverlayState.None) return

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xCC050F19))
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        event.changes.forEach { it.consume() }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        when (state) {
            is OverlayState.Loading -> LoadingOverlayTemplate(state.title, state.message)
            is OverlayState.Success -> SuccessOverlayTemplate(state.title, state.message)
            is OverlayState.Error -> ErrorOverlayTemplate(state.title, state.message)
            OverlayState.None -> Unit
        }
    }
}

@Composable
private fun OverlayCardShell(
    testTag: String,
    content: @Composable () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = OverlayCardBg,
        border = BorderStroke(1.dp, OverlayCardBorder),
        modifier = Modifier
            .padding(horizontal = 24.dp)
            .fillMaxWidth()
            .widthIn(max = 300.dp)
            .shadow(
                elevation = 24.dp,
                shape = RoundedCornerShape(18.dp),
                ambientColor = Color.Black.copy(alpha = 0.6f),
                spotColor = Color.Black.copy(alpha = 0.7f),
            )
            .testTag(testTag),
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // Sutil brillo superior equivalente a inset 0 1px 0 rgba(255,255,255,.06)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color.White.copy(alpha = 0.06f))
                    .align(Alignment.TopCenter),
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 24.dp, top = 28.dp, end = 24.dp, bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                content()
            }
        }
    }
}

private fun buildEggPath(): Path = Path().apply {
    moveTo(60f, 6f)
    cubicTo(90f, 6f, 112f, 58f, 112f, 92f)
    cubicTo(112f, 124f, 90f, 144f, 60f, 144f)
    cubicTo(30f, 144f, 8f, 124f, 8f, 92f)
    cubicTo(8f, 58f, 30f, 6f, 60f, 6f)
    close()
}

@Composable
fun LoadingOverlayTemplate(title: String, message: String) {
    val transition = rememberInfiniteTransition(label = "loading_egg")

    val wobbleDeg by transition.animateFloat(
        initialValue = -4f,
        targetValue = -4f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 1800
                -4f at 0 using EaseInOut
                4f at 900 using EaseInOut
                -4f at 1800
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "wobble",
    )

    val shadowScaleX by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 1800
                1f at 0 using EaseInOut
                0.82f at 900 using EaseInOut
                1f at 1800
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "shadow_scale",
    )

    val riseY by transition.animateFloat(
        initialValue = 150f,
        targetValue = 26f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 3200
                150f at 0 using EaseInOut
                26f at 2720
                26f at 3200
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "rise_y",
    )

    val waveShiftX by transition.animateFloat(
        initialValue = 0f,
        targetValue = -60f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave_shift",
    )

    val crackProgress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 3200
                0f at 0
                0f at 960 using EaseInOut
                1f at 2720
                1f at 3200
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "crack_progress",
    )

    val eggPath = remember { buildEggPath() }
    val wavePath = remember {
        Path().apply {
            moveTo(-60f, 0f)
            quadraticTo(-45f, -9f, -30f, 0f)
            quadraticTo(-15f, 9f, 0f, 0f)
            quadraticTo(15f, -9f, 30f, 0f)
            quadraticTo(45f, 9f, 60f, 0f)
            quadraticTo(75f, -9f, 90f, 0f)
            quadraticTo(105f, 9f, 120f, 0f)
            quadraticTo(135f, -9f, 150f, 0f)
            quadraticTo(165f, 9f, 180f, 0f)
            quadraticTo(195f, -9f, 210f, 0f)
            lineTo(210f, 220f)
            lineTo(-60f, 220f)
            close()
        }
    }
    val crackFullPath = remember {
        Path().apply {
            moveTo(44f, 50f)
            lineTo(55f, 66f)
            lineTo(45f, 80f)
            lineTo(60f, 96f)
        }
    }
    val crackMeasure = remember(crackFullPath) {
        PathMeasure().apply { setPath(crackFullPath, false) }
    }
    val crackSegmentPath = remember { Path() }

    OverlayCardShell(testTag = "overlay_loading") {
        Canvas(
            modifier = Modifier
                .size(width = 132.dp, height = 170.dp)
                .semantics { contentDescription = "Huevo cargando" },
        ) {
            val sx = size.width / 120f
            val sy = size.height / 150f

            scale(scaleX = sx, scaleY = sy, pivot = Offset.Zero) {
                // Sombra inferior animada
                scale(scaleX = shadowScaleX, scaleY = 1f, pivot = Offset(60f, 146f)) {
                    drawOval(
                        color = Color.White.copy(alpha = 0.07f),
                        topLeft = Offset(26f, 141f),
                        size = Size(68f, 10f),
                    )
                }

                // Huevo con balanceo
                rotate(degrees = wobbleDeg, pivot = Offset(60f, 140f)) {
                    drawPath(path = eggPath, color = Color.White)

                    clipPath(eggPath) {
                        translate(left = waveShiftX, top = riseY) {
                            drawPath(path = wavePath, color = EggYolkYellow)
                        }
                    }

                    drawPath(
                        path = eggPath,
                        color = EggOutlineBlue,
                        style = Stroke(width = 4f),
                    )

                    if (crackProgress > 0.01f) {
                        crackSegmentPath.reset()
                        crackMeasure.getSegment(
                            startDistance = 0f,
                            stopDistance = crackMeasure.length * crackProgress,
                            destination = crackSegmentPath,
                            startWithMoveTo = true,
                        )
                        drawPath(
                            path = crackSegmentPath,
                            color = EggCrackNavy,
                            style = Stroke(
                                width = 3f,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Text(
            text = "aguanta tarnal",
            fontSize = 19.sp,
            fontWeight = FontWeight.Bold,
            color = LoadingTitleBlue,
            textAlign = TextAlign.Center,
        )
        val subtitle = message.ifBlank { title }
        if (subtitle.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle,
                fontSize = 12.5.sp,
                lineHeight = 16.sp,
                color = OverlaySubtitleColor,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun ErrorOverlayTemplate(title: String, message: String) {
    val shakeCycle = remember { Animatable(0f) }
    val badgeScale = remember { Animatable(0f) }

    LaunchedEffect(title, message) {
        shakeCycle.snapTo(0f)
        badgeScale.snapTo(0f)
        launch {
            // Dos sacudidas de 700ms cada una (shk .7s ease-in-out 2)
            repeat(2) {
                shakeCycle.snapTo(0f)
                shakeCycle.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(durationMillis = 700, easing = EaseInOut),
                )
            }
        }
        launch {
            delay(500)
            badgeScale.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 400,
                    easing = CubicBezierEasing(0.2f, 1.6f, 0.4f, 1f),
                ),
            )
        }
    }

    val eggPath = remember { buildEggPath() }
    val mainCrack = remember {
        Path().apply {
            moveTo(40f, 44f)
            lineTo(52f, 62f)
            lineTo(42f, 76f)
            lineTo(58f, 92f)
            lineTo(48f, 108f)
            lineTo(60f, 124f)
        }
    }
    val branchCrack = remember {
        Path().apply {
            moveTo(58f, 92f)
            lineTo(76f, 86f)
        }
    }

    val p = shakeCycle.value
    val (shakeX, shakeRot) = when {
        p <= 0.2f -> {
            val k = p / 0.2f
            (-5f * k) to (-3f * k)
        }
        p <= 0.4f -> {
            val k = (p - 0.2f) / 0.2f
            (-5f + 10f * k) to (-3f + 6f * k)
        }
        p <= 0.6f -> {
            val k = (p - 0.4f) / 0.2f
            (5f - 9f * k) to (3f - 5f * k)
        }
        p <= 0.8f -> {
            val k = (p - 0.6f) / 0.2f
            (-4f + 7f * k) to (-2f + 3f * k)
        }
        else -> {
            val k = (p - 0.8f) / 0.2f
            (3f * (1f - k)) to (1f * (1f - k))
        }
    }

    OverlayCardShell(testTag = "overlay_error") {
        Canvas(
            modifier = Modifier
                .size(width = 132.dp, height = 170.dp)
                .semantics { contentDescription = "Huevo roto con aviso de error" },
        ) {
            val sx = size.width / 120f
            val sy = size.height / 150f

            scale(scaleX = sx, scaleY = sy, pivot = Offset.Zero) {
                drawOval(
                    color = Color.White.copy(alpha = 0.07f),
                    topLeft = Offset(26f, 141f),
                    size = Size(68f, 10f),
                )

                translate(left = shakeX, top = 0f) {
                    rotate(degrees = shakeRot, pivot = Offset(60f, 140f)) {
                        drawPath(path = eggPath, color = Color.White)
                        drawPath(
                            path = eggPath,
                            color = EggOutlineBlue,
                            style = Stroke(width = 4f),
                        )
                        drawPath(
                            path = mainCrack,
                            color = ErrorCrackRed,
                            style = Stroke(
                                width = 4f,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                        )
                        drawPath(
                            path = branchCrack,
                            color = ErrorCrackRed,
                            style = Stroke(
                                width = 3f,
                                cap = StrokeCap.Round,
                            ),
                        )
                    }
                }

                // Insignia roja con signo de exclamación
                val bScale = badgeScale.value
                if (bScale > 0.001f) {
                    scale(scaleX = bScale, scaleY = bScale, pivot = Offset(98f, 118f)) {
                        drawCircle(
                            color = ErrorCrackRed,
                            radius = 17f,
                            center = Offset(98f, 118f),
                        )
                        drawCircle(
                            color = Color.White,
                            radius = 17f,
                            center = Offset(98f, 118f),
                            style = Stroke(width = 3f),
                        )
                        drawLine(
                            color = Color.White,
                            start = Offset(98f, 108f),
                            end = Offset(98f, 120f),
                            strokeWidth = 4f,
                            cap = StrokeCap.Round,
                        )
                        drawCircle(
                            color = Color.White,
                            radius = 2.4f,
                            center = Offset(98f, 127f),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Text(
            text = "cancelando mis huevitos",
            fontSize = 19.sp,
            fontWeight = FontWeight.Bold,
            color = ErrorTitleCoral,
            textAlign = TextAlign.Center,
        )
        val subtitle = message.ifBlank { title }
        if (subtitle.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle,
                fontSize = 12.5.sp,
                lineHeight = 16.sp,
                color = OverlaySubtitleColor,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun SuccessOverlayTemplate(title: String, message: String) {
    val topCapProgress = remember { Animatable(0f) }
    val checkScale = remember { Animatable(0f) }
    val msgAlpha = remember { Animatable(0f) }

    LaunchedEffect(title, message) {
        topCapProgress.snapTo(0f)
        checkScale.snapTo(0f)
        msgAlpha.snapTo(0f)
        launch {
            delay(200)
            topCapProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 900,
                    easing = CubicBezierEasing(0.2f, 1.4f, 0.4f, 1f),
                ),
            )
        }
        launch {
            delay(600)
            checkScale.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 500,
                    easing = CubicBezierEasing(0.2f, 1.6f, 0.4f, 1f),
                ),
            )
        }
        launch {
            delay(1000)
            msgAlpha.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = 500, easing = LinearEasing),
            )
        }
    }

    val eggPath = remember { buildEggPath() }
    val topClipPath = remember {
        Path().apply {
            moveTo(0f, 0f)
            lineTo(120f, 0f)
            lineTo(120f, 78f)
            lineTo(100f, 70f)
            lineTo(84f, 82f)
            lineTo(66f, 70f)
            lineTo(50f, 82f)
            lineTo(34f, 70f)
            lineTo(18f, 82f)
            lineTo(0f, 74f)
            close()
        }
    }
    val bottomClipPath = remember {
        Path().apply {
            moveTo(0f, 74f)
            lineTo(18f, 82f)
            lineTo(34f, 70f)
            lineTo(50f, 82f)
            lineTo(66f, 70f)
            lineTo(84f, 82f)
            lineTo(100f, 70f)
            lineTo(120f, 78f)
            lineTo(120f, 150f)
            lineTo(0f, 150f)
            close()
        }
    }
    val zigzagLine = remember {
        Path().apply {
            moveTo(0f, 74f)
            lineTo(18f, 82f)
            lineTo(34f, 70f)
            lineTo(50f, 82f)
            lineTo(66f, 70f)
            lineTo(84f, 82f)
            lineTo(100f, 70f)
            lineTo(120f, 78f)
        }
    }
    val checkMarkPath = remember {
        Path().apply {
            moveTo(48f, 108f)
            lineTo(57f, 117f)
            lineTo(74f, 97f)
        }
    }

    OverlayCardShell(testTag = "overlay_success") {
        Canvas(
            modifier = Modifier
                .size(width = 132.dp, height = 170.dp)
                .semantics { contentDescription = "Huevo abierto con palomita verde" },
        ) {
            val sx = size.width / 120f
            val sy = size.height / 150f

            scale(scaleX = sx, scaleY = sy, pivot = Offset.Zero) {
                drawOval(
                    color = Color.White.copy(alpha = 0.07f),
                    topLeft = Offset(26f, 141f),
                    size = Size(68f, 10f),
                )

                // Mitad inferior del cascarón
                clipPath(bottomClipPath) {
                    drawPath(path = eggPath, color = SuccessEggBottomMint)
                    drawPath(
                        path = eggPath,
                        color = EggOutlineBlue,
                        style = Stroke(width = 4f),
                    )
                }
                clipPath(eggPath) {
                    drawPath(
                        path = zigzagLine,
                        color = EggCrackNavy,
                        style = Stroke(width = 3f, join = StrokeJoin.Round),
                    )
                }

                // Palomita verde emergiendo
                val cScale = checkScale.value
                if (cScale > 0.001f) {
                    scale(scaleX = cScale, scaleY = cScale, pivot = Offset(60f, 108f)) {
                        drawCircle(
                            color = SuccessCheckGreen,
                            radius = 24f,
                            center = Offset(60f, 108f),
                        )
                        drawPath(
                            path = checkMarkPath,
                            color = Color.White,
                            style = Stroke(
                                width = 6f,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                        )
                    }
                }

                // Tapa superior del huevo abriéndose
                val t = topCapProgress.value
                translate(left = -24f * t, top = -34f * t) {
                    rotate(degrees = -34f * t, pivot = Offset(100f, 76f)) {
                        clipPath(topClipPath) {
                            drawPath(path = eggPath, color = Color.White)
                            drawPath(
                                path = eggPath,
                                color = EggOutlineBlue,
                                style = Stroke(width = 4f),
                            )
                        }
                        clipPath(eggPath) {
                            drawPath(
                                path = zigzagLine,
                                color = EggCrackNavy,
                                style = Stroke(width = 3f, join = StrokeJoin.Round),
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Column(
            modifier = Modifier.graphicsLayer { alpha = msgAlpha.value },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "AHUEVO otra venta",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                color = SuccessTitleMint,
                textAlign = TextAlign.Center,
            )
            val subtitle = listOf(title, message).firstOrNull { it.isNotBlank() }
                ?.let {
                    if (title.isNotBlank() && message.isNotBlank()) "$title • $message" else it
                }
            if (!subtitle.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    color = OverlaySubtitleColor,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
