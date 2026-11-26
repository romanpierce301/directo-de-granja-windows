package com.example.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AlarmAdd
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LockClock
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.ReminderEntity
import com.example.domain.CalculationEngine
import com.example.domain.PaymentMethod
import com.example.ui.components.AuroraCard
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
import com.example.ui.theme.SurfaceContainerLowest
import com.example.ui.viewmodel.ClientWithDebt
import org.json.JSONArray
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@Composable
fun RecordatoriosScreen(
    reminders: List<ReminderEntity>,
    clients: List<ClientWithDebt>,
    onOpenDrawer: () -> Unit,
    onSaveReminder: (id: Long, clientId: Long, clientName: String, dateMillis: Long, boxesNote: String, note: String, onSaved: () -> Unit) -> Unit,
    onToggleCompleted: (ReminderEntity) -> Unit,
    onDeleteReminder: (ReminderEntity) -> Unit,
) {
    val context = LocalContext.current
    var showForm by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ReminderEntity?>(null) }
    var filterTab by remember { mutableIntStateOf(0) } // 0=Pendientes, 1=Completados

    val notifPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ ->
        showForm = true
    }

    fun requestNotifThenOpenForm(target: ReminderEntity?) {
        editing = target
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                showForm = true
            } else {
                notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            showForm = true
        }
    }

    val filtered = remember(reminders, filterTab) {
        if (filterTab == 0) reminders.filter { !it.isCompleted } else reminders.filter { it.isCompleted }
    }
    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX")) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Recordatorios",
            subtitle = "Fechas especiales de entrega • Offline",
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.NotificationsActive, contentDescription = null, tint = Secondary)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Notificación local programada la noche anterior (20:00) y alerta al abrir la aplicación el día correspondiente.",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    }
                }
            }

            item {
                AuroraPrimaryButton(
                    text = "Nuevo Recordatorio",
                    icon = Icons.Default.AlarmAdd,
                    onClick = { requestNotifThenOpenForm(null) },
                    testTag = "add_reminder_button",
                )
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val tabs = listOf(
                        "Pendientes (${reminders.count { !it.isCompleted }})",
                        "Completados (${reminders.count { it.isCompleted }})",
                    )
                    tabs.forEachIndexed { idx, label ->
                        FilterChip(
                            selected = filterTab == idx,
                            onClick = { filterTab = idx },
                            label = { Text(label) },
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

            if (filtered.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.NotificationsActive,
                        title = if (filterTab == 0) "Sin recordatorios pendientes" else "Sin recordatorios completados",
                        subtitle = "Crea un recordatorio para entregas programadas de clientes.",
                    )
                }
            } else {
                items(filtered, key = { it.id }) { rem ->
                    AuroraCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = rem.clientName,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = OnSurface,
                                )
                                Text(
                                    text = "Fecha entrega: ${dateFmt.format(Date(rem.deliveryDateMillis))}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Secondary,
                                )
                            }
                            IconButton(
                                onClick = { onDeleteReminder(rem) },
                                modifier = Modifier.size(48.dp),
                            ) {
                                Icon(imageVector = Icons.Default.DeleteOutline, contentDescription = "Eliminar", tint = Error)
                            }
                        }

                        if (rem.boxesNote.isNotBlank()) {
                            Text(
                                text = "Pedido: ${rem.boxesNote}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Primary,
                            )
                        }
                        if (rem.note.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = rem.note,
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            AuroraOutlinedButton(
                                text = if (rem.isCompleted) "Reactivar" else "Marcar Completado",
                                icon = if (rem.isCompleted) Icons.Default.Replay else Icons.Default.CheckCircle,
                                onClick = { onToggleCompleted(rem) },
                                accentColor = if (rem.isCompleted) Secondary else PrimaryGlow,
                                modifier = Modifier.weight(1f),
                                testTag = "toggle_reminder_${rem.id}",
                            )
                            AuroraOutlinedButton(
                                text = "Editar",
                                icon = Icons.Default.Edit,
                                onClick = { requestNotifThenOpenForm(rem) },
                                modifier = Modifier.weight(0.65f),
                            )
                        }
                    }
                }
            }
        }
    }

    if (showForm) {
        ReminderFormDialog(
            initial = editing,
            clients = clients,
            onDismiss = { showForm = false },
            onSave = { clientId, clientName, dateMs, boxesNote, note ->
                onSaveReminder(editing?.id ?: 0L, clientId, clientName, dateMs, boxesNote, note) {
                    showForm = false
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReminderFormDialog(
    initial: ReminderEntity?,
    clients: List<ClientWithDebt>,
    onDismiss: () -> Unit,
    onSave: (clientId: Long, clientName: String, dateMillis: Long, boxesNote: String, note: String) -> Unit,
) {
    var clientId by remember { mutableLongStateOf(initial?.clientId ?: (clients.firstOrNull()?.client?.id ?: 0L)) }
    var clientName by remember { mutableStateOf(initial?.clientName ?: (clients.firstOrNull()?.client?.name ?: "")) }
    var dateMillis by remember { mutableLongStateOf(initial?.deliveryDateMillis ?: (System.currentTimeMillis() + 86_400_000L)) }
    var boxesNote by remember { mutableStateOf(initial?.boxesNote ?: "") }
    var note by remember { mutableStateOf(initial?.note ?: "") }
    var showDatePicker by remember { mutableStateOf(false) }

    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX")) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = {
            Text(
                text = if (initial == null) "Nuevo Recordatorio" else "Editar Recordatorio",
                color = OnSurface,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (clients.isNotEmpty()) {
                    Text("Clientes registrados:", style = MaterialTheme.typography.labelSmall, color = OnSurfaceVariant)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(clients, key = { it.client.id }) { c ->
                            FilterChip(
                                selected = clientId == c.client.id && clientName == c.client.name,
                                onClick = {
                                    clientId = c.client.id
                                    clientName = c.client.name
                                },
                                label = { Text(c.client.name) },
                            )
                        }
                    }
                }
                AuroraTextField(
                    value = clientName,
                    onValueChange = { clientName = it },
                    label = "Cliente *",
                    testTag = "reminder_client_input",
                )
                AuroraOutlinedButton(
                    text = "Fecha entrega: ${dateFmt.format(Date(dateMillis))}",
                    icon = Icons.Default.CalendarMonth,
                    onClick = { showDatePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                    testTag = "reminder_date_button",
                )
                AuroraTextField(
                    value = boxesNote,
                    onValueChange = { boxesNote = it },
                    label = "Cajas / Marca estimada",
                    testTag = "reminder_boxes_input",
                )
                AuroraTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = "Notas de entrega o cobro",
                    singleLine = false,
                    testTag = "reminder_note_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(clientId, clientName, dateMillis, boxesNote, note) },
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("save_reminder_confirm"),
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

    if (showDatePicker) {
        val state = rememberDatePickerState(initialSelectedDateMillis = dateMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.selectedDateMillis?.let { dateMillis = it }
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
fun CierresDiariosScreen(
    deliveries: List<DeliveryEntity>,
    activeAbonos: List<AbonoEntity>,
    closings: List<DailyClosingEntity>,
    onOpenDrawer: () -> Unit,
    onGenerateClosing: () -> Unit,
    onOpenClosingDetail: (Long) -> Unit,
    onDownloadPdf: (DailyClosingEntity) -> Unit,
    onDownloadJson: (DailyClosingEntity) -> Unit,
) {
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
    val todayLabel = remember {
        SimpleDateFormat("dd 'de' MMMM 'de' yyyy", Locale("es", "MX")).format(Date())
    }

    val activeToday = deliveries.filter { it.status == "ACTIVA" && it.dateMillis in todayStart..todayEnd }
    val todayAbonos = activeAbonos.filter { it.dateMillis in todayStart..todayEnd }
    val cashSales = activeToday.filter { it.paymentMethod == PaymentMethod.CONTADO.dbValue }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.finalAmountMxn)) }
    val creditSales = activeToday.filter { it.paymentMethod == PaymentMethod.CREDITO.dbValue }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.finalAmountMxn)) }
    val initialCreditPaid = activeToday.filter { it.paymentMethod == PaymentMethod.CREDITO.dbValue }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.initialPaymentMxn)) }
    val abonosSum = todayAbonos.fold(BigDecimal.ZERO) { acc, a -> acc.add(BigDecimal.valueOf(a.amountMxn)) }
    val moneyCollected = cashSales.add(initialCreditPaid).add(abonosSum)
    val boxesToday = activeToday.fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.boxes)) }
    val kgToday = activeToday.fold(BigDecimal.ZERO) { acc, d ->
        acc.add(BigDecimal.valueOf(d.netWeightKg + (d.sugarSacks * d.sugarSackWeightKg)))
    }
    val sugarSacksToday = activeToday.fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.sugarSacks)) }
    val pendingAll = deliveries.filter { it.status == "ACTIVA" }
        .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Cierres Diarios",
            subtitle = "Arqueo de jornada en PDF y JSON",
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
                AuroraCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text("PREVIA DE HOY", style = MaterialTheme.typography.labelSmall, color = Primary)
                            Text(todayLabel, style = MaterialTheme.typography.titleMedium, color = OnSurface)
                        }
                        AuroraStatusBadge(text = "${activeToday.size} entregas", tint = PrimaryGlow)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "${CalculationEngine.formatMoney(moneyCollected)} MXN",
                        style = MaterialTheme.typography.displayLarge,
                        color = Secondary,
                    )
                    Text("Dinero cobrado (Contado + Abonos)", style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)

                    Spacer(Modifier.height(12.dp))
                    ClosingStatPair("Ventas contado:", "${CalculationEngine.formatMoney(cashSales)} MXN")
                    ClosingStatPair("Ventas a crédito:", "${CalculationEngine.formatMoney(creditSales)} MXN")
                    ClosingStatPair("Abonos recibidos:", "${CalculationEngine.formatMoney(abonosSum)} MXN")
                    ClosingStatPair("Cajas entregadas:", "${CalculationEngine.formatExactBoxes(boxesToday)} cajas")
                    if (sugarSacksToday > BigDecimal.ZERO) {
                        ClosingStatPair("Bultos de azúcar:", "${CalculationEngine.formatExactBoxes(sugarSacksToday)} bultos")
                    }
                    ClosingStatPair("Kilogramos entregados:", "${CalculationEngine.formatExactWeight(kgToday)} kg")
                    ClosingStatPair("Clientes atendidos:", "${activeToday.map { it.clientId }.distinct().size}")
                    ClosingStatPair("Deudas pendientes totales:", "${CalculationEngine.formatMoney(pendingAll)} MXN")

                    Spacer(Modifier.height(14.dp))
                    AuroraPrimaryButton(
                        text = "Ejecutar Cierre Diario",
                        icon = Icons.Default.PointOfSale,
                        onClick = onGenerateClosing,
                        testTag = "execute_daily_closing_button",
                    )
                }
            }

            item {
                Text(
                    text = "Cierres Históricos (${closings.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (closings.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.LockClock,
                        title = "Aún no hay cierres diarios",
                        subtitle = "Al ejecutar un cierre se guardará en PDF y JSON para consulta histórica.",
                    )
                }
            } else {
                items(closings, key = { it.id }) { closing ->
                    AuroraCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(closing.folio, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = Primary)
                                Text("Fecha: ${closing.dateKey}", style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                            }
                            Text(
                                text = "${CalculationEngine.formatMoney(closing.totalMoneyCollectedMxn)} MXN",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = Secondary,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "${closing.totalDeliveries} entregas • ${CalculationEngine.formatExactBoxes(closing.totalBoxesDelivered)} cajas • ${CalculationEngine.formatExactWeight(closing.totalKgDelivered)} kg",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            AuroraOutlinedButton(
                                text = "Detalle",
                                icon = Icons.Default.Visibility,
                                onClick = { onOpenClosingDetail(closing.id) },
                                modifier = Modifier.weight(1f),
                                testTag = "open_closing_detail_${closing.id}",
                            )
                            AuroraOutlinedButton(
                                text = "PDF",
                                icon = Icons.Default.PictureAsPdf,
                                onClick = { onDownloadPdf(closing) },
                                accentColor = Secondary,
                                modifier = Modifier.weight(0.75f),
                            )
                            AuroraOutlinedButton(
                                text = "JSON",
                                icon = Icons.Default.Code,
                                onClick = { onDownloadJson(closing) },
                                accentColor = Primary,
                                modifier = Modifier.weight(0.75f),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DetalleCierreScreen(
    closing: DailyClosingEntity?,
    onBack: () -> Unit,
    onDownloadPdf: (DailyClosingEntity) -> Unit,
    onDownloadJson: (DailyClosingEntity) -> Unit,
) {
    if (closing == null) {
        Column(modifier = Modifier.fillMaxSize()) {
            AuroraTopBar(title = "Detalle del Cierre", showDrawerMenu = false, onMenuOrBackClick = onBack)
            Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
                AuroraEmptyState(
                    icon = Icons.Default.LockClock,
                    title = "Cierre no encontrado",
                    subtitle = "No se encontró el registro solicitado.",
                )
            }
        }
        return
    }

    val movements = remember(closing.movementsSnapshotJson) {
        runCatching {
            val arr = JSONArray(closing.movementsSnapshotJson)
            buildList {
                for (i in 0 until arr.length()) {
                    add(arr.getJSONObject(i))
                }
            }
        }.getOrDefault(emptyList())
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Detalle del Cierre",
            subtitle = "${closing.folio} • ${closing.dateKey}",
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
                    Text("TOTAL COBRADO EN EL CIERRE", style = MaterialTheme.typography.labelSmall, color = Primary)
                    Text(
                        text = "${CalculationEngine.formatMoney(closing.totalMoneyCollectedMxn)} MXN",
                        style = MaterialTheme.typography.displayLarge,
                        color = Secondary,
                    )
                    Spacer(Modifier.height(10.dp))
                    ClosingStatPair("Total de entregas:", closing.totalDeliveries.toString())
                    ClosingStatPair("Clientes atendidos:", closing.clientsServedCount.toString())
                    ClosingStatPair("Cajas entregadas:", "${CalculationEngine.formatExactBoxes(closing.totalBoxesDelivered)} cajas")
                    ClosingStatPair("Kilogramos entregados:", "${CalculationEngine.formatExactWeight(closing.totalKgDelivered)} kg")
                    ClosingStatPair("Ventas contado:", "${CalculationEngine.formatMoney(closing.cashSalesMxn)} MXN")
                    ClosingStatPair("Ventas crédito:", "${CalculationEngine.formatMoney(closing.creditSalesMxn)} MXN")
                    ClosingStatPair("Abonos recibidos:", "${CalculationEngine.formatMoney(closing.abonosReceivedMxn)} MXN")
                    ClosingStatPair("Deudas pendientes:", "${CalculationEngine.formatMoney(closing.pendingDebtsMxn)} MXN")
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Firma local: #${closing.hashSignature}",
                        style = MaterialTheme.typography.labelSmall,
                        color = OnSurfaceVariant,
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AuroraPrimaryButton(
                        text = "Descargar PDF",
                        icon = Icons.Default.PictureAsPdf,
                        onClick = { onDownloadPdf(closing) },
                        modifier = Modifier.weight(1f),
                        testTag = "closing_detail_pdf_button",
                    )
                    AuroraOutlinedButton(
                        text = "Descargar JSON",
                        icon = Icons.Default.Code,
                        onClick = { onDownloadJson(closing) },
                        accentColor = Secondary,
                        modifier = Modifier.weight(1f),
                        testTag = "closing_detail_json_button",
                    )
                }
            }

            item {
                Text(
                    text = "Movimientos del Cierre (${movements.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (movements.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.LockClock,
                        title = "Sin entregas en esta fecha",
                        subtitle = "El cierre se registró con 0 entregas en el día.",
                    )
                }
            } else {
                items(movements.size) { idx ->
                    val m = movements[idx]
                    val folio = m.optString("folio")
                    val clientName = m.optString("cliente_nombre")
                    val status = m.optString("estado", "ACTIVA")
                    val cajas = m.optDouble("cajas", 0.0)
                    val bultosAzucar = m.optDouble("bultos_azucar", 0.0)
                    val pesoNeto = m.optDouble("peso_neto_kg", 0.0)
                    val importe = m.optDouble("importe_final_mxn", 0.0)
                    val forma = m.optString("forma_pago")

                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(folio, style = MaterialTheme.typography.titleSmall, color = Primary)
                            AuroraStatusBadge(
                                text = if (status == "CANCELADA") "CANCELADO" else PaymentMethod.fromDb(forma).label,
                                tint = if (status == "CANCELADA") Error else PrimaryGlow,
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(clientName, style = MaterialTheme.typography.titleSmall, color = OnSurface)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            val qtyLabel = buildList {
                                if (cajas > 0.0) add("${CalculationEngine.formatExactBoxes(cajas)} cjs")
                                if (bultosAzucar > 0.0) add("${CalculationEngine.formatExactBoxes(bultosAzucar)} bto azúcar")
                                add("${CalculationEngine.formatExactWeight(pesoNeto)} kg")
                            }.joinToString(" • ")
                            Text(
                                text = qtyLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant,
                            )
                            Text(
                                text = "${CalculationEngine.formatMoney(importe)} MXN",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = Secondary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ClosingStatPair(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = OnSurface)
    }
}
