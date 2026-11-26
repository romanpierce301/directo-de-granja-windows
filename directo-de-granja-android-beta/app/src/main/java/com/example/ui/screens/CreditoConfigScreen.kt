package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.domain.CalculationEngine
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraPrimaryButton
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.AuroraTextField
import com.example.ui.components.AuroraTopBar
import com.example.ui.theme.OnPrimary
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.OutlineVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SpaceMonoFontFamily
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.theme.SurfaceContainerLowest
import com.example.ui.theme.ThermalInk
import com.example.ui.theme.ThermalInkDark
import com.example.ui.theme.ThermalPaper
import com.example.ui.viewmodel.ClientWithDebt

@Composable
fun CreditoConfigScreen(
    settings: BusinessSettingsEntity,
    clients: List<ClientWithDebt>,
    onOpenDrawer: () -> Unit,
    onSaveCreditLegendConfig: (
        creditTermDaysText: String,
        moratoriumInterestText: String,
        paymentPlace: String,
        legendExtra: String,
        legendClosing: String,
    ) -> Unit,
    onUpdateClientCreditTermDays: (clientId: Long, daysText: String) -> Unit,
) {
    var termDaysText by remember(settings.creditTermDays) {
        mutableStateOf(settings.creditTermDays.toString())
    }
    var interestText by remember(settings.creditMoratoriumInterestPercent) {
        mutableStateOf(
            if (settings.creditMoratoriumInterestPercent > 0.0) {
                CalculationEngine.formatPlainDecimal(settings.creditMoratoriumInterestPercent)
            } else {
                ""
            },
        )
    }
    var paymentPlace by remember(settings.creditPaymentPlace) {
        mutableStateOf(settings.creditPaymentPlace)
    }
    var legendExtra by remember(settings.creditLegendExtra) {
        mutableStateOf(settings.creditLegendExtra)
    }
    var legendClosing by remember(settings.creditLegendClosing) {
        mutableStateOf(settings.creditLegendClosing)
    }
    var editingClient by remember { mutableStateOf<ClientEntity?>(null) }

    val previewDays = (termDaysText.trim().toIntOrNull() ?: settings.creditTermDays).coerceIn(0, 3650)
    val previewInterest = (interestText.trim().replace(",", ".").toDoubleOrNull() ?: 0.0).coerceIn(0.0, 100.0)
    val referenceNowMillis = remember { System.currentTimeMillis() }
    val previewDueDate = remember(previewDays, referenceNowMillis) {
        CalculationEngine.formatCreditDueDate(referenceNowMillis, previewDays)
    }
    val previewSegments = remember(
        previewDays,
        previewInterest,
        paymentPlace,
        legendExtra,
        legendClosing,
        referenceNowMillis,
    ) {
        CalculationEngine.buildPendingCreditLegendSegments(
            deliveryDateMillis = referenceNowMillis,
            pendingBalanceMxn = 1500.0,
            totalDebtMxn = 2500.0,
            effectiveTermDays = previewDays,
            moratoriumInterestPercent = previewInterest,
            paymentPlace = paymentPlace,
            extraCondition = legendExtra,
            closingNote = legendClosing,
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Crédito y Leyenda",
            subtitle = "Plazos límite y recuadros del ticket",
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Card 1: Tiempo límite general y selección rápida
            item {
                AuroraCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Schedule, contentDescription = null, tint = PrimaryGlow)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "Tiempo Límite de Crédito",
                                style = MaterialTheme.typography.titleMedium,
                                color = OnSurface,
                            )
                        }
                        AuroraStatusBadge(
                            text = if (previewDays == 0) "Mismo día" else "$previewDays días",
                            tint = Secondary,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Ajusta los días límite que se asignan automáticamente al entregar a crédito (o personalízalo por cliente más abajo).",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))

                    // Botones rápidos de plazo
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf(3, 7, 15, 30).forEach { preset ->
                            val selected = termDaysText.trim().toIntOrNull() == preset
                            Surface(
                                onClick = { termDaysText = preset.toString() },
                                shape = RoundedCornerShape(12.dp),
                                color = if (selected) Primary else SurfaceContainerLow,
                                border = BorderStroke(1.dp, if (selected) Primary else OutlineVariant),
                                modifier = Modifier
                                    .weight(1f)
                                    .heightIn(min = 48.dp)
                                    .testTag("credit_preset_${preset}_days"),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = "$preset d",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (selected) OnPrimary else OnSurface,
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    AuroraTextField(
                        value = termDaysText,
                        onValueChange = { input ->
                            termDaysText = input.filter { it.isDigit() }.take(4)
                        },
                        label = "Tiempo límite general (días)",
                        placeholder = "Ej. 7",
                        suffixText = "días",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        testTag = "credit_term_days_input",
                    )

                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.EventAvailable,
                            contentDescription = null,
                            tint = Primary,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Entrega hoy vence: $previewDueDate",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = Primary,
                        )
                    }
                }
            }

            // Card 2: Otros recuadros para la información de la leyenda de crédito
            item {
                AuroraCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.EditNote, contentDescription = null, tint = Secondary)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Recuadros de la Leyenda (Crédito)",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Personaliza los datos adicionales que aparecen en la leyenda legal de los comprobantes con saldo pendiente a crédito.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))

                    AuroraTextField(
                        value = interestText,
                        onValueChange = { interestText = it },
                        label = "Interés moratorio mensual (%)",
                        placeholder = "Ej. 3 (deja vacío o 0 si no aplica)",
                        suffixText = "% mensual",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        testTag = "credit_interest_input",
                    )
                    Spacer(Modifier.height(10.dp))

                    AuroraTextField(
                        value = paymentPlace,
                        onValueChange = { paymentPlace = it },
                        label = "Lugar o forma de pago acordada",
                        placeholder = "Ej. En bodega, ruta o transferencia",
                        singleLine = false,
                        testTag = "credit_payment_place_input",
                    )
                    Spacer(Modifier.height(10.dp))

                    AuroraTextField(
                        value = legendExtra,
                        onValueChange = { legendExtra = it },
                        label = "Cláusula o condiciones adicionales",
                        placeholder = "Ej. Mercancía revisada al entregar, sin devoluciones posteriores",
                        singleLine = false,
                        testTag = "credit_legend_extra_input",
                    )
                    Spacer(Modifier.height(10.dp))

                    AuroraTextField(
                        value = legendClosing,
                        onValueChange = { legendClosing = it },
                        label = "Texto de cierre / validez",
                        placeholder = "Válido con firma digital.",
                        singleLine = false,
                        testTag = "credit_legend_closing_input",
                    )
                    Spacer(Modifier.height(14.dp))

                    AuroraPrimaryButton(
                        text = "Guardar Plazo y Leyenda",
                        icon = Icons.Default.Save,
                        onClick = {
                            onSaveCreditLegendConfig(
                                termDaysText,
                                interestText,
                                paymentPlace,
                                legendExtra,
                                legendClosing,
                            )
                        },
                        testTag = "save_credit_config_button",
                    )
                }
            }

            // Card 3: Vista previa en vivo de la leyenda térmica
            item {
                AuroraCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Receipt, contentDescription = null, tint = PrimaryGlow)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Vista Previa en Ticket (Ejemplo)",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ThermalPaper, RoundedCornerShape(10.dp))
                            .border(1.dp, OutlineVariant, RoundedCornerShape(10.dp))
                            .padding(12.dp)
                            .testTag("credit_legend_live_preview"),
                    ) {
                        val previewAnnotated = buildAnnotatedString {
                            previewSegments.forEach { seg ->
                                if (seg.bold) {
                                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = ThermalInkDark)) {
                                        append(seg.text)
                                    }
                                } else {
                                    append(seg.text)
                                }
                            }
                        }
                        Text(
                            text = previewAnnotated,
                            fontFamily = SpaceMonoFontFamily,
                            fontSize = 10.sp,
                            lineHeight = 14.sp,
                            color = ThermalInk,
                        )
                    }
                }
            }

            // Card 4: Tiempo límite personalizado por cliente
            item {
                AuroraCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Person, contentDescription = null, tint = Primary)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Plazo Límite por Cliente",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Toca un cliente para fijarle un tiempo límite distinto al general cuando compre a crédito.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))

                    if (clients.isEmpty()) {
                        Text(
                            text = "Registra clientes primero para asignar plazos individuales.",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .widthIn(max = 600.dp),
                        )
                    } else {
                        clients.forEach { c ->
                            val customDays = c.client.creditTermDays
                            Surface(
                                onClick = { editingClient = c.client },
                                color = SurfaceContainerLowest,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, OutlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .padding(vertical = 4.dp)
                                    .testTag("client_credit_term_${c.client.id}"),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = c.client.name,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = OnSurface,
                                        modifier = Modifier.weight(1f),
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = if (customDays != null) {
                                            "Plazo: $customDays d"
                                        } else {
                                            "General (${settings.creditTermDays} d)"
                                        },
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (customDays != null) Secondary else Primary,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editingClient?.let { target ->
        ClientCreditTermDialog(
            client = target,
            defaultDays = settings.creditTermDays,
            onDismiss = { editingClient = null },
            onSave = { daysStr ->
                onUpdateClientCreditTermDays(target.id, daysStr)
                editingClient = null
            },
        )
    }
}

@Composable
private fun ClientCreditTermDialog(
    client: ClientEntity,
    defaultDays: Int,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var daysText by remember { mutableStateOf(client.creditTermDays?.toString() ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = { Text("Plazo límite: ${client.name}", color = OnSurface) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Ingresa los días límite para este cliente o deja vacío para usar el plazo general ($defaultDays días).",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                )
                AuroraTextField(
                    value = daysText,
                    onValueChange = { input -> daysText = input.filter { it.isDigit() }.take(4) },
                    label = "Días límite para este cliente",
                    placeholder = "Vacío = general ($defaultDays d)",
                    suffixText = "días",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    testTag = "client_credit_term_dialog_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(daysText) },
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("save_client_credit_term_confirm"),
            ) {
                Text("Guardar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Cancelar", color = Secondary)
            }
        },
    )
}
