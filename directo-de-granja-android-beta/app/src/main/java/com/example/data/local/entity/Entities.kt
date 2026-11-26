package com.example.data.local.entity

import com.example.BuildConfig

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.PrimaryKey

object SalesChannel {
    const val PUBLIC = "PUBLIC"
    const val CREMERIA = "CREMERIA"
    const val CREMERIA_CLIENT_ID = -1L
    const val CREMERIA_CLIENT_NAME = "Cremería del Patrón"
}

@Entity(tableName = "clients")
data class ClientEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val windowsId: String? = null,
    val name: String,
    val phone: String = "",
    val address: String,
    val specialPricePerKg: Double? = null,
    val creditTermDays: Int? = null,
    @ColumnInfo(defaultValue = "0.0") val windowsSyncedDebtMxn: Double = 0.0,
    val createdAtMillis: Long = System.currentTimeMillis(),
)

@Entity(tableName = "egg_purchases")
data class EggPurchaseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val purchaseDateMillis: Long,
    val boxes: Double,
    val brand: String,
    val grossWeightKg: Double,
    val createdAtMillis: Long = System.currentTimeMillis(),
)

@Entity(tableName = "inventory_brands")
data class InventoryBrandEntity(
    @PrimaryKey val brand: String,
    val availableBoxes: Double = 0.0,
    val deliveredBoxes: Double = 0.0,
) {
    val remainingBoxes: Double
        get() = (java.math.BigDecimal.valueOf(availableBoxes)
            .subtract(java.math.BigDecimal.valueOf(deliveredBoxes))).toDouble()
}

@Entity(tableName = "sugar_purchases")
data class SugarPurchaseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val purchaseDateMillis: Long,
    val sacks: Double,
    val totalWeightKg: Double,
    val createdAtMillis: Long = System.currentTimeMillis(),
)

@Entity(tableName = "sugar_inventory")
data class SugarInventoryEntity(
    @PrimaryKey val id: Int = 1,
    val availableSacks: Double = 0.0,
    val deliveredSacks: Double = 0.0,
    val availableWeightKg: Double = 0.0,
    val deliveredWeightKg: Double = 0.0,
) {
    val remainingSacks: Double
        get() = (java.math.BigDecimal.valueOf(availableSacks)
            .subtract(java.math.BigDecimal.valueOf(deliveredSacks))).toDouble()

    val remainingWeightKg: Double
        get() = (java.math.BigDecimal.valueOf(availableWeightKg)
            .subtract(java.math.BigDecimal.valueOf(deliveredWeightKg))).toDouble()
}

@Entity(tableName = "deliveries")
data class DeliveryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(defaultValue = "''") val localId: String = java.util.UUID.randomUUID().toString(),
    @ColumnInfo(defaultValue = "'LOCAL'") val syncStatus: String = "PENDIENTE",
    @ColumnInfo(defaultValue = "''") val routeVendorName: String = "",
    @ColumnInfo(defaultValue = "''") val routeDriverName: String = "",
    @ColumnInfo(defaultValue = "''") val routeHelperName: String = "",
    val folio: String,
    val clientId: Long,
    val clientName: String,
    val dateMillis: Long,
    val modality: String,
    val brand: String,
    val boxes: Double,
    val grossWeightKg: Double,
    val tareDeductionKg: Double,
    val netWeightKg: Double,
    val pricePerKg: Double,
    val rawAmountMxn: Double,
    val finalAmountMxn: Double,
    val paymentMethod: String,
    val initialPaymentMxn: Double,
    val pendingBalanceMxn: Double,
    val previousDebtSnapshotMxn: Double,
    val totalAccumulatedDebtSnapshotMxn: Double,
    val signaturePath: String? = null,
    val status: String = "ACTIVA",
    val cancelledAtMillis: Long? = null,
    val cancellationReason: String? = null,
    val itemsSnapshotJson: String = "[]",
    val sugarSacks: Double = 0.0,
    val sugarSackWeightKg: Double = 0.0,
    val sugarPricePerSackMxn: Double = 0.0,
    val sugarSubtotalMxn: Double = 0.0,
    val salesChannel: String = "PUBLIC",
)

@Entity(tableName = "abonos")
data class AbonoEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(defaultValue = "''") val localId: String = java.util.UUID.randomUUID().toString(),
    @ColumnInfo(defaultValue = "'LOCAL'") val syncStatus: String = "PENDIENTE",
    val clientId: Long,
    val deliveryId: Long,
    val deliveryFolio: String,
    val amountMxn: Double,
    val dateMillis: Long = System.currentTimeMillis(),
    val note: String = "",
    val isCancelled: Boolean = false,
    val salesChannel: String = "PUBLIC",
)

@Entity(tableName = "reminders")
data class ReminderEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val clientId: Long,
    val clientName: String,
    val deliveryDateMillis: Long,
    val boxesNote: String = "",
    val note: String = "",
    val isCompleted: Boolean = false,
    val completedAtMillis: Long? = null,
    val createdAtMillis: Long = System.currentTimeMillis(),
)

@Entity(tableName = "daily_closings")
data class DailyClosingEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val folio: String,
    val dateKey: String,
    val createdAtMillis: Long,
    val totalDeliveries: Int,
    val totalBoxesDelivered: Double,
    val totalKgDelivered: Double,
    val cashSalesMxn: Double,
    val creditSalesMxn: Double,
    val abonosReceivedMxn: Double,
    val totalMoneyCollectedMxn: Double,
    val pendingDebtsMxn: Double,
    val clientsServedCount: Int,
    val movementsSnapshotJson: String,
    val pdfPath: String,
    val jsonPath: String,
    val hashSignature: String,
)

@Entity(tableName = "backup_records")
data class BackupRecordEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fileName: String,
    val filePath: String,
    val format: String,
    val sizeBytes: Long,
    val createdAtMillis: Long = System.currentTimeMillis(),
)

@Entity(tableName = "route_incidents")
data class RouteIncidentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val localId: String = java.util.UUID.randomUUID().toString(),
    val type: String,
    val description: String,
    val productOrBrand: String = "",
    val quantity: Double? = null,
    val amountMxn: Double? = null,
    @ColumnInfo(defaultValue = "''") val routeVendorName: String = "",
    @ColumnInfo(defaultValue = "''") val routeDriverName: String = "",
    @ColumnInfo(defaultValue = "''") val routeHelperName: String = "",
    val createdAtMillis: Long = System.currentTimeMillis(),
    val syncStatus: String = "PENDIENTE",
)

@Entity(tableName = "business_settings")
data class BusinessSettingsEntity(
    @PrimaryKey val id: Int = 1,
    val businessName: String = BuildConfig.BRAND_APP_NAME,
    val slogan: String = BuildConfig.BRAND_SLOGAN,
    val phone: String = "",
    val address: String = "",
    val globalPricePerKg: Double = 0.0,
    val printerType: String = "BLUETOOTH",
    val printerName: String = "",
    val printerAddress: String = "",
    val printerTransport: String = "CLASSIC",
    val nextFolioSequence: Int = 1,
    val nextClosingSequence: Int = 1,
    val creditTermDays: Int = 7,
    val creditMoratoriumInterestPercent: Double = 0.0,
    val creditPaymentPlace: String = "",
    val creditLegendExtra: String = "",
    val creditLegendClosing: String = "Válido con firma digital.",
    val nextCremeriaFolioSequence: Int = 1,
)
