package com.example.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.domain.CalculationEngine
import com.example.domain.PaymentMethod
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraDangerButton
import com.example.ui.components.AuroraEmptyState
import com.example.ui.components.AuroraOutlinedButton
import com.example.ui.components.AuroraPrimaryButton
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.AuroraTextField
import com.example.ui.components.AuroraTopBar
import com.example.ui.components.ThermalTicket60mmView
import com.example.ui.theme.Error
import com.example.ui.theme.ErrorContainer
import com.example.ui.theme.OnErrorContainer
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.theme.SurfaceContainerLowest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TicketScreen(
    delivery: DeliveryEntity?,
    client: ClientEntity?,
    settings: BusinessSettingsEntity,
    onBack: () -> Unit,
    onPrint: (DeliveryEntity) -> Unit,
    onShareWhatsApp: (DeliveryEntity) -> Unit,
    onDownloadPdf: (DeliveryEntity) -> Unit,
    onDownloadJson: (DeliveryEntity) -> Unit,
    onCancelDelivery: (deliveryId: Long, reason: String) -> Unit,
    allowCancel: Boolean = true,
) {
    if (delivery == null) {
        Column(modifier = Modifier.fillMaxSize()) {
            AuroraTopBar(title = "Ticket", showDrawerMenu = false, onMenuOrBackClick = onBack)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                contentAlignment = Alignment.Center,
            ) {
                AuroraEmptyState(
                    icon = Icons.Default.ReceiptLong,
                    title = "Ticket no encontrado",
                    subtitle = "No se encontró el comprobante solicitado.",
                )
            }
        }
        return
    }

    var showCancelDialog by remember { mutableStateOf(false) }
    var signatureBitmap by remember(delivery.signaturePath) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(delivery.signaturePath) {
        signatureBitmap = withContext(Dispatchers.IO) {
            val path = delivery.signaturePath
            if (path.isNullOrBlank()) null
            else File(path).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.absolutePath) }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Ticket 60 mm",
            subtitle = "${delivery.folio} • ${PaymentMethod.fromDb(delivery.paymentMethod).label}",
            showDrawerMenu = false,
            onMenuOrBackClick = onBack,
            trailingBadge = {
                AuroraStatusBadge(
                    text = if (delivery.status == "CANCELADA") "CANCELADO" else PaymentMethod.fromDb(delivery.paymentMethod).label,
                    tint = if (delivery.status == "CANCELADA") Error else PrimaryGlow,
                )
            },
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            ThermalTicket60mmView(
                delivery = delivery,
                client = client,
                settings = settings,
                signatureBitmap = signatureBitmap,
            )

            AuroraCard {
                Text(
                    text = "Opciones del Comprobante (Independientes)",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                )
                Spacer(Modifier.height(12.dp))

                AuroraPrimaryButton(
                    text = "Imprimir (60 mm)",
                    icon = Icons.Default.Print,
                    onClick = { onPrint(delivery) },
                    testTag = "ticket_print_button",
                )

                Spacer(Modifier.height(10.dp))

                AuroraOutlinedButton(
                    text = "Compartir PDF por WhatsApp",
                    icon = Icons.Default.Share,
                    onClick = { onShareWhatsApp(delivery) },
                    accentColor = PrimaryGlow,
                    modifier = Modifier.fillMaxWidth(),
                    testTag = "ticket_whatsapp_button",
                )

                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AuroraOutlinedButton(
                        text = "Descargar PDF",
                        icon = Icons.Default.PictureAsPdf,
                        onClick = { onDownloadPdf(delivery) },
                        accentColor = Secondary,
                        modifier = Modifier.weight(1f),
                        testTag = "ticket_download_pdf_button",
                    )
                    AuroraOutlinedButton(
                        text = "Descargar JSON",
                        icon = Icons.Default.Code,
                        onClick = { onDownloadJson(delivery) },
                        accentColor = Primary,
                        modifier = Modifier.weight(1f),
                        testTag = "ticket_download_json_button",
                    )
                }

                if (allowCancel && delivery.status != "CANCELADA") {
                    Spacer(Modifier.height(12.dp))
                    AuroraDangerButton(
                        text = "Cancelar Entrega y Revertir Inventario",
                        icon = Icons.Default.Cancel,
                        onClick = { showCancelDialog = true },
                        testTag = "ticket_cancel_delivery_button",
                    )
                }
            }
        }
    }

    if (showCancelDialog) {
        CancelDeliveryDialog(
            delivery = delivery,
            onDismiss = { showCancelDialog = false },
            onConfirm = { reason ->
                onCancelDelivery(delivery.id, reason)
                showCancelDialog = false
            },
        )
    }
}

