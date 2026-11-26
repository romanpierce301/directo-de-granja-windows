package com.example.ui.screens

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.domain.CalculationEngine
import com.example.domain.DeliveryCalculationResult
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraConfirmationDialog
import com.example.ui.components.AuroraOutlinedButton
import com.example.ui.components.AuroraPrimaryButton
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.AuroraTextField
import com.example.ui.components.AuroraTopBar
import com.example.ui.components.SignaturePadCanvas
import com.example.ui.components.SignaturePadController
import com.example.ui.components.SlideToPayControl
import com.example.ui.theme.Error
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
import com.example.ui.viewmodel.ClientWithDebt
import com.example.ui.viewmodel.DeliveryDraftState
import java.math.BigDecimal
import java.math.RoundingMode

@Composable
fun NuevaEntregaScreen(
    draft: DeliveryDraftState,
    clients: List<ClientWithDebt>,
    inventoryBrands: List<InventoryBrandEntity>,
    settings: BusinessSettingsEntity,
    onSelectClient: (Long) -> Unit,
    onUpdateBrand: (String) -> Unit,
    onUpdateModality: (DeliveryModality) -> Unit,
    onUpdateWeight: (String) -> Unit,
    onUpdatePricePerKg: (String) -> Unit,
    onUpdateSugarSacks: (String) -> Unit,
    onUpdateSugarWeightPerSack: (String) -> Unit,
    onUpdateSugarPricePerSack: (String) -> Unit,
    onAddBoxItem: () -> Unit,
    onRemoveBoxItem: (Long) -> Unit,
    onContinueToPayment: () -> Unit,
    onExitDelivery: () -> Unit,
    screenTitle: String = "Nueva Entrega",
    screenSubtitle: String? = null,
    fixedClientName: String? = null,
) {
    var showExitDialog by remember { mutableStateOf(false) }
    var showClientPicker by remember { mutableStateOf(false) }

    // Protección obligatoria contra salida accidental durante Nueva Entrega (Sección 5.6 y 12.1)
    BackHandler {
        showExitDialog = true
    }

    val selectedClientWithDebt = clients.firstOrNull { it.client.id == draft.clientId }
    val selectedClient = selectedClientWithDebt?.client
    val typedPriceBd = remember(draft.pricePerKgInput) {
        CalculationEngine.parsePositiveDecimal(draft.pricePerKgInput)
    }

    val sugarSummary = remember(
        draft.sugarSacksInput,
        draft.sugarWeightPerSackInput,
        draft.sugarPricePerSackInput,
    ) {
        CalculationEngine.calculateSugarSummary(
            sacksInput = draft.sugarSacksInput,
            weightPerSackInput = draft.sugarWeightPerSackInput,
            pricePerSackInput = draft.sugarPricePerSackInput,
        )
    }

    val calc: DeliveryCalculationResult = remember(draft.weighedItems, typedPriceBd, sugarSummary) {
        CalculationEngine.calculateDeliveryWithSugar(
            items = draft.weighedItems,
            pricePerKg = typedPriceBd,
            sugarSummary = sugarSummary,
        )
    }

    val selectedBrandName = draft.brand.ifBlank {
        inventoryBrands.firstOrNull()?.brand ?: ""
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = screenTitle,
            subtitle = screenSubtitle ?: settings.businessName,
            showDrawerMenu = false,
            onMenuOrBackClick = { showExitDialog = true },
            trailingBadge = {
                AuroraStatusBadge(text = "Báscula Exacta", tint = Secondary)
            },
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 1. Destino fijo en ventas de Cremería; selector de cliente para ventas públicas.
            AuroraCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (fixedClientName == null) "CLIENTE SELECCIONADO" else "DESTINO DE VENTA",
                            style = MaterialTheme.typography.labelSmall,
                            color = Secondary,
                        )
                        Spacer(Modifier.height(4.dp))
                        if (fixedClientName != null) {
                            Text(
                                text = fixedClientName,
                                style = MaterialTheme.typography.titleLarge,
                                color = OnSurface,
                            )
                        } else if (selectedClient != null) {
                            Text(
                                text = selectedClient.name,
                                style = MaterialTheme.typography.titleLarge,
                                color = OnSurface,
                            )
                            Text(
                                text = selectedClient.address,
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                            )
                        } else {
                            Text(
                                text = "Ningún cliente seleccionado",
                                style = MaterialTheme.typography.titleMedium,
                                color = OnSurfaceVariant,
                            )
                        }
                    }
                    if (fixedClientName == null) {
                        AuroraOutlinedButton(
                            text = if (selectedClient == null) "Elegir" else "Cambiar",
                            icon = Icons.Default.SwapHoriz,
                            onClick = { showClientPicker = true },
                            testTag = "select_client_button",
                        )
                    }
                }
            }

            // 2. Marca del inventario y precio por kilogramo para las siguientes cajas
            AuroraCard {
                Text(
                    text = "MARCA Y PRECIO DEL HUEVO",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                if (inventoryBrands.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(inventoryBrands, key = { it.brand }) { inv ->
                            val isSelected = selectedBrandName.equals(inv.brand, ignoreCase = true)
                            FilterChip(
                                selected = isSelected,
                                onClick = { onUpdateBrand(inv.brand) },
                                label = {
                                    Text("${inv.brand} (${CalculationEngine.formatExactBoxes(inv.remainingBoxes)} cjs)")
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Primary.copy(alpha = 0.22f),
                                    selectedLabelColor = Primary,
                                    containerColor = SurfaceContainerLowest,
                                    labelColor = OnSurfaceVariant,
                                ),
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                AuroraTextField(
                    value = draft.brand,
                    onValueChange = onUpdateBrand,
                    label = "Marca",
                    placeholder = "Nombre de la marca",
                    testTag = "delivery_brand_input",
                )
                Spacer(Modifier.height(10.dp))
                val priceHintCaption = when {
                    selectedClient?.specialPricePerKg != null ->
                        "Tarifa especial del cliente (${CalculationEngine.formatMoney(selectedClient.specialPricePerKg)}/kg)"
                    settings.globalPricePerKg > 0.0 ->
                        "Último precio registrado (${CalculationEngine.formatMoney(settings.globalPricePerKg)}/kg)"
                    else ->
                        "Ingresa el precio por kilogramo para esta marca"
                }
                Text(
                    text = priceHintCaption,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (typedPriceBd > BigDecimal.ZERO) Secondary else OnSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                AuroraTextField(
                    value = draft.pricePerKgInput,
                    onValueChange = onUpdatePricePerKg,
                    label = "Precio del huevo por kg (MXN) *",
                    suffixText = "MXN/kg",
                    leadingIcon = Icons.Default.AttachMoney,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    testTag = "delivery_price_per_kg_input",
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Cada caja que agregues con + conservará esta marca y precio; puedes cambiarlos para agregar otra marca en la misma entrega.",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                )
            }

            // 3. Modalidad de Pesaje (Caja completa | Media caja | Media caja pesada)
            AuroraCard {
                Text(
                    text = "MODALIDAD DE PESAJE",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DeliveryModality.entries.forEach { mod ->
                        val selected = draft.modality == mod
                        Surface(
                            onClick = { onUpdateModality(mod) },
                            shape = RoundedCornerShape(14.dp),
                            color = if (selected) Primary else SurfaceContainerLowest,
                            border = BorderStroke(1.dp, if (selected) Primary else OutlineVariant),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 56.dp)
                                .testTag("modality_${mod.dbValue.lowercase()}"),
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Text(
                                    text = mod.label,
                                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                    color = if (selected) OnPrimary else OnSurface,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))
                Surface(
                    color = SurfaceContainerLowest,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                        val ruleDesc = when (draft.modality) {
                            DeliveryModality.CAJA_COMPLETA ->
                                "Tara automática: 2.000 kg por caja. Peso neto = Peso bruto − 2.000 kg."
                            DeliveryModality.MEDIA_CAJA ->
                                "Media caja (0.5): Peso neto = (Peso bruto − 2.000 kg) / 2."
                            DeliveryModality.MEDIA_CAJA_PESADA ->
                                "Captura directa de peso neto (no es bruto). Descuenta automáticamente 0.500 kg (500 g)."
                        }
                        Text(
                            text = ruleDesc,
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            }

            // 4. Captura de peso por caja con botón + y lista de cajas agregadas
            AuroraCard {
                Text(
                    text = "CAPTURA EN BÁSCULA",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                val weightFieldLabel = when (draft.modality) {
                    DeliveryModality.CAJA_COMPLETA -> "Peso bruto de caja (kg)"
                    DeliveryModality.MEDIA_CAJA -> "Peso bruto de media caja (kg)"
                    DeliveryModality.MEDIA_CAJA_PESADA -> "Peso neto ingresado (kg)"
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AuroraTextField(
                        value = draft.weightInputKg,
                        onValueChange = onUpdateWeight,
                        label = weightFieldLabel,
                        suffixText = "kg",
                        leadingIcon = Icons.Default.Scale,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        testTag = "delivery_weight_input",
                    )
                    FilledIconButton(
                        onClick = onAddBoxItem,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = Primary,
                            contentColor = OnPrimary,
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .size(56.dp)
                            .testTag("add_box_button"),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Agregar caja a la entrega",
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                if (draft.weighedItems.isEmpty()) {
                    Surface(
                        color = SurfaceContainerLowest,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = if (draft.weightInputKg.isNotBlank()) {
                                "Presiona el botón + para agregar este peso a la lista de entrega."
                            } else {
                                "Ingresa el peso en báscula y presiona + para agregar cada caja o media caja."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (draft.weightInputKg.isNotBlank()) Secondary else OnSurfaceVariant,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                } else {
                    if (draft.weightInputKg.isNotBlank()) {
                        Text(
                            text = "Presiona + si deseas agregar ${draft.weightInputKg} kg a la lista.",
                            style = MaterialTheme.typography.labelSmall,
                            color = Secondary,
                        )
                        Spacer(Modifier.height(6.dp))
                    }
                    Text(
                        text = "CAJAS AGREGADAS (${draft.weighedItems.size})",
                        style = MaterialTheme.typography.labelSmall,
                        color = Secondary,
                    )
                    Spacer(Modifier.height(6.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        draft.weighedItems.forEachIndexed { idx, item ->
                            val rowNum = String.format(java.util.Locale.US, "%02d", idx + 1)
                            val weightTag = if (item.modality == DeliveryModality.MEDIA_CAJA_PESADA) "Ing." else "Bruto"
                            val itemBrand = item.brand.trim().ifBlank { selectedBrandName.ifBlank { "General" } }
                            val itemPrice = if (item.pricePerKg > BigDecimal.ZERO) item.pricePerKg else typedPriceBd
                            val itemSubtotal = item.netWeightKg.multiply(itemPrice).setScale(2, RoundingMode.HALF_UP)
                            Surface(
                                color = SurfaceContainerLowest,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, OutlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("weighed_item_row_$idx"),
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(start = 12.dp, top = 6.dp, bottom = 6.dp, end = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "$rowNum • ${item.modality.label} (${CalculationEngine.formatExactBoxes(item.boxesDecimal)} cj)",
                                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                            color = OnSurface,
                                        )
                                        Text(
                                            text = "$itemBrand • ${CalculationEngine.formatMoney(itemPrice)}/kg",
                                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                                            color = Secondary,
                                        )
                                        Text(
                                            text = "$weightTag: ${CalculationEngine.formatExactWeight(item.inputWeightKg)} kg  |  Tara: -${CalculationEngine.formatExactWeight(item.tareDeductionKg)} kg",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = OnSurfaceVariant,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "${CalculationEngine.formatExactWeight(item.netWeightKg)} kg",
                                            fontFamily = SpaceMonoFontFamily,
                                            fontWeight = FontWeight.Bold,
                                            color = Primary,
                                        )
                                        Text(
                                            text = CalculationEngine.formatMoney(itemSubtotal),
                                            fontFamily = SpaceMonoFontFamily,
                                            fontSize = 11.sp,
                                            color = OnSurfaceVariant,
                                        )
                                    }
                                    IconButton(
                                        onClick = { onRemoveBoxItem(item.id) },
                                        modifier = Modifier
                                            .size(48.dp)
                                            .testTag("remove_box_button_${item.id}"),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.DeleteOutline,
                                            contentDescription = "Quitar caja $rowNum",
                                            tint = Error,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Surface(
                    color = SurfaceContainerLowest,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Total de cajas:",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = CalculationEngine.formatExactBoxes(calc.boxesDecimal),
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface,
                                modifier = Modifier.testTag("calculated_total_boxes_text"),
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Tara / descuento acumulado:",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = "-${CalculationEngine.formatExactWeight(calc.tareDeductionKg)} kg",
                                fontFamily = SpaceMonoFontFamily,
                                color = Error,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "PESO NETO FINAL:",
                                style = MaterialTheme.typography.labelMedium,
                                color = Primary,
                            )
                            Text(
                                text = "${CalculationEngine.formatExactWeight(calc.netWeightKg)} kg",
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp,
                                color = OnSurface,
                                modifier = Modifier.testTag("calculated_net_weight_text"),
                            )
                        }
                    }
                }
            }

            // 4b. Bultos de Azúcar (Opcional, sin valores predeterminados ni botones rápidos)
            AuroraCard {
                Text(
                    text = "BULTOS DE AZÚCAR (OPCIONAL)",
                    style = MaterialTheme.typography.labelSmall,
                    color = Secondary,
                )
                Spacer(Modifier.height(8.dp))
                AuroraTextField(
                    value = draft.sugarSacksInput,
                    onValueChange = onUpdateSugarSacks,
                    label = "Bultos de azúcar",
                    suffixText = "bto",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    testTag = "delivery_sugar_sacks_input",
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AuroraTextField(
                        value = draft.sugarWeightPerSackInput,
                        onValueChange = onUpdateSugarWeightPerSack,
                        label = "Peso por bulto",
                        suffixText = "kg",
                        leadingIcon = Icons.Default.Scale,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        testTag = "delivery_sugar_weight_input",
                    )
                    AuroraTextField(
                        value = draft.sugarPricePerSackInput,
                        onValueChange = onUpdateSugarPricePerSack,
                        label = "Precio por bulto",
                        suffixText = "MXN",
                        leadingIcon = Icons.Default.AttachMoney,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        testTag = "delivery_sugar_price_input",
                    )
                }
                if (sugarSummary.isPartialError) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Completa bultos, peso por bulto y precio por bulto (o deja los 3 campos vacíos).",
                        style = MaterialTheme.typography.bodySmall,
                        color = Error,
                    )
                } else if (sugarSummary.isPresent) {
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        color = SurfaceContainerLowest,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Azúcar: ${CalculationEngine.formatExactBoxes(sugarSummary.sacks)} bto • ${CalculationEngine.formatExactWeight(sugarSummary.totalWeightKg)} kg",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = "${CalculationEngine.formatMoney(sugarSummary.subtotalMxn.setScale(2, RoundingMode.HALF_UP))} MXN",
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Secondary,
                                modifier = Modifier.testTag("calculated_sugar_subtotal_text"),
                            )
                        }
                    }
                }
            }

            // 5. Cálculo de Importe, Desglose por Marca / Azúcar y Redondeo Oficial MXN
            val brandBreakdown = remember(draft.weighedItems, selectedBrandName, typedPriceBd) {
                CalculationEngine.summarizeBrandBreakdown(
                    items = draft.weighedItems,
                    fallbackBrand = selectedBrandName.ifBlank { "General" },
                    fallbackPricePerKg = typedPriceBd,
                )
            }
            AuroraCard {
                if (brandBreakdown.isNotEmpty() || sugarSummary.isPresent) {
                    Text(
                        text = "DESGLOSE POR MARCA Y CONCEPTOS",
                        style = MaterialTheme.typography.labelSmall,
                        color = Secondary,
                    )
                    Spacer(Modifier.height(6.dp))
                    brandBreakdown.forEachIndexed { idx, b ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 2.dp)
                                .testTag("brand_breakdown_row_$idx"),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${b.brand} (${CalculationEngine.formatExactBoxes(b.boxesDecimal)} cj • ${CalculationEngine.formatExactWeight(b.netWeightKg)} kg × ${CalculationEngine.formatMoney(b.pricePerKg)}/kg)",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 8.dp),
                            )
                            Text(
                                text = CalculationEngine.formatMoney(b.subtotalMxn.setScale(2, RoundingMode.HALF_UP)),
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface,
                            )
                        }
                    }
                    if (sugarSummary.isPresent) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 2.dp)
                                .testTag("sugar_breakdown_row"),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Azúcar (${CalculationEngine.formatExactBoxes(sugarSummary.sacks)} bto • ${CalculationEngine.formatExactWeight(sugarSummary.totalWeightKg)} kg × ${CalculationEngine.formatMoney(sugarSummary.pricePerSackMxn)}/bto)",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 8.dp),
                            )
                            Text(
                                text = CalculationEngine.formatMoney(sugarSummary.subtotalMxn.setScale(2, RoundingMode.HALF_UP)),
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface,
                            )
                        }
                    }
                    HorizontalDivider(
                        color = Primary.copy(alpha = 0.14f),
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
                if (sugarSummary.isPresent) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "Peso neto total (Huevo + Azúcar)",
                            style = MaterialTheme.typography.bodyMedium,
                            color = OnSurfaceVariant,
                        )
                        Text(
                            text = "${CalculationEngine.formatExactWeight(calc.combinedNetWeightKg)} kg",
                            fontFamily = SpaceMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = Primary,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = if (brandBreakdown.size > 1 || sugarSummary.isPresent) {
                            "Importe exacto integrado"
                        } else {
                            "Importe exacto (Neto × Precio/kg)"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = OnSurfaceVariant,
                    )
                    Text(
                        text = "${CalculationEngine.formatMoney(calc.rawAmountMxn.setScale(2, RoundingMode.HALF_UP))} MXN",
                        fontFamily = SpaceMonoFontFamily,
                        color = OnSurface,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Surface(
                    color = SurfaceContainerLowest,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(
                            text = "REGLA OFICIAL DE REDONDEO MXN",
                            style = MaterialTheme.typography.labelSmall,
                            color = Secondary,
                        )
                        Text(
                            text = "<50¢ baja al entero • =50¢ conserva .50 • >50¢ sube al siguiente entero",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "TOTAL A COBRAR:",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                    )
                    Text(
                        text = "${CalculationEngine.formatMoney(calc.finalAmountMxn)} MXN",
                        style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
                        color = Secondary,
                        modifier = Modifier.testTag("calculated_final_amount_text"),
                    )
                }
            }

            AuroraPrimaryButton(
                text = "Continuar a Pago",
                icon = Icons.AutoMirrored.Filled.ArrowForward,
                enabled = selectedClient != null && calc.isValid,
                onClick = onContinueToPayment,
                testTag = "continue_to_payment_button",
            )
        }
    }

    if (showExitDialog) {
        AuroraConfirmationDialog(
            title = stringResource(R.string.exit_delivery_title),
            message = "Si sales ahora se descartarán los datos capturados de esta entrega.",
            confirmText = stringResource(R.string.exit_delivery_confirm),
            dismissText = stringResource(R.string.exit_delivery_cancel),
            isDangerConfirm = true,
            onConfirm = {
                showExitDialog = false
                onExitDelivery()
            },
            onDismiss = { showExitDialog = false },
        )
    }

    if (showClientPicker && fixedClientName == null) {
        ClientSelectorDialog(
            clients = clients,
            globalPrice = settings.globalPricePerKg,
            onSelect = { id ->
                onSelectClient(id)
                showClientPicker = false
            },
            onDismiss = { showClientPicker = false },
        )
    }
}

@Composable
private fun ClientSelectorDialog(
    clients: List<ClientWithDebt>,
    globalPrice: Double,
    onSelect: (Long) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(clients, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) clients else clients.filter { it.client.name.lowercase().contains(q) }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = { Text("Seleccionar Cliente", color = OnSurface) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AuroraTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = "Buscar cliente",
                    leadingIcon = Icons.Default.PersonSearch,
                    testTag = "picker_search_client",
                )
                if (filtered.isEmpty()) {
                    Text(
                        text = "No hay clientes disponibles. Registra un cliente en el módulo Clientes.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        items(filtered, key = { it.client.id }) { item ->
                            val price = item.client.specialPricePerKg ?: globalPrice
                            Surface(
                                onClick = { onSelect(item.client.id) },
                                color = SurfaceContainerLow,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .testTag("pick_client_${item.client.id}"),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(item.client.name, color = OnSurface, style = MaterialTheme.typography.titleSmall)
                                        Text(
                                            item.client.address,
                                            color = OnSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                    Text(
                                        text = "${CalculationEngine.formatMoney(price)}/kg",
                                        color = Secondary,
                                        style = MaterialTheme.typography.labelLarge,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cerrar", color = Secondary)
            }
        },
    )
}

@Composable
fun PagoScreen(
    draft: DeliveryDraftState,
    clientWithDebt: ClientWithDebt?,
    settings: BusinessSettingsEntity,
    onBack: () -> Unit,
    onSelectPaymentMethod: (PaymentMethod) -> Unit,
    onUpdateInitialAbono: (String) -> Unit,
    onConfirmContado: () -> Unit,
    onProceedToCreditSignature: () -> Unit,
    screenSubtitle: String? = null,
) {
    val client = clientWithDebt?.client
    val typedPriceBd = remember(draft.pricePerKgInput) {
        CalculationEngine.parsePositiveDecimal(draft.pricePerKgInput)
    }
    val sugarSummary = remember(
        draft.sugarSacksInput,
        draft.sugarWeightPerSackInput,
        draft.sugarPricePerSackInput,
    ) {
        CalculationEngine.calculateSugarSummary(
            sacksInput = draft.sugarSacksInput,
            weightPerSackInput = draft.sugarWeightPerSackInput,
            pricePerSackInput = draft.sugarPricePerSackInput,
        )
    }
    val calc = remember(draft.weighedItems, typedPriceBd, sugarSummary) {
        CalculationEngine.calculateDeliveryWithSugar(
            items = draft.weighedItems,
            pricePerKg = typedPriceBd,
            sugarSummary = sugarSummary,
        )
    }
    val finalBd = calc.finalAmountMxn
    val abonoBd = if (draft.paymentMethod == PaymentMethod.CONTADO) {
        finalBd
    } else {
        CalculationEngine.parsePositiveDecimal(draft.initialAbonoInput).coerceIn(BigDecimal.ZERO, finalBd)
    }
    val deliveryPendingBd = finalBd.subtract(abonoBd).setScale(2, RoundingMode.HALF_UP)
    val previousDebtBd = BigDecimal.valueOf(clientWithDebt?.activeDebtMxn ?: 0.0).setScale(2, RoundingMode.HALF_UP)
    val totalAccumulatedBd = previousDebtBd.add(deliveryPendingBd).setScale(2, RoundingMode.HALF_UP)

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Pago",
            subtitle = screenSubtitle ?: settings.businessName,
            showDrawerMenu = false,
            onMenuOrBackClick = onBack,
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val brandBreakdown = remember(draft.weighedItems, draft.brand, typedPriceBd) {
                CalculationEngine.summarizeBrandBreakdown(
                    items = draft.weighedItems,
                    fallbackBrand = draft.brand.ifBlank { "General" },
                    fallbackPricePerKg = typedPriceBd,
                )
            }
            val brandSummary = remember(draft.weighedItems, draft.brand) {
                CalculationEngine.resolveBrandSummaryLabel(draft.brand.ifBlank { "General" }, draft.weighedItems)
            }
            AuroraCard {
                Text(
                    text = client?.name ?: "Cliente",
                    style = MaterialTheme.typography.titleLarge,
                    color = OnSurface,
                )
                Spacer(Modifier.height(4.dp))
                val summaryHeader = buildList {
                    if (draft.weighedItems.isNotEmpty()) {
                        add("${CalculationEngine.formatExactBoxes(calc.boxesDecimal)} cajas")
                    }
                    if (sugarSummary.isPresent) {
                        add("${CalculationEngine.formatExactBoxes(sugarSummary.sacks)} bto azúcar")
                    }
                    add("${CalculationEngine.formatExactWeight(calc.combinedNetWeightKg)} kg netos")
                    if (draft.weighedItems.isNotEmpty()) {
                        if (brandBreakdown.size <= 1) {
                            add("${CalculationEngine.formatMoney(calc.pricePerKg)}/kg")
                        }
                        add(brandSummary)
                    }
                }.joinToString(" • ")
                Text(
                    text = summaryHeader,
                    style = MaterialTheme.typography.bodyMedium,
                    color = OnSurfaceVariant,
                )
                if (brandBreakdown.size > 1 || (brandBreakdown.isNotEmpty() && sugarSummary.isPresent)) {
                    Spacer(Modifier.height(8.dp))
                    HorizontalDivider(color = Primary.copy(alpha = 0.14f))
                    Spacer(Modifier.height(6.dp))
                    brandBreakdown.forEach { b ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 2.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "${b.brand} • ${CalculationEngine.formatExactWeight(b.netWeightKg)} kg × ${CalculationEngine.formatMoney(b.pricePerKg)}/kg",
                                style = MaterialTheme.typography.bodySmall,
                                color = Secondary,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = CalculationEngine.formatMoney(b.subtotalMxn.setScale(2, RoundingMode.HALF_UP)),
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface,
                            )
                        }
                    }
                    if (sugarSummary.isPresent) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 2.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Azúcar • ${CalculationEngine.formatExactBoxes(sugarSummary.sacks)} bto (${CalculationEngine.formatExactWeight(sugarSummary.totalWeightKg)} kg)",
                                style = MaterialTheme.typography.bodySmall,
                                color = Secondary,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = CalculationEngine.formatMoney(sugarSummary.subtotalMxn.setScale(2, RoundingMode.HALF_UP)),
                                fontFamily = SpaceMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface,
                            )
                        }
                    }
                }
            }

            // Solo Contado y Crédito (sin transferencias bancarias)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 600.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PaymentMethod.entries.forEach { method ->
                    val selected = draft.paymentMethod == method
                    Surface(
                        onClick = { onSelectPaymentMethod(method) },
                        shape = RoundedCornerShape(18.dp),
                        color = if (selected) Primary else SurfaceContainerLow,
                        border = BorderStroke(1.dp, if (selected) Primary else OutlineVariant),
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 52.dp)
                            .testTag("payment_method_${method.dbValue.lowercase()}"),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 14.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Default.Payments,
                                contentDescription = null,
                                tint = if (selected) OnPrimary else Primary,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = method.label,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = if (selected) OnPrimary else OnSurface,
                            )
                        }
                    }
                }
            }

            AuroraCard {
                Text(
                    text = "RESUMEN DE LIQUIDACIÓN",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))

                SummaryMoneyRow(
                    label = "1. Importe de la entrega actual:",
                    value = "${CalculationEngine.formatMoney(finalBd)} MXN",
                    highlightColor = OnSurface,
                )

                if (draft.paymentMethod == PaymentMethod.CREDITO) {
                    Spacer(Modifier.height(10.dp))
                    AuroraTextField(
                        value = draft.initialAbonoInput,
                        onValueChange = onUpdateInitialAbono,
                        label = "Abono inicial recibido hoy (MXN)",
                        placeholder = "0.00",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        testTag = "credit_initial_abono_input",
                    )
                    Spacer(Modifier.height(10.dp))
                    SummaryMoneyRow(
                        label = "2. Saldo pendiente de la entrega:",
                        value = "${CalculationEngine.formatMoney(deliveryPendingBd)} MXN",
                        highlightColor = Secondary,
                    )
                    SummaryMoneyRow(
                        label = "3. Deuda anterior del cliente:",
                        value = "${CalculationEngine.formatMoney(previousDebtBd)} MXN",
                        highlightColor = OnSurfaceVariant,
                    )
                    HorizontalDivider(color = Primary.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 8.dp))
                    SummaryMoneyRow(
                        label = "4. TOTAL ACUMULADO PENDIENTE:",
                        value = "${CalculationEngine.formatMoney(totalAccumulatedBd)} MXN",
                        highlightColor = Secondary,
                        isBig = true,
                    )
                } else {
                    Spacer(Modifier.height(6.dp))
                    SummaryMoneyRow(
                        label = "Importe pagado de contado:",
                        value = "${CalculationEngine.formatMoney(finalBd)} MXN",
                        highlightColor = PrimaryGlow,
                        isBig = true,
                    )
                    SummaryMoneyRow(
                        label = "Deuda anterior del cliente:",
                        value = "${CalculationEngine.formatMoney(previousDebtBd)} MXN",
                        highlightColor = OnSurfaceVariant,
                    )
                }
            }

            if (draft.paymentMethod == PaymentMethod.CREDITO) {
                AuroraCard(contentPadding = PaddingValues(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.Draw, contentDescription = null, tint = Secondary)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Al deslizar para pagar a crédito se abrirá la pizarra digital para recabar la firma obligatoria del cliente.",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            // ÚNICO control de confirmación de pago (deslizador izquierda a derecha)
            SlideToPayControl(
                enabled = calc.isValid && client != null,
                label = "«Desliza para pagar»",
                onSlideConfirmed = {
                    if (draft.paymentMethod == PaymentMethod.CONTADO) {
                        onConfirmContado()
                    } else {
                        onProceedToCreditSignature()
                    }
                },
            )
        }
    }
}

