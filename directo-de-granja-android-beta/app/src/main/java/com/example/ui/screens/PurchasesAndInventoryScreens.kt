package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.R
import com.example.BuildConfig
import com.example.data.local.entity.EggPurchaseEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.data.local.entity.SugarInventoryEntity
import com.example.data.local.entity.SugarPurchaseEntity
import com.example.domain.CalculationEngine
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraEmptyState
import com.example.ui.components.AuroraOutlinedButton
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
import com.example.ui.theme.SurfaceContainerLowest
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private sealed interface PurchaseHistoryEntry {
    val sortDateMillis: Long
    val sortCreatedMillis: Long
    val keyId: String

    data class Egg(val item: EggPurchaseEntity) : PurchaseHistoryEntry {
        override val sortDateMillis: Long get() = item.purchaseDateMillis
        override val sortCreatedMillis: Long get() = item.createdAtMillis
        override val keyId: String get() = "egg_${item.id}"
    }

    data class Sugar(val item: SugarPurchaseEntity) : PurchaseHistoryEntry {
        override val sortDateMillis: Long get() = item.purchaseDateMillis
        override val sortCreatedMillis: Long get() = item.createdAtMillis
        override val keyId: String get() = "sugar_${item.id}"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComprasHuevoScreen(
    purchases: List<EggPurchaseEntity>,
    sugarPurchases: List<SugarPurchaseEntity>,
    inventoryBrands: List<InventoryBrandEntity>,
    onOpenDrawer: () -> Unit,
    onRegisterPurchase: (dateMillis: Long, boxesText: String, brand: String, grossWeightText: String, onSuccess: () -> Unit) -> Unit,
    onRegisterSugarPurchase: (dateMillis: Long, sacksText: String, totalWeightText: String, onSuccess: () -> Unit) -> Unit,
) {
    var selectedDateMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var showDatePicker by remember { mutableStateOf(false) }
    var isSugarMode by remember { mutableStateOf(false) }
    var brandInput by remember { mutableStateOf("") }
    var boxesInput by remember { mutableStateOf("") }
    var grossWeightInput by remember { mutableStateOf("") }
    var sugarSacksInput by remember { mutableStateOf("") }
    var sugarWeightInput by remember { mutableStateOf("") }

    val suggestedBrands = remember(inventoryBrands) {
        inventoryBrands.map { it.brand }.distinct()
    }
    val combinedHistory = remember(purchases, sugarPurchases) {
        (purchases.map { PurchaseHistoryEntry.Egg(it) } + sugarPurchases.map { PurchaseHistoryEntry.Sugar(it) })
            .sortedWith(compareByDescending<PurchaseHistoryEntry> { it.sortDateMillis }.thenByDescending { it.sortCreatedMillis })
    }
    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX")) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Compras de Huevo y Azúcar",
            subtitle = "Registro de entradas a inventario",
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
                AuroraCard(contentPadding = PaddingValues(14.dp)) {
                    Text(
                        text = "Solo registro físico de inventario (huevo por marca/cajas/peso bruto o bultos de azúcar/peso total). No se capturan importes monetarios.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                }
            }

            item {
                AuroraCard {
                    Text(
                        text = "Registrar Compra a Proveedor",
                        style = MaterialTheme.typography.titleLarge,
                        color = OnSurface,
                    )
                    Spacer(Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Surface(
                            onClick = { isSugarMode = false },
                            shape = RoundedCornerShape(14.dp),
                            color = if (!isSugarMode) Primary else SurfaceContainerLowest,
                            border = BorderStroke(1.dp, if (!isSugarMode) Primary else OutlineVariant),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .testTag("purchase_mode_egg"),
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp)) {
                                Text(
                                    text = "Huevo",
                                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                    color = if (!isSugarMode) OnPrimary else OnSurface,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                        Surface(
                            onClick = { isSugarMode = true },
                            shape = RoundedCornerShape(14.dp),
                            color = if (isSugarMode) Primary else SurfaceContainerLowest,
                            border = BorderStroke(1.dp, if (isSugarMode) Primary else OutlineVariant),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .testTag("purchase_mode_sugar"),
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp)) {
                                Text(
                                    text = "Bultos de azúcar",
                                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                    color = if (isSugarMode) OnPrimary else OnSurface,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    AuroraOutlinedButton(
                        text = "Fecha de compra: ${dateFmt.format(Date(selectedDateMillis))}",
                        icon = Icons.Default.CalendarMonth,
                        onClick = { showDatePicker = true },
                        modifier = Modifier.fillMaxWidth(),
                        testTag = "purchase_date_button",
                    )

                    Spacer(Modifier.height(10.dp))

                    if (!isSugarMode) {
                        Text(
                            text = "Marca",
                            style = MaterialTheme.typography.labelMedium,
                            color = OnSurfaceVariant,
                        )
                        Spacer(Modifier.height(6.dp))
                        if (suggestedBrands.isNotEmpty()) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(suggestedBrands) { brand ->
                                    FilterChip(
                                        selected = brandInput.equals(brand, ignoreCase = true),
                                        onClick = { brandInput = brand },
                                        label = { Text(brand) },
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

                        Spacer(Modifier.height(8.dp))
                        AuroraTextField(
                            value = brandInput,
                            onValueChange = { brandInput = it },
                            label = "Nombre de la marca *",
                            testTag = "purchase_brand_input",
                        )

                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            AuroraTextField(
                                value = boxesInput,
                                onValueChange = { boxesInput = it },
                                label = "Cajas (decimales) *",
                                suffixText = "cjs",
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f),
                                testTag = "purchase_boxes_input",
                            )
                            AuroraTextField(
                                value = grossWeightInput,
                                onValueChange = { grossWeightInput = it },
                                label = "Peso bruto total *",
                                suffixText = "kg",
                                leadingIcon = Icons.Default.Scale,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1.2f),
                                testTag = "purchase_weight_input",
                            )
                        }

                        Spacer(Modifier.height(14.dp))
                        AuroraPrimaryButton(
                            text = "Registrar Entrada al Inventario",
                            icon = Icons.Default.AddShoppingCart,
                            onClick = {
                                onRegisterPurchase(selectedDateMillis, boxesInput, brandInput, grossWeightInput) {
                                    boxesInput = ""
                                    grossWeightInput = ""
                                }
                            },
                            testTag = "save_purchase_button",
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            AuroraTextField(
                                value = sugarSacksInput,
                                onValueChange = { sugarSacksInput = it },
                                label = "Bultos de azúcar *",
                                suffixText = "bto",
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f),
                                testTag = "purchase_sugar_sacks_input",
                            )
                            AuroraTextField(
                                value = sugarWeightInput,
                                onValueChange = { sugarWeightInput = it },
                                label = "Peso total *",
                                suffixText = "kg",
                                leadingIcon = Icons.Default.Scale,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1.2f),
                                testTag = "purchase_sugar_weight_input",
                            )
                        }

                        Spacer(Modifier.height(14.dp))
                        AuroraPrimaryButton(
                            text = "Registrar Entrada de Azúcar",
                            icon = Icons.Default.AddShoppingCart,
                            onClick = {
                                onRegisterSugarPurchase(selectedDateMillis, sugarSacksInput, sugarWeightInput) {
                                    sugarSacksInput = ""
                                    sugarWeightInput = ""
                                }
                            },
                            testTag = "save_sugar_purchase_button",
                        )
                    }
                }
            }

            item {
                Text(
                    text = "Historial de Compras (${combinedHistory.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (combinedHistory.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.AddShoppingCart,
                        title = "Sin compras registradas",
                        subtitle = "Registra una compra de huevo o bultos de azúcar arriba para actualizar el inventario.",
                    )
                }
            } else {
                items(combinedHistory, key = { it.keyId }) { entry ->
                    when (entry) {
                        is PurchaseHistoryEntry.Egg -> {
                            val p = entry.item
                            AuroraCard(contentPadding = PaddingValues(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = p.brand,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = OnSurface,
                                        )
                                        Text(
                                            text = "Fecha: ${dateFmt.format(Date(p.purchaseDateMillis))}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = OnSurfaceVariant,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "+${CalculationEngine.formatExactBoxes(p.boxes)} cajas",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                            color = PrimaryGlow,
                                        )
                                        Text(
                                            text = "${CalculationEngine.formatExactWeight(p.grossWeightKg)} kg brutos",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Secondary,
                                        )
                                    }
                                }
                            }
                        }
                        is PurchaseHistoryEntry.Sugar -> {
                            val sp = entry.item
                            AuroraCard(contentPadding = PaddingValues(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Azúcar (Bultos)",
                                            style = MaterialTheme.typography.titleMedium,
                                            color = OnSurface,
                                        )
                                        Text(
                                            text = "Fecha: ${dateFmt.format(Date(sp.purchaseDateMillis))}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = OnSurfaceVariant,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "+${CalculationEngine.formatExactBoxes(sp.sacks)} bultos",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                            color = PrimaryGlow,
                                        )
                                        Text(
                                            text = "${CalculationEngine.formatExactWeight(sp.totalWeightKg)} kg totales",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Secondary,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDatePicker) {
        val state = rememberDatePickerState(initialSelectedDateMillis = selectedDateMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.selectedDateMillis?.let { selectedDateMillis = it }
                        showDatePicker = false
                    },
                ) {
                    Text("Aceptar", color = Primary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancelar", color = Secondary)
                }
            },
        ) {
            DatePicker(state = state)
        }
    }
}

@Composable
fun InventarioScreen(
    inventoryBrands: List<InventoryBrandEntity>,
    purchases: List<EggPurchaseEntity>,
    sugarInventory: SugarInventoryEntity,
    sugarPurchases: List<SugarPurchaseEntity>,
    onOpenDrawer: () -> Unit,
) {
    val totalAvailable = remember(inventoryBrands) {
        inventoryBrands.fold(BigDecimal.ZERO) { acc, b -> acc.add(BigDecimal.valueOf(b.availableBoxes)) }
    }
    val totalDelivered = remember(inventoryBrands) {
        inventoryBrands.fold(BigDecimal.ZERO) { acc, b -> acc.add(BigDecimal.valueOf(b.deliveredBoxes)) }
    }
    val totalRemaining = remember(totalAvailable, totalDelivered) {
        totalAvailable.subtract(totalDelivered)
    }
    val combinedPurchases = remember(purchases, sugarPurchases) {
        (purchases.map { PurchaseHistoryEntry.Egg(it) } + sugarPurchases.map { PurchaseHistoryEntry.Sugar(it) })
            .sortedWith(compareByDescending<PurchaseHistoryEntry> { it.sortDateMillis }.thenByDescending { it.sortCreatedMillis })
    }
    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX")) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Inventario",
            subtitle = "Existencias fraccionadas exactas",
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Resumen exacto de cajas disponibles, entregadas y restantes (sin alertas de stock bajo ni mermas)
            item {
                AuroraCard {
                    Text(
                        text = "CANTIDAD RESTANTE EN INVENTARIO (HUEVO)",
                        style = MaterialTheme.typography.labelSmall,
                        color = Primary,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${CalculationEngine.formatExactBoxes(totalRemaining)} Cajas",
                        style = MaterialTheme.typography.displayLarge,
                        color = OnSurface,
                        modifier = Modifier.testTag("inventory_remaining_boxes"),
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            color = SurfaceContainerLowest,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Cajas Disponibles (Entradas)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = OnSurfaceVariant,
                                )
                                Text(
                                    text = "${CalculationEngine.formatExactBoxes(totalAvailable)} cjs",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = PrimaryGlow,
                                )
                            }
                        }
                        Surface(
                            color = SurfaceContainerLowest,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Cajas Entregadas",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = OnSurfaceVariant,
                                )
                                Text(
                                    text = "${CalculationEngine.formatExactBoxes(totalDelivered)} cjs",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = Secondary,
                                )
                            }
                        }
                    }
                }
            }

            // Inventario de Azúcar (Bultos y Kilogramos)
            item {
                AuroraCard(modifier = Modifier.testTag("sugar_inventory_card")) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "INVENTARIO DE AZÚCAR (BULTOS)",
                            style = MaterialTheme.typography.labelSmall,
                            color = Secondary,
                        )
                        AuroraStatusBadge(
                            text = "${CalculationEngine.formatExactWeight(sugarInventory.remainingWeightKg)} kg",
                            tint = Secondary,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${CalculationEngine.formatExactBoxes(sugarInventory.remainingSacks)} Bultos",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = OnSurface,
                        modifier = Modifier.testTag("sugar_inventory_remaining_text"),
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            color = SurfaceContainerLowest,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Entradas (Bultos / Kg)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = OnSurfaceVariant,
                                )
                                Text(
                                    text = "${CalculationEngine.formatExactBoxes(sugarInventory.availableSacks)} bto • ${CalculationEngine.formatExactWeight(sugarInventory.availableWeightKg)} kg",
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                    color = PrimaryGlow,
                                )
                            }
                        }
                        Surface(
                            color = SurfaceContainerLowest,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Entregado (Bultos / Kg)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = OnSurfaceVariant,
                                )
                                Text(
                                    text = "${CalculationEngine.formatExactBoxes(sugarInventory.deliveredSacks)} bto • ${CalculationEngine.formatExactWeight(sugarInventory.deliveredWeightKg)} kg",
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                    color = Secondary,
                                )
                            }
                        }
                    }
                }
            }

            // Imagen de almacén
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp)
                        .height(130.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .border(1.dp, Primary.copy(alpha = 0.25f), RoundedCornerShape(20.dp)),
                ) {
                    Image(
                        painter = painterResource(R.drawable.img_eggs_warehouse),
                        contentDescription = "Almacén ${BuildConfig.BRAND_APP_NAME}",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color(0x220A141E), Color(0xDD0A141E)),
                                ),
                            ),
                    )
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(14.dp),
                    ) {
                        Text(
                            text = "Control Fraccionado por Marca",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                        Text(
                            text = "Actualización automática en compras, entregas y cancelaciones",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            }

            // Existencias por marca
            item {
                Text(
                    text = "Existencias por Marca (${inventoryBrands.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (inventoryBrands.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.Inventory2,
                        title = "Inventario vacío",
                        subtitle = "Las existencias se actualizarán automáticamente al registrar compras de huevo.",
                    )
                }
            } else {
                val maxPositive = inventoryBrands.maxOfOrNull { it.availableBoxes.coerceAtLeast(1.0) } ?: 1.0
                items(inventoryBrands, key = { it.brand }) { item ->
                    val ratio = (item.remainingBoxes.coerceAtLeast(0.0) / maxPositive).toFloat().coerceIn(0f, 1f)
                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.brand,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = OnSurface,
                                )
                                Text(
                                    text = "Disp: ${CalculationEngine.formatExactBoxes(item.availableBoxes)} • Entregadas: ${CalculationEngine.formatExactBoxes(item.deliveredBoxes)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = OnSurfaceVariant,
                                )
                            }
                            AuroraStatusBadge(
                                text = "${CalculationEngine.formatExactBoxes(item.remainingBoxes)} cjs",
                                tint = PrimaryGlow,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
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

            // Compras registradas (solo lectura, sin botones duplicados a Compras)
            item {
                Text(
                    text = "Compras Registradas (${combinedPurchases.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (combinedPurchases.isEmpty()) {
                item {
                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Text(
                            text = "No hay compras registradas hasta el momento.",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            } else {
                items(combinedPurchases, key = { "inv_${it.keyId}" }) { entry ->
                    when (entry) {
                        is PurchaseHistoryEntry.Egg -> {
                            val p = entry.item
                            AuroraCard(contentPadding = PaddingValues(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(p.brand, style = MaterialTheme.typography.titleSmall, color = OnSurface)
                                        Text(dateFmt.format(Date(p.purchaseDateMillis)), style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "+${CalculationEngine.formatExactBoxes(p.boxes)} cjs",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                            color = Primary,
                                        )
                                        Text(
                                            text = "${CalculationEngine.formatExactWeight(p.grossWeightKg)} kg",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Secondary,
                                        )
                                    }
                                }
                            }
                        }
                        is PurchaseHistoryEntry.Sugar -> {
                            val sp = entry.item
                            AuroraCard(contentPadding = PaddingValues(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text("Azúcar (Bultos)", style = MaterialTheme.typography.titleSmall, color = OnSurface)
                                        Text(dateFmt.format(Date(sp.purchaseDateMillis)), style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "+${CalculationEngine.formatExactBoxes(sp.sacks)} bto",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                            color = Primary,
                                        )
                                        Text(
                                            text = "${CalculationEngine.formatExactWeight(sp.totalWeightKg)} kg",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Secondary,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
