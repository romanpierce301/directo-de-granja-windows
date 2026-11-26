@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.example.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.data.local.entity.RouteIncidentEntity
import com.example.ui.viewmodel.RouteCrewAssignment
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

@Composable
fun DirectoLoginScreen(
    initialServerUrl: String,
    onLogin: suspend (String, String, String) -> String?,
    onAuthenticated: () -> Unit,
) {
    var serverUrl by remember { mutableStateOf(initialServerUrl) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Scaffold(topBar = { TopAppBar(title = { Text("Acceso de ruta · Directo de Granja") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("El dueño crea y autoriza tu cuenta y teléfono desde Windows. La primera conexión requiere internet.", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(serverUrl, { serverUrl = it }, Modifier.fillMaxWidth(), label = { Text("Dirección de Windows (VPN)") }, placeholder = { Text("http://100.x.x.x:3000") }, singleLine = true)
            OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo de acceso") }, singleLine = true)
            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Contraseña") }, singleLine = true)
            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Button(
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        error = onLogin(serverUrl, email, password)
                        busy = false
                        if (error == null) onAuthenticated()
                    }
                },
                enabled = !busy && serverUrl.isNotBlank() && email.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp) else Text("Iniciar sesión y solicitar autorización")
            }
            Text("Después del primer acceso, la app puede seguir guardando la ruta sin conexión.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun DirectoSyncScreen(
    userName: String,
    customerCount: Int,
    foliosRemaining: Int,
    wsConnected: Boolean,
    syncStatus: String,
    pendingSyncCount: Int,
    lastSyncIso: String,
    onOpenDrawer: () -> Unit,
    onSync: suspend () -> String?,
) {
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Scaffold(topBar = { TopAppBar(title = { Text("Sincronizar con Windows") }, navigationIcon = { IconButton(onClick = onOpenDrawer) { Icon(Icons.Default.Menu, "Menú") } }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        if (wsConnected) "Enlace en vivo conectado con Windows" else "Enlace en espera / sin conexión",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (wsConnected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                    )
                    Text(syncStatus, style = MaterialTheme.typography.bodySmall)
                    if (lastSyncIso.isNotBlank()) {
                        Text("Última sincronización: $lastSyncIso", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text("Sesión: ${userName.ifBlank { "Vendedor" }}", style = MaterialTheme.typography.titleMedium)
            Text("Clientes sincronizados: $customerCount")
            Text("Folios oficiales disponibles sin conexión: $foliosRemaining")
            Text("Movimientos pendientes por subir: $pendingSyncCount")
            Text("La app sincroniza automáticamente en tiempo real al guardar ventas, abonos o mermas. Si no hay señal, todo se guarda localmente y se envía al reconectar.", style = MaterialTheme.typography.bodyMedium)
            if (status != null) Text(status!!, color = MaterialTheme.colorScheme.primary)
            Button(onClick = {
                busy = true
                status = null
                scope.launch {
                    status = onSync() ?: "Sincronización simultánea completada."
                    busy = false
                }
            }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                if (busy) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp) else Text("Forzar sincronización ahora")
            }
        }
    }
}

@Composable
fun RouteCrewAssignmentScreen(
    assignment: RouteCrewAssignment,
    onOpenDrawer: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var vendor by remember(assignment) { mutableStateOf(assignment.vendorName) }
    var driver by remember(assignment) { mutableStateOf(assignment.driverName) }
    var helper by remember(assignment) { mutableStateOf(assignment.helperName) }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Personal de ruta") },
            navigationIcon = { IconButton(onClick = onOpenDrawer) { Icon(Icons.Default.Menu, "Menú") } },
        )
    }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Asigna quién participa en esta ruta. El catálogo de clientes es el mismo para todos los teléfonos.", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(vendor, { vendor = it }, Modifier.fillMaxWidth(), label = { Text("Vendedor") }, singleLine = true)
            OutlinedTextField(driver, { driver = it }, Modifier.fillMaxWidth(), label = { Text("Chofer") }, singleLine = true)
            OutlinedTextField(helper, { helper = it }, Modifier.fillMaxWidth(), label = { Text("Ayudante / chalán") }, singleLine = true)
            Spacer(Modifier.height(4.dp))
            Button(onClick = { onSave(vendor, driver, helper) }, modifier = Modifier.fillMaxWidth(), enabled = vendor.isNotBlank() && driver.isNotBlank()) {
                Text("Guardar personal de ruta")
            }
            Text("El registro queda guardado en este teléfono y se incluirá en los movimientos de ruta.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun RouteIncidentScreen(
    incidents: List<RouteIncidentEntity>,
    onOpenDrawer: () -> Unit,
    onSave: (String, String, String, String, String, () -> Unit) -> Unit,
) {
    var type by remember { mutableStateOf("MERMA") }
    var description by remember { mutableStateOf("") }
    var product by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Mermas e incidentes") },
            navigationIcon = { IconButton(onClick = onOpenDrawer) { Icon(Icons.Default.Menu, "Menú") } },
        )
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                FilterChip(selected = type == "MERMA", onClick = { type = "MERMA" }, label = { Text("Merma") })
                FilterChip(selected = type == "INCIDENTE", onClick = { type = "INCIDENTE" }, label = { Text("Incidente") })
            }
            OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text("Describe lo ocurrido") })
            OutlinedTextField(product, { product = it }, Modifier.fillMaxWidth(), label = { Text("Producto o marca (opcional)") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(quantity, { quantity = it }, Modifier.weight(1f), label = { Text("Cantidad / kg") }, singleLine = true)
                OutlinedTextField(amount, { amount = it }, Modifier.weight(1f), label = { Text("Importe $ (opcional)") }, singleLine = true)
            }
            Button(
                onClick = { onSave(type, description, product, quantity, amount) { description = ""; product = ""; quantity = ""; amount = "" } },
                enabled = description.isNotBlank() && if (type == "MERMA") quantity.isNotBlank() else amount.isNotBlank(),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text(if (type == "MERMA") "Guardar merma" else "Guardar incidente") }
            Text("Registros locales: ${incidents.size} · se conservarán hasta sincronizar", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 8.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                items(incidents, key = { it.id }) { incident ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("${incident.type} · ${SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("es", "MX")).format(Date(incident.createdAtMillis))}", style = MaterialTheme.typography.labelLarge)
                            Text(incident.description)
                            if (incident.productOrBrand.isNotBlank()) Text("Producto: ${incident.productOrBrand}", style = MaterialTheme.typography.bodySmall)
                            if (incident.quantity != null) Text("Cantidad: ${incident.quantity}", style = MaterialTheme.typography.bodySmall)
                            if (incident.amountMxn != null) Text("Importe: $${"%.2f".format(Locale.US, incident.amountMxn)}", style = MaterialTheme.typography.bodySmall)
                            Text(incident.syncStatus, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}