@Composable
private fun SummaryMoneyRow(
    label: String,
    value: String,
    highlightColor: androidx.compose.ui.graphics.Color,
    isBig: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = if (isBig) MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold) else MaterialTheme.typography.bodyMedium,
            color = OnSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            fontFamily = SpaceMonoFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = if (isBig) 18.sp else 14.sp,
            color = highlightColor,
        )
    }
}

@Composable
fun FirmaDigitalScreen(
    clientName: String,
    pendingAmountMxn: BigDecimal,
    onBack: () -> Unit,
    onConfirmSignature: (Bitmap) -> Unit,
) {
    val controller = remember { SignaturePadController() }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Firma Digital",
            subtitle = "Compromiso de Crédito • $clientName",
            showDrawerMenu = false,
            onMenuOrBackClick = onBack,
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            AuroraCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text("CLIENTE", style = MaterialTheme.typography.labelSmall, color = OnSurfaceVariant)
                        Text(clientName, style = MaterialTheme.typography.titleMedium, color = OnSurface)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("SALDO DE ENTREGA", style = MaterialTheme.typography.labelSmall, color = OnSurfaceVariant)
                        Text(
                            text = "${CalculationEngine.formatMoney(pendingAmountMxn)} MXN",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = Secondary,
                        )
                    }
                }
            }

            AuroraCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Pizarra de Firma del Cliente",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                    )
                    AuroraOutlinedButton(
                        text = "Limpiar",
                        icon = Icons.Default.DeleteSweep,
                        onClick = { controller.clear() },
                        accentColor = Secondary,
                        testTag = "clear_signature_button",
                    )
                }
                Spacer(Modifier.height(10.dp))
                SignaturePadCanvas(controller = controller)
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "\"${stringResource(R.string.credit_commitment_legend)}\"",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            AuroraPrimaryButton(
                text = "Confirmar Firma y Emitir Ticket",
                icon = Icons.Default.CheckCircle,
                enabled = controller.hasSignature,
                onClick = {
                    val bmp = controller.renderToBitmap()
                    if (bmp != null) {
                        onConfirmSignature(bmp)
                    }
                },
                testTag = "confirm_signature_button",
            )
        }
    }
}
