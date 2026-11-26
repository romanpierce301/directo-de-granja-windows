package com.example.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.BuildConfig
import com.example.ui.theme.BackgroundDark
import com.example.ui.theme.Error
import com.example.ui.theme.ErrorContainer
import com.example.ui.theme.OnErrorContainer
import com.example.ui.theme.OnPrimary
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.OutlineVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.Primary3DLip
import com.example.ui.theme.PrimaryContainer
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SubtleGlassBorder
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerHigh
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.theme.SurfaceContainerLowest
import kotlin.math.roundToInt

@Composable
fun AuroraBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .drawBehind {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x2834D399), Color.Transparent),
                        center = Offset(size.width * 0.15f, size.height * 0.08f),
                        radius = size.width * 0.75f,
                    ),
                    radius = size.width * 0.75f,
                    center = Offset(size.width * 0.15f, size.height * 0.08f),
                )
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x1EECC068), Color.Transparent),
                        center = Offset(size.width * 0.88f, size.height * 0.85f),
                        radius = size.width * 0.70f,
                    ),
                    radius = size.width * 0.70f,
                    center = Offset(size.width * 0.88f, size.height * 0.85f),
                )
            },
        content = content,
    )
}

@Composable
fun AuroraTopBar(
    title: String,
    subtitle: String = stringResource(R.string.brand_slogan),
    showDrawerMenu: Boolean,
    onMenuOrBackClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailingBadge: (@Composable () -> Unit)? = null,
) {
    Surface(
        color = SurfaceContainerLowest.copy(alpha = 0.88f),
        border = BorderStroke(1.dp, SubtleGlassBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onMenuOrBackClick,
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(SurfaceContainerLow)
                    .testTag(if (showDrawerMenu) "hamburger_menu_button" else "top_back_button"),
            ) {
                Icon(
                    imageVector = if (showDrawerMenu) Icons.Default.Menu else Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = if (showDrawerMenu) "Abrir menú de módulos" else "Regresar",
                    tint = Primary,
                )
            }

            Spacer(Modifier.width(10.dp))

            Image(
                painter = painterResource(R.drawable.img_welcome_hero),
                contentDescription = "Logotipo ${BuildConfig.BRAND_APP_NAME}",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .border(1.dp, Secondary.copy(alpha = 0.45f), RoundedCornerShape(10.dp)),
            )

            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp),
                    color = OnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = Secondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            if (trailingBadge != null) {
                Spacer(Modifier.width(8.dp))
                trailingBadge()
            } else {
                AuroraStatusBadge(
                    text = "LOCAL",
                    tint = PrimaryGlow,
                )
            }
        }
    }
}

@Composable
fun AuroraCard(
    modifier: Modifier = Modifier,
    containerColor: Color = SurfaceContainerLow.copy(alpha = 0.92f),
    borderBrush: Brush = Brush.linearGradient(
        listOf(
            Primary.copy(alpha = 0.22f),
            SubtleGlassBorder,
            Secondary.copy(alpha = 0.16f),
        ),
    ),
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    val clickModifier = if (onClick != null) {
        Modifier.clickable(onClick = onClick)
    } else {
        Modifier
    }
    Surface(
        shape = shape,
        color = containerColor,
        border = BorderStroke(1.dp, borderBrush),
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 600.dp)
            .clip(shape)
            .then(clickModifier),
    ) {
        Column(
            modifier = Modifier.padding(contentPadding),
            content = content,
        )
    }
}

