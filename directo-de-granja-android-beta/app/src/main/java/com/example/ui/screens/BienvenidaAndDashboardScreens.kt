package com.example.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.BuildConfig
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.data.local.entity.ReminderEntity
import com.example.domain.CalculationEngine
import com.example.domain.PaymentMethod
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraEmptyState
import com.example.ui.components.AuroraPrimaryButton
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.AuroraTopBar
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerHigh
import com.example.ui.theme.SurfaceContainerLowest
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@Composable
fun BienvenidaScreen(
    settings: BusinessSettingsEntity,
    onEnterDashboard: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Spacer(Modifier.height(6.dp))

        // Emblema oficial enviado por el usuario para pantalla de inicio (sin recortar texto ni cubrirlo)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 320.dp)
                .aspectRatio(1f)
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xFF050A0F))
                .border(1.5.dp, Secondary.copy(alpha = 0.45f), RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.img_welcome_hero),
                contentDescription = "Emblema ${BuildConfig.BRAND_APP_NAME} - ${BuildConfig.BRAND_SLOGAN}",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }

        Spacer(Modifier.height(14.dp))

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 600.dp),
        ) {
            AuroraStatusBadge(
                text = "SISTEMA LOCAL OFFLINE",
                tint = PrimaryGlow,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = settings.businessName,
                style = MaterialTheme.typography.headlineLarge.copy(fontSize = 28.sp),
                color = OnSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = settings.slogan,
                style = MaterialTheme.typography.titleMedium,
                color = Secondary,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(18.dp))

        // Tarjeta de Terminal Local
        AuroraCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(Primary.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudOff,
                        contentDescription = null,
                        tint = Primary,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Terminal Android Nativa",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                    )
                    Text(
                        text = "Modo Local Offline 100% Persistente • SQLite",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                }
                AuroraStatusBadge(text = "Activo", tint = PrimaryGlow)
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = Primary.copy(alpha = 0.14f))
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Acceso Inmediato: Sin perfiles, sin PIN y sin conexión a Internet.",
                style = MaterialTheme.typography.labelLarge,
                color = Secondary,
            )
        }

        Spacer(Modifier.height(14.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 600.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AuroraCard(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(14.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Storage,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "BASE DE DATOS",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Text(
                    text = "Local SQLite",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                )
                Text(
                    text = "Cero latencia en ventas",
                    style = MaterialTheme.typography.bodySmall,
                    color = Primary,
                )
            }
            AuroraCard(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(14.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.AccountBalanceWallet,
                    contentDescription = null,
                    tint = Secondary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "OPERACIÓN",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Text(
                    text = "Moneda MXN",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                )
                Text(
                    text = "Cálculo y tara exacta",
                    style = MaterialTheme.typography.bodySmall,
                    color = Secondary,
                )
            }
        }

        Spacer(Modifier.height(22.dp))

        AuroraPrimaryButton(
            text = "Ingresar al Panel Principal",
            icon = Icons.AutoMirrored.Filled.ArrowForward,
            onClick = onEnterDashboard,
            testTag = "enter_dashboard_button",
        )

        Spacer(Modifier.height(14.dp))

        Text(
            text = "${BuildConfig.BRAND_APP_NAME} • Operaciones Locales • MXN",
            style = MaterialTheme.typography.labelSmall,
            color = OnSurfaceVariant.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun PanelPrincipalScreen(
    settings: BusinessSettingsEntity,
    deliveries: List<DeliveryEntity>,
    activeAbonos: List<AbonoEntity>,
    inventoryBrands: List<InventoryBrandEntity>,
    dueTodayReminders: List<ReminderEntity>,
    onOpenDrawer: () -> Unit,
    showInventory: Boolean = true,
) {
    val todayLabel = remember {
        SimpleDateFormat("dd 'de' MMMM 'de' yyyy", Locale("es", "MX")).format(Date())
    }
    val (todayStart, todayEnd) = remember {
        val start = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val end = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 23)
            set(Calendar.MINUTE, 59)
            set(Calendar.SECOND, 59)
            set(Calendar.MILLISECOND, 999)
        }.timeInMillis
        start to end
    }

    val activeTodayDeliveries = remember(deliveries, todayStart, todayEnd) {
        deliveries.filter { it.status == "ACTIVA" && it.dateMillis in todayStart..todayEnd }
    }
    val todayAbonos = remember(activeAbonos, todayStart, todayEnd) {
        activeAbonos.filter { it.dateMillis in todayStart..todayEnd }
    }

    val cashToday = activeTodayDeliveries
        .filter { it.paymentMethod == PaymentMethod.CONTADO.dbValue }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.finalAmountMxn)) }
    val creditInitToday = activeTodayDeliveries
        .filter { it.paymentMethod == PaymentMethod.CREDITO.dbValue }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.initialPaymentMxn)) }
    val abonosSumToday = todayAbonos
        .fold(BigDecimal.ZERO) { acc, a -> acc.add(BigDecimal.valueOf(a.amountMxn)) }
    val collectedToday = cashToday.add(creditInitToday).add(abonosSumToday)

    val totalPendingCredit = deliveries
        .filter { it.status == "ACTIVA" }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }

    val boxesDeliveredToday = activeTodayDeliveries
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.boxes)) }

    val totalRemainingBoxes = inventoryBrands
        .fold(BigDecimal.ZERO) { acc, b -> acc.add(BigDecimal.valueOf(b.remainingBoxes)) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = settings.businessName,
            subtitle = settings.slogan,
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Encabezado operativo offline
            AuroraCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        AuroraStatusBadge(text = "MODO LOCAL OFFLINE", tint = PrimaryGlow)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Panel Principal",
                            style = MaterialTheme.typography.headlineMedium,
                            color = OnSurface,
                        )
                        Text(
                            text = "Jornada: $todayLabel",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                    Surface(
                        color = SurfaceContainer,
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalAlignment = Alignment.End,
                        ) {
                            Text(
                                text = "Precio Base",
                                style = MaterialTheme.typography.labelSmall,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = "${CalculationEngine.formatMoney(settings.globalPricePerKg)}/kg",
                                style = MaterialTheme.typography.titleMedium,
                                color = Secondary,
                            )
                        }
                    }
                }
            }

            // Recordatorios del día (solo resumen informativo, el módulo se abre en el menú hamburguesa)
            if (dueTodayReminders.isNotEmpty()) {
                AuroraCard(
                    borderBrush = Brush.linearGradient(
                        listOf(Secondary.copy(alpha = 0.55f), Primary.copy(alpha = 0.25f)),
                    ),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.NotificationsActive,
                            contentDescription = "Recordatorios pendientes para hoy",
                            tint = Secondary,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Recordatorios Activos (${dueTodayReminders.size})",
                            style = MaterialTheme.typography.titleMedium,
                            color = Secondary,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    dueTodayReminders.take(3).forEach { rem ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = rem.clientName,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = OnSurface,
                            )
                            Text(
                                text = rem.boxesNote.ifBlank { "Entrega programada" },
                                style = MaterialTheme.typography.bodySmall,
                                color = Primary,
                            )
                        }
                    }
                }
            }

            // Métricas del día
            Text(
                text = "Métricas de la Jornada",
                style = MaterialTheme.typography.titleLarge,
                color = OnSurface,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 600.dp),
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 600.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                MetricTile(
                    icon = Icons.Default.AccountBalanceWallet,
                    title = "COBRANZA HOY",
                    value = "${CalculationEngine.formatMoney(collectedToday)} MXN",
                    subtitle = "Contado + abonos",
                    accent = PrimaryGlow,
                    modifier = Modifier.weight(1f),
                )
                MetricTile(
                    icon = Icons.Default.ReceiptLong,
                    title = "CARTERA PENDIENTE",
                    value = "${CalculationEngine.formatMoney(totalPendingCredit)} MXN",
                    subtitle = "Saldo total clientes",
                    accent = Secondary,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 600.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                MetricTile(
                    icon = Icons.Default.LocalShipping,
                    title = "ENTREGAS HOY",
                    value = "${activeTodayDeliveries.size} notas",
                    subtitle = "Activas en jornada",
                    accent = Primary,
                    modifier = Modifier.weight(1f),
                )
                MetricTile(
                    icon = Icons.Default.Inventory2,
                    title = "CAJAS REPARTIDAS",
                    value = "${CalculationEngine.formatExactBoxes(boxesDeliveredToday)} cjs",
                    subtitle = "Fracción exacta",
                    accent = Secondary,
                    modifier = Modifier.weight(1f),
                )
            }

            // Resumen de Inventario (solo lectura en Panel; sin botones duplicados)
            if (showInventory && inventoryBrands.isEmpty()) {
                AuroraEmptyState(
                    icon = Icons.Default.Inventory2,
                    title = "Sin movimientos de inventario",
                    subtitle = "Abre el menú lateral (≡) para registrar clientes, compras de huevo o nuevas entregas.",
                )
            } else if (showInventory) {
                AuroraCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Existencias en Inventario",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                        AuroraStatusBadge(
                            text = "${CalculationEngine.formatExactBoxes(totalRemainingBoxes)} cajas",
                            tint = Primary,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    val totalPositive = inventoryBrands
                        .sumOf { it.remainingBoxes.coerceAtLeast(0.0) }
                        .coerceAtLeast(0.001)
                    inventoryBrands.forEach { brand ->
                        val ratio = (brand.remainingBoxes.coerceAtLeast(0.0) / totalPositive).toFloat().coerceIn(0f, 1f)
                        Column(modifier = Modifier.padding(vertical = 6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = brand.brand,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = OnSurface,
                                )
                                Text(
                                    text = "${CalculationEngine.formatExactBoxes(brand.remainingBoxes)} cajas",
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                    color = Secondary,
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            LinearProgressIndicator(
                                progress = { ratio },
                                color = Primary,
                                trackColor = SurfaceContainerLowest,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                            )
                        }
                    }
                }
            }

            // Nota única guiando al menú hamburguesa sin duplicar accesos
            Surface(
                color = SurfaceContainerHigh.copy(alpha = 0.55f),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 600.dp),
            ) {
                Text(
                    text = "Utiliza el menú (≡) en la esquina superior izquierda para acceder a todos los módulos operativos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
}

@Composable
private fun MetricTile(
    icon: ImageVector,
    title: String,
    value: String,
    subtitle: String,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    AuroraCard(
        modifier = modifier,
        contentPadding = PaddingValues(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = OnSurfaceVariant,
            )
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = OnSurface,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.labelSmall,
            color = accent,
        )
    }
}
