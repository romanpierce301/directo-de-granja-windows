package com.example.data.local.repository

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.room.withTransaction
import com.example.data.local.HyhDatabase
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BackupRecordEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.EggPurchaseEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.BuildConfig
import com.example.data.local.entity.ReminderEntity
import com.example.data.local.entity.SalesChannel
import com.example.data.local.entity.SugarInventoryEntity
import com.example.data.local.entity.SugarPurchaseEntity
import com.example.data.local.entity.RouteIncidentEntity
import com.example.domain.CalculationEngine
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import com.example.domain.WeighedBoxItem
import com.example.system.JsonExporter
import com.example.system.DirectoBusinessSettings
import com.example.system.DirectoEggStock
import com.example.system.DirectoSessionStore
import com.example.system.DirectoSugarStock
import com.example.system.PdfDocumentGenerator
import com.example.system.ReminderScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.zip.ZipInputStream

class HyhRepository(
    private val context: Context,
    private val database: HyhDatabase,
) {
    private val dao = database.hyhDao()

    companion object {
        private const val MAX_RESTORE_BYTES = 25 * 1024 * 1024L // 25 MB safeguard
        private const val MAX_ZIP_ENTRIES = 2000
    }

    fun observeSettings(): Flow<BusinessSettingsEntity> =
        dao.observeSettings().map { it ?: BusinessSettingsEntity() }

    fun observeClients(): Flow<List<ClientEntity>> = dao.observeClients()

    fun observeClientById(id: Long): Flow<ClientEntity?> = dao.observeClientById(id)

    fun observePurchases(): Flow<List<EggPurchaseEntity>> = dao.observePurchases()

    fun observeInventoryBrands(): Flow<List<InventoryBrandEntity>> = dao.observeInventoryBrands()

    fun observeSugarPurchases(): Flow<List<SugarPurchaseEntity>> = dao.observeSugarPurchases()

    fun observeSugarInventory(): Flow<SugarInventoryEntity> =
        dao.observeSugarInventory().map { it ?: SugarInventoryEntity() }

    fun observeDeliveries(): Flow<List<DeliveryEntity>> = dao.observeDeliveries()

    fun observeCremeriaDeliveries(): Flow<List<DeliveryEntity>> = dao.observeCremeriaDeliveries()

    fun observeDeliveryById(id: Long): Flow<DeliveryEntity?> = dao.observeDeliveryById(id)

    fun observeCremeriaDeliveryById(id: Long): Flow<DeliveryEntity?> = dao.observeCremeriaDeliveryById(id)

    fun observeDeliveriesForClient(clientId: Long): Flow<List<DeliveryEntity>> =
        dao.observeDeliveriesForClient(clientId)

    fun observeActiveAbonos(): Flow<List<AbonoEntity>> = dao.observeActiveAbonos()

    fun observeActiveCremeriaAbonos(): Flow<List<AbonoEntity>> = dao.observeActiveCremeriaAbonos()

    fun observeAbonosForClient(clientId: Long): Flow<List<AbonoEntity>> =
        dao.observeAbonosForClient(clientId)

    fun observeReminders(): Flow<List<ReminderEntity>> = dao.observeReminders()

    fun observeDailyClosings(): Flow<List<DailyClosingEntity>> = dao.observeDailyClosings()

    fun observeDailyClosingById(id: Long): Flow<DailyClosingEntity?> =
        dao.observeDailyClosingById(id)

    fun observeBackups(): Flow<List<BackupRecordEntity>> = dao.observeBackups()

    fun observeRouteIncidents(): Flow<List<RouteIncidentEntity>> = dao.observeRouteIncidents()

    suspend fun pendingDeliveriesForSync(): List<DeliveryEntity> = dao.getPendingSyncDeliveries()
    suspend fun pendingAbonosForSync(): List<AbonoEntity> = dao.getPendingSyncAbonos()
    suspend fun pendingIncidentsForSync(): List<RouteIncidentEntity> = dao.getPendingSyncRouteIncidents()
    suspend fun getDeliveryOnce(id: Long): DeliveryEntity? = dao.getDeliveryById(id)
    suspend fun markDeliverySynced(localId: String) = dao.updateDeliverySyncStatus(localId, "RECIBIDA")
    suspend fun markAbonoSynced(localId: String) = dao.updateAbonoSyncStatus(localId, "RECIBIDA")
    suspend fun markIncidentSynced(localId: String) = dao.updateRouteIncidentSyncStatus(localId, "RECIBIDA")

    suspend fun registerRouteIncident(
        type: String,
        description: String,
        productOrBrand: String,
        quantity: Double?,
        amountMxn: Double?,
    ) {
        require(type in setOf("MERMA", "INCIDENTE")) { "Tipo de registro inválido" }
        require(description.isNotBlank()) { "Describe lo ocurrido" }
        require(quantity == null || quantity.isFinite() && quantity >= 0) { "Cantidad inválida" }
        require(amountMxn == null || amountMxn.isFinite() && amountMxn >= 0) { "Importe inválido" }
        if (type == "MERMA") require(quantity != null && quantity > 0) { "Indica la cantidad de la merma" }
        if (type == "INCIDENTE") require(amountMxn != null && amountMxn > 0) { "Indica el importe del incidente" }
        val crew = context.getSharedPreferences("route_crew_assignment", Context.MODE_PRIVATE)
        dao.insertRouteIncident(
            RouteIncidentEntity(
                type = type,
                description = description.trim(),
                productOrBrand = productOrBrand.trim(),
                quantity = quantity,
                amountMxn = amountMxn,
                routeVendorName = crew.getString("vendor", "").orEmpty(),
                routeDriverName = crew.getString("driver", "").orEmpty(),
                routeHelperName = crew.getString("helper", "").orEmpty(),
            ),
        )
    }

    suspend fun ensureDefaultSettings(): BusinessSettingsEntity {
        val current = dao.getSettings()
        if (current != null) return current
        val defaults = BusinessSettingsEntity()
        dao.upsertSettings(defaults)
        return defaults
    }

    suspend fun getSettingsOnce(): BusinessSettingsEntity = ensureDefaultSettings()

    suspend fun getClientOnce(id: Long): ClientEntity? = dao.getClientById(id)

    suspend fun applyWindowsClients(remoteClients: List<ClientEntity>) = database.withTransaction {
        remoteClients.forEach { remote ->
            val windowsId = remote.windowsId ?: return@forEach
            val existing = dao.getClientByWindowsId(windowsId) ?: dao.getClientByName(remote.name)
            if (existing == null) {
                dao.insertClient(remote.copy(id = 0))
            } else {
                dao.updateClient(
                    existing.copy(
                        windowsId = windowsId,
                        name = remote.name,
                        phone = remote.phone,
                        address = remote.address,
                        specialPricePerKg = remote.specialPricePerKg,
                        creditTermDays = remote.creditTermDays,
                        windowsSyncedDebtMxn = remote.windowsSyncedDebtMxn,
                    ),
                )
            }
        }
    }

    suspend fun getEffectiveActiveDebtForClient(clientId: Long): Double {
        if (BuildConfig.FLAVOR != "directodegranja") {
            return dao.getActiveDebtForClient(clientId)
        }
        val client = dao.getClientById(clientId)
        val windowsBase = BigDecimal.valueOf(client?.windowsSyncedDebtMxn ?: 0.0)
        val publicDeliveries = dao.getPublicDeliveriesOnce().filter { it.clientId == clientId }
        val deliveriesById = publicDeliveries.associateBy { it.id }

        val unsyncedDeliveriesDebt = publicDeliveries
            .filter { it.status == "ACTIVA" && it.syncStatus != "RECIBIDA" }
            .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }

        val unsyncedAbonosOnSyncedDeliveries = dao.getAllPublicAbonosOnce()
            .filter {
                it.clientId == clientId &&
                    !it.isCancelled &&
                    it.syncStatus != "RECIBIDA" &&
                    deliveriesById[it.deliveryId]?.syncStatus == "RECIBIDA"
            }
            .fold(BigDecimal.ZERO) { acc, a -> acc.add(BigDecimal.valueOf(a.amountMxn)) }

        return windowsBase
            .add(unsyncedDeliveriesDebt)
            .subtract(unsyncedAbonosOnSyncedDeliveries)
            .coerceAtLeast(BigDecimal.ZERO)
            .setScale(2, RoundingMode.HALF_UP)
            .toDouble()
    }

    suspend fun applyWindowsDailyPrice(pricePerKg: Double) {
        require(pricePerKg.isFinite() && pricePerKg >= 0.0) { "Precio recibido inválido" }
        val current = ensureDefaultSettings()
        dao.upsertSettings(current.copy(globalPricePerKg = pricePerKg))
    }

    suspend fun applyWindowsSettings(remote: DirectoBusinessSettings?) {
        if (remote == null) return
        val current = ensureDefaultSettings()
        dao.upsertSettings(
            current.copy(
                phone = remote.phone.trim().ifBlank { current.phone },
                address = remote.address.trim().ifBlank { current.address },
                slogan = remote.slogan.trim().ifBlank { current.slogan },
            ),
        )
    }

    suspend fun applyWindowsInventory(
        eggStocks: List<DirectoEggStock>,
        sugarStock: DirectoSugarStock?,
    ) = database.withTransaction {
        val pendingDeliveries = dao.getPendingSyncDeliveries().filter { it.status == "ACTIVA" }
        val pendingEggByBrandKey = mutableMapOf<String, Pair<String, BigDecimal>>()
        var pendingSugarSacks = BigDecimal.ZERO
        var pendingSugarKg = BigDecimal.ZERO

        pendingDeliveries.forEach { del ->
            val weighed = CalculationEngine.parseWeighedItemsJson(del.itemsSnapshotJson)
            if (weighed.isNotEmpty()) {
                weighed.forEach { item ->
                    val bName = item.brand.trim().ifBlank { del.brand.trim() }.ifBlank { "General" }
                    val key = bName.lowercase(Locale.US)
                    val prev = pendingEggByBrandKey[key]
                    val nextQty = (prev?.second ?: BigDecimal.ZERO).add(item.boxesDecimal)
                    pendingEggByBrandKey[key] = (prev?.first ?: bName) to nextQty
                }
            } else if (del.boxes > 0.0) {
                val bName = del.brand.trim().ifBlank { "General" }
                val key = bName.lowercase(Locale.US)
                val prev = pendingEggByBrandKey[key]
                val nextQty = (prev?.second ?: BigDecimal.ZERO).add(BigDecimal.valueOf(del.boxes))
                pendingEggByBrandKey[key] = (prev?.first ?: bName) to nextQty
            }
            if (del.sugarSacks > 0.0) {
                val sacksBd = BigDecimal.valueOf(del.sugarSacks)
                pendingSugarSacks = pendingSugarSacks.add(sacksBd)
                pendingSugarKg = pendingSugarKg.add(sacksBd.multiply(BigDecimal.valueOf(del.sugarSackWeightKg)))
            }
        }

        dao.clearInventoryBrands()
        val matchedKeys = mutableSetOf<String>()
        eggStocks.forEach { stock ->
            val key = stock.brand.trim().lowercase(Locale.US)
            matchedKeys.add(key)
            val pending = pendingEggByBrandKey[key]?.second ?: BigDecimal.ZERO
            dao.upsertInventoryBrand(
                InventoryBrandEntity(
                    brand = stock.brand,
                    availableBoxes = stock.availableBoxes,
                    deliveredBoxes = BigDecimal.valueOf(stock.soldBoxes).add(pending).toDouble(),
                ),
            )
        }
        pendingEggByBrandKey.forEach { (key, pair) ->
            if (key !in matchedKeys) {
                dao.upsertInventoryBrand(
                    InventoryBrandEntity(
                        brand = pair.first,
                        availableBoxes = 0.0,
                        deliveredBoxes = pair.second.toDouble(),
                    ),
                )
            }
        }

        if (sugarStock != null) {
            dao.upsertSugarInventory(
                SugarInventoryEntity(
                    id = 1,
                    availableSacks = sugarStock.availableSacks,
                    deliveredSacks = BigDecimal.valueOf(sugarStock.soldSacks).add(pendingSugarSacks).toDouble(),
                    availableWeightKg = sugarStock.availableKg,
                    deliveredWeightKg = pendingSugarKg.toDouble(),
                ),
            )
        } else if (pendingSugarSacks > BigDecimal.ZERO) {
            dao.upsertSugarInventory(
                SugarInventoryEntity(
                    id = 1,
                    availableSacks = 0.0,
                    deliveredSacks = pendingSugarSacks.toDouble(),
                    availableWeightKg = 0.0,
                    deliveredWeightKg = pendingSugarKg.toDouble(),
                ),
            )
        } else {
            dao.clearSugarInventory()
        }
    }

    suspend fun getDefaultBrandOnce(): String =
        dao.getAllInventoryBrandsOnce().firstOrNull()?.brand ?: "General"

    suspend fun updateBusinessSettings(
        phone: String,
        address: String,
        slogan: String,
        globalPricePerKg: Double,
    ) {
        require(globalPricePerKg.isFinite() && globalPricePerKg >= 0.0) {
            "Precio por kilogramo inválido"
        }
        val current = ensureDefaultSettings()
        dao.upsertSettings(
            current.copy(
                phone = phone.trim(),
                address = address.trim(),
                slogan = slogan.trim().ifBlank { BuildConfig.BRAND_SLOGAN },
                globalPricePerKg = globalPricePerKg,
            ),
        )
    }

    suspend fun updatePrinterSettings(type: String, name: String, address: String, transport: String = "CLASSIC") {
        val current = ensureDefaultSettings()
        val safeType = if (type == "USB") "USB" else "BLUETOOTH"
        dao.upsertSettings(
            current.copy(
                printerType = safeType,
                printerName = name.trim(),
                printerAddress = address.trim(),
                printerTransport = if (transport == "BLE") "BLE" else "CLASSIC",
            ),
        )
    }

    suspend fun updateCreditLegendSettings(
        creditTermDays: Int,
        moratoriumInterestPercent: Double,
        paymentPlace: String,
        legendExtra: String,
        legendClosing: String,
    ) {
        require(creditTermDays in 0..3650) {
            "El tiempo límite debe estar entre 0 y 3650 días"
        }
        require(moratoriumInterestPercent.isFinite() && moratoriumInterestPercent in 0.0..100.0) {
            "El interés moratorio debe estar entre 0% y 100%"
        }
        val current = ensureDefaultSettings()
        dao.upsertSettings(
            current.copy(
                creditTermDays = creditTermDays,
                creditMoratoriumInterestPercent = moratoriumInterestPercent,
                creditPaymentPlace = paymentPlace.trim(),
                creditLegendExtra = legendExtra.trim(),
                creditLegendClosing = legendClosing.trim().ifBlank { "Válido con firma digital." },
            ),
        )
    }

    suspend fun updateClientCreditTermDays(clientId: Long, creditTermDays: Int?) {
        if (creditTermDays != null) {
            require(creditTermDays in 0..3650) {
                "El tiempo límite del cliente debe estar entre 0 y 3650 días"
            }
        }
        val client = dao.getClientById(clientId) ?: return
        dao.updateClient(client.copy(creditTermDays = creditTermDays))
    }

    // --- Clientes ---
    suspend fun saveClient(
        id: Long = 0,
        name: String,
        phone: String,
        address: String,
        specialPricePerKg: Double?,
    ): Long {
        val cleanName = name.trim()
        val cleanAddress = address.trim()
        require(cleanName.isNotEmpty()) { "El nombre del cliente es obligatorio" }
        require(cleanAddress.isNotEmpty()) { "La dirección del cliente es obligatoria" }
        if (specialPricePerKg != null) {
            require(specialPricePerKg.isFinite() && specialPricePerKg > 0.0) {
                "El precio especial debe ser mayor a cero"
            }
        }
        return if (id <= 0L) {
            dao.insertClient(
                ClientEntity(
                    name = cleanName,
                    phone = phone.trim(),
                    address = cleanAddress,
                    specialPricePerKg = specialPricePerKg,
                ),
            )
        } else {
            val existing = dao.getClientById(id) ?: throw IllegalStateException("Cliente no encontrado")
            dao.updateClient(
                existing.copy(
                    name = cleanName,
                    phone = phone.trim(),
                    address = cleanAddress,
                    specialPricePerKg = specialPricePerKg,
                ),
            )
            id
        }
    }

    suspend fun updateClientSpecialPrice(clientId: Long, specialPricePerKg: Double?) {
        if (specialPricePerKg != null) {
            require(specialPricePerKg.isFinite() && specialPricePerKg > 0.0) {
                "El precio especial debe ser mayor a cero"
            }
        }
        val client = dao.getClientById(clientId) ?: return
        dao.updateClient(client.copy(specialPricePerKg = specialPricePerKg))
    }

    suspend fun deleteClientIfAllowed(client: ClientEntity): Result<Unit> {
        val count = dao.countDeliveriesForClient(client.id)
        if (count > 0) {
            return Result.failure(
                IllegalStateException("No se puede eliminar un cliente con entregas registradas ($count)."),
            )
        }
        dao.deleteClient(client)
        return Result.success(Unit)
    }

    // --- Compras de huevo e inventario fraccionado ---
    suspend fun registerPurchase(
        purchaseDateMillis: Long,
        boxes: Double,
        brand: String,
        grossWeightKg: Double,
    ) {
        val cleanBrand = brand.trim()
        require(cleanBrand.isNotEmpty()) { "La marca del proveedor es obligatoria" }
        require(boxes.isFinite() && boxes > 0.0) { "La cantidad de cajas debe ser mayor a cero" }
        require(grossWeightKg.isFinite() && grossWeightKg > 0.0) {
            "El peso bruto debe ser mayor a cero"
        }
        database.withTransaction {
            dao.insertPurchase(
                EggPurchaseEntity(
                    purchaseDateMillis = purchaseDateMillis,
                    boxes = boxes,
                    brand = cleanBrand,
                    grossWeightKg = grossWeightKg,
                ),
            )
            val existing = dao.getInventoryBrand(cleanBrand)
            if (existing == null) {
                dao.upsertInventoryBrand(
                    InventoryBrandEntity(
                        brand = cleanBrand,
                        availableBoxes = boxes,
                        deliveredBoxes = 0.0,
                    ),
                )
            } else {
                val updatedAvail = BigDecimal.valueOf(existing.availableBoxes)
                    .add(BigDecimal.valueOf(boxes))
                    .toDouble()
                dao.upsertInventoryBrand(existing.copy(availableBoxes = updatedAvail))
            }
        }
    }

    suspend fun registerSugarPurchase(
        purchaseDateMillis: Long,
        sacks: Double,
        totalWeightKg: Double,
    ) {
        require(sacks.isFinite() && sacks > 0.0) { "La cantidad de bultos de azúcar debe ser mayor a cero" }
        require(totalWeightKg.isFinite() && totalWeightKg > 0.0) {
            "El peso de los bultos de azúcar debe ser mayor a cero"
        }
        database.withTransaction {
            dao.insertSugarPurchase(
                SugarPurchaseEntity(
                    purchaseDateMillis = purchaseDateMillis,
                    sacks = sacks,
                    totalWeightKg = totalWeightKg,
                ),
            )
            val existing = dao.getSugarInventoryOnce()
            if (existing == null) {
                dao.upsertSugarInventory(
                    SugarInventoryEntity(
                        id = 1,
                        availableSacks = sacks,
                        deliveredSacks = 0.0,
                        availableWeightKg = totalWeightKg,
                        deliveredWeightKg = 0.0,
                    ),
                )
            } else {
                val updatedSacks = BigDecimal.valueOf(existing.availableSacks)
                    .add(BigDecimal.valueOf(sacks))
                    .toDouble()
                val updatedWeight = BigDecimal.valueOf(existing.availableWeightKg)
                    .add(BigDecimal.valueOf(totalWeightKg))
                    .toDouble()
                dao.upsertSugarInventory(
                    existing.copy(
                        availableSacks = updatedSacks,
                        availableWeightKg = updatedWeight,
                    ),
                )
            }
        }
    }

    // --- Entregas y Pagos ---
    suspend fun registerDelivery(
        clientId: Long,
        modality: DeliveryModality,
        brand: String,
        boxes: Double,
        grossWeightKg: Double,
        tareDeductionKg: Double,
        netWeightKg: Double,
        pricePerKg: Double,
        rawAmountMxn: Double,
        finalAmountMxn: Double,
        paymentMethod: PaymentMethod,
        initialPaymentMxn: Double,
        signatureBitmap: Bitmap?,
        weighedItems: List<WeighedBoxItem> = emptyList(),
        sugarSacks: Double = 0.0,
        sugarSackWeightKg: Double = 0.0,
        sugarPricePerSackMxn: Double = 0.0,
        sugarSubtotalMxn: Double = 0.0,
        salesChannel: String = SalesChannel.PUBLIC,
    ): Long = withContext(Dispatchers.IO) {
        require(salesChannel in setOf(SalesChannel.PUBLIC, SalesChannel.CREMERIA)) { "Canal de venta inválido" }
        if (BuildConfig.FLAVOR == "directodegranja" && salesChannel == SalesChannel.PUBLIC) {
            val crew = context.getSharedPreferences("route_crew_assignment", Context.MODE_PRIVATE)
            require(!crew.getString("vendor", "").isNullOrBlank()) { "Asigna al vendedor en Personal de ruta antes de registrar entregas" }
            require(!crew.getString("driver", "").isNullOrBlank()) { "Asigna al chofer en Personal de ruta antes de registrar entregas" }
        }
        val hasEggs = boxes > 0.0 || weighedItems.isNotEmpty()
        val hasSugar = sugarSacks > 0.0
        require(hasEggs || hasSugar) { "Agrega al menos una caja de huevo o bultos de azúcar" }
        if (hasEggs) {
            require(boxes.isFinite() && boxes > 0.0) { "Cantidad de cajas inválida" }
            require(grossWeightKg.isFinite() && grossWeightKg > 0.0) { "Peso inválido" }
            require(netWeightKg.isFinite() && netWeightKg > 0.0) { "Peso neto inválido" }
            require(pricePerKg.isFinite() && pricePerKg > 0.0) { "Precio por kilogramo inválido" }
        }
        if (hasSugar) {
            require(sugarSacks.isFinite() && sugarSacks > 0.0) { "Cantidad de bultos de azúcar inválida" }
            require(sugarSackWeightKg.isFinite() && sugarSackWeightKg > 0.0) { "Peso del bulto de azúcar inválido" }
            require(sugarPricePerSackMxn.isFinite() && sugarPricePerSackMxn > 0.0) { "Precio del bulto de azúcar inválido" }
            require(sugarSubtotalMxn.isFinite() && sugarSubtotalMxn > 0.0) { "Importe de azúcar inválido" }
        }
        require(finalAmountMxn.isFinite() && finalAmountMxn > 0.0) { "Importe inválido" }
        require(initialPaymentMxn.isFinite() && initialPaymentMxn >= 0.0) { "Abono inválido" }
        val cleanBrand = if (hasEggs) {
            CalculationEngine.resolveBrandSummaryLabel(brand, weighedItems)
        } else {
            "Azúcar"
        }

        val finalBd = BigDecimal.valueOf(finalAmountMxn).setScale(2, RoundingMode.HALF_UP)
        val initialBd = if (paymentMethod == PaymentMethod.CONTADO) {
            finalBd
        } else {
            BigDecimal.valueOf(initialPaymentMxn)
                .setScale(2, RoundingMode.HALF_UP)
                .coerceIn(BigDecimal.ZERO, finalBd)
        }
        val pendingBd = finalBd.subtract(initialBd).setScale(2, RoundingMode.HALF_UP)
        val distinctModalities = weighedItems.map { it.modality }.distinct()
        val resolvedModalityDb = when {
            !hasEggs && hasSugar -> "AZUCAR"
            distinctModalities.size > 1 -> "MIXTA"
            distinctModalities.size == 1 -> distinctModalities.first().dbValue
            else -> modality.dbValue
        }
        val itemsJson = CalculationEngine.encodeWeighedItemsJson(weighedItems)

        var savedSignatureFile: File? = null
        try {
            database.withTransaction {
                val settings = ensureDefaultSettings()
                val client = if (salesChannel == SalesChannel.CREMERIA) {
                    require(clientId == SalesChannel.CREMERIA_CLIENT_ID) { "La venta debe registrarse para Cremería del Patrón" }
                    ClientEntity(
                        id = SalesChannel.CREMERIA_CLIENT_ID,
                        name = SalesChannel.CREMERIA_CLIENT_NAME,
                        address = "",
                    )
                } else {
                    dao.getClientById(clientId)
                        ?: throw IllegalStateException("Cliente seleccionado no existe")
                }

                val seq = if (salesChannel == SalesChannel.CREMERIA) {
                    settings.nextCremeriaFolioSequence.coerceAtLeast(1)
                } else {
                    settings.nextFolioSequence.coerceAtLeast(1)
                }
                val year = SimpleDateFormat("yyyy", Locale.US).format(Date())
                val folioPrefix = if (salesChannel == SalesChannel.CREMERIA) "CREM" else BuildConfig.BRAND_FILE_PREFIX
                val folio = if (BuildConfig.FLAVOR == "directodegranja" && salesChannel == SalesChannel.PUBLIC) {
                    val reserved = DirectoSessionStore(context).consumeNextFolio()
                        ?: throw IllegalStateException("No hay folios oficiales disponibles. Conéctate a Windows antes de iniciar otra ruta.")
                    String.format(Locale.US, "%s-%04d", reserved.first, reserved.second)
                } else {
                    String.format(Locale.US, "$folioPrefix-%s-%04d", year, seq)
                }

                val signaturePath = if (paymentMethod == PaymentMethod.CREDITO && signatureBitmap != null) {
                    val sigDir = File(context.filesDir, "signatures").apply { mkdirs() }
                    val file = File(sigDir, "Firma_${sanitizeFileName(folio)}.png")
                    FileOutputStream(file).use { out ->
                        signatureBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                    savedSignatureFile = file
                    file.absolutePath
                } else {
                    null
                }

                val previousDebt = if (salesChannel == SalesChannel.CREMERIA) {
                    dao.getActiveCremeriaDebtForClient(client.id)
                } else {
                    getEffectiveActiveDebtForClient(client.id)
                }
                val prevDebtBd = BigDecimal.valueOf(previousDebt).setScale(2, RoundingMode.HALF_UP)
                val totalAccumBd = prevDebtBd.add(pendingBd).setScale(2, RoundingMode.HALF_UP)
                val routeCrewPrefs = context.getSharedPreferences("route_crew_assignment", Context.MODE_PRIVATE)

                val deliveryId = dao.insertDelivery(
                    DeliveryEntity(
                        routeVendorName = routeCrewPrefs.getString("vendor", "").orEmpty(),
                        routeDriverName = routeCrewPrefs.getString("driver", "").orEmpty(),
                        routeHelperName = routeCrewPrefs.getString("helper", "").orEmpty(),
                        folio = folio,
                        clientId = client.id,
                        clientName = client.name,
                        dateMillis = System.currentTimeMillis(),
                        modality = resolvedModalityDb,
                        brand = cleanBrand,
                        boxes = boxes,
                        grossWeightKg = grossWeightKg,
                        tareDeductionKg = tareDeductionKg,
                        netWeightKg = netWeightKg,
                        pricePerKg = pricePerKg,
                        rawAmountMxn = rawAmountMxn,
                        finalAmountMxn = finalBd.toDouble(),
                        paymentMethod = paymentMethod.dbValue,
                        initialPaymentMxn = initialBd.toDouble(),
                        pendingBalanceMxn = pendingBd.toDouble(),
                        previousDebtSnapshotMxn = prevDebtBd.toDouble(),
                        totalAccumulatedDebtSnapshotMxn = totalAccumBd.toDouble(),
                        signaturePath = signaturePath,
                        status = "ACTIVA",
                        itemsSnapshotJson = itemsJson,
                        sugarSacks = if (hasSugar) sugarSacks else 0.0,
                        sugarSackWeightKg = if (hasSugar) sugarSackWeightKg else 0.0,
                        sugarPricePerSackMxn = if (hasSugar) sugarPricePerSackMxn else 0.0,
                        sugarSubtotalMxn = if (hasSugar) sugarSubtotalMxn else 0.0,
                        salesChannel = salesChannel,
                    ),
                )

                // Actualizar inventario fraccionado sin redondear cajas (solo si hay huevo)
                if (hasEggs) {
                    val itemBrandBoxes = weighedItems
                        .map { it.brand.trim().ifBlank { cleanBrand } to it.boxesDecimal }
                        .groupBy({ it.first }, { it.second })
                        .mapValues { (_, list) -> list.fold(BigDecimal.ZERO) { acc, b -> acc.add(b) } }

                    if (itemBrandBoxes.isEmpty()) {
                        val brandStock = dao.getInventoryBrand(cleanBrand)
                        if (brandStock == null) {
                            dao.upsertInventoryBrand(
                                InventoryBrandEntity(
                                    brand = cleanBrand,
                                    availableBoxes = 0.0,
                                    deliveredBoxes = boxes,
                                ),
                            )
                        } else {
                            val newDelivered = BigDecimal.valueOf(brandStock.deliveredBoxes)
                                .add(BigDecimal.valueOf(boxes))
                                .toDouble()
                            dao.upsertInventoryBrand(brandStock.copy(deliveredBoxes = newDelivered))
                        }
                    } else {
                        itemBrandBoxes.forEach { (itemBrand, brandBoxes) ->
                            val brandStock = dao.getInventoryBrand(itemBrand)
                            if (brandStock == null) {
                                dao.upsertInventoryBrand(
                                    InventoryBrandEntity(
                                        brand = itemBrand,
                                        availableBoxes = 0.0,
                                        deliveredBoxes = brandBoxes.toDouble(),
                                    ),
                                )
                            } else {
                                val newDelivered = BigDecimal.valueOf(brandStock.deliveredBoxes)
                                    .add(brandBoxes)
                                    .toDouble()
                                dao.upsertInventoryBrand(brandStock.copy(deliveredBoxes = newDelivered))
                            }
                        }
                    }
                }

                // Actualizar inventario de azúcar si la entrega incluyó bultos
                if (hasSugar) {
                    val sugarWeight = BigDecimal.valueOf(sugarSacks)
                        .multiply(BigDecimal.valueOf(sugarSackWeightKg))
                    val sugarStock = dao.getSugarInventoryOnce()
                    if (sugarStock == null) {
                        dao.upsertSugarInventory(
                            SugarInventoryEntity(
                                id = 1,
                                availableSacks = 0.0,
                                deliveredSacks = sugarSacks,
                                availableWeightKg = 0.0,
                                deliveredWeightKg = sugarWeight.toDouble(),
                            ),
                        )
                    } else {
                        dao.upsertSugarInventory(
                            sugarStock.copy(
                                deliveredSacks = BigDecimal.valueOf(sugarStock.deliveredSacks)
                                    .add(BigDecimal.valueOf(sugarSacks))
                                    .toDouble(),
                                deliveredWeightKg = BigDecimal.valueOf(sugarStock.deliveredWeightKg)
                                    .add(sugarWeight)
                                    .toDouble(),
                            ),
                        )
                    }
                }

                // Consumir siguiente folio y mantener registrado el último precio del huevo por kg
                val shouldUpdateGlobalPrice = salesChannel == SalesChannel.PUBLIC && hasEggs &&
                    (client.specialPricePerKg == null || settings.globalPricePerKg <= 0.0)
                val persistedEggPrice = weighedItems.lastOrNull { it.pricePerKg > BigDecimal.ZERO }
                    ?.pricePerKg?.toDouble() ?: pricePerKg
                dao.upsertSettings(
                    settings.copy(
                        nextFolioSequence = if (salesChannel == SalesChannel.PUBLIC) seq + 1 else settings.nextFolioSequence,
                        nextCremeriaFolioSequence = if (salesChannel == SalesChannel.CREMERIA) seq + 1 else settings.nextCremeriaFolioSequence,
                        globalPricePerKg = if (shouldUpdateGlobalPrice && persistedEggPrice > 0.0) persistedEggPrice else settings.globalPricePerKg,
                    ),
                )
                deliveryId
            }
        } catch (t: Throwable) {
            savedSignatureFile?.delete()
            throw t
        }
    }

    suspend fun recordAbono(
        clientId: Long,
        deliveryId: Long,
        amountMxn: Double,
        note: String,
        salesChannel: String = SalesChannel.PUBLIC,
    ) {
        require(amountMxn.isFinite() && amountMxn > 0.0) { "El abono debe ser mayor a cero" }
        database.withTransaction {
            val delivery = if (salesChannel == SalesChannel.CREMERIA) {
                dao.getCremeriaDeliveryById(deliveryId)
            } else {
                dao.getDeliveryById(deliveryId)
            }
                ?: throw IllegalStateException("Entrega no encontrada")
            if (delivery.status == "CANCELADA") {
                throw IllegalStateException("No se puede abonar a una entrega cancelada")
            }
            if (delivery.clientId != clientId) {
                throw IllegalStateException("La entrega no pertenece al cliente")
            }
            val currentPending = BigDecimal.valueOf(delivery.pendingBalanceMxn)
                .setScale(2, RoundingMode.HALF_UP)
            if (currentPending <= BigDecimal.ZERO) {
                throw IllegalStateException("Esta entrega ya está liquidada")
            }
            val applied = BigDecimal.valueOf(amountMxn)
                .setScale(2, RoundingMode.HALF_UP)
                .coerceAtMost(currentPending)
            val newPending = currentPending.subtract(applied)
                .setScale(2, RoundingMode.HALF_UP)
                .coerceAtLeast(BigDecimal.ZERO)

            dao.updateDelivery(delivery.copy(pendingBalanceMxn = newPending.toDouble()))
            dao.insertAbono(
                AbonoEntity(
                    clientId = clientId,
                    deliveryId = delivery.id,
                    deliveryFolio = delivery.folio,
                    amountMxn = applied.toDouble(),
                    dateMillis = System.currentTimeMillis(),
                    note = note.trim(),
                    isCancelled = false,
                    salesChannel = salesChannel,
                ),
            )
        }
    }

    suspend fun cancelDelivery(deliveryId: Long, reason: String, salesChannel: String = SalesChannel.PUBLIC) {
        database.withTransaction {
            val delivery = if (salesChannel == SalesChannel.CREMERIA) {
                dao.getCremeriaDeliveryById(deliveryId)
            } else {
                dao.getDeliveryById(deliveryId)
            }
                ?: throw IllegalStateException("Entrega no encontrada")
            if (delivery.status == "CANCELADA") {
                throw IllegalStateException("Esta entrega ya fue cancelada")
            }
            dao.updateDelivery(
                delivery.copy(
                    status = "CANCELADA",
                    pendingBalanceMxn = 0.0,
                    cancelledAtMillis = System.currentTimeMillis(),
                    cancellationReason = reason.trim().ifBlank { "Cancelación operativa" },
                ),
            )
            if (salesChannel == SalesChannel.CREMERIA) {
                dao.markCremeriaAbonosCancelledForDelivery(delivery.id)
            } else {
                dao.markAbonosCancelledForDelivery(delivery.id)
            }

            val weighedItems = CalculationEngine.parseWeighedItemsJson(delivery.itemsSnapshotJson)
            val itemBrandBoxes = weighedItems
                .map { it.brand.trim() to it.boxesDecimal }
                .filter { it.first.isNotEmpty() }
                .groupBy({ it.first }, { it.second })
                .mapValues { (_, list) -> list.fold(BigDecimal.ZERO) { acc, b -> acc.add(b) } }

            if (itemBrandBoxes.isEmpty()) {
                if (delivery.boxes > 0.0) {
                    val brandStock = dao.getInventoryBrand(delivery.brand)
                    if (brandStock != null) {
                        val restored = BigDecimal.valueOf(brandStock.deliveredBoxes)
                            .subtract(BigDecimal.valueOf(delivery.boxes))
                            .coerceAtLeast(BigDecimal.ZERO)
                            .toDouble()
                        dao.upsertInventoryBrand(brandStock.copy(deliveredBoxes = restored))
                    }
                }
            } else {
                itemBrandBoxes.forEach { (itemBrand, brandBoxes) ->
                    val brandStock = dao.getInventoryBrand(itemBrand)
                    if (brandStock != null) {
                        val restored = BigDecimal.valueOf(brandStock.deliveredBoxes)
                            .subtract(brandBoxes)
                            .coerceAtLeast(BigDecimal.ZERO)
                            .toDouble()
                        dao.upsertInventoryBrand(brandStock.copy(deliveredBoxes = restored))
                    }
                }
            }

            if (delivery.sugarSacks > 0.0) {
                val sugarStock = dao.getSugarInventoryOnce()
                if (sugarStock != null) {
                    val sugarWeight = BigDecimal.valueOf(delivery.sugarSacks)
                        .multiply(BigDecimal.valueOf(delivery.sugarSackWeightKg))
                    val restoredSacks = BigDecimal.valueOf(sugarStock.deliveredSacks)
                        .subtract(BigDecimal.valueOf(delivery.sugarSacks))
                        .coerceAtLeast(BigDecimal.ZERO)
                        .toDouble()
                    val restoredWeight = BigDecimal.valueOf(sugarStock.deliveredWeightKg)
                        .subtract(sugarWeight)
                        .coerceAtLeast(BigDecimal.ZERO)
                        .toDouble()
                    dao.upsertSugarInventory(
                        sugarStock.copy(
                            deliveredSacks = restoredSacks,
                            deliveredWeightKg = restoredWeight,
                        ),
                    )
                }
            }
        }
    }

    // --- Recordatorios ---
    suspend fun saveReminder(
        id: Long = 0,
        clientId: Long,
        clientName: String,
        deliveryDateMillis: Long,
        boxesNote: String,
        note: String,
    ): Long {
        require(clientName.isNotBlank()) { "El cliente es obligatorio" }
        val entity = ReminderEntity(
            id = if (id > 0) id else 0,
            clientId = clientId,
            clientName = clientName.trim(),
            deliveryDateMillis = deliveryDateMillis,
            boxesNote = boxesNote.trim(),
            note = note.trim(),
            isCompleted = false,
            completedAtMillis = null,
        )
        val savedId = dao.insertReminder(entity)
        val finalEntity = entity.copy(id = savedId)
        ReminderScheduler.scheduleReminderAlarms(context, finalEntity)
        return savedId
    }

    suspend fun toggleReminderCompleted(reminder: ReminderEntity) {
        val nextCompleted = !reminder.isCompleted
        val updated = reminder.copy(
            isCompleted = nextCompleted,
            completedAtMillis = if (nextCompleted) System.currentTimeMillis() else null,
        )
        dao.updateReminder(updated)
        if (nextCompleted) {
            ReminderScheduler.cancelReminderAlarms(context, reminder.id)
        } else {
            ReminderScheduler.scheduleReminderAlarms(context, updated)
        }
    }

    suspend fun deleteReminder(reminder: ReminderEntity) {
        ReminderScheduler.cancelReminderAlarms(context, reminder.id)
        dao.deleteReminder(reminder)
    }

    // --- Cierres Diarios ---
    suspend fun generateDailyClosing(targetDateMillis: Long = System.currentTimeMillis()): DailyClosingEntity =
        withContext(Dispatchers.IO) {
            val dayKeyFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val dateKey = dayKeyFmt.format(Date(targetDateMillis))
            val (startMs, endMs) = dayRangeMillis(targetDateMillis)

            val allDeliveries = dao.getPublicDeliveriesOnce()
            val dayDeliveries = allDeliveries.filter { it.dateMillis in startMs..endMs }
            val activeDayDeliveries = dayDeliveries.filter { it.status == "ACTIVA" }

            val allAbonos = dao.getAllPublicAbonosOnce()
            val dayAbonos = allAbonos.filter { !it.isCancelled && it.dateMillis in startMs..endMs }

            var totalBoxes = BigDecimal.ZERO
            var totalKg = BigDecimal.ZERO
            var cashSales = BigDecimal.ZERO
            var creditSales = BigDecimal.ZERO
            var initialCreditCollected = BigDecimal.ZERO

            activeDayDeliveries.forEach { d ->
                totalBoxes = totalBoxes.add(BigDecimal.valueOf(d.boxes))
                totalKg = totalKg.add(BigDecimal.valueOf(d.netWeightKg))
                    .add(BigDecimal.valueOf(d.sugarSacks).multiply(BigDecimal.valueOf(d.sugarSackWeightKg)))
                if (d.paymentMethod == PaymentMethod.CONTADO.dbValue) {
                    cashSales = cashSales.add(BigDecimal.valueOf(d.finalAmountMxn))
                } else {
                    creditSales = creditSales.add(BigDecimal.valueOf(d.finalAmountMxn))
                    initialCreditCollected = initialCreditCollected.add(BigDecimal.valueOf(d.initialPaymentMxn))
                }
            }

            val abonosSum = dayAbonos.fold(BigDecimal.ZERO) { acc, abono ->
                acc.add(BigDecimal.valueOf(abono.amountMxn))
            }
            val totalMoneyCollected = cashSales.add(initialCreditCollected).add(abonosSum)
            val allPendingDebts = allDeliveries
                .filter { it.status == "ACTIVA" }
                .fold(BigDecimal.ZERO) { acc, d -> acc.add(BigDecimal.valueOf(d.pendingBalanceMxn)) }

            val clientsServed = activeDayDeliveries.map { it.clientId }.distinct().size

            val settings = ensureDefaultSettings()
            val seq = settings.nextClosingSequence.coerceAtLeast(1)
            val compactDate = dateKey.replace("-", "")
            val folio = String.format(Locale.US, "CD-%s-%03d", compactDate, seq)

            val snapshotArr = JSONArray().apply {
                dayDeliveries.forEach { put(JsonExporter.deliveryToJson(it, settings)) }
            }

            val prelim = DailyClosingEntity(
                folio = folio,
                dateKey = dateKey,
                createdAtMillis = System.currentTimeMillis(),
                totalDeliveries = activeDayDeliveries.size,
                totalBoxesDelivered = totalBoxes.toDouble(),
                totalKgDelivered = totalKg.toDouble(),
                cashSalesMxn = cashSales.setScale(2, RoundingMode.HALF_UP).toDouble(),
                creditSalesMxn = creditSales.setScale(2, RoundingMode.HALF_UP).toDouble(),
                abonosReceivedMxn = abonosSum.setScale(2, RoundingMode.HALF_UP).toDouble(),
                totalMoneyCollectedMxn = totalMoneyCollected.setScale(2, RoundingMode.HALF_UP).toDouble(),
                pendingDebtsMxn = allPendingDebts.setScale(2, RoundingMode.HALF_UP).toDouble(),
                clientsServedCount = clientsServed,
                movementsSnapshotJson = snapshotArr.toString(),
                pdfPath = "",
                jsonPath = "",
                hashSignature = sha256Short("$folio|$dateKey|${totalMoneyCollected.toPlainString()}|${dayDeliveries.size}"),
            )

            val pdfFile = PdfDocumentGenerator.generateDailyClosingPdf(context, prelim, dayDeliveries, settings)
            val cierresDir = File(context.filesDir, "cierres").apply { mkdirs() }
            val jsonFile = File(cierresDir, "Cierre_${sanitizeFileName(folio)}.json")
            jsonFile.writeText(
                JsonExporter.closingToJson(prelim, dayDeliveries, settings).toString(2),
                Charsets.UTF_8,
            )

            val finalClosing = prelim.copy(
                pdfPath = pdfFile.absolutePath,
                jsonPath = jsonFile.absolutePath,
            )
            database.withTransaction {
                val id = dao.insertDailyClosing(finalClosing)
                dao.upsertSettings(settings.copy(nextClosingSequence = seq + 1))
                finalClosing.copy(id = id)
            }
        }

    // --- Documentos y Respaldos Locales ---
    suspend fun generateTicketPdf(delivery: DeliveryEntity): File = withContext(Dispatchers.IO) {
        val settings = ensureDefaultSettings()
        val client = dao.getClientById(delivery.clientId)
        PdfDocumentGenerator.generateTicketPdf(context, delivery, settings, client)
    }

    suspend fun generateTicketJson(delivery: DeliveryEntity): File = withContext(Dispatchers.IO) {
        val settings = ensureDefaultSettings()
        JsonExporter.writeDeliveryJsonFile(context, delivery, settings)
    }

    suspend fun createFullBackupZip(): BackupRecordEntity = withContext(Dispatchers.IO) {
        val settings = ensureDefaultSettings()
        val clients = dao.getAllClientsOnce()
        val purchases = dao.getAllPurchasesOnce()
        val inventory = dao.getAllInventoryBrandsOnce()
        val deliveries = dao.getAllDeliveriesOnce()
        val abonos = dao.getAllAbonosOnce()
        val reminders = dao.getAllRemindersOnce()
        val closings = dao.getAllDailyClosingsOnce()
        val sugarPurchases = dao.getAllSugarPurchasesOnce()
        val sugarInventory = dao.getSugarInventoryOnce()

        val zipFile = JsonExporter.createFullBackupZip(
            context = context,
            settings = settings,
            clients = clients,
            purchases = purchases,
            inventory = inventory,
            deliveries = deliveries,
            abonos = abonos,
            reminders = reminders,
            closings = closings,
            sugarPurchases = sugarPurchases,
            sugarInventory = sugarInventory,
        )
        val record = BackupRecordEntity(
            fileName = zipFile.name,
            filePath = zipFile.absolutePath,
            format = "ZIP",
            sizeBytes = zipFile.length(),
        )
        val id = dao.insertBackupRecord(record)
        record.copy(id = id)
    }

    suspend fun exportFullJsonBackup(): BackupRecordEntity = withContext(Dispatchers.IO) {
        val settings = ensureDefaultSettings()
        val dir = File(context.filesDir, "backups").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val jsonFile = File(dir, "Respaldo_${BuildConfig.BRAND_FILE_PREFIX}_$stamp.json")
        val jsonObj = JsonExporter.buildFullDatabaseJson(
            settings = settings,
            clients = dao.getAllClientsOnce(),
            purchases = dao.getAllPurchasesOnce(),
            inventory = dao.getAllInventoryBrandsOnce(),
            deliveries = dao.getAllDeliveriesOnce(),
            abonos = dao.getAllAbonosOnce(),
            reminders = dao.getAllRemindersOnce(),
            closings = dao.getAllDailyClosingsOnce(),
            sugarPurchases = dao.getAllSugarPurchasesOnce(),
            sugarInventory = dao.getSugarInventoryOnce(),
        )
        jsonFile.writeText(jsonObj.toString(2), Charsets.UTF_8)
        val record = BackupRecordEntity(
            fileName = jsonFile.name,
            filePath = jsonFile.absolutePath,
            format = "JSON",
            sizeBytes = jsonFile.length(),
        )
        val id = dao.insertBackupRecord(record)
        record.copy(id = id)
    }

    /**
     * Restaura un respaldo .ZIP o .JSON validando contra Zip Slip, tamaños excesivos y estructura.
     */
    suspend fun restoreBackupFromUri(uri: Uri): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val mime = context.contentResolver.getType(uri).orEmpty()
            val nameHint = uri.lastPathSegment.orEmpty().lowercase(Locale.US)
            val isZip = mime.contains("zip") || nameHint.endsWith(".zip")

            if (isZip) {
                restoreFromZipStream {
                    context.contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException("No se pudo abrir el archivo ZIP")
                }
            } else {
                val rawBytes = context.contentResolver.openInputStream(uri)?.use { input ->
                    readLimitedBytes(input, MAX_RESTORE_BYTES)
                } ?: throw IllegalStateException("No se pudo leer el archivo JSON")
                restoreFromJsonString(String(rawBytes, Charsets.UTF_8), emptyMap())
            }
        }
    }

    suspend fun restoreFromLocalBackup(record: BackupRecordEntity): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val file = File(record.filePath)
            if (!file.exists()) throw IllegalStateException("El archivo de respaldo local ya no existe")
            if (record.format.equals("ZIP", ignoreCase = true) || file.extension.equals("zip", ignoreCase = true)) {
                restoreFromZipStream { file.inputStream() }
            } else {
                val bytes = file.inputStream().use { readLimitedBytes(it, MAX_RESTORE_BYTES) }
                restoreFromJsonString(String(bytes, Charsets.UTF_8), emptyMap())
            }
        }
    }

    private suspend fun restoreFromZipStream(streamProvider: () -> java.io.InputStream): String {
        val signaturesDir = File(context.filesDir, "signatures").apply { mkdirs() }
        val canonicalSigDir = signaturesDir.canonicalFile
        var mainJsonText: String? = null
        val restoredSignaturePaths = mutableMapOf<String, String>()
        var totalBytesRead = 0L
        var entryCount = 0

        ZipInputStream(streamProvider()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                entryCount++
                if (entryCount > MAX_ZIP_ENTRIES) {
                    throw IllegalArgumentException("El paquete ZIP excede el límite de archivos permitido")
                }
                val entryName = entry.name
                if (!entry.isDirectory) {
                    val bytes = readLimitedBytes(zis, MAX_RESTORE_BYTES - totalBytesRead)
                    totalBytesRead += bytes.size
                    if (totalBytesRead > MAX_RESTORE_BYTES) {
                        throw IllegalArgumentException("El paquete ZIP excede el tamaño máximo permitido (25 MB)")
                    }
                    when {
                        entryName == "datos_generales.json" -> {
                            mainJsonText = String(bytes, Charsets.UTF_8)
                        }
                        entryName.startsWith("firmas/") && entryName.endsWith(".png", ignoreCase = true) -> {
                            val safeName = sanitizeFileName(File(entryName).name)
                            if (safeName.isNotBlank()) {
                                val target = File(canonicalSigDir, safeName).canonicalFile
                                if (!target.path.startsWith(canonicalSigDir.path + File.separator)) {
                                    throw SecurityException("Ruta inválida en archivo ZIP")
                                }
                                target.writeBytes(bytes)
                                restoredSignaturePaths[safeName] = target.absolutePath
                            }
                        }
                    }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }

        val jsonPayload = mainJsonText
            ?: throw IllegalArgumentException("El archivo ZIP no contiene datos_generales.json válido")
        return restoreFromJsonString(jsonPayload, restoredSignaturePaths)
    }

    private suspend fun restoreFromJsonString(
        jsonString: String,
        restoredSignaturesByFileName: Map<String, String>,
    ): String {
        val root = JSONObject(jsonString)
        if (!root.has("clients") || !root.has("deliveries")) {
            throw IllegalArgumentException("El archivo JSON no corresponde a un respaldo de ${BuildConfig.BRAND_APP_NAME}")
        }

        val sObj = root.optJSONObject("settings")
        val settings = BusinessSettingsEntity(
            id = 1,
            businessName = BuildConfig.BRAND_APP_NAME,
            slogan = sObj?.optString("slogan", BuildConfig.BRAND_SLOGAN)
                ?.ifBlank { BuildConfig.BRAND_SLOGAN } ?: BuildConfig.BRAND_SLOGAN,
            phone = sObj?.optString("phone", "") ?: "",
            address = sObj?.optString("address", "") ?: "",
            globalPricePerKg = sObj?.optDouble("globalPricePerKg", 0.0)?.takeIf { it.isFinite() && it >= 0 } ?: 0.0,
            printerType = sObj?.optString("printerType", "BLUETOOTH") ?: "BLUETOOTH",
            printerName = sObj?.optString("printerName", "") ?: "",
            printerAddress = sObj?.optString("printerAddress", "") ?: "",
            printerTransport = if (sObj?.optString("printerTransport", "CLASSIC") == "BLE") "BLE" else "CLASSIC",
            nextFolioSequence = sObj?.optInt("nextFolioSequence", 1)?.coerceAtLeast(1) ?: 1,
            nextCremeriaFolioSequence = sObj?.optInt("nextCremeriaFolioSequence", 1)?.coerceAtLeast(1) ?: 1,
            nextClosingSequence = sObj?.optInt("nextClosingSequence", 1)?.coerceAtLeast(1) ?: 1,
            creditTermDays = sObj?.optInt("creditTermDays", 7)?.coerceIn(0, 3650) ?: 7,
            creditMoratoriumInterestPercent = sObj?.optDouble("creditMoratoriumInterestPercent", 0.0)
                ?.takeIf { it.isFinite() && it in 0.0..100.0 } ?: 0.0,
            creditPaymentPlace = sObj?.optString("creditPaymentPlace", "") ?: "",
            creditLegendExtra = sObj?.optString("creditLegendExtra", "") ?: "",
            creditLegendClosing = sObj?.optString("creditLegendClosing", "Válido con firma digital.")
                ?.ifBlank { "Válido con firma digital." } ?: "Válido con firma digital.",
        )

        fun Double.nonNegOrZero(): Double = if (isFinite() && this >= 0.0) this else 0.0

        val clients = parseJsonArray(root.optJSONArray("clients")) { o ->
            ClientEntity(
                id = o.getLong("id"),
                windowsId = if (o.isNull("windowsId")) null else o.optString("windowsId").takeIf { it.isNotBlank() },
                name = o.getString("name"),
                phone = o.optString("phone", ""),
                address = o.optString("address", ""),
                specialPricePerKg = if (o.isNull("specialPricePerKg")) null else o.optDouble("specialPricePerKg").takeIf { it.isFinite() && it >= 0.0 },
                creditTermDays = if (o.isNull("creditTermDays")) null else o.optInt("creditTermDays").coerceIn(0, 3650),
                windowsSyncedDebtMxn = o.optDouble("windowsSyncedDebtMxn", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                createdAtMillis = o.optLong("createdAtMillis", System.currentTimeMillis()),
            )
        }
        val purchases = parseJsonArray(root.optJSONArray("purchases")) { o ->
            EggPurchaseEntity(
                id = o.getLong("id"),
                purchaseDateMillis = o.getLong("purchaseDateMillis"),
                boxes = o.getDouble("boxes").nonNegOrZero(),
                brand = o.getString("brand"),
                grossWeightKg = o.getDouble("grossWeightKg").nonNegOrZero(),
                createdAtMillis = o.optLong("createdAtMillis", System.currentTimeMillis()),
            )
        }
        val inventory = parseJsonArray(root.optJSONArray("inventory")) { o ->
            InventoryBrandEntity(
                brand = o.getString("brand"),
                availableBoxes = o.getDouble("availableBoxes").nonNegOrZero(),
                deliveredBoxes = o.getDouble("deliveredBoxes").nonNegOrZero(),
            )
        }
        val deliveries = parseJsonArray(root.optJSONArray("deliveries")) { o ->
            val rawSigPath = if (o.isNull("signaturePath")) null else o.optString("signaturePath", null)
            val resolvedSigPath = rawSigPath?.let { path ->
                val fileName = sanitizeFileName(File(path).name)
                restoredSignaturesByFileName[fileName]
            }
            DeliveryEntity(
                id = o.getLong("id"),
                folio = o.getString("folio"),
                clientId = o.getLong("clientId"),
                clientName = o.getString("clientName"),
                dateMillis = o.getLong("dateMillis"),
                modality = o.getString("modality"),
                brand = o.getString("brand"),
                boxes = o.getDouble("boxes"),
                grossWeightKg = o.getDouble("grossWeightKg"),
                tareDeductionKg = o.getDouble("tareDeductionKg"),
                netWeightKg = o.getDouble("netWeightKg"),
                pricePerKg = o.getDouble("pricePerKg"),
                rawAmountMxn = o.getDouble("rawAmountMxn"),
                finalAmountMxn = o.getDouble("finalAmountMxn"),
                paymentMethod = o.getString("paymentMethod"),
                initialPaymentMxn = o.getDouble("initialPaymentMxn"),
                pendingBalanceMxn = o.getDouble("pendingBalanceMxn"),
                previousDebtSnapshotMxn = o.getDouble("previousDebtSnapshotMxn"),
                totalAccumulatedDebtSnapshotMxn = o.getDouble("totalAccumulatedDebtSnapshotMxn"),
                signaturePath = resolvedSigPath,
                status = o.optString("status", "ACTIVA"),
                cancelledAtMillis = if (o.isNull("cancelledAtMillis")) null else o.optLong("cancelledAtMillis"),
                cancellationReason = if (o.isNull("cancellationReason")) null else o.optString("cancellationReason", null),
                itemsSnapshotJson = o.optString("itemsSnapshotJson", "[]"),
                sugarSacks = o.optDouble("sugarSacks", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                sugarSackWeightKg = o.optDouble("sugarSackWeightKg", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                sugarPricePerSackMxn = o.optDouble("sugarPricePerSackMxn", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                sugarSubtotalMxn = o.optDouble("sugarSubtotalMxn", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                salesChannel = o.optString("salesChannel", SalesChannel.PUBLIC),
            )
        }
        val abonos = parseJsonArray(root.optJSONArray("abonos")) { o ->
            AbonoEntity(
                id = o.getLong("id"),
                clientId = o.getLong("clientId"),
                deliveryId = o.getLong("deliveryId"),
                deliveryFolio = o.getString("deliveryFolio"),
                amountMxn = o.getDouble("amountMxn").nonNegOrZero(),
                dateMillis = o.getLong("dateMillis"),
                note = o.optString("note", ""),
                isCancelled = o.optBoolean("isCancelled", false),
                salesChannel = o.optString("salesChannel", SalesChannel.PUBLIC),
            )
        }
        val reminders = parseJsonArray(root.optJSONArray("reminders")) { o ->
            ReminderEntity(
                id = o.getLong("id"),
                clientId = o.getLong("clientId"),
                clientName = o.getString("clientName"),
                deliveryDateMillis = o.getLong("deliveryDateMillis"),
                boxesNote = o.optString("boxesNote", ""),
                note = o.optString("note", ""),
                isCompleted = o.optBoolean("isCompleted", false),
                completedAtMillis = if (o.isNull("completedAtMillis")) null else o.optLong("completedAtMillis"),
                createdAtMillis = o.optLong("createdAtMillis", System.currentTimeMillis()),
            )
        }
        val closings = parseJsonArray(root.optJSONArray("closings")) { o ->
            val cierresDir = File(context.filesDir, "cierres").canonicalFile
            val rawPdf = sanitizeFileName(File(o.optString("pdfPath", "")).name)
            val rawJson = sanitizeFileName(File(o.optString("jsonPath", "")).name)
            val safePdf = File(cierresDir, rawPdf).takeIf { rawPdf.isNotBlank() && it.exists() }?.absolutePath ?: ""
            val safeJson = File(cierresDir, rawJson).takeIf { rawJson.isNotBlank() && it.exists() }?.absolutePath ?: ""
            DailyClosingEntity(
                id = o.getLong("id"),
                folio = o.getString("folio"),
                dateKey = o.getString("dateKey"),
                createdAtMillis = o.getLong("createdAtMillis"),
                totalDeliveries = o.getInt("totalDeliveries"),
                totalBoxesDelivered = o.getDouble("totalBoxesDelivered"),
                totalKgDelivered = o.getDouble("totalKgDelivered"),
                cashSalesMxn = o.getDouble("cashSalesMxn"),
                creditSalesMxn = o.getDouble("creditSalesMxn"),
                abonosReceivedMxn = o.getDouble("abonosReceivedMxn"),
                totalMoneyCollectedMxn = o.getDouble("totalMoneyCollectedMxn"),
                pendingDebtsMxn = o.getDouble("pendingDebtsMxn"),
                clientsServedCount = o.getInt("clientsServedCount"),
                movementsSnapshotJson = o.optString("movementsSnapshotJson", "[]"),
                pdfPath = safePdf,
                jsonPath = safeJson,
                hashSignature = o.optString("hashSignature", ""),
            )
        }
        val sugarPurchases = parseJsonArray(root.optJSONArray("sugarPurchases")) { o ->
            SugarPurchaseEntity(
                id = o.getLong("id"),
                purchaseDateMillis = o.getLong("purchaseDateMillis"),
                sacks = o.getDouble("sacks").nonNegOrZero(),
                totalWeightKg = o.getDouble("totalWeightKg").nonNegOrZero(),
                createdAtMillis = o.optLong("createdAtMillis", System.currentTimeMillis()),
            )
        }
        val sugarInventory = root.optJSONObject("sugarInventory")?.let { o ->
            SugarInventoryEntity(
                id = 1,
                availableSacks = o.optDouble("availableSacks", 0.0).nonNegOrZero(),
                deliveredSacks = o.optDouble("deliveredSacks", 0.0).nonNegOrZero(),
                availableWeightKg = o.optDouble("availableWeightKg", 0.0).nonNegOrZero(),
                deliveredWeightKg = o.optDouble("deliveredWeightKg", 0.0).nonNegOrZero(),
            )
        }

        database.withTransaction {
            dao.clearAbonos()
            dao.clearDeliveries()
            dao.clearPurchases()
            dao.clearInventoryBrands()
            dao.clearReminders()
            dao.clearClosings()
            dao.clearClients()
            dao.clearSugarPurchases()
            dao.clearSugarInventory()

            dao.upsertSettings(settings)
            clients.forEach { dao.insertClient(it) }
            purchases.forEach { dao.insertPurchase(it) }
            inventory.forEach { dao.upsertInventoryBrand(it) }
            deliveries.forEach { dao.insertDelivery(it) }
            abonos.forEach { dao.insertAbono(it) }
            reminders.forEach { dao.insertReminder(it) }
            closings.forEach { dao.insertDailyClosing(it) }
            sugarPurchases.forEach { dao.insertSugarPurchase(it) }
            if (sugarInventory != null) dao.upsertSugarInventory(sugarInventory)
        }

        reminders.filter { !it.isCompleted }.forEach {
            ReminderScheduler.scheduleReminderAlarms(context, it)
        }

        return "Respaldo restaurado: ${clients.size} clientes, ${deliveries.size} entregas, ${closings.size} cierres."
    }

    suspend fun saveFileToPublicDownloads(
        sourceFile: File,
        mimeType: String,
        subFolder: String = BuildConfig.BRAND_TICKETS_FOLDER,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            if (!sourceFile.exists()) throw IllegalStateException("Archivo no encontrado")
            val safeName = sanitizeFileName(sourceFile.name)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$subFolder")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("No se pudo crear archivo en Descargas")
                resolver.openOutputStream(uri)?.use { out ->
                    sourceFile.inputStream().use { it.copyTo(out) }
                } ?: throw IllegalStateException("No se pudo escribir en Descargas")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                "Guardado en Descargas/$subFolder/$safeName"
            } else {
                throw UnsupportedOperationException("USE_SAF")
            }
        }
    }

    suspend fun loadSignatureBitmap(path: String?): Bitmap? = withContext(Dispatchers.IO) {
        if (path.isNullOrBlank()) return@withContext null
        val file = File(path)
        if (!file.exists()) null else BitmapFactory.decodeFile(file.absolutePath)
    }

    private fun <T> parseJsonArray(array: JSONArray?, mapper: (JSONObject) -> T): List<T> {
        if (array == null) return emptyList()
        return buildList(array.length()) {
            for (i in 0 until array.length()) {
                add(mapper(array.getJSONObject(i)))
            }
        }
    }

    private fun readLimitedBytes(input: java.io.InputStream, limit: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0L
        while (true) {
            val count = input.read(buffer)
            if (count <= 0) break
            total += count
            if (total > limit) {
                throw IllegalArgumentException("El archivo excede el tamaño máximo permitido")
            }
            out.write(buffer, 0, count)
        }
        return out.toByteArray()
    }

    private fun dayRangeMillis(timestamp: Long): Pair<Long, Long> {
        val start = Calendar.getInstance().apply {
            timeInMillis = timestamp
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val end = Calendar.getInstance().apply {
            timeInMillis = timestamp
            set(Calendar.HOUR_OF_DAY, 23)
            set(Calendar.MINUTE, 59)
            set(Calendar.SECOND, 59)
            set(Calendar.MILLISECOND, 999)
        }.timeInMillis
        return start to end
    }

    private fun sanitizeFileName(raw: String): String =
        raw.replace(Regex("[^a-zA-Z0-9._-]"), "_")

    private fun sha256Short(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.take(6).joinToString("") { "%02x".format(it) }
    }
}
