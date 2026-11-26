package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.data.local.dao.HyhDao
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

@Database(
    entities = [
        ClientEntity::class,
        EggPurchaseEntity::class,
        InventoryBrandEntity::class,
        DeliveryEntity::class,
        AbonoEntity::class,
        ReminderEntity::class,
        DailyClosingEntity::class,
        BackupRecordEntity::class,
        BusinessSettingsEntity::class,
        SugarPurchaseEntity::class,
        SugarInventoryEntity::class,
        RouteIncidentEntity::class,
    ],
    version = 11,
    exportSchema = false,
)
abstract class HyhDatabase : RoomDatabase() {
    abstract fun hyhDao(): HyhDao

    companion object {
        @Volatile
        private var INSTANCE: HyhDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE deliveries ADD COLUMN itemsSnapshotJson TEXT NOT NULL DEFAULT '[]'",
                )
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE clients ADD COLUMN creditTermDays INTEGER DEFAULT NULL",
                )
                db.execSQL(
                    "ALTER TABLE business_settings ADD COLUMN creditTermDays INTEGER NOT NULL DEFAULT 7",
                )
                db.execSQL(
                    "ALTER TABLE business_settings ADD COLUMN creditMoratoriumInterestPercent REAL NOT NULL DEFAULT 0.0",
                )
                db.execSQL(
                    "ALTER TABLE business_settings ADD COLUMN creditPaymentPlace TEXT NOT NULL DEFAULT ''",
                )
                db.execSQL(
                    "ALTER TABLE business_settings ADD COLUMN creditLegendExtra TEXT NOT NULL DEFAULT ''",
                )
                db.execSQL(
                    "ALTER TABLE business_settings ADD COLUMN creditLegendClosing TEXT NOT NULL DEFAULT 'Válido con firma digital.'",
                )
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sugar_purchases (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        purchaseDateMillis INTEGER NOT NULL,
                        sacks REAL NOT NULL,
                        totalWeightKg REAL NOT NULL,
                        createdAtMillis INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sugar_inventory (
                        id INTEGER NOT NULL PRIMARY KEY,
                        availableSacks REAL NOT NULL,
                        deliveredSacks REAL NOT NULL,
                        availableWeightKg REAL NOT NULL,
                        deliveredWeightKg REAL NOT NULL
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    "ALTER TABLE deliveries ADD COLUMN sugarSacks REAL NOT NULL DEFAULT 0.0",
                )
                db.execSQL(
                    "ALTER TABLE deliveries ADD COLUMN sugarSackWeightKg REAL NOT NULL DEFAULT 0.0",
                )
                db.execSQL(
                    "ALTER TABLE deliveries ADD COLUMN sugarPricePerSackMxn REAL NOT NULL DEFAULT 0.0",
                )
                db.execSQL(
                    "ALTER TABLE deliveries ADD COLUMN sugarSubtotalMxn REAL NOT NULL DEFAULT 0.0",
                )
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE deliveries ADD COLUMN salesChannel TEXT NOT NULL DEFAULT 'PUBLIC'")
                db.execSQL("ALTER TABLE abonos ADD COLUMN salesChannel TEXT NOT NULL DEFAULT 'PUBLIC'")
                db.execSQL("ALTER TABLE business_settings ADD COLUMN nextCremeriaFolioSequence INTEGER NOT NULL DEFAULT 1")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("UPDATE deliveries SET clientId = -1, clientName = 'Cremería del Patrón' WHERE salesChannel = 'CREMERIA'")
                db.execSQL("UPDATE abonos SET clientId = -1 WHERE salesChannel = 'CREMERIA'")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE business_settings ADD COLUMN printerTransport TEXT NOT NULL DEFAULT 'CLASSIC'")
            }
        }

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE deliveries ADD COLUMN localId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE deliveries ADD COLUMN syncStatus TEXT NOT NULL DEFAULT 'LOCAL'")
                db.execSQL("ALTER TABLE deliveries ADD COLUMN routeVendorName TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE deliveries ADD COLUMN routeDriverName TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE deliveries ADD COLUMN routeHelperName TEXT NOT NULL DEFAULT ''")
                db.execSQL("UPDATE deliveries SET localId = lower(hex(randomblob(16))) WHERE localId = ''")
                db.execSQL("ALTER TABLE abonos ADD COLUMN localId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE abonos ADD COLUMN syncStatus TEXT NOT NULL DEFAULT 'LOCAL'")
                db.execSQL("UPDATE abonos SET localId = lower(hex(randomblob(16))) WHERE localId = ''")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS route_incidents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        localId TEXT NOT NULL,
                        type TEXT NOT NULL,
                        description TEXT NOT NULL,
                        productOrBrand TEXT NOT NULL,
                        quantity REAL,
                        amountMxn REAL,
                        createdAtMillis INTEGER NOT NULL,
                        syncStatus TEXT NOT NULL
                    )
                """.trimIndent())
            }
        }

        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE clients ADD COLUMN windowsId TEXT")
            }
        }

        val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE route_incidents ADD COLUMN routeVendorName TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE route_incidents ADD COLUMN routeDriverName TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE route_incidents ADD COLUMN routeHelperName TEXT NOT NULL DEFAULT ''")
            }
        }

        val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE clients ADD COLUMN windowsSyncedDebtMxn REAL NOT NULL DEFAULT 0.0")
            }
        }

        fun getInstance(context: Context): HyhDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    HyhDatabase::class.java,
                    "hyh_huevos_local.db",
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11).build().also { INSTANCE = it }
            }
        }
    }
}
