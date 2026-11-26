package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.domain.CalculationEngine
import com.example.domain.PaymentMethod
import com.example.ui.components.AuroraCard
import com.example.ui.components.AuroraConfirmationDialog
import com.example.ui.components.AuroraEmptyState
import com.example.ui.components.AuroraOutlinedButton
import com.example.ui.components.AuroraPrimaryButton
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.AuroraTextField
import com.example.ui.components.AuroraTopBar
import com.example.ui.theme.Error
import com.example.ui.theme.OnPrimary
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.viewmodel.ClientWithDebt
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ClientesScreen(
    clients: List<ClientWithDebt>,
    settings: BusinessSettingsEntity,
    onOpenDrawer: () -> Unit,
    onOpenClientProfile: (Long) -> Unit,
    onSaveClient: (id: Long, name: String, phone: String, address: String, specialPrice: String, onSaved: () -> Unit) -> Unit,
    onDeleteClient: (ClientEntity) -> Unit,
    allowOwnerEdits: Boolean = true,
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableIntStateOf(0) } // 0=Todos, 1=Con Deuda, 2=Tarifa Especial
    var showFormDialog by remember { mutableStateOf(false) }
    var editingClient by remember { mutableStateOf<ClientEntity?>(null) }
    var clientToDelete by remember { mutableStateOf<ClientEntity?>(null) }

    val filtered = remember(clients, searchQuery, selectedFilter) {
        val q = searchQuery.trim().lowercase(Locale.getDefault())
        clients.filter { item ->
            val matchesQuery = q.isEmpty() ||
                item.client.name.lowercase(Locale.getDefault()).contains(q) ||
                item.client.address.lowercase(Locale.getDefault()).contains(q) ||
                item.client.phone.lowercase(Locale.getDefault()).contains(q)
            val matchesFilter = when (selectedFilter) {
                1 -> item.activeDebtMxn > 0.0
                2 -> item.client.specialPricePerKg != null
                else -> true
            }
            matchesQuery && matchesFilter
        }
    }

    val totalReceivable = remember(clients) {
        clients.fold(BigDecimal.ZERO) { acc, c -> acc.add(BigDecimal.valueOf(c.activeDebtMxn)) }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Clientes",
            subtitle = "${clients.size} registrados • Cobranza local",
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (allowOwnerEdits) item {
                AuroraPrimaryButton(
                    text = "Registrar Cliente",
                    icon = Icons.Default.PersonAdd,
                    onClick = {
                        editingClient = null
                        showFormDialog = true
                    },
                    testTag = "add_client_button",
                )
            }

            item {
                AuroraTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = "Buscar cliente, dirección o teléfono",
                    leadingIcon = Icons.Default.Search,
                    testTag = "search_clients_input",
                    modifier = Modifier.widthIn(max = 600.dp),
                )
            }

            item {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val chips = listOf(
                        "Todos (${clients.size})",
                        "Con Saldo (${clients.count { it.activeDebtMxn > 0.0 }})",
                        "Tarifa Especial (${clients.count { it.client.specialPricePerKg != null }})",
                    )
                    items(chips.size) { index ->
                        FilterChip(
                            selected = selectedFilter == index,
                            onClick = { selectedFilter = index },
                            label = { Text(chips[index]) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Primary.copy(alpha = 0.2f),
                                selectedLabelColor = Primary,
                                containerColor = SurfaceContainerLow,
                                labelColor = OnSurfaceVariant,
                            ),
                        )
                    }
                }
            }

            if (clients.isNotEmpty()) {
                item {
                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "TOTAL POR COBRAR",
                                style = MaterialTheme.typography.labelMedium,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = "${CalculationEngine.formatMoney(totalReceivable)} MXN",
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                color = Secondary,
                            )
                        }
                    }
                }
            }

            if (filtered.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.Store,
                        title = if (clients.isEmpty()) "Aún no hay clientes registrados" else "Sin resultados",
                        subtitle = if (clients.isEmpty() && allowOwnerEdits) {
                            "Presiona 'Registrar Cliente' para agregar el primer negocio o cliente."
                        } else if (clients.isEmpty()) {
                            "Este teléfono aún no descargó el catálogo de Windows."
                        } else {
                            "Intenta con otro nombre, calle o filtro."
                        },
                    )
                }
            } else {
                items(filtered, key = { it.client.id }) { item ->
                    ClientListCard(
                        item = item,
                        globalPrice = settings.globalPricePerKg,
                        onClick = { onOpenClientProfile(item.client.id) },
                        onEdit = {
                            editingClient = item.client
                            showFormDialog = true
                        },
                        onDelete = { clientToDelete = item.client },
                        showAdminActions = allowOwnerEdits,
                    )
                }
            }
        }
    }

    if (showFormDialog) {
        ClientFormDialog(
            initialClient = editingClient,
            globalPrice = settings.globalPricePerKg,
            onDismiss = { showFormDialog = false },
            onSave = { name, phone, address, specialPrice ->
                onSaveClient(editingClient?.id ?: 0L, name, phone, address, specialPrice) {
                    showFormDialog = false
                }
            },
        )
    }

    clientToDelete?.let { target ->
        AuroraConfirmationDialog(
            title = "Eliminar cliente",
            message = "¿Eliminar a ${target.name}? Esta acción solo es posible si no tiene entregas registradas.",
            confirmText = "Eliminar",
            dismissText = "Cancelar",
            isDangerConfirm = true,
            onConfirm = {
                onDeleteClient(target)
                clientToDelete = null
            },
            onDismiss = { clientToDelete = null },
        )
    }
}

