package com.example.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
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
import kotlinx.coroutines.flow.Flow

@Dao
interface HyhDao {
    @Query("SELECT * FROM route_incidents ORDER BY createdAtMillis DESC, id DESC")
    fun observeRouteIncidents(): Flow<List<RouteIncidentEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRouteIncident(incident: RouteIncidentEntity): Long

    @Query("SELECT * FROM route_incidents WHERE syncStatus = 'PENDIENTE' ORDER BY createdAtMillis ASC, id ASC")
    suspend fun getPendingSyncRouteIncidents(): List<RouteIncidentEntity>

    @Query("UPDATE route_incidents SET syncStatus = :status WHERE localId = :localId")
    suspend fun updateRouteIncidentSyncStatus(localId: String, status: String)

    // --- Settings ---
    @Query("SELECT * FROM business_settings WHERE id = 1")
    fun observeSettings(): Flow<BusinessSettingsEntity?>

    @Query("SELECT * FROM business_settings WHERE id = 1")
    suspend fun getSettings(): BusinessSettingsEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSettings(settings: BusinessSettingsEntity)

    // --- Clients ---
    @Query("SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC")
    fun observeClients(): Flow<List<ClientEntity>>

    @Query("SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC")
    suspend fun getAllClientsOnce(): List<ClientEntity>

    @Query("SELECT * FROM clients WHERE id = :id")
    fun observeClientById(id: Long): Flow<ClientEntity?>

    @Query("SELECT * FROM clients WHERE id = :id")
    suspend fun getClientById(id: Long): ClientEntity?

    @Query("SELECT * FROM clients WHERE windowsId = :windowsId LIMIT 1")
    suspend fun getClientByWindowsId(windowsId: String): ClientEntity?

    @Query("SELECT * FROM clients WHERE name = :name COLLATE NOCASE LIMIT 1")
    suspend fun getClientByName(name: String): ClientEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertClient(client: ClientEntity): Long

    @Update
    suspend fun updateClient(client: ClientEntity)

    @Delete
    suspend fun deleteClient(client: ClientEntity)

    @Query("SELECT COUNT(*) FROM deliveries WHERE clientId = :clientId")
    suspend fun countDeliveriesForClient(clientId: Long): Int

    // --- Purchases & Inventory ---
    @Query("SELECT * FROM egg_purchases ORDER BY purchaseDateMillis DESC, id DESC")
    fun observePurchases(): Flow<List<EggPurchaseEntity>>

    @Query("SELECT * FROM egg_purchases ORDER BY purchaseDateMillis DESC, id DESC")
    suspend fun getAllPurchasesOnce(): List<EggPurchaseEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPurchase(purchase: EggPurchaseEntity): Long

    @Query("SELECT * FROM inventory_brands ORDER BY brand COLLATE NOCASE ASC")
    fun observeInventoryBrands(): Flow<List<InventoryBrandEntity>>

    @Query("SELECT * FROM inventory_brands ORDER BY brand COLLATE NOCASE ASC")
    suspend fun getAllInventoryBrandsOnce(): List<InventoryBrandEntity>

    @Query("SELECT * FROM inventory_brands WHERE brand = :brand")
    suspend fun getInventoryBrand(brand: String): InventoryBrandEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertInventoryBrand(item: InventoryBrandEntity)

    // --- Sugar Purchases & Inventory ---
    @Query("SELECT * FROM sugar_purchases ORDER BY purchaseDateMillis DESC, id DESC")
    fun observeSugarPurchases(): Flow<List<SugarPurchaseEntity>>

    @Query("SELECT * FROM sugar_purchases ORDER BY purchaseDateMillis DESC, id DESC")
    suspend fun getAllSugarPurchasesOnce(): List<SugarPurchaseEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSugarPurchase(purchase: SugarPurchaseEntity): Long

    @Query("SELECT * FROM sugar_inventory WHERE id = 1")
    fun observeSugarInventory(): Flow<SugarInventoryEntity?>

    @Query("SELECT * FROM sugar_inventory WHERE id = 1")
    suspend fun getSugarInventoryOnce(): SugarInventoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSugarInventory(inventory: SugarInventoryEntity)

