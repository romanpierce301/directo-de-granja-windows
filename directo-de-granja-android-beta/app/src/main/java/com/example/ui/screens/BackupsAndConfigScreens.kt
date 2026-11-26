package com.example.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FolderZip
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.example.BuildConfig
import com.example.data.local.entity.BackupRecordEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.domain.CalculationEngine
import com.example.system.PairedPrinterDevice
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
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.theme.SurfaceContainerLowest
import com.example.ui.viewmodel.ClientWithDebt
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun RespaldosLocalesScreen(
    backups: List<BackupRecordEntity>,
    onOpenDrawer: () -> Unit,
    onCreateZipBackup: () -> Unit,
    onExportJsonBackup: () -> Unit,
    onSaveBackupToDownloads: (BackupRecordEntity) -> Unit,
    onRestoreFromUri: (Uri) -> Unit,
    onRestoreFromRecord: (BackupRecordEntity) -> Unit,
    backupFolderName: String = BuildConfig.BRAND_BACKUPS_FOLDER,
) {
    val openDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            onRestoreFromUri(uri)
        }
    }

    val dateFmt = remember { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("es", "MX")) }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Respaldos Locales",
            subtitle = "Copia ZIP / JSON • Transferencia USB",
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.CloudOff, contentDescription = null, tint = PrimaryGlow)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Almacenamiento 100% Local en Dispositivo",
                            style = MaterialTheme.typography.titleMedium,
                            color = OnSurface,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Sin sincronización en la nube. El paquete ZIP incluye datos generales en JSON, cierres diarios (PDF/JSON), tickets, firmas digitales y metadatos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(14.dp))
                    AuroraPrimaryButton(
                        text = "Generar Respaldo Completo (.ZIP)",
                        icon = Icons.Default.FolderZip,
                        onClick = onCreateZipBackup,
                        testTag = "create_zip_backup_button",
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        AuroraOutlinedButton(
                            text = "Exportar JSON",
                            icon = Icons.Default.Code,
                            onClick = onExportJsonBackup,
                            accentColor = Secondary,
                            modifier = Modifier.weight(1f),
                            testTag = "export_json_backup_button",
                        )
                        AuroraOutlinedButton(
                            text = "Restaurar Archivo",
                            icon = Icons.Default.Restore,
                            onClick = {
                                openDocLauncher.launch(arrayOf("application/zip", "application/json", "*/*"))
                            },
                            accentColor = Primary,
                            modifier = Modifier.weight(1f),
                            testTag = "restore_backup_picker_button",
                        )
                    }
                }
            }

            item {
                AuroraCard(contentPadding = PaddingValues(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.Usb, contentDescription = null, tint = Secondary)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Transferencia a PC por Cable USB",
                            style = MaterialTheme.typography.titleSmall,
                            color = OnSurface,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "1. Genera un respaldo ZIP o JSON (se guarda automáticamente en Descargas/$backupFolderName).\n2. Conecta tu teléfono a la computadora por USB en modo 'Transferencia de archivos' y copia la carpeta $backupFolderName.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                }
            }

            item {
                Text(
                    text = "Historial de Respaldos (${backups.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 600.dp),
                )
            }

            if (backups.isEmpty()) {
                item {
                    AuroraEmptyState(
                        icon = Icons.Default.FolderZip,
                        title = "Sin respaldos generados",
                        subtitle = "Crea un paquete ZIP o exportación JSON para proteger tus datos localmente.",
                    )
                }
            } else {
                items(backups, key = { it.id }) { rec ->
                    AuroraCard(contentPadding = PaddingValues(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(rec.fileName, style = MaterialTheme.typography.titleSmall, color = OnSurface)
                                Text(
                                    text = "${dateFmt.format(Date(rec.createdAtMillis))} • ${(rec.sizeBytes / 1024).coerceAtLeast(1)} KB",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = OnSurfaceVariant,
                                )
                            }
                            AuroraStatusBadge(text = rec.format, tint = Primary)
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            AuroraOutlinedButton(
                                text = "Guardar / USB",
                                icon = Icons.Default.Download,
                                onClick = { onSaveBackupToDownloads(rec) },
                                accentColor = Secondary,
                                modifier = Modifier.weight(1f),
                            )
                            AuroraOutlinedButton(
                                text = "Restaurar",
                                icon = Icons.Default.Restore,
                                onClick = { onRestoreFromRecord(rec) },
                                accentColor = PrimaryGlow,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ConfiguracionScreen(
    settings: BusinessSettingsEntity,
    clients: List<ClientWithDebt>,
    printers: List<PairedPrinterDevice>,
    onOpenDrawer: () -> Unit,
    onSaveBusinessConfig: (phone: String, address: String, slogan: String, globalPriceText: String) -> Unit,
    onUpdateClientSpecialPrice: (clientId: Long, specialPriceText: String) -> Unit,
    onRefreshPrinters: () -> Unit,
    onScanPrinters: () -> Unit,
    onStopPrinterScan: () -> Unit,
    onPrinterPermissionDenied: () -> Unit,
    isScanningPrinters: Boolean,
    onSelectPrinterType: (String) -> Unit,
    onSelectPrinter: (PairedPrinterDevice) -> Unit,
    onTestPrinter: () -> Unit,
) {
    val context = LocalContext.current
    var phone by remember(settings.phone) { mutableStateOf(settings.phone) }
    var address by remember(settings.address) { mutableStateOf(settings.address) }
    var slogan by remember(settings.slogan) { mutableStateOf(settings.slogan) }
    var globalPriceText by remember(settings.globalPricePerKg) {
        mutableStateOf(if (settings.globalPricePerKg > 0.0) settings.globalPricePerKg.toString() else "")
    }
    var editingSpecialClient by remember { mutableStateOf<ClientEntity?>(null) }

    val btPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.isNotEmpty() && result.values.all { it }) onScanPrinters()
        else onPrinterPermissionDenied()
    }

    fun requestScanWithPermissions() {
        val required = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        val missing = required.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) onScanPrinters() else btPermissionLauncher.launch(missing.toTypedArray())
    }

    LaunchedEffect(Unit) {
        onRefreshPrinters()
    }
    DisposableEffect(Unit) {
        onDispose { onStopPrinterScan() }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AuroraTopBar(
            title = "Configuración",
            subtitle = settings.businessName,
            showDrawerMenu = true,
            onMenuOrBackClick = onOpenDrawer,
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Datos del Negocio y Precio Global
            item {
                AuroraCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Datos del Negocio",
                            style = MaterialTheme.typography.titleLarge,
                            color = OnSurface,
                        )
                        AuroraStatusBadge(text = settings.businessName, tint = Secondary)
                    }
                    Spacer(Modifier.height(12.dp))
                    AuroraTextField(
                        value = slogan,
                        onValueChange = { slogan = it },
                        label = "Eslogan oficial",
                        testTag = "config_slogan_input",
                    )
                    Spacer(Modifier.height(10.dp))
                    AuroraTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = "Teléfono del negocio",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        testTag = "config_phone_input",
                    )
                    Spacer(Modifier.height(10.dp))
                    AuroraTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = "Dirección del negocio",
                        singleLine = false,
                        testTag = "config_address_input",
                    )
                    Spacer(Modifier.height(10.dp))
                    AuroraTextField(
                        value = globalPriceText,
                        onValueChange = { globalPriceText = it },
                        label = "Precio global por kilogramo (MXN)",
                        suffixText = "MXN/kg",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        testTag = "config_global_price_input",
                    )
                    Spacer(Modifier.height(14.dp))
                    AuroraPrimaryButton(
                        text = "Guardar Datos y Precio Global",
                        icon = Icons.Default.Save,
                        onClick = { onSaveBusinessConfig(phone, address, slogan, globalPriceText) },
                        testTag = "save_business_config_button",
                    )
                }
            }

            // Precio Especial por Cliente
            item {
                AuroraCard {
                    Text(
                        text = "Precios Especiales por Cliente",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Si un cliente tiene precio especial, se usará en lugar del precio global en sus entregas.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    if (clients.isEmpty()) {
                        Text(
                            text = "Registra clientes primero para asignarles tarifas especiales.",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant,
                        )
                    } else {
                        clients.forEach { c ->
                            Surface(
                                onClick = { editingSpecialClient = c.client },
                                color = SurfaceContainerLowest,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, OutlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .testTag("special_price_client_${c.client.id}"),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(c.client.name, style = MaterialTheme.typography.titleSmall, color = OnSurface)
                                    Text(
                                        text = if (c.client.specialPricePerKg != null) {
                                            "Especial: ${CalculationEngine.formatMoney(c.client.specialPricePerKg)}/kg"
                                        } else {
                                            "Usa global (${CalculationEngine.formatMoney(settings.globalPricePerKg)})"
                                        },
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (c.client.specialPricePerKg != null) Secondary else Primary,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Impresora Térmica 60 mm (Bluetooth y USB OTG)
            item {
                AuroraCard {
                    Text(
                        text = "Conectar impresora térmica",
                        style = MaterialTheme.typography.titleMedium,
                        color = OnSurface,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Enciende la impresora y pulsa Buscar. Si aparece como Bluetooth, tócala para vincularla con Android. Si aparece como Bluetooth LE, tócala para seleccionarla. Después pulsa Prueba 60 mm.",
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        listOf("BLUETOOTH" to Icons.Default.Bluetooth, "USB" to Icons.Default.Usb).forEach { (type, icon) ->
                            val selected = settings.printerType == type
                            Surface(
                                onClick = { onSelectPrinterType(type) },
                                shape = RoundedCornerShape(14.dp),
                                color = if (selected) Primary else SurfaceContainerLow,
                                border = BorderStroke(1.dp, if (selected) Primary else OutlineVariant),
                                modifier = Modifier
                                    .weight(1f)
                                    .heightIn(min = 48.dp)
                                    .testTag("printer_type_${type.lowercase()}"),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(icon, contentDescription = null, tint = if (selected) OnPrimary else Primary)
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = if (type == "USB") "USB OTG" else "Bluetooth",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (selected) OnPrimary else OnSurface,
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = if (settings.printerName.isNotBlank()) {
                            "Seleccionada: ${settings.printerName} (${if (settings.printerTransport == "BLE") "Bluetooth LE" else settings.printerType})"
                        } else {
                            "Ninguna impresora seleccionada"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = Secondary,
                    )

                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AuroraOutlinedButton(
                            text = if (isScanningPrinters) "Buscando…" else "Buscar impresora",
                            icon = Icons.Default.Refresh,
                            onClick = ::requestScanWithPermissions,
                            modifier = Modifier.weight(1f),
                            enabled = !isScanningPrinters,
                            testTag = "scan_printers_button",
                        )
                        AuroraOutlinedButton(
                            text = "Prueba 60mm",
                            icon = Icons.Default.Print,
                            onClick = onTestPrinter,
                            accentColor = Secondary,
                            modifier = Modifier.weight(0.9f),
                            enabled = settings.printerAddress.isNotBlank(),
                            testTag = "test_printer_button",
                        )
                    }

                    if (isScanningPrinters) {
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("Buscando dispositivos cercanos…", style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                        }
                    }

                    if (printers.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider(color = Primary.copy(alpha = 0.14f))
                        Spacer(Modifier.height(8.dp))
                        printers.forEach { dev ->
                            val isSelected = settings.printerAddress == dev.address && settings.printerType == dev.type
                            Surface(
                                onClick = { onSelectPrinter(dev) },
                                color = if (isSelected) Primary.copy(alpha = 0.16f) else SurfaceContainerLowest,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, if (isSelected) Primary else OutlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column {
                                        Text(dev.name, style = MaterialTheme.typography.titleSmall, color = OnSurface)
                                        Text("${if (dev.isLowEnergy) "Bluetooth LE" else dev.type} • ${dev.address}", style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                                    }
                                    if (isSelected) {
                                        AuroraStatusBadge(text = "Activa", tint = PrimaryGlow)
                                    } else if (dev.type == "USB") {
                                        AuroraStatusBadge(text = "Conectada", tint = PrimaryGlow)
                                    } else if (dev.isPaired) {
                                        AuroraStatusBadge(text = "Vinculada", tint = Secondary)
                                    } else {
                                        AuroraStatusBadge(text = if (dev.isLowEnergy) "Toca para seleccionar" else "Toca para vincular", tint = Secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editingSpecialClient?.let { target ->
        SpecialPriceDialog(
            client = target,
            globalPrice = settings.globalPricePerKg,
            onDismiss = { editingSpecialClient = null },
            onSave = { priceText ->
                onUpdateClientSpecialPrice(target.id, priceText)
                editingSpecialClient = null
            },
        )
    }
}

@Composable
private fun SpecialPriceDialog(
    client: ClientEntity,
    globalPrice: Double,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var priceText by remember { mutableStateOf(client.specialPricePerKg?.toString() ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SurfaceContainer,
        title = { Text("Precio especial: ${client.name}", color = OnSurface) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Deja vacío para usar el precio global (${CalculationEngine.formatMoney(globalPrice)} MXN/kg).",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceVariant,
                )
                AuroraTextField(
                    value = priceText,
                    onValueChange = { priceText = it },
                    label = "Precio especial (MXN/kg)",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    testTag = "special_price_dialog_input",
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(priceText) },
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("save_special_price_confirm"),
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