@Composable
private fun ClientListCard(
    item: ClientWithDebt,
    globalPrice: Double,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    showAdminActions: Boolean,
) {
    val client = item.client
    val tariff = client.specialPricePerKg ?: globalPrice
    AuroraCard(
        onClick = onClick,
        modifier = Modifier.testTag("client_card_${client.id}"),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Secondary.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = Icons.Default.Store, contentDescription = null, tint = Secondary)
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = client.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = OnSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = client.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (client.phone.isNotBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.size(13.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = client.phone,
                            style = MaterialTheme.typography.bodySmall,
                            color = Primary,
                        )
                    }
                }
            }
            if (showAdminActions) {
                IconButton(onClick = onEdit, modifier = Modifier.size(48.dp)) {
                    Icon(imageVector = Icons.Default.Edit, contentDescription = "Editar cliente", tint = Primary)
                }
                if (item.deliveryCount == 0) {
                    IconButton(onClick = onDelete, modifier = Modifier.size(48.dp)) {
                        Icon(imageVector = Icons.Default.DeleteOutline, contentDescription = "Eliminar cliente", tint = Error)
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        HorizontalDivider(color = Primary.copy(alpha = 0.12f))
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AuroraStatusBadge(
                text = if (client.specialPricePerKg != null) {
                    "Especial: ${CalculationEngine.formatMoney(tariff)}/kg"
                } else {
                    "Global: ${CalculationEngine.formatMoney(tariff)}/kg"
                },
                tint = if (client.specialPricePerKg != null) Primary else OnSurfaceVariant,
            )
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = if (item.activeDebtMxn > 0.0) "SALDO PENDIENTE" else "ESTADO DE CUENTA",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                )
                Text(
                    text = if (item.activeDebtMxn > 0.0) {
                        "${CalculationEngine.formatMoney(item.activeDebtMxn)} MXN"
                    } else {
                        "Al corriente"
                    },
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (item.activeDebtMxn > 0.0) Secondary else PrimaryGlow,
                )
            }
        }
    }
}