@Composable
fun AuroraPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    use3DEffect: Boolean = true,
    testTag: String = "primary_button",
) {
    val lipHeight = if (use3DEffect && enabled) 4.dp else 0.dp
    Box(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 600.dp)
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(if (enabled && use3DEffect) Primary3DLip else Color.Transparent)
            .padding(bottom = lipHeight),
    ) {
        Button(
            onClick = onClick,
            enabled = enabled,
            shape = RoundedCornerShape(26.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                contentColor = OnPrimary,
                disabledContainerColor = SurfaceContainerHigh,
                disabledContentColor = OnSurfaceVariant.copy(alpha = 0.5f),
            ),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag(testTag),
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = text,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun AuroraOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    accentColor: Color = Primary,
    testTag: String = "outlined_button",
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(26.dp),
        border = BorderStroke(1.dp, accentColor.copy(alpha = if (enabled) 0.45f else 0.18f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = SurfaceContainer,
            contentColor = accentColor,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        modifier = modifier
            .heightIn(min = 48.dp)
            .testTag(testTag),
    ) {
        if (icon != null) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun AuroraDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    testTag: String = "danger_button",
) {
    Button(
        onClick = onClick,
        shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = ErrorContainer,
            contentColor = OnErrorContainer,
        ),
        border = BorderStroke(1.dp, Error.copy(alpha = 0.35f)),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        modifier = modifier
            .heightIn(min = 48.dp)
            .testTag(testTag),
    ) {
        if (icon != null) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun AuroraStatusBadge(
    text: String,
    tint: Color = Primary,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(50),
        color = tint.copy(alpha = 0.14f),
        border = BorderStroke(1.dp, tint.copy(alpha = 0.38f)),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(tint),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                color = tint,
                maxLines = 1,
            )
        }
    }
}

@Composable
fun AuroraTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    singleLine: Boolean = true,
    suffixText: String? = null,
    leadingIcon: ImageVector? = null,
    readOnly: Boolean = false,
    testTag: String = "input_field",
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (placeholder.isNotEmpty()) {
            { Text(placeholder, color = OnSurfaceVariant.copy(alpha = 0.55f)) }
        } else {
            null
        },
        leadingIcon = leadingIcon?.let { icon ->
            { Icon(imageVector = icon, contentDescription = null, tint = Primary) }
        },
        suffix = suffixText?.let { sfx ->
            { Text(sfx, color = Secondary, style = MaterialTheme.typography.labelMedium) }
        },
        singleLine = singleLine,
        readOnly = readOnly,
        keyboardOptions = keyboardOptions,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Primary,
            unfocusedBorderColor = OutlineVariant,
            focusedContainerColor = SurfaceContainerLowest,
            unfocusedContainerColor = SurfaceContainerLowest,
            focusedLabelColor = Primary,
            unfocusedLabelColor = OnSurfaceVariant,
            focusedTextColor = OnSurface,
            unfocusedTextColor = OnSurface,
        ),
        modifier = modifier
            .fillMaxWidth()
            .testTag(testTag),
    )
}

@Composable
fun AuroraEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    AuroraCard(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Primary.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(28.dp),
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = OnSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = OnSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * Control deslizante único de izquierda a derecha para confirmar el pago ("«Desliza para pagar»").
 */
@Composable
fun SlideToPayControl(
    enabled: Boolean,
    label: String = "«Desliza para pagar»",
    onSlideConfirmed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val thumbSize = 52.dp
    val trackPadding = 4.dp
    var dragOffsetPx by remember { mutableFloatStateOf(0f) }
    val animatedOffset by animateFloatAsState(targetValue = dragOffsetPx, label = "slide_thumb")

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 600.dp)
            .height(60.dp)
            .clip(RoundedCornerShape(30.dp))
            .background(
                if (enabled) SurfaceContainerLowest else SurfaceContainer,
            )
            .border(
                width = 1.dp,
                color = if (enabled) Primary.copy(alpha = 0.45f) else OutlineVariant,
                shape = RoundedCornerShape(30.dp),
            )
            .padding(trackPadding)
            .testTag("slide_to_pay_control"),
    ) {
        val density = LocalDensity.current
        val maxDragPx = with(density) { (maxWidth - thumbSize).toPx() }.coerceAtLeast(1f)
        val progress = (dragOffsetPx / maxDragPx).coerceIn(0f, 1f)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(26.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Primary.copy(alpha = 0.14f + 0.25f * progress),
                            Color.Transparent,
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = if (enabled) OnSurface.copy(alpha = (1f - progress * 0.7f)) else OnSurfaceVariant.copy(alpha = 0.45f),
            )
        }

        Box(
            modifier = Modifier
                .offset { IntOffset(animatedOffset.roundToInt(), 0) }
                .size(thumbSize)
                .clip(CircleShape)
                .background(if (enabled) Primary else SurfaceContainerHigh)
                .draggable(
                    enabled = enabled,
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        dragOffsetPx = (dragOffsetPx + delta).coerceIn(0f, maxDragPx)
                    },
                    onDragStopped = {
                        if (dragOffsetPx >= maxDragPx * 0.80f) {
                            dragOffsetPx = 0f
                            onSlideConfirmed()
                        } else {
                            dragOffsetPx = 0f
                        }
                    },
                )
                .testTag("slide_to_pay_thumb"),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = "Deslizar para confirmar pago",
                    tint = if (enabled) OnPrimary else OnSurfaceVariant,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

@Composable
fun AuroraConfirmationDialog(
    title: String,
    message: String,
    confirmText: String,
    dismissText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    isDangerConfirm: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        titleContentColor = OnSurface,
        textContentColor = OnSurfaceVariant,
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
            )
        },
        text = {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isDangerConfirm) ErrorContainer else Primary,
                    contentColor = if (isDangerConfirm) OnErrorContainer else OnPrimary,
                ),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("dialog_confirm_button"),
            ) {
                Text(confirmText)
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("dialog_dismiss_button"),
            ) {
                Text(dismissText, color = Secondary)
            }
        },
    )
}
