package com.example.ui.viewmodel

import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.BuildConfig
import com.example.HyhApplication
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BackupRecordEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.EggPurchaseEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.data.local.entity.ReminderEntity
import com.example.data.local.entity.SugarInventoryEntity
import com.example.data.local.entity.SugarPurchaseEntity
import com.example.data.local.entity.RouteIncidentEntity
import com.example.data.local.entity.SalesChannel
import com.example.domain.CalculationEngine
import com.example.domain.DeliveryCalculationResult
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import com.example.domain.WeighedBoxItem
import com.example.system.PairedPrinterDevice
import com.example.system.DirectoSessionStore
import com.example.system.DirectoSocketHandle
import com.example.system.WindowsApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class ClientWithDebt(
    val client: ClientEntity,
    val activeDebtMxn: Double,
    val deliveryCount: Int,
)

data class RouteCrewAssignment(
    val vendorName: String = "",
    val driverName: String = "",
    val helperName: String = "",
)

data class DeliveryDraftState(
    val clientId: Long? = null,
    val brand: String = "",
    val modality: DeliveryModality = DeliveryModality.CAJA_COMPLETA,
    val weightInputKg: String = "",
    val pricePerKgInput: String = "",
    val weighedItems: List<WeighedBoxItem> = emptyList(),
    val nextBoxSeq: Long = 1L,
    val paymentMethod: PaymentMethod = PaymentMethod.CONTADO,
    val initialAbonoInput: String = "",
    val sugarSacksInput: String = "",
    val sugarWeightPerSackInput: String = "",
    val sugarPricePerSackInput: String = "",
) {
    val hasCapturedData: Boolean
        get() = clientId != null ||
            brand.isNotBlank() ||
            weighedItems.isNotEmpty() ||
            weightInputKg.isNotBlank() ||
            initialAbonoInput.isNotBlank() ||
            sugarSacksInput.isNotBlank() ||
            sugarWeightPerSackInput.isNotBlank() ||
            sugarPricePerSackInput.isNotBlank()
}

sealed interface OverlayState {
    data object None : OverlayState
    data class Loading(val title: String, val message: String) : OverlayState
    data class Success(val title: String, val message: String) : OverlayState
    data class Error(val title: String, val message: String) : OverlayState
}

data class PendingSafSave(
    val file: File,
    val mimeType: String,
    val suggestedFileName: String,
)

class HyhViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as HyhApplication
    private val repository = app.repository
    private val soundManager = app.soundManager
    private val printerManager = app.printerManager
    private val directoSessionStore = DirectoSessionStore(application)
    private val _directoAuthenticated = MutableStateFlow(BuildConfig.FLAVOR != "directodegranja" || directoSessionStore.token() != null)
    val directoAuthenticated: StateFlow<Boolean> = _directoAuthenticated.asStateFlow()
    private val directoSyncMutex = Mutex()
    private var directoSocketHandle: DirectoSocketHandle? = null
    private var directoLoopJob: Job? = null
    private val _directoWsConnected = MutableStateFlow(false)
    val directoWsConnected: StateFlow<Boolean> = _directoWsConnected.asStateFlow()
    private val _directoSyncStatus = MutableStateFlow(
        if (BuildConfig.FLAVOR == "directodegranja") "Esperando conexión con Windows" else "Local",
    )
    val directoSyncStatus: StateFlow<String> = _directoSyncStatus.asStateFlow()
    private val _directoLastSyncIso = MutableStateFlow(directoSessionStore.lastSyncIso())
    val directoLastSyncIso: StateFlow<String> = _directoLastSyncIso.asStateFlow()

    val directoServerUrl: String get() = directoSessionStore.serverUrl()
    val directoUserName: String get() = directoSessionStore.userName()
    val directoFoliosRemaining: Int get() = directoSessionStore.foliosRemaining()

    suspend fun loginDirecto(serverUrl: String, email: String, password: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            val result = WindowsApiClient.loginAndRegisterDevice(serverUrl, email, password, directoSessionStore.deviceId())
            directoSessionStore.saveSession(serverUrl, result.token, result.userName)
            directoSessionStore.saveDeviceAuthorized(false)
            _directoAuthenticated.value = true
            _directoSyncStatus.value = "Pendiente de autorización en Windows"
            startDirectoRealtimeLoop()
            syncDirectoData(silent = true)
        }.exceptionOrNull()?.message
    }

    fun startDirectoRealtimeLoop() {
        if (BuildConfig.FLAVOR != "directodegranja") return
        if (directoLoopJob?.isActive == true) return
        directoLoopJob = viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                val token = directoSessionStore.token()
                val serverUrl = directoSessionStore.serverUrl()
                if (!_directoAuthenticated.value || token.isNullOrBlank() || serverUrl.isBlank()) {
                    _directoWsConnected.value = false
                    directoSocketHandle?.close()
                    directoSocketHandle = null
                    delay(3_000L)
                    continue
                }
                if (directoSocketHandle == null) {
                    runCatching {
                        directoSocketHandle = WindowsApiClient.openSyncWebSocket(
                            baseUrl = serverUrl,
                            token = token,
                            onEvent = { eventType ->
                                when (eventType) {
                                    "device:authorized",
                                    "vendor:updated",
                                    "delivery:synced",
                                    "delivery:cancelled",
                                    "closing:created",
                                    "customer:updated",
                                    "bodega:updated",
                                    "price:published",
                                    "transfer:verified",
                                    "sync:state_updated" -> {
                                        viewModelScope.launch {
                                            syncDirectoData(silent = true)
                                        }
                                    }
                                }
                            },
                            onConnectedChanged = { connected ->
                                _directoWsConnected.value = connected
                                if (connected) {
                                    viewModelScope.launch {
                                        syncDirectoData(silent = true)
                                    }
                                }
                            },
                            onFailure = {
                                _directoWsConnected.value = false
                                directoSocketHandle?.close()
                                directoSocketHandle = null
                            },
                        )
                    }.onFailure {
                        _directoWsConnected.value = false
                        directoSocketHandle = null
                    }
                }
                delay(if (_directoWsConnected.value) 30_000L else 6_000L)
                if (!_directoWsConnected.value) {
                    syncDirectoData(silent = true)
                }
            }
        }
    }

    suspend fun syncDirectoData(silent: Boolean = false): String? = withContext(Dispatchers.IO) {
        directoSyncMutex.withLock {
            runCatching {
                val token = directoSessionStore.token() ?: throw IllegalStateException("Inicia sesión primero")
                val serverUrl = directoSessionStore.serverUrl()
                val deviceId = directoSessionStore.deviceId()

                val snapshot = WindowsApiClient.downloadSnapshot(serverUrl, token, deviceId)
                directoSessionStore.saveDeviceAuthorized(snapshot.deviceAuthorized)
                repository.applyWindowsClients(snapshot.customers)
                if (snapshot.pricePerKg > 0.0) repository.applyWindowsDailyPrice(snapshot.pricePerKg)
                repository.applyWindowsSettings(snapshot.settings)
                repository.applyWindowsInventory(snapshot.eggStocks, snapshot.sugarStock)

                var newlyReservedFolios = 0
                if (directoSessionStore.foliosRemaining() < 20) {
                    val (series, folios) = WindowsApiClient.reserveFolios(serverUrl, token, deviceId, 100)
                    directoSessionStore.saveFolios(series, folios)
                    newlyReservedFolios = folios.size
                }

                val pendingDeliveries = repository.pendingDeliveriesForSync()
                val pendingAbonos = repository.pendingAbonosForSync()
                val pendingIncidents = repository.pendingIncidentsForSync()
                val deliveriesJson = JSONArray()
                val paymentsJson = JSONArray()

                pendingDeliveries.forEach { delivery ->
                    val client = repository.getClientOnce(delivery.clientId)
                        ?: throw IllegalStateException("No se encontró el cliente de la entrega ${delivery.folio}")
                    val windowsClientId = client.windowsId
                        ?: throw IllegalStateException("El cliente ${client.name} aún no está vinculado al catálogo de Windows")
                    val itemSnapshot = runCatching { JSONArray(delivery.itemsSnapshotJson) }.getOrElse { JSONArray() }
                    val syncedItems = JSONArray()
                    for (index in 0 until itemSnapshot.length()) {
                        val item = itemSnapshot.optJSONObject(index) ?: continue
                        val inputKg = item.optString("inputKg").toBigDecimalOrNull() ?: BigDecimal.ZERO
                        val tareKg = item.optString("tareKg").toBigDecimalOrNull() ?: BigDecimal.ZERO
                        val netKg = item.optString("netKg").toBigDecimalOrNull() ?: BigDecimal.ZERO
                        val boxes = item.optString("boxes").toBigDecimalOrNull() ?: BigDecimal.ONE
                        val price = item.optString("priceKg").toBigDecimalOrNull() ?: BigDecimal.valueOf(delivery.pricePerKg)
                        syncedItems.put(
                            JSONObject()
                                .put("id", "${delivery.localId}-$index")
                                .put("modality", item.optString("modality"))
                                .put("boxesDecimal", boxes.toDouble())
                                .put("inputWeightKg", inputKg.toDouble())
                                .put("tareDeductionKg", tareKg.toDouble())
                                .put("netWeightKg", netKg.toDouble())
                                .put("brand", item.optString("brand", delivery.brand))
                                .put("pricePerKg", price.toDouble()),
                        )
                    }
                    val folioNumber = delivery.folio.substringAfterLast('-').toIntOrNull()
                        ?: throw IllegalStateException("El folio ${delivery.folio} no es oficial")
                    val priceCentavos = BigDecimal.valueOf(delivery.pricePerKg)
                        .multiply(BigDecimal(100))
                        .setScale(0, RoundingMode.HALF_UP)
                        .toInt()
                    val record = JSONObject()
                        .put("id", delivery.localId)
                        .put("customerId", windowsClientId)
                        .put("folioNumber", folioNumber)
                        .put("brandName", delivery.brand)
                        .put("driverName", delivery.routeDriverName)
                        .put("helpersNames", JSONArray().apply { if (delivery.routeHelperName.isNotBlank()) put(delivery.routeHelperName) })
                        .put("createdAtUtc", toUtcIso(delivery.dateMillis))
                        .put("priceCentavosPerKg", priceCentavos)
                        .put("paymentTerm", delivery.paymentMethod)
                        .put("isSpecialPrice", client.specialPricePerKg != null)
                        .put("items", syncedItems)
                    if (delivery.sugarSacks > 0) {
                        record.put(
                            "sugar",
                            JSONObject()
                                .put("sacks", delivery.sugarSacks)
                                .put("weightPerSackKg", delivery.sugarSackWeightKg)
                                .put("pricePerSackMxn", delivery.sugarPricePerSackMxn),
                        )
                    }
                    deliveriesJson.put(record)
                    if (delivery.initialPaymentMxn > 0) {
                        val initCentavos = BigDecimal.valueOf(delivery.initialPaymentMxn)
                            .multiply(BigDecimal(100))
                            .setScale(0, RoundingMode.HALF_UP)
                            .toInt()
                        if (initCentavos > 0) {
                            paymentsJson.put(
                                JSONObject()
                                    .put("id", "pay-initial-${delivery.localId}")
                                    .put("customerId", windowsClientId)
                                    .put("deliveryId", delivery.localId)
                                    .put("amountCentavos", initCentavos)
                                    .put("method", "efectivo")
                                    .put("createdAtUtc", toUtcIso(delivery.dateMillis))
                                    .put("note", "Pago inicial registrado en Android"),
                            )
                        }
                    }
                }
                pendingAbonos.forEach { abono ->
                    val client = repository.getClientOnce(abono.clientId) ?: return@forEach
                    val windowsClientId = client.windowsId ?: return@forEach
                    val linkedDelivery = repository.getDeliveryOnce(abono.deliveryId) ?: return@forEach
                    val abonoCentavos = BigDecimal.valueOf(abono.amountMxn)
                        .multiply(BigDecimal(100))
                        .setScale(0, RoundingMode.HALF_UP)
                        .toInt()
                    if (abonoCentavos > 0) {
                        paymentsJson.put(
                            JSONObject()
                                .put("id", "pay-${abono.localId}")
                                .put("customerId", windowsClientId)
                                .put("deliveryId", linkedDelivery.localId)
                                .put("amountCentavos", abonoCentavos)
                                .put("method", "efectivo")
                                .put("createdAtUtc", toUtcIso(abono.dateMillis))
                                .put("note", abono.note.ifBlank { "Abono capturado en Android" }),
                        )
                    }
                }
                val lossesJson = JSONArray()
                val incidentsJson = JSONArray()
                pendingIncidents.forEach { incident ->
                    if (incident.type == "MERMA" && incident.quantity != null && incident.quantity > 0) {
                        val lostGrams = BigDecimal.valueOf(incident.quantity)
                            .multiply(BigDecimal(1000))
                            .setScale(0, RoundingMode.HALF_UP)
                            .toInt()
                        if (lostGrams > 0) {
                            lossesJson.put(
                                JSONObject().put("id", "loss-${incident.localId}")
                                    .put("lostGrams", lostGrams)
                                    .put("note", incident.description)
                                    .put("driverName", incident.routeDriverName)
                                    .put("helpersNames", JSONArray().apply { if (incident.routeHelperName.isNotBlank()) put(incident.routeHelperName) }),
                            )
                        }
                    } else if (incident.type == "INCIDENTE" && incident.amountMxn != null && incident.amountMxn > 0) {
                        val incCentavos = BigDecimal.valueOf(incident.amountMxn)
                            .multiply(BigDecimal(100))
                            .setScale(0, RoundingMode.HALF_UP)
                            .toInt()
                        if (incCentavos > 0) {
                            incidentsJson.put(
                                JSONObject().put("id", "inc-${incident.localId}")
                                    .put("amountCentavos", incCentavos)
                                    .put("description", incident.description)
                                    .put("type", "otro")
                                    .put("driverName", incident.routeDriverName)
                                    .put("helpersNames", JSONArray().apply { if (incident.routeHelperName.isNotBlank()) put(incident.routeHelperName) }),
                            )
                        }
                    }
                }

                var acceptedCount = 0
                if (deliveriesJson.length() > 0 || paymentsJson.length() > 0 || lossesJson.length() > 0 || incidentsJson.length() > 0) {
                    val result = WindowsApiClient.pushAndroidBatch(
                        serverUrl,
                        token,
                        deviceId,
                        JSONObject()
                            .put("deliveries", deliveriesJson)
                            .put("payments", paymentsJson)
                            .put("losses", lossesJson)
                            .put("incidents", incidentsJson),
                    )
                    val accepted = result.optJSONArray("acceptedDeliveryIds") ?: JSONArray()
                    val acceptedSet = (0 until accepted.length()).map { accepted.optString(it) }.toSet()
                    pendingDeliveries.filter { it.localId in acceptedSet }.forEach { repository.markDeliverySynced(it.localId) }
                    acceptedCount = accepted.length()

                    val acceptedPayments = result.optJSONArray("acceptedPaymentIds") ?: JSONArray()
                    val acceptedPaymentSet = (0 until acceptedPayments.length()).map { acceptedPayments.optString(it) }.toSet()
                    pendingAbonos.filter { "pay-${it.localId}" in acceptedPaymentSet }.forEach { repository.markAbonoSynced(it.localId) }

                    val acceptedLosses = result.optJSONArray("acceptedLossIds") ?: JSONArray()
                    val acceptedLossSet = (0 until acceptedLosses.length()).map { acceptedLosses.optString(it) }.toSet()
                    val acceptedIncidents = result.optJSONArray("acceptedIncidentIds") ?: JSONArray()
                    val acceptedIncidentSet = (0 until acceptedIncidents.length()).map { acceptedIncidents.optString(it) }.toSet()
                    pendingIncidents.filter { "loss-${it.localId}" in acceptedLossSet || "inc-${it.localId}" in acceptedIncidentSet }
                        .forEach { repository.markIncidentSynced(it.localId) }

                    val refreshed = WindowsApiClient.downloadSnapshot(serverUrl, token, deviceId)
                    repository.applyWindowsClients(refreshed.customers)
                    repository.applyWindowsInventory(refreshed.eggStocks, refreshed.sugarStock)
                }

                val syncedStamp = snapshot.serverTimeUtc.ifBlank { toUtcIso(System.currentTimeMillis()) }
                directoSessionStore.saveLastSyncIso(syncedStamp)
                _directoLastSyncIso.value = syncedStamp
                _directoSyncStatus.value = if (_directoWsConnected.value) {
                    "Conectado en vivo con Windows"
                } else {
                    "Sincronizado con Windows"
                }

                if (!silent) {
                    val folioNote = if (newlyReservedFolios > 0) ", $newlyReservedFolios folios nuevos" else ""
                    _feedbackMessage.value = "Sincronizado: ${snapshot.customers.size} clientes$folioNote, $acceptedCount entregas enviadas"
                }
            }.onFailure { err ->
                val msg = err.message ?: "Sin conexión con Windows"
                _directoSyncStatus.value = if (msg.contains("autorizado", ignoreCase = true)) {
                    "Pendiente de autorizar este teléfono en Windows"
                } else {
                    "Sin conexión · guardado en cola local"
                }
            }.exceptionOrNull()?.message
        }
    }

    private fun toUtcIso(epochMillis: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(epochMillis))

    val settings: StateFlow<BusinessSettingsEntity> = repository.observeSettings()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), BusinessSettingsEntity())

    val rawClients: StateFlow<List<ClientEntity>> = repository.observeClients()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val deliveries: StateFlow<List<DeliveryEntity>> = repository.observeDeliveries()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val cremeriaDeliveries: StateFlow<List<DeliveryEntity>> = repository.observeCremeriaDeliveries()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val activeAbonos: StateFlow<List<AbonoEntity>> = repository.observeActiveAbonos()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val activeCremeriaAbonos: StateFlow<List<AbonoEntity>> = repository.observeActiveCremeriaAbonos()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val clientsWithDebt: StateFlow<List<ClientWithDebt>> = combine(
        rawClients,
        deliveries,
        activeAbonos,
    ) { clients, allDeliveries, allAbonos ->
        val deliveriesByClient = allDeliveries.groupBy { it.clientId }
        val deliveriesById = allDeliveries.associateBy { it.id }
        val abonosByClient = allAbonos.groupBy { it.clientId }
        clients.map { client ->
            val clientDeliveries = deliveriesByClient[client.id].orEmpty()
            val activeDebt = if (BuildConfig.FLAVOR == "directodegranja") {
                val windowsBase = BigDecimal.valueOf(client.windowsSyncedDebtMxn)
                val unsyncedDebt = clientDeliveries
                    .filter { it.status == "ACTIVA" && it.syncStatus != "RECIBIDA" }
                    .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }
                val unsyncedAbonosOnSynced = abonosByClient[client.id].orEmpty()
                    .filter {
                        !it.isCancelled &&
                            it.syncStatus != "RECIBIDA" &&
                            deliveriesById[it.deliveryId]?.syncStatus == "RECIBIDA"
                    }
                    .fold(BigDecimal.ZERO) { acc, a -> acc.add(BigDecimal.valueOf(a.amountMxn)) }
                windowsBase
                    .add(unsyncedDebt)
                    .subtract(unsyncedAbonosOnSynced)
                    .coerceAtLeast(BigDecimal.ZERO)
                    .setScale(2, RoundingMode.HALF_UP)
                    .toDouble()
            } else {
                clientDeliveries
                    .filter { it.status == "ACTIVA" }
                    .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }
                    .setScale(2, RoundingMode.HALF_UP)
                    .toDouble()
            }
            ClientWithDebt(
                client = client,
                activeDebtMxn = activeDebt,
                deliveryCount = clientDeliveries.size,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val cremeriaAccount = ClientEntity(
        id = SalesChannel.CREMERIA_CLIENT_ID,
        name = SalesChannel.CREMERIA_CLIENT_NAME,
        address = "",
    )
    val cremeriaClientsWithDebt: StateFlow<List<ClientWithDebt>> = cremeriaDeliveries
        .map { allDeliveries ->
            val accountDeliveries = allDeliveries.filter { it.clientId == SalesChannel.CREMERIA_CLIENT_ID }
            val activeDebt = accountDeliveries
                .filter { it.status == "ACTIVA" }
                .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }
                .setScale(2, RoundingMode.HALF_UP)
                .toDouble()
            listOf(ClientWithDebt(cremeriaAccount, activeDebt, accountDeliveries.size))
        }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            listOf(ClientWithDebt(cremeriaAccount, 0.0, 0)),
        )

    val purchases: StateFlow<List<EggPurchaseEntity>> = repository.observePurchases()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val inventoryBrands: StateFlow<List<InventoryBrandEntity>> = repository.observeInventoryBrands()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val sugarPurchases: StateFlow<List<SugarPurchaseEntity>> = repository.observeSugarPurchases()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val sugarInventory: StateFlow<SugarInventoryEntity> = repository.observeSugarInventory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SugarInventoryEntity())

    val reminders: StateFlow<List<ReminderEntity>> = repository.observeReminders()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val dailyClosings: StateFlow<List<DailyClosingEntity>> = repository.observeDailyClosings()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val backups: StateFlow<List<BackupRecordEntity>> = repository.observeBackups()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val routeIncidents: StateFlow<List<RouteIncidentEntity>> = repository.observeRouteIncidents()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val directoPendingSyncCount: StateFlow<Int> = combine(deliveries, activeAbonos, routeIncidents) { dels, abonos, incs ->
        dels.count { it.syncStatus == "PENDIENTE" } +
            abonos.count { it.syncStatus == "PENDIENTE" } +
            incs.count { it.syncStatus == "PENDIENTE" }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    private val crewPrefs = application.getSharedPreferences("route_crew_assignment", android.content.Context.MODE_PRIVATE)
    private val _routeCrew = MutableStateFlow(
        RouteCrewAssignment(
            vendorName = crewPrefs.getString("vendor", "").orEmpty(),
            driverName = crewPrefs.getString("driver", "").orEmpty(),
            helperName = crewPrefs.getString("helper", "").orEmpty(),
        ),
    )
    val routeCrew: StateFlow<RouteCrewAssignment> = _routeCrew.asStateFlow()

    private val _overlayState = MutableStateFlow<OverlayState>(OverlayState.None)
    val overlayState: StateFlow<OverlayState> = _overlayState.asStateFlow()

    private val _deliveryDraft = MutableStateFlow(DeliveryDraftState())
    val deliveryDraft: StateFlow<DeliveryDraftState> = _deliveryDraft.asStateFlow()

    private val _cremeriaDraft = MutableStateFlow(DeliveryDraftState())
    val cremeriaDraft: StateFlow<DeliveryDraftState> = _cremeriaDraft.asStateFlow()

    private fun draftFlow(isCremeria: Boolean) = if (isCremeria) _cremeriaDraft else _deliveryDraft

    private val _feedbackMessage = MutableStateFlow<String?>(null)
    val feedbackMessage: StateFlow<String?> = _feedbackMessage.asStateFlow()

    private val _pendingSafSave = MutableStateFlow<PendingSafSave?>(null)
    val pendingSafSave: StateFlow<PendingSafSave?> = _pendingSafSave.asStateFlow()

    private val _pairedPrinters = MutableStateFlow<List<PairedPrinterDevice>>(emptyList())
    val pairedPrinters: StateFlow<List<PairedPrinterDevice>> = _pairedPrinters.asStateFlow()

    private val _isScanningPrinters = MutableStateFlow(false)
    val isScanningPrinters: StateFlow<Boolean> = _isScanningPrinters.asStateFlow()

    private val _dueTodayBannerReminders = MutableStateFlow<List<ReminderEntity>>(emptyList())
    val dueTodayBannerReminders: StateFlow<List<ReminderEntity>> = _dueTodayBannerReminders.asStateFlow()

    private var startupReminderSoundPlayed = false

    init {
        if (BuildConfig.FLAVOR == "directodegranja" && _directoAuthenticated.value) {
            startDirectoRealtimeLoop()
        }
        viewModelScope.launch {
            reminders.collect { list ->
                val endOfToday = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, 23)
                    set(Calendar.MINUTE, 59)
                    set(Calendar.SECOND, 59)
                    set(Calendar.MILLISECOND, 999)
                }.timeInMillis
                val due = list.filter { !it.isCompleted && it.deliveryDateMillis <= endOfToday }
                _dueTodayBannerReminders.value = due
                if (due.isNotEmpty() && !startupReminderSoundPlayed) {
                    startupReminderSoundPlayed = true
                    soundManager.playNotificationSound()
                }
            }
        }
    }

    override fun onCleared() {
        directoSocketHandle?.close()
        directoSocketHandle = null
        directoLoopJob?.cancel()
        super.onCleared()
    }

    fun clearFeedback() {
        _feedbackMessage.value = null
    }

    fun dismissOverlay() {
        _overlayState.value = OverlayState.None
    }

    fun showFeedback(msg: String) {
        _feedbackMessage.value = msg
    }

    fun saveRouteCrew(vendor: String, driver: String, helper: String) {
        val assignment = RouteCrewAssignment(vendor.trim(), driver.trim(), helper.trim())
        crewPrefs.edit()
            .putString("vendor", assignment.vendorName)
            .putString("driver", assignment.driverName)
            .putString("helper", assignment.helperName)
            .apply()
        _routeCrew.value = assignment
        _feedbackMessage.value = "Personal de ruta guardado en este teléfono"
    }

    fun registerRouteIncident(
        type: String,
        description: String,
        productOrBrand: String,
        quantityText: String,
        amountText: String,
        onDone: () -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                val quantity = quantityText.trim().takeIf { it.isNotEmpty() }?.let {
                    CalculationEngine.parsePositiveDecimal(it).toDouble()
                }
                val amount = amountText.trim().takeIf { it.isNotEmpty() }?.let {
                    CalculationEngine.parsePositiveDecimal(it).toDouble()
                }
                repository.registerRouteIncident(type, description, productOrBrand, quantity, amount)
            }.onSuccess {
                _feedbackMessage.value = if (type == "MERMA") "Merma guardada en este teléfono" else "Incidente guardado en este teléfono"
                if (BuildConfig.FLAVOR == "directodegranja") {
                    viewModelScope.launch { syncDirectoData(silent = true) }
                }
                onDone()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "No se pudo guardar el registro"
            }
        }
    }

    // --- Overlays operacionales (Sección 11) ---
    fun runDeliveriesHistoryLoading() {
        if (_overlayState.value is OverlayState.Loading) return
        viewModelScope.launch {
            try {
                _overlayState.value = OverlayState.Loading(
                    title = "Cargando entregas",
                    message = "Recuperando historial local de notas y folios...",
                )
                delay(2400)
            } finally {
                if (_overlayState.value is OverlayState.Loading) {
                    _overlayState.value = OverlayState.None
                }
            }
        }
    }

    fun openTicketWithLoading(onReady: () -> Unit) {
        if (_overlayState.value is OverlayState.Loading) return
        viewModelScope.launch {
            var completed = false
            try {
                val widthLabel = if (BuildConfig.FLAVOR == "directodegranja") "48 mm" else "60 mm"
                _overlayState.value = OverlayState.Loading(
                    title = "Cargando ticket",
                    message = "Preparando comprobante térmico de $widthLabel...",
                )
                delay(2200)
                completed = true
            } finally {
                if (_overlayState.value is OverlayState.Loading) {
                    _overlayState.value = OverlayState.None
                }
            }
            if (completed) {
                onReady()
            }
        }
    }

    // --- Clientes ---
    fun saveClient(
        id: Long = 0,
        name: String,
        phone: String,
        address: String,
        specialPriceText: String,
        onSaved: () -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                val specialPrice = specialPriceText.trim().takeIf { it.isNotEmpty() }?.let {
                    it.replace(",", ".").toDoubleOrNull()
                        ?: throw IllegalArgumentException("Precio especial inválido")
                }
                repository.saveClient(id, name, phone, address, specialPrice)
            }.onSuccess {
                _feedbackMessage.value = if (id > 0) "Cliente actualizado" else "Cliente registrado"
                onSaved()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al guardar cliente"
            }
        }
    }

    fun updateClientSpecialPrice(clientId: Long, specialPriceText: String) {
        viewModelScope.launch {
            runCatching {
                val parsed = specialPriceText.trim().takeIf { it.isNotEmpty() }?.let {
                    it.replace(",", ".").toDoubleOrNull()
                        ?: throw IllegalArgumentException("Precio especial inválido")
                }
                repository.updateClientSpecialPrice(clientId, parsed)
            }.onSuccess {
                _feedbackMessage.value = "Tarifa del cliente actualizada"
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al actualizar tarifa"
            }
        }
    }

    fun deleteClient(client: ClientEntity) {
        viewModelScope.launch {
            repository.deleteClientIfAllowed(client)
                .onSuccess { _feedbackMessage.value = "Cliente eliminado" }
                .onFailure { _feedbackMessage.value = it.message ?: "No se pudo eliminar el cliente" }
        }
    }

    // --- Compras de huevo ---
    fun registerPurchase(
        purchaseDateMillis: Long,
        boxesText: String,
        brand: String,
        grossWeightText: String,
        onSuccess: () -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                val boxes = CalculationEngine.parsePositiveDecimal(boxesText).toDouble()
                val gross = CalculationEngine.parsePositiveDecimal(grossWeightText).toDouble()
                repository.registerPurchase(purchaseDateMillis, boxes, brand, gross)
            }.onSuccess {
                _feedbackMessage.value = "Compra registrada e inventario actualizado"
                onSuccess()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Datos inválidos en la compra"
            }
        }
    }

    fun registerSugarPurchase(
        purchaseDateMillis: Long,
        sacksText: String,
        totalWeightText: String,
        onSuccess: () -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                val sacks = CalculationEngine.parsePositiveDecimal(sacksText).toDouble()
                val totalWeight = CalculationEngine.parsePositiveDecimal(totalWeightText).toDouble()
                repository.registerSugarPurchase(purchaseDateMillis, sacks, totalWeight)
            }.onSuccess {
                _feedbackMessage.value = "Compra de azúcar registrada e inventario actualizado"
                onSuccess()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Datos inválidos en la compra de azúcar"
            }
        }
    }

    // --- Nueva entrega y flujo de pago ---
    fun startDeliveryForClient(clientId: Long?, isCremeria: Boolean = false) {
        val resolvedClientId = if (isCremeria) SalesChannel.CREMERIA_CLIENT_ID else clientId
        val selectedClient = resolvedClientId?.let { id -> rawClients.value.firstOrNull { it.id == id } }
        val basePrice = selectedClient?.specialPricePerKg ?: settings.value.globalPricePerKg
        draftFlow(isCremeria).value = DeliveryDraftState(
            clientId = resolvedClientId,
            pricePerKgInput = CalculationEngine.formatPlainDecimal(basePrice),
        )
    }

    fun clearDeliveryDraft(isCremeria: Boolean = false) {
        draftFlow(isCremeria).value = DeliveryDraftState()
    }

    fun selectDraftClient(clientId: Long, isCremeria: Boolean = false) {
        if (isCremeria) return
        val selectedClient = rawClients.value.firstOrNull { it.id == clientId }
        draftFlow(isCremeria).update { current ->
            val previousClient = current.clientId?.let { id ->
                rawClients.value.firstOrNull { it.id == id }
            }
            val special = selectedClient?.specialPricePerKg
            val nextPrice = when {
                special != null && special > 0.0 ->
                    CalculationEngine.formatPlainDecimal(special)
                previousClient?.specialPricePerKg != null && settings.value.globalPricePerKg > 0.0 ->
                    CalculationEngine.formatPlainDecimal(settings.value.globalPricePerKg)
                current.pricePerKgInput.isBlank() && settings.value.globalPricePerKg > 0.0 ->
                    CalculationEngine.formatPlainDecimal(settings.value.globalPricePerKg)
                else -> current.pricePerKgInput
            }
            current.copy(clientId = clientId, pricePerKgInput = nextPrice)
        }
    }

    fun updateDraftBrand(brand: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(brand = brand) }
    }

    fun updateDraftModality(modality: DeliveryModality, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(modality = modality) }
    }

    fun updateDraftWeight(weight: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(weightInputKg = weight) }
    }

    fun updateDraftPricePerKg(price: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(pricePerKgInput = price) }
    }

    fun addWeighedBoxItem(isCremeria: Boolean = false) {
        val flow = draftFlow(isCremeria)
        val current = flow.value
        val priceBd = CalculationEngine.parsePositiveDecimal(current.pricePerKgInput)
        if (priceBd <= BigDecimal.ZERO) {
            _feedbackMessage.value = "Ingresa el precio por kilogramo antes de agregar"
            return
        }
        val itemBrand = current.brand.trim()
            .ifBlank { inventoryBrands.value.firstOrNull()?.brand ?: "General" }
        CalculationEngine.calculateSingleBoxItem(
            id = current.nextBoxSeq,
            modality = current.modality,
            weightInputKg = current.weightInputKg,
            brand = itemBrand,
            pricePerKg = priceBd,
        ).onSuccess { item ->
            flow.update {
                it.copy(
                    weighedItems = it.weighedItems + item,
                    weightInputKg = "",
                    nextBoxSeq = it.nextBoxSeq + 1L,
                )
            }
        }.onFailure { err ->
            _feedbackMessage.value = err.message ?: "Ingresa un peso válido para agregar"
        }
    }

    fun removeWeighedBoxItem(itemId: Long, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { current ->
            current.copy(weighedItems = current.weighedItems.filterNot { it.id == itemId })
        }
    }

    fun updateDraftPaymentMethod(method: PaymentMethod, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(paymentMethod = method, initialAbonoInput = if (method == PaymentMethod.CONTADO) "" else it.initialAbonoInput) }
    }

    fun updateDraftInitialAbono(abono: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(initialAbonoInput = abono) }
    }

    fun updateDraftSugarSacks(sacks: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(sugarSacksInput = sacks) }
    }

    fun updateDraftSugarWeightPerSack(weight: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(sugarWeightPerSackInput = weight) }
    }

    fun updateDraftSugarPricePerSack(price: String, isCremeria: Boolean = false) {
        draftFlow(isCremeria).update { it.copy(sugarPricePerSackInput = price) }
    }

    fun computeDraftCalculation(
        draft: DeliveryDraftState,
        @Suppress("UNUSED_PARAMETER") settings: BusinessSettingsEntity,
        @Suppress("UNUSED_PARAMETER") clients: List<ClientWithDebt>,
    ): DeliveryCalculationResult {
        val priceBd = CalculationEngine.parsePositiveDecimal(draft.pricePerKgInput)
        val sugarSummary = CalculationEngine.calculateSugarSummary(
            sacksInput = draft.sugarSacksInput,
            weightPerSackInput = draft.sugarWeightPerSackInput,
            pricePerSackInput = draft.sugarPricePerSackInput,
        )
        return CalculationEngine.calculateDeliveryWithSugar(
            items = draft.weighedItems,
            pricePerKg = priceBd,
            sugarSummary = sugarSummary,
        )
    }

    fun finalizeDelivery(
        signatureBitmap: Bitmap?,
        isCremeria: Boolean = false,
        onCompleted: (Long) -> Unit,
    ) {
        viewModelScope.launch {
            val flow = draftFlow(isCremeria)
            val draft = flow.value
            val clientId = draft.clientId
            val selectedClient = if (isCremeria) {
                ClientEntity(
                    id = SalesChannel.CREMERIA_CLIENT_ID,
                    name = SalesChannel.CREMERIA_CLIENT_NAME,
                    address = "",
                )
            } else {
                clientId?.let { repository.getClientOnce(it) }
            }
            if (selectedClient == null) {
                _feedbackMessage.value = "Seleccione un cliente antes de continuar"
                return@launch
            }
            val priceBd = CalculationEngine.parsePositiveDecimal(draft.pricePerKgInput)
            val sugarSummary = CalculationEngine.calculateSugarSummary(
                sacksInput = draft.sugarSacksInput,
                weightPerSackInput = draft.sugarWeightPerSackInput,
                pricePerSackInput = draft.sugarPricePerSackInput,
            )
            if (sugarSummary.isPartialError) {
                _feedbackMessage.value = "Completa bultos, peso y precio del azúcar (o deja los campos vacíos)"
                return@launch
            }
            if (draft.weighedItems.isEmpty() && !sugarSummary.isPresent) {
                _feedbackMessage.value = "Agrega al menos una caja (+) o bultos de azúcar"
                return@launch
            }
            val calc = CalculationEngine.calculateDeliveryWithSugar(
                items = draft.weighedItems,
                pricePerKg = priceBd,
                sugarSummary = sugarSummary,
            )
            if (!calc.isValid) {
                _feedbackMessage.value = if (draft.weighedItems.isNotEmpty() && priceBd <= BigDecimal.ZERO) {
                    "Ingresa el precio por kilogramo en Nueva Entrega"
                } else {
                    "Verifique cajas pesadas, bultos de azúcar y precios"
                }
                return@launch
            }
            if (draft.paymentMethod == PaymentMethod.CREDITO && signatureBitmap == null) {
                _feedbackMessage.value = "La firma del cliente es obligatoria para entregas a crédito"
                return@launch
            }

            val effectivePrice = if (draft.weighedItems.isEmpty()) {
                0.0
            } else if (calc.pricePerKg > BigDecimal.ZERO) {
                calc.pricePerKg.toDouble()
            } else {
                priceBd.toDouble()
            }
            val finalMxn = calc.finalAmountMxn.toDouble()
            val initialAbono = if (draft.paymentMethod == PaymentMethod.CONTADO) {
                finalMxn
            } else {
                CalculationEngine.parsePositiveDecimal(draft.initialAbonoInput)
                    .toDouble()
                    .coerceIn(0.0, finalMxn)
            }
            val resolvedBrand = if (draft.weighedItems.isNotEmpty()) {
                CalculationEngine.resolveBrandSummaryLabel(
                    fallbackBrand = draft.brand.ifBlank { repository.getDefaultBrandOnce() },
                    items = draft.weighedItems,
                )
            } else {
                "Azúcar"
            }
            val distinctMods = draft.weighedItems.map { it.modality }.distinct()
            val primaryModality = distinctMods.firstOrNull() ?: draft.modality

            runCatching {
                repository.registerDelivery(
                    clientId = selectedClient.id,
                    modality = primaryModality,
                    brand = resolvedBrand,
                    boxes = calc.boxesDecimal.toDouble(),
                    grossWeightKg = calc.inputWeightKg.toDouble(),
                    tareDeductionKg = calc.tareDeductionKg.toDouble(),
                    netWeightKg = calc.netWeightKg.toDouble(),
                    pricePerKg = effectivePrice,
                    rawAmountMxn = calc.rawAmountMxn.toDouble(),
                    finalAmountMxn = finalMxn,
                    paymentMethod = draft.paymentMethod,
                    initialPaymentMxn = initialAbono,
                    signatureBitmap = signatureBitmap,
                    weighedItems = draft.weighedItems,
                    sugarSacks = if (sugarSummary.isPresent) sugarSummary.sacks.toDouble() else 0.0,
                    sugarSackWeightKg = if (sugarSummary.isPresent) sugarSummary.weightPerSackKg.toDouble() else 0.0,
                    sugarPricePerSackMxn = if (sugarSummary.isPresent) sugarSummary.pricePerSackMxn.toDouble() else 0.0,
                    sugarSubtotalMxn = if (sugarSummary.isPresent) sugarSummary.subtotalMxn.toDouble() else 0.0,
                    salesChannel = if (isCremeria) SalesChannel.CREMERIA else SalesChannel.PUBLIC,
                )
            }.onSuccess { deliveryId ->
                soundManager.playPaymentSuccessSound()
                flow.value = DeliveryDraftState()
                if (BuildConfig.FLAVOR == "directodegranja" && !isCremeria) {
                    viewModelScope.launch { syncDirectoData(silent = true) }
                }
                _overlayState.value = OverlayState.Success(
                    title = if (isCremeria) "Entrega de Cremería registrada" else "Entrega registrada",
                    message = if (BuildConfig.FLAVOR == "directodegranja") {
                        "Ticket guardado y enviado en tiempo real a Windows."
                    } else {
                        "El ticket y los saldos locales se guardaron por separado."
                    },
                )
                delay(2600)
                _overlayState.value = OverlayState.None
                onCompleted(deliveryId)
            }.onFailure { err ->
                _feedbackMessage.value = err.message ?: "No se pudo registrar la entrega"
            }
        }
    }

    fun recordAbono(
        clientId: Long,
        deliveryId: Long,
        amountText: String,
        note: String,
        onDone: () -> Unit = {},
        isCremeria: Boolean = false,
    ) {
        viewModelScope.launch {
            runCatching {
                val amount = CalculationEngine.parsePositiveDecimal(amountText).toDouble()
                repository.recordAbono(
                    clientId, deliveryId, amount, note,
                    if (isCremeria) SalesChannel.CREMERIA else SalesChannel.PUBLIC,
                )
            }.onSuccess {
                soundManager.playPaymentSuccessSound()
                if (BuildConfig.FLAVOR == "directodegranja" && !isCremeria) {
                    viewModelScope.launch { syncDirectoData(silent = true) }
                }
                _feedbackMessage.value = "Abono registrado correctamente"
                onDone()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al registrar abono"
            }
        }
    }

    fun cancelDelivery(deliveryId: Long, reason: String, isCremeria: Boolean = false) {
        viewModelScope.launch {
            runCatching {
                repository.cancelDelivery(
                    deliveryId, reason,
                    if (isCremeria) SalesChannel.CREMERIA else SalesChannel.PUBLIC,
                )
            }.onSuccess {
                soundManager.playCancellationSound()
                _overlayState.value = OverlayState.Error(
                    title = "Entrega cancelada",
                    message = "Se conservó el folio y se revirtieron inventario y saldos.",
                )
                delay(2400)
                _overlayState.value = OverlayState.None
            }.onFailure {
                _feedbackMessage.value = it.message ?: "No se pudo cancelar la entrega"
            }
        }
    }

    // --- Recordatorios ---
    fun saveReminder(
        id: Long = 0,
        clientId: Long,
        clientName: String,
        deliveryDateMillis: Long,
        boxesNote: String,
        note: String,
        onSaved: () -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                repository.saveReminder(id, clientId, clientName, deliveryDateMillis, boxesNote, note)
            }.onSuccess {
                soundManager.playNotificationSound()
                _feedbackMessage.value = "Recordatorio guardado y programado"
                onSaved()
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al guardar recordatorio"
            }
        }
    }

    fun toggleReminderCompleted(reminder: ReminderEntity) {
        viewModelScope.launch {
            repository.toggleReminderCompleted(reminder)
            _feedbackMessage.value = if (!reminder.isCompleted) {
                "Recordatorio marcado como completado"
            } else {
                "Recordatorio reactivado"
            }
        }
    }

    fun deleteReminder(reminder: ReminderEntity) {
        viewModelScope.launch {
            repository.deleteReminder(reminder)
            _feedbackMessage.value = "Recordatorio eliminado"
        }
    }

    // --- Cierres diarios ---
    fun generateDailyClosing() {
        viewModelScope.launch {
            runCatching {
                repository.generateDailyClosing()
            }.onSuccess { closing ->
                _overlayState.value = OverlayState.Success(
                    title = "Cierre diario completado",
                    message = "Folio ${closing.folio} guardado en PDF y JSON.",
                )
                delay(2600)
                _overlayState.value = OverlayState.None
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al generar cierre diario"
            }
        }
    }

    // --- Documentos, WhatsApp, Descargas e Impresión ---
    fun printDeliveryTicket(delivery: DeliveryEntity) {
        viewModelScope.launch {
            val currentSettings = repository.getSettingsOnce()
            val client = repository.getClientOnce(delivery.clientId)
            printerManager.printDeliveryTicket(delivery, currentSettings, client)
                .onSuccess { msg -> _feedbackMessage.value = msg }
                .onFailure { err -> _feedbackMessage.value = err.message ?: "Error de impresión" }
        }
    }

    fun shareDeliveryPdfWhatsApp(delivery: DeliveryEntity) {
        viewModelScope.launch {
            runCatching {
                val pdfFile = repository.generateTicketPdf(delivery)
                val uri = FileProvider.getUriForFile(
                    app,
                    "${BuildConfig.APPLICATION_ID}.fileprovider",
                    pdfFile,
                )
                val waIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/pdf"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(
                        Intent.EXTRA_TEXT,
                        "Comprobante ${BuildConfig.BRAND_APP_NAME} • Folio ${delivery.folio}",
                    )
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    setPackage("com.whatsapp")
                }
                try {
                    app.startActivity(waIntent)
                } catch (_: ActivityNotFoundException) {
                    val chooser = Intent.createChooser(
                        Intent(Intent.ACTION_SEND).apply {
                            type = "application/pdf"
                            putExtra(Intent.EXTRA_STREAM, uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        },
                        "Compartir comprobante PDF",
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    app.startActivity(chooser)
                }
            }.onFailure {
                _feedbackMessage.value = "No se pudo compartir el PDF: ${it.message}"
            }
        }
    }

    fun downloadDeliveryPdf(delivery: DeliveryEntity) {
        viewModelScope.launch {
            runCatching {
                repository.generateTicketPdf(delivery)
            }.onSuccess { file ->
                saveOrRequestSaf(file, "application/pdf", file.name, BuildConfig.BRAND_TICKETS_FOLDER)
            }.onFailure {
                _feedbackMessage.value = "Error al generar PDF: ${it.message}"
            }
        }
    }

    fun downloadDeliveryJson(delivery: DeliveryEntity) {
        viewModelScope.launch {
            runCatching {
                repository.generateTicketJson(delivery)
            }.onSuccess { file ->
                saveOrRequestSaf(file, "application/json", file.name, BuildConfig.BRAND_TICKETS_FOLDER)
            }.onFailure {
                _feedbackMessage.value = "Error al generar JSON: ${it.message}"
            }
        }
    }

    fun downloadClosingPdf(closing: DailyClosingEntity) {
        viewModelScope.launch {
            val file = File(closing.pdfPath)
            if (file.exists()) {
                saveOrRequestSaf(file, "application/pdf", file.name, BuildConfig.BRAND_CLOSINGS_FOLDER)
            } else {
                _feedbackMessage.value = "Archivo PDF del cierre no encontrado"
            }
        }
    }

    fun downloadClosingJson(closing: DailyClosingEntity) {
        viewModelScope.launch {
            val file = File(closing.jsonPath)
            if (file.exists()) {
                saveOrRequestSaf(file, "application/json", file.name, BuildConfig.BRAND_CLOSINGS_FOLDER)
            } else {
                _feedbackMessage.value = "Archivo JSON del cierre no encontrado"
            }
        }
    }

    fun createFullBackupZip() {
        viewModelScope.launch {
            runCatching {
                repository.createFullBackupZip()
            }.onSuccess { record ->
                saveOrRequestSaf(File(record.filePath), "application/zip", record.fileName, BuildConfig.BRAND_BACKUPS_FOLDER)
            }.onFailure {
                _feedbackMessage.value = "Error al crear respaldo ZIP: ${it.message}"
            }
        }
    }

    fun exportFullJsonBackup() {
        viewModelScope.launch {
            runCatching {
                repository.exportFullJsonBackup()
            }.onSuccess { record ->
                saveOrRequestSaf(File(record.filePath), "application/json", record.fileName, BuildConfig.BRAND_BACKUPS_FOLDER)
            }.onFailure {
                _feedbackMessage.value = "Error al exportar JSON: ${it.message}"
            }
        }
    }

    fun saveExistingBackupToDownloads(record: BackupRecordEntity) {
        viewModelScope.launch {
            val mime = if (record.format.equals("ZIP", ignoreCase = true)) "application/zip" else "application/json"
            saveOrRequestSaf(File(record.filePath), mime, record.fileName, BuildConfig.BRAND_BACKUPS_FOLDER)
        }
    }

    fun restoreFromUri(uri: Uri) {
        viewModelScope.launch {
            val startedAt = System.currentTimeMillis()
            _overlayState.value = OverlayState.Loading("Restaurando respaldo", "Validando datos locales...")
            val result = repository.restoreBackupFromUri(uri)
            val remaining = (2000L - (System.currentTimeMillis() - startedAt)).coerceAtLeast(0L)
            if (remaining > 0L) delay(remaining)
            _overlayState.value = OverlayState.None
            result.onSuccess { msg ->
                _feedbackMessage.value = msg
            }.onFailure { err ->
                _feedbackMessage.value = err.message ?: "El respaldo es inválido o está dañado"
            }
        }
    }

    fun restoreFromRecord(record: BackupRecordEntity) {
        viewModelScope.launch {
            val startedAt = System.currentTimeMillis()
            _overlayState.value = OverlayState.Loading("Restaurando respaldo", "Recuperando base de datos...")
            val result = repository.restoreFromLocalBackup(record)
            val remaining = (2000L - (System.currentTimeMillis() - startedAt)).coerceAtLeast(0L)
            if (remaining > 0L) delay(remaining)
            _overlayState.value = OverlayState.None
            result.onSuccess { msg ->
                _feedbackMessage.value = msg
            }.onFailure { err ->
                _feedbackMessage.value = err.message ?: "No se pudo restaurar el respaldo"
            }
        }
    }

    private suspend fun saveOrRequestSaf(
        file: File,
        mimeType: String,
        suggestedName: String,
        subFolder: String,
    ) {
        val result = repository.saveFileToPublicDownloads(file, mimeType, subFolder)
        result.onSuccess { msg ->
            _feedbackMessage.value = msg
        }.onFailure { err ->
            if (err is UnsupportedOperationException || mimeType == "application/zip") {
                _pendingSafSave.value = PendingSafSave(file, mimeType, suggestedName)
            } else {
                _feedbackMessage.value = err.message ?: "No se pudo guardar el archivo"
            }
        }
    }

    fun completePendingSafSave(destUri: Uri?) {
        val pending = _pendingSafSave.value ?: return
        _pendingSafSave.value = null
        if (destUri == null) return
        viewModelScope.launch {
            runCatching {
                app.contentResolver.openOutputStream(destUri)?.use { out ->
                    pending.file.inputStream().use { it.copyTo(out) }
                } ?: throw IllegalStateException("No se pudo abrir destino")
            }.onSuccess {
                _feedbackMessage.value = "Archivo guardado: ${pending.suggestedFileName}"
            }.onFailure {
                _feedbackMessage.value = "Error al guardar archivo: ${it.message}"
            }
        }
    }

    // --- Configuración y periféricos ---
    fun saveBusinessConfig(phone: String, address: String, slogan: String, globalPriceText: String) {
        viewModelScope.launch {
            runCatching {
                val price = CalculationEngine.parsePositiveDecimal(globalPriceText).toDouble()
                repository.updateBusinessSettings(phone, address, slogan, price)
            }.onSuccess {
                _feedbackMessage.value = "Configuración guardada"
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error en configuración"
            }
        }
    }

    fun refreshPrinters() {
        val bt = printerManager.getPairedBluetoothPrinters()
        val usb = printerManager.getConnectedUsbPrinters()
        _pairedPrinters.value = (bt + usb).distinctBy { it.type to it.address }
    }

    fun scanPrinters() {
        if (_isScanningPrinters.value) return
        refreshPrinters()
        val result = printerManager.startBluetoothDiscovery(
            onDeviceFound = { found ->
                _pairedPrinters.update { current ->
                    val previous = current.firstOrNull { it.type == found.type && it.address == found.address }
                    val preferred = if (previous?.isLowEnergy == true && !found.isLowEnergy) previous else found
                    (current.filterNot { it.type == found.type && it.address == found.address } + preferred)
                        .distinctBy { it.type to it.address }
                }
            },
            onFinished = {
                _isScanningPrinters.value = false
                _feedbackMessage.value = if (_pairedPrinters.value.any { it.type == "BLUETOOTH" }) {
                    "Búsqueda lista. Toca la impresora para vincularla o seleccionarla."
                } else {
                    "No se encontraron dispositivos. Enciende la impresora y activa su modo de vinculación."
                }
            },
        )
        result.onSuccess { message ->
            _isScanningPrinters.value = true
            _feedbackMessage.value = message
        }.onFailure { error ->
            _isScanningPrinters.value = false
            _feedbackMessage.value = error.message ?: "No se pudo buscar impresoras Bluetooth"
        }
    }

    fun stopPrinterScan() {
        printerManager.cancelBluetoothDiscovery()
        _isScanningPrinters.value = false
    }

    fun selectPrinter(device: PairedPrinterDevice) {
        viewModelScope.launch {
            if (device.type != "BLUETOOTH" || device.isPaired || device.isLowEnergy) {
                savePrinterSelection(device)
                return@launch
            }
            _feedbackMessage.value = "Solicitando vinculación de ${device.name}…"
            val request = printerManager.requestBluetoothPairing(device.address) { pairingResult ->
                viewModelScope.launch {
                    pairingResult.onSuccess {
                        savePrinterSelection(device.copy(isPaired = true))
                        refreshPrinters()
                    }.onFailure {
                        _feedbackMessage.value = it.message ?: "No se pudo vincular la impresora"
                    }
                }
            }
            request.onSuccess { _feedbackMessage.value = it }
                .onFailure { _feedbackMessage.value = it.message ?: "No se pudo iniciar la vinculación" }
        }
    }

    private suspend fun savePrinterSelection(device: PairedPrinterDevice) {
        val transport = if (device.isLowEnergy) "BLE" else "CLASSIC"
        repository.updatePrinterSettings(device.type, device.name, device.address, transport)
        _feedbackMessage.value = when {
            device.type == "USB" -> "Impresora USB seleccionada: ${device.name}"
            device.isLowEnergy && !device.isPaired -> {
                val widthLabel = if (BuildConfig.FLAVOR == "directodegranja") "48mm" else "60mm"
                "Impresora Bluetooth LE seleccionada. Toca Prueba $widthLabel para conectarla."
            }
            else -> "Impresora Bluetooth vinculada y seleccionada: ${device.name}"
        }
    }

    fun selectPrinterType(type: String) {
        viewModelScope.launch {
            val current = repository.getSettingsOnce()
            repository.updatePrinterSettings(type, current.printerName, current.printerAddress, current.printerTransport)
        }
    }

    fun testPrinter() {
        viewModelScope.launch {
            val current = repository.getSettingsOnce()
            printerManager.printTestTicket(current)
                .onSuccess { _feedbackMessage.value = it }
                .onFailure { _feedbackMessage.value = it.message ?: "Error al probar impresora" }
        }
    }

    fun saveCreditLegendConfig(
        creditTermDaysText: String,
        moratoriumInterestText: String,
        paymentPlace: String,
        legendExtra: String,
        legendClosing: String,
    ) {
        viewModelScope.launch {
            runCatching {
                val cleanDays = creditTermDaysText.trim()
                val days = cleanDays.toIntOrNull()
                    ?: throw IllegalArgumentException("Ingresa un número válido de días límite")
                val interestClean = moratoriumInterestText.trim().replace(",", ".")
                val interest = if (interestClean.isEmpty()) {
                    0.0
                } else {
                    interestClean.toDoubleOrNull()
                        ?: throw IllegalArgumentException("Interés moratorio inválido")
                }
                repository.updateCreditLegendSettings(
                    creditTermDays = days,
                    moratoriumInterestPercent = interest,
                    paymentPlace = paymentPlace,
                    legendExtra = legendExtra,
                    legendClosing = legendClosing,
                )
            }.onSuccess {
                _feedbackMessage.value = "Configuración de crédito y leyenda guardada"
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al guardar configuración de crédito"
            }
        }
    }

    fun updateClientCreditTermDays(clientId: Long, daysText: String) {
        viewModelScope.launch {
            runCatching {
                val parsed = daysText.trim().takeIf { it.isNotEmpty() }?.let {
                    it.toIntOrNull()
                        ?: throw IllegalArgumentException("Plazo límite de días inválido")
                }
                repository.updateClientCreditTermDays(clientId, parsed)
            }.onSuccess {
                _feedbackMessage.value = "Plazo de crédito del cliente actualizado"
            }.onFailure {
                _feedbackMessage.value = it.message ?: "Error al actualizar plazo del cliente"
            }
        }
    }
}