@Composable
private fun ClientFormDialog(
    initialClient: ClientEntity?,
    globalPrice: Double,
    onDismiss: () -> Unit,
    onSave: (name: String, phone: String, address: String, specialPrice: String) -> Unit,
) {
    var name by remember { mutableStateOf(initialClient?.name ?: "") }
    var phone by remember { mutableStateOf(initialClient?.phone ?: "") }
    var address by remember { mutableStateOf(initialClient?.address ?: "") }
    var specialPrice by remember {
        mutableStateOf(initialClient?.specialPricePerKg?.toString() ?: "")
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = {
            Text(
                text = if (initialClient == null) "Registrar Cliente" else "Editar Cliente",
                style = MaterialTheme.typography.headlineSmall,
                color = OnSurface,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AuroraTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = "Nombre o negocio *",
                    testTag = "client_name_input",
                )
                AuroraTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = "Teléfono (opcional)",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    testTag = "client_phone_input",
                )
                AuroraTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = "Dirección *",
                    singleLine = false,
                    testTag = "client_address_input",
                )
                AuroraTextField(
                    value = specialPrice,
                    onValueChange = { specialPrice = it },
                    label = "Precio especial MXN/kg (opcional)",
                    placeholder = "Global actual: ${CalculationEngine.formatMoney(globalPrice)}",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    testTag = "client_special_price_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name, phone, address, specialPrice) },
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("save_client_confirm_button"),
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

@Composable
fun PerfilClienteScreen(
    client: ClientEntity?,
    deliveries: List<DeliveryEntity>,
    abonos: List<AbonoEntity>,
    settings: BusinessSettingsEntity,
    onBack: () -> Unit,
    onStartNewDeliveryForClient: (Long) -> Unit,
    onRecordAbono: (clientId: Long, deliveryId: Long, amount: String, note: String, onDone: () -> Unit) -> Unit,
    onOpenTicket: (Long) -> Unit,
) {
    if (client == null) {
        Column(modifier = Modifier.fillMaxSize()) {
            AuroraTopBar(
                title = "Perfil del Cliente",
                showDrawerMenu = false,
                onMenuOrBackClick = onBack,
            )
            Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
                AuroraEmptyState(
                    icon = Icons.Default.Store,
                    title = "Cliente no encontrado",
                    subtitle = "El cliente pudo haber sido eliminado.",
                )
            }
        }
        return
    }

    val activeDeliveriesWithDebt = remember(deliveries) {
        deliveries.filter { it.status == "ACTIVA" && it.pendingBalanceMxn > 0.0 }
    }
    val totalPendingDebt = remember(activeDeliveriesWithDebt) {
        activeDeliveriesWithDebt.fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }
    }
    val effectiveTariff = client.specialPricePerKg ?: settings.globalPricePerKg
    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("es", "MX")) }
    var showAbonoDialog by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Perfil del Cliente",
            subtitle = client.name,
            showDrawerMenu = false,
            onMenuOrBackClick = onBack,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                AuroraCard {
                    Text(
                        text = client.name,
                        style = MaterialTheme.typography.headlineMedium,
                        color = OnSurface,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = client.address,
                        style = MaterialTheme.typography.bodyMedium,
                        color = OnSurfaceVariant,
                    )
                    if (client.phone.isNotBlank()) {
                        Text(
                            text = "Tel: ${client.phone}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Primary,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    AuroraStatusBadge(
                        text = if (client.specialPricePerKg != null) {
                            "Tarifa Especial: ${CalculationEngine.formatMoney(effectiveTariff)} MXN/kg"
                        } else {
                            "Tarifa Global: ${CalculationEngine.formatMoney(effectiveTariff)} MXN/kg"
                        },
                        tint = if (client.specialPricePerKg != null) Secondary else Primary,
                    )
                }
            }

            // Total acumulado pendiente + Registro de abono
            item {
                AuroraCard {
                    Text(
                        text = "TOTAL ACUMULADO PENDIENTE",
                        style = MaterialTheme.typography.labelMedium,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${CalculationEngine.formatMoney(totalPendingDebt)} MXN",
                        style = MaterialTheme.typography.displayLarge.copy(fontSize = 30.spWithFallback()),
                        color = if (totalPendingDebt > BigDecimal.ZERO) Secondary else PrimaryGlow,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = if (activeDeliveriesWithDebt.isEmpty()) {
                            "Sin adeudos activos"
                        } else {
                            "${activeDeliveriesWithDebt.size} nota(s) con saldo pendiente"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    if (activeDeliveriesWithDebt.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        AuroraOutlinedButton(
                            text = "Registrar Abono a Deuda",
                            icon = Icons.Default.Payments,
                            onClick = { showAbonoDialog = true },
                            accentColor = Secondary,
                            modifier = Modifier.fillMaxWidth(),
                            testTag = "record_abono_button",
                        )
                    }
                }
            }

            // Acceso único aprobado desde Perfil del cliente para iniciar nueva entrega
            item {
                AuroraPrimaryButton(
                    text = "Iniciar Nueva Entrega",
                    icon = Icons.Default.AddCircleOutline,
                    onClick = { onStartNewDeliveryForClient(client.id) },
                    testTag = "start_delivery_from_profile_button",
                )
            }

            // Deudas por entrega activa
            if (activeDeliveriesWithDebt.isNotEmpty()) {
                item {
                    Text(
                        text = "Entregas con Saldo Pendiente",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                        modifier = Modifier
                            .fillMaxWidth()
                            .widthIn(max = 600.dp),
                    )
                }
                items(activeDeliveriesWithDebt, key = { "debt_${it.id}" }) { d ->
                    AuroraCard(
                        onClick = { onOpenTicket(d.id) },
                        contentPadding = PaddingValues(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = d.folio,
                                style = MaterialTheme.typography.titleSmall,
                                color = Primary,
                            )
                            Text(
                                text = "Pendiente: ${CalculationEngine.formatMoney(d.pendingBalanceMxn)} MXN",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = Secondary,
                            )
                        }
                        Text(
                            text = "Importe original: ${CalculationEngine.formatMoney(d.finalAmountMxn)} MXN • ${dateFmt.format(Date(d.dateMillis))}",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            }

            // Abonos registrados
            item {
                Text(
                    text = "Abonos Registrados (${abonos.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }
            if (abonos.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.Payments,
                        title = "Sin abonos registrados",
                        subtitle = "Los abonos aplicados a entregas a crédito aparecerán aquí.",
                    )
                }
            } else {
                items(abonos, key = { "abono_${it.id}" }) { ab ->
                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Abono a ${ab.deliveryFolio}",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = OnSurface,
                                )
                                Text(
                                    text = dateFmt.format(Date(ab.dateMillis)) +
                                        if (ab.note.isNotBlank()) " • ${ab.note}" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = OnSurfaceVariant,
                                )
                            }
                            Text(
                                text = "-${CalculationEngine.formatMoney(ab.amountMxn)} MXN",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = PrimaryGlow,
                            )
                        }
                    }
                }
            }

            // Historial completo de entregas
            item {
                Text(
                    text = "Historial de Entregas (${deliveries.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }
            if (deliveries.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.Receipt,
                        title = "Sin entregas registradas",
                        subtitle = "Presiona 'Iniciar Nueva Entrega' para registrar la primera entrega.",
                    )
                }
            } else {
                items(deliveries, key = { "del_${it.id}" }) { d ->
                    AuroraCard(
                        onClick = { onOpenTicket(d.id) },
                        contentPadding = PaddingValues(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = d.folio,
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = Primary,
                            )
                            AuroraStatusBadge(
                                text = if (d.status == "CANCELADA") "CANCELADO" else PaymentMethod.fromDb(d.paymentMethod).label,
                                tint = if (d.status == "CANCELADA") Error else PrimaryGlow,
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        val totalKg = d.netWeightKg + (d.sugarSacks * d.sugarSackWeightKg)
                        val detailParts = buildList {
                            if (d.boxes > 0.0) add("${CalculationEngine.formatExactBoxes(d.boxes)} cajas")
                            if (d.sugarSacks > 0.0) add("${CalculationEngine.formatExactBoxes(d.sugarSacks)} bto azúcar")
                            add("${CalculationEngine.formatExactWeight(totalKg)} kg netos")
                            add(d.brand)
                        }
                        Text(
                            text = detailParts.joinToString(" • "),
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = dateFmt.format(Date(d.dateMillis)),
                                style = MaterialTheme.typography.labelSmall,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = "${CalculationEngine.formatMoney(d.finalAmountMxn)} MXN",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = OnSurface,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAbonoDialog && activeDeliveriesWithDebt.isNotEmpty()) {
        AbonoDialog(
            deliveries = activeDeliveriesWithDebt,
            onDismiss = { showAbonoDialog = false },
            onConfirm = { deliveryId, amountText, note ->
                onRecordAbono(client.id, deliveryId, amountText, note) {
                    showAbonoDialog = false
                }
            },
        )
    }
}

@Composable
private fun Int.spWithFallback() = androidx.compose.ui.unit.TextUnit(this.toFloat(), androidx.compose.ui.unit.TextUnitType.Sp)

@Composable
private fun AbonoDialog(
    deliveries: List<DeliveryEntity>,
    onDismiss: () -> Unit,
    onConfirm: (deliveryId: Long, amountText: String, note: String) -> Unit,
) {
    var selectedDeliveryId by remember { mutableStateOf(deliveries.first().id) }
    var amountText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val selectedDelivery = deliveries.firstOrNull { it.id == selectedDeliveryId } ?: deliveries.first()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = { Text("Registrar Abono", color = OnSurface) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Selecciona la nota a abonar:",
                    style = MaterialTheme.typography.labelMedium,
                    color = OnSurfaceVariant,
                )
                deliveries.forEach { d ->
                    val selected = d.id == selectedDelivery.id
                    Surface(
                        onClick = { selectedDeliveryId = d.id },
                        shape = RoundedCornerShape(12.dp),
                        color = if (selected) Primary.copy(alpha = 0.16f) else SurfaceContainerLow,
                        border = BorderStroke(1.dp, if (selected) Primary else OnSurfaceVariant.copy(alpha = 0.2f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(d.folio, color = OnSurface, style = MaterialTheme.typography.labelLarge)
                            Text(
                                "${CalculationEngine.formatMoney(d.pendingBalanceMxn)} MXN",
                                color = Secondary,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }
                AuroraTextField(
                    value = amountText,
                    onValueChange = { amountText = it },
                    label = "Monto del abono (MXN)",
                    placeholder = "Máximo: ${CalculationEngine.formatMoney(selectedDelivery.pendingBalanceMxn)}",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    testTag = "abono_amount_input",
                )
                AuroraTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = "Nota (opcional)",
                    testTag = "abono_note_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(selectedDelivery.id, amountText, note) },
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("confirm_abono_button"),
            ) {
                Text("Aplicar Abono")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Cancelar", color = Secondary)
            }
        },
    )
}