@Composable
fun EntregasRealizadasScreen(
    deliveries: List<DeliveryEntity>,
    onEnterScreenLoading: () -> Unit,
    onOpenDrawer: () -> Unit,
    onOpenTicket: (Long) -> Unit,
    onCancelDelivery: (deliveryId: Long, reason: String) -> Unit,
    allowCancel: Boolean = true,
    title: String = "Entregas Realizadas",
    newDeliveryLabel: String? = null,
    onNewDelivery: (() -> Unit)? = null,
    onOpenClientProfile: ((Long) -> Unit)? = null,
) {
    LaunchedEffect(Unit) {
        onEnterScreenLoading()
    }

    var searchQuery by remember { mutableStateOf("") }
    var filterIndex by remember { mutableIntStateOf(0) } // 0=Todas, 1=Activas, 2=Canceladas
    var deliveryToCancel by remember { mutableStateOf<DeliveryEntity?>(null) }

    val filtered = remember(deliveries, searchQuery, filterIndex) {
        val q = searchQuery.trim().lowercase(Locale.getDefault())
        deliveries.filter { d ->
            val matchesQ = q.isEmpty() ||
                d.folio.lowercase(Locale.getDefault()).contains(q) ||
                d.clientName.lowercase(Locale.getDefault()).contains(q) ||
                d.brand.lowercase(Locale.getDefault()).contains(q)
            val matchesF = when (filterIndex) {
                1 -> d.status == "ACTIVA"
                2 -> d.status == "CANCELADA"
                else -> true
            }
            matchesQ && matchesF
        }
    }

    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("es", "MX")) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = title,
            subtitle = "${deliveries.size} notas registradas",
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                AuroraTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = "Buscar por folio o cliente",
                    leadingIcon = Icons.Default.Search,
                    testTag = "search_deliveries_input",
                    modifier = Modifier.widthIn(max = 600.dp),
                )
            }

            if (onNewDelivery != null && newDeliveryLabel != null) {
                item {
                    AuroraPrimaryButton(
                        text = newDeliveryLabel,
                        icon = Icons.Default.ReceiptLong,
                        onClick = onNewDelivery,
                        testTag = "new_channel_delivery_button",
                    )
                }
            }

            item {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val labels = listOf(
                        "Todas (${deliveries.size})",
                        "Activas (${deliveries.count { it.status == "ACTIVA" }})",
                        "Canceladas (${deliveries.count { it.status == "CANCELADA" }})",
                    )
                    items(labels.size) { idx ->
                        FilterChip(
                            selected = filterIndex == idx,
                            onClick = { filterIndex = idx },
                            label = { Text(labels[idx]) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Primary.copy(alpha = 0.22f),
                                selectedLabelColor = Primary,
                                containerColor = SurfaceContainerLow,
                                labelColor = OnSurfaceVariant,
                            ),
                        )
                    }
                }
            }

            item {
                AuroraCard(contentPadding = PaddingValues(12.dp)) {
                    Text(
                        text = "Al cancelar una entrega se conserva el folio original sin reutilizarse, se marca como CANCELADO y se revierten inventario y saldos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                }
            }

            if (filtered.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.ReceiptLong,
                        title = if (deliveries.isEmpty()) "Aún no hay entregas registradas" else "Sin coincidencias",
                        subtitle = if (deliveries.isEmpty()) {
                            "Las entregas realizadas aparecerán aquí con su folio y comprobante."
                        } else {
                            "Intenta buscar con otro folio o nombre de cliente."
                        },
                    )
                }
            } else {
                items(filtered, key = { it.id }) { delivery ->
                    val isCancelled = delivery.status == "CANCELADA"
                    AuroraCard(modifier = Modifier.testTag("delivery_history_card_${delivery.id}")) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = delivery.folio,
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                    color = Primary,
                                )
                                AuroraStatusBadge(
                                    text = if (isCancelled) "CANCELADO" else PaymentMethod.fromDb(delivery.paymentMethod).label,
                                    tint = if (isCancelled) Error else if (delivery.paymentMethod == PaymentMethod.CREDITO.dbValue) Secondary else PrimaryGlow,
                                )
                            }
                            Text(
                                text = "${CalculationEngine.formatMoney(delivery.finalAmountMxn)} MXN",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    textDecoration = if (isCancelled) TextDecoration.LineThrough else TextDecoration.None,
                                ),
                                color = if (isCancelled) OnSurfaceVariant else OnSurface,
                            )
                        }

                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = delivery.clientName,
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                        Text(
                            text = "${dateFmt.format(Date(delivery.dateMillis))} • ${delivery.brand}",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )

                        Spacer(Modifier.height(8.dp))
                        Surface(
                            color = SurfaceContainerLowest,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                val totalNetKg = delivery.netWeightKg + (delivery.sugarSacks * delivery.sugarSackWeightKg)
                                val qtySummary = buildList {
                                    if (delivery.boxes > 0.0) {
                                        add("${CalculationEngine.formatExactBoxes(delivery.boxes)} cjs")
                                    }
                                    if (delivery.sugarSacks > 0.0) {
                                        add("${CalculationEngine.formatExactBoxes(delivery.sugarSacks)} bto azúcar")
                                    }
                                    add("${CalculationEngine.formatExactWeight(totalNetKg)} kg")
                                }.joinToString(" • ")
                                Text(
                                    text = qtySummary,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = OnSurface,
                                )
                                if (!isCancelled && delivery.pendingBalanceMxn > 0.0) {
                                    Text(
                                        text = "Pendiente: ${CalculationEngine.formatMoney(delivery.pendingBalanceMxn)}",
                                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                        color = Secondary,
                                    )
                                } else if (isCancelled) {
                                    Text(
                                        text = "Saldo e inventario revertidos",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Error,
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider(color = Primary.copy(alpha = 0.1f))
                        Spacer(Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            AuroraOutlinedButton(
                                text = "Ver Ticket",
                                icon = Icons.Default.ReceiptLong,
                                onClick = { onOpenTicket(delivery.id) },
                                modifier = Modifier.weight(1f),
                                testTag = "view_ticket_button_${delivery.id}",
                            )
                            if (!isCancelled && allowCancel) {
                                AuroraDangerButton(
                                    text = "Cancelar",
                                    icon = Icons.Default.Cancel,
                                    onClick = { deliveryToCancel = delivery },
                                    modifier = Modifier.weight(1f),
                                    testTag = "cancel_delivery_button_${delivery.id}",
                                )
                            }
                        }
                        if (onOpenClientProfile != null) {
                            Spacer(Modifier.height(8.dp))
                            AuroraOutlinedButton(
                                text = "Ver saldo de este cliente",
                                icon = Icons.Default.ReceiptLong,
                                onClick = { onOpenClientProfile(delivery.clientId) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }

    deliveryToCancel?.let { target ->
        CancelDeliveryDialog(
            delivery = target,
            onDismiss = { deliveryToCancel = null },
            onConfirm = { reason ->
                onCancelDelivery(target.id, reason)
                deliveryToCancel = null
            },
        )
    }
}

@Composable
private fun CancelDeliveryDialog(
    delivery: DeliveryEntity,
    onDismiss: () -> Unit,
    onConfirm: (reason: String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = {
            Text(
                text = "Cancelar entrega ${delivery.folio}",
                color = OnSurface,
                style = MaterialTheme.typography.titleLarge,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val revertDesc = buildList {
                    if (delivery.boxes > 0.0) {
                        add("${CalculationEngine.formatExactBoxes(delivery.boxes)} cajas")
                    }
                    if (delivery.sugarSacks > 0.0) {
                        add("${CalculationEngine.formatExactBoxes(delivery.sugarSacks)} bultos de azúcar")
                    }
                }.joinToString(" y ").ifEmpty { "las unidades" }
                Text(
                    text = "El folio se conservará marcado como CANCELADO, se revertirán $revertDesc al inventario y se ajustará la deuda del cliente.",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                )
                AuroraTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = "Motivo de cancelación (opcional)",
                    testTag = "cancel_reason_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(reason) },
                colors = ButtonDefaults.buttonColors(containerColor = ErrorContainer, contentColor = OnErrorContainer),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("confirm_cancel_delivery_button"),
            ) {
                Text("Confirmar Cancelación")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Volver", color = Secondary)
            }
        },
    )
}