    // --- Deliveries ---
    @Query("SELECT * FROM deliveries WHERE salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    fun observeDeliveries(): Flow<List<DeliveryEntity>>

    @Query("SELECT * FROM deliveries ORDER BY dateMillis DESC, id DESC")
    suspend fun getAllDeliveriesOnce(): List<DeliveryEntity>

    @Query("SELECT * FROM deliveries WHERE salesChannel = 'PUBLIC' AND syncStatus = 'PENDIENTE' ORDER BY dateMillis ASC, id ASC")
    suspend fun getPendingSyncDeliveries(): List<DeliveryEntity>

    @Query("UPDATE deliveries SET syncStatus = :status WHERE localId = :localId")
    suspend fun updateDeliverySyncStatus(localId: String, status: String)

    @Query("SELECT * FROM deliveries WHERE salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    suspend fun getPublicDeliveriesOnce(): List<DeliveryEntity>

    @Query("SELECT * FROM deliveries WHERE salesChannel = 'CREMERIA' ORDER BY dateMillis DESC, id DESC")
    fun observeCremeriaDeliveries(): Flow<List<DeliveryEntity>>

    @Query("SELECT * FROM deliveries WHERE salesChannel = 'CREMERIA' ORDER BY dateMillis DESC, id DESC")
    suspend fun getAllCremeriaDeliveriesOnce(): List<DeliveryEntity>

    @Query("SELECT * FROM deliveries WHERE id = :id AND salesChannel = 'PUBLIC'")
    fun observeDeliveryById(id: Long): Flow<DeliveryEntity?>

    @Query("SELECT * FROM deliveries WHERE id = :id AND salesChannel = 'PUBLIC'")
    suspend fun getDeliveryById(id: Long): DeliveryEntity?

    @Query("SELECT * FROM deliveries WHERE id = :id AND salesChannel = 'CREMERIA'")
    fun observeCremeriaDeliveryById(id: Long): Flow<DeliveryEntity?>

    @Query("SELECT * FROM deliveries WHERE id = :id AND salesChannel = 'CREMERIA'")
    suspend fun getCremeriaDeliveryById(id: Long): DeliveryEntity?

    @Query("SELECT * FROM deliveries WHERE clientId = :clientId AND salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    fun observeDeliveriesForClient(clientId: Long): Flow<List<DeliveryEntity>>

    @Query("SELECT * FROM deliveries WHERE clientId = :clientId AND salesChannel = 'CREMERIA' ORDER BY dateMillis DESC, id DESC")
    fun observeCremeriaDeliveriesForClient(clientId: Long): Flow<List<DeliveryEntity>>

    @Query("SELECT COALESCE(SUM(pendingBalanceMxn), 0.0) FROM deliveries WHERE clientId = :clientId AND status = 'ACTIVA' AND salesChannel = 'PUBLIC'")
    suspend fun getActiveDebtForClient(clientId: Long): Double

    @Query("SELECT COALESCE(SUM(pendingBalanceMxn), 0.0) FROM deliveries WHERE clientId = :clientId AND status = 'ACTIVA' AND salesChannel = 'CREMERIA'")
    suspend fun getActiveCremeriaDebtForClient(clientId: Long): Double

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDelivery(delivery: DeliveryEntity): Long

    @Update
    suspend fun updateDelivery(delivery: DeliveryEntity)

    // --- Abonos ---
    @Query("SELECT * FROM abonos WHERE isCancelled = 0 AND salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    fun observeActiveAbonos(): Flow<List<AbonoEntity>>

    @Query("SELECT * FROM abonos ORDER BY dateMillis DESC, id DESC")
    suspend fun getAllAbonosOnce(): List<AbonoEntity>

    @Query("SELECT * FROM abonos WHERE salesChannel = 'PUBLIC' AND isCancelled = 0 AND syncStatus = 'PENDIENTE' ORDER BY dateMillis ASC, id ASC")
    suspend fun getPendingSyncAbonos(): List<AbonoEntity>

    @Query("UPDATE abonos SET syncStatus = :status WHERE localId = :localId")
    suspend fun updateAbonoSyncStatus(localId: String, status: String)

    @Query("SELECT * FROM abonos WHERE salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    suspend fun getAllPublicAbonosOnce(): List<AbonoEntity>

    @Query("SELECT * FROM abonos WHERE isCancelled = 0 AND salesChannel = 'CREMERIA' ORDER BY dateMillis DESC, id DESC")
    fun observeActiveCremeriaAbonos(): Flow<List<AbonoEntity>>

    @Query("SELECT * FROM abonos WHERE clientId = :clientId AND isCancelled = 0 AND salesChannel = 'PUBLIC' ORDER BY dateMillis DESC, id DESC")
    fun observeAbonosForClient(clientId: Long): Flow<List<AbonoEntity>>

    @Query("SELECT * FROM abonos WHERE clientId = :clientId AND isCancelled = 0 AND salesChannel = 'CREMERIA' ORDER BY dateMillis DESC, id DESC")
    fun observeCremeriaAbonosForClient(clientId: Long): Flow<List<AbonoEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAbono(abono: AbonoEntity): Long

    @Query("UPDATE abonos SET isCancelled = 1 WHERE deliveryId = :deliveryId AND salesChannel = 'PUBLIC'")
    suspend fun markAbonosCancelledForDelivery(deliveryId: Long)

    @Query("UPDATE abonos SET isCancelled = 1 WHERE deliveryId = :deliveryId AND salesChannel = 'CREMERIA'")
    suspend fun markCremeriaAbonosCancelledForDelivery(deliveryId: Long)

    // --- Reminders ---
    @Query("SELECT * FROM reminders ORDER BY isCompleted ASC, deliveryDateMillis ASC, id DESC")
    fun observeReminders(): Flow<List<ReminderEntity>>

    @Query("SELECT * FROM reminders WHERE isCompleted = 0 ORDER BY deliveryDateMillis ASC")
    suspend fun getPendingRemindersOnce(): List<ReminderEntity>

    @Query("SELECT * FROM reminders ORDER BY deliveryDateMillis ASC")
    suspend fun getAllRemindersOnce(): List<ReminderEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReminder(reminder: ReminderEntity): Long

    @Update
    suspend fun updateReminder(reminder: ReminderEntity)

    @Delete
    suspend fun deleteReminder(reminder: ReminderEntity)

    // --- Daily Closings ---
    @Query("SELECT * FROM daily_closings ORDER BY createdAtMillis DESC, id DESC")
    fun observeDailyClosings(): Flow<List<DailyClosingEntity>>

    @Query("SELECT * FROM daily_closings ORDER BY createdAtMillis DESC, id DESC")
    suspend fun getAllDailyClosingsOnce(): List<DailyClosingEntity>

    @Query("SELECT * FROM daily_closings WHERE id = :id")
    fun observeDailyClosingById(id: Long): Flow<DailyClosingEntity?>

    @Query("SELECT * FROM daily_closings WHERE id = :id")
    suspend fun getDailyClosingById(id: Long): DailyClosingEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDailyClosing(closing: DailyClosingEntity): Long

    // --- Backups ---
    @Query("SELECT * FROM backup_records ORDER BY createdAtMillis DESC, id DESC")
    fun observeBackups(): Flow<List<BackupRecordEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBackupRecord(record: BackupRecordEntity): Long

    // --- Clear for Restore ---
    @Query("DELETE FROM abonos")
    suspend fun clearAbonos()

    @Query("DELETE FROM deliveries")
    suspend fun clearDeliveries()

    @Query("DELETE FROM egg_purchases")
    suspend fun clearPurchases()

    @Query("DELETE FROM inventory_brands")
    suspend fun clearInventoryBrands()

    @Query("DELETE FROM reminders")
    suspend fun clearReminders()

    @Query("DELETE FROM daily_closings")
    suspend fun clearClosings()

    @Query("DELETE FROM clients")
    suspend fun clearClients()

    @Query("DELETE FROM sugar_purchases")
    suspend fun clearSugarPurchases()

    @Query("DELETE FROM sugar_inventory")
    suspend fun clearSugarInventory()
}
