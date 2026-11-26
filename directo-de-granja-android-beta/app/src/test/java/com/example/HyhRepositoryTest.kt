package com.example

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.example.data.local.HyhDatabase
import com.example.data.local.repository.HyhRepository
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], shadows = [ShadowPdfDocument::class])
class HyhRepositoryTest {

    private lateinit var context: Context
    private lateinit var db: HyhDatabase
    private lateinit var repository: HyhRepository

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        db = Room.inMemoryDatabaseBuilder(context, HyhDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = HyhRepository(context, db)
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `initial database contains zero preloaded clients deliveries or inventory`() = runTest {
        assertTrue(repository.observeClients().first().isEmpty())
        assertTrue(repository.observeDeliveries().first().isEmpty())
        assertTrue(repository.observePurchases().first().isEmpty())
        assertTrue(repository.observeInventoryBrands().first().isEmpty())
        assertTrue(repository.observeReminders().first().isEmpty())
        assertTrue(repository.observeDailyClosings().first().isEmpty())
        assertTrue(repository.observeBackups().first().isEmpty())
    }

    @Test
    fun `fractional inventory abonos and folio-preserving cancellation work atomically`() = runTest {
        repository.updateBusinessSettings(
            phone = "5512345678",
            address = "Bodega 1",
            slogan = "LOS MAS FRESCOS DE LA ZONA",
            globalPricePerKg = 40.0,
        )
        val clientId = repository.saveClient(
            name = "Abarrotes Test",
            phone = "",
            address = "Calle Hidalgo 10",
            specialPricePerKg = 38.0,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 40.0,
            brand = "San Juan",
            grossWeightKg = 920.0,
        )

        val sigBitmap = Bitmap.createBitmap(120, 60, Bitmap.Config.ARGB_8888)
        val deliveryId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "San Juan",
            boxes = 12.5,
            grossWeightKg = 275.0,
            tareDeductionKg = 25.0,
            netWeightKg = 250.0,
            pricePerKg = 38.0,
            rawAmountMxn = 9500.0,
            finalAmountMxn = 9500.0,
            paymentMethod = PaymentMethod.CREDITO,
            initialPaymentMxn = 1500.0,
            signatureBitmap = sigBitmap,
        )

        // Verify fractional inventory: 40.0 - 12.5 = 27.5
        val stockAfterDelivery = repository.observeInventoryBrands().first().first { it.brand == "San Juan" }
        assertEquals(27.5, stockAfterDelivery.remainingBoxes, 0.0001)

        val savedDelivery = repository.observeDeliveryById(deliveryId).first()
        assertNotNull(savedDelivery)
        assertEquals(8000.0, savedDelivery!!.pendingBalanceMxn, 0.01)
        assertNotNull(savedDelivery.signaturePath)
        assertTrue(File(savedDelivery.signaturePath!!).exists())

        // Record abono
        repository.recordAbono(clientId, deliveryId, 2000.0, "Abono en ruta")
        val afterAbono = repository.observeDeliveryById(deliveryId).first()!!
        assertEquals(6000.0, afterAbono.pendingBalanceMxn, 0.01)

        // Cancel delivery -> reverts inventory back to 40.0, preserves folio, zeroes debt
        repository.cancelDelivery(deliveryId, "Error de captura")
        val afterCancel = repository.observeDeliveryById(deliveryId).first()!!
        assertEquals("CANCELADA", afterCancel.status)
        assertEquals(savedDelivery.folio, afterCancel.folio)
        assertEquals(0.0, afterCancel.pendingBalanceMxn, 0.001)

        val stockAfterCancel = repository.observeInventoryBrands().first().first { it.brand == "San Juan" }
        assertEquals(40.0, stockAfterCancel.remainingBoxes, 0.0001)

        // Next delivery must NOT reuse cancelled folio
        val secondDeliveryId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            brand = "San Juan",
            boxes = 0.5,
            grossWeightKg = 15.0,
            tareDeductionKg = 0.5,
            netWeightKg = 14.5,
            pricePerKg = 38.0,
            rawAmountMxn = 551.0,
            finalAmountMxn = 551.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 551.0,
            signatureBitmap = null,
        )
        val secondDelivery = repository.observeDeliveryById(secondDeliveryId).first()!!
        assertTrue(secondDelivery.folio != savedDelivery.folio)
    }

    @Test
    fun `restore rejects zip slip traversal entries`() = runTest {
        val maliciousZip = File(context.cacheDir, "malicious.zip")
        ZipOutputStream(FileOutputStream(maliciousZip)).use { zos ->
            zos.putNextEntry(ZipEntry("firmas/../../evil.png"))
            zos.write(byteArrayOf(1, 2, 3))
            zos.closeEntry()
            zos.putNextEntry(ZipEntry("datos_generales.json"))
            zos.write("""{"clients":[],"deliveries":[]}""".toByteArray())
            zos.closeEntry()
        }
        val result = repository.restoreBackupFromUri(Uri.fromFile(maliciousZip))
        // Either rejected with SecurityException or safely stripped to filename inside signatures dir without escaping
        val escaped = File(context.filesDir, "evil.png")
        assertTrue(!escaped.exists())
        maliciousZip.delete()
        if (result.isSuccess) {
            File(context.filesDir, "signatures/.._.._evil.png").delete()
        }
    }

    @Test
    fun `ticket pdf and escpos bytes generate cleanly for credit and cash deliveries`() = runTest {
        val clientId = repository.saveClient(
            name = "Tienda El Sol",
            phone = "5598765432",
            address = "Av. Juárez 22",
            specialPricePerKg = null,
        )
        repository.updateBusinessSettings(
            phone = "5500001111",
            address = "Nave 1 Bodega 5",
            slogan = "LOS MAS FRESCOS DE LA ZONA",
            globalPricePerKg = 45.0,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 20.0,
            brand = "Tehuacán",
            grossWeightKg = 480.0,
        )
        val sig = Bitmap.createBitmap(120, 60, Bitmap.Config.ARGB_8888)
        val creditId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "Tehuacán",
            boxes = 2.0,
            grossWeightKg = 48.0,
            tareDeductionKg = 4.0,
            netWeightKg = 44.0,
            pricePerKg = 45.0,
            rawAmountMxn = 1980.0,
            finalAmountMxn = 1980.0,
            paymentMethod = PaymentMethod.CREDITO,
            initialPaymentMxn = 500.0,
            signatureBitmap = sig,
        )
        val creditDelivery = repository.observeDeliveryById(creditId).first()!!
        val settings = repository.getSettingsOnce()
        val client = repository.getClientOnce(clientId)
        assertEquals(170, com.example.system.PdfDocumentGenerator.TICKET_PAGE_WIDTH_PT)
        assertEquals(369, com.example.system.PdfDocumentGenerator.TICKET_PAGE_HEIGHT_PT)
        val estHeight = com.example.system.PdfDocumentGenerator.measureTicketHeight(
            context = context,
            delivery = creditDelivery,
            settings = settings,
            client = client,
        )
        assertEquals(369, estHeight)
        val pdfCanvasBmp = Bitmap.createBitmap(170, estHeight, Bitmap.Config.ARGB_8888)
        val drawnHeight = com.example.system.PdfDocumentGenerator.renderTicketToCanvas(
            context = context,
            canvas = android.graphics.Canvas(pdfCanvasBmp),
            delivery = creditDelivery,
            settings = settings,
            client = client,
        )
        assertTrue("Ticket height ($drawnHeight) must fit within 60x130 height ($estHeight)", drawnHeight <= estHeight)

        val escPosBytes = com.example.system.ThermalPrinterManager(context)
            .buildEscPosTicketBytes(creditDelivery, settings, client)
        val asciiDump = String(escPosBytes, Charsets.US_ASCII)
        val asciiSingleLine = asciiDump.replace('\n', ' ')
        assertTrue(asciiDump.contains("COMPROBANTE DE REMISION"))
        assertTrue(asciiDump.contains("KILOS NETOS"))
        assertTrue(asciiDump.contains("Subtotal:"))
        assertTrue(asciiDump.contains("TOTAL"))
        assertTrue(asciiDump.contains("RESTA ENTREGA"))
        assertTrue(asciiDump.contains("Esta remision:"))
        assertTrue(asciiDump.contains("SALDO TOTAL"))
        assertTrue(asciiSingleLine.contains("reconozco el saldo pendiente"))
        assertTrue(asciiDump.contains("Recibi de conformidad"))
        assertTrue(asciiDump.contains("Tienda El Sol"))
        // Simplified ticket must omit per-box weights, tare, total boxes, and gross total
        assertTrue(!asciiDump.contains("Cajas:"))
        assertTrue(!asciiDump.contains("Tara total:"))
        assertTrue(!asciiDump.contains("Bruto total:"))
        assertTrue(!asciiDump.contains("Peso ingresado:"))

        // Pay off the remaining credit balance via abono -> switches to settled credit template
        repository.recordAbono(clientId, creditId, 1480.0, "Liquidacion total")
        val settledCredit = repository.observeDeliveryById(creditId).first()!!
        assertEquals(0.0, settledCredit.pendingBalanceMxn, 0.001)
        val settledEstHeight = com.example.system.PdfDocumentGenerator.measureTicketHeight(
            context = context,
            delivery = settledCredit,
            settings = settings,
            client = client,
        )
        val settledBmp = Bitmap.createBitmap(220, settledEstHeight, Bitmap.Config.ARGB_8888)
        val settledDrawn = com.example.system.PdfDocumentGenerator.renderTicketToCanvas(
            context = context,
            canvas = android.graphics.Canvas(settledBmp),
            delivery = settledCredit,
            settings = settings,
            client = client,
        )
        assertTrue("Settled credit ticket height ($settledDrawn) must fit ($settledEstHeight)", settledDrawn <= settledEstHeight)

        val settledEscPos = String(
            com.example.system.ThermalPrinterManager(context)
                .buildEscPosTicketBytes(settledCredit, settings, client),
            Charsets.US_ASCII,
        )
        val settledSingleLine = settledEscPos.replace('\n', ' ')
        assertTrue(settledEscPos.contains("LIQUIDADO"))
        assertTrue(settledEscPos.contains("Esta remision:"))
        assertTrue(settledSingleLine.contains("cubri el importe total senalado"))
        assertTrue(settledEscPos.contains("Recibi de conformidad"))
        assertTrue(!settledEscPos.contains("RESTA ENTREGA"))

        // Contado must NOT contain signature or credit commitment legend
        val cashId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            brand = "Tehuacán",
            boxes = 0.5,
            grossWeightKg = 11.5,
            tareDeductionKg = 0.5,
            netWeightKg = 11.0,
            pricePerKg = 45.0,
            rawAmountMxn = 495.0,
            finalAmountMxn = 495.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 495.0,
            signatureBitmap = null,
        )
        val cashDelivery = repository.observeDeliveryById(cashId).first()!!
        val cashEscPos = String(
            com.example.system.ThermalPrinterManager(context)
                .buildEscPosTicketBytes(cashDelivery, settings, client),
            Charsets.US_ASCII,
        )
        assertTrue(cashEscPos.contains("LIQUIDADO"))
        assertTrue(!cashEscPos.contains("Recibi de conformidad"))
        assertTrue(!cashEscPos.contains("fecha limite de pago"))
    }

    @Test
    fun `multi-box weighedItems persist render per-row on tickets and survive json backup restore`() = runTest {
        val clientId = repository.saveClient(
            name = "Distribuidora Norte",
            phone = "5511223344",
            address = "Calle Central 88",
            specialPricePerKg = 43.0,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 10.0,
            brand = "Blanco Selecto",
            grossWeightKg = 240.0,
        )

        val items = listOf(
            com.example.domain.CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.CAJA_COMPLETA, "24.250").getOrThrow(),
            com.example.domain.CalculationEngine.calculateSingleBoxItem(2L, DeliveryModality.MEDIA_CAJA, "22.000").getOrThrow(),
            com.example.domain.CalculationEngine.calculateSingleBoxItem(3L, DeliveryModality.MEDIA_CAJA_PESADA, "15.000").getOrThrow(),
        )
        val calc = com.example.domain.CalculationEngine.calculateDeliveryFromItems(
            items = items,
            pricePerKg = java.math.BigDecimal("43.00"),
        )
        val deliveryId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "Blanco Selecto",
            boxes = calc.boxesDecimal.toDouble(),
            grossWeightKg = calc.inputWeightKg.toDouble(),
            tareDeductionKg = calc.tareDeductionKg.toDouble(),
            netWeightKg = calc.netWeightKg.toDouble(),
            pricePerKg = 43.0,
            rawAmountMxn = calc.rawAmountMxn.toDouble(),
            finalAmountMxn = calc.finalAmountMxn.toDouble(),
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = calc.finalAmountMxn.toDouble(),
            signatureBitmap = null,
            weighedItems = items,
        )

        val saved = repository.observeDeliveryById(deliveryId).first()!!
        assertEquals("MIXTA", saved.modality)
        val parsed = com.example.domain.CalculationEngine.parseWeighedItemsJson(saved.itemsSnapshotJson)
        assertEquals(3, parsed.size)

        val settings = repository.getSettingsOnce()
        val client = repository.getClientOnce(clientId)
        val estHeight = com.example.system.PdfDocumentGenerator.measureTicketHeight(
            context = context,
            delivery = saved,
            settings = settings,
            client = client,
        )
        val bmp = Bitmap.createBitmap(170, estHeight, Bitmap.Config.ARGB_8888)
        val drawn = com.example.system.PdfDocumentGenerator.renderTicketToCanvas(
            context = context,
            canvas = android.graphics.Canvas(bmp),
            delivery = saved,
            settings = settings,
            client = client,
        )
        assertTrue("Multi-row PDF height ($drawn) must fit ($estHeight)", drawn <= estHeight)

        val escPos = String(
            com.example.system.ThermalPrinterManager(context)
                .buildEscPosTicketBytes(saved, settings, client),
            Charsets.US_ASCII,
        )
        assertTrue(escPos.contains("Mixta"))
        assertTrue(escPos.contains("Blanco Selec"))
        assertTrue(escPos.contains("KILOS NETOS"))
        assertTrue(escPos.contains("Subtotal:"))
        assertTrue(escPos.contains("TOTAL"))
        assertTrue(!escPos.contains("Cajas:"))
        assertTrue(!escPos.contains("Tara total:"))
        assertTrue(!escPos.contains("Bruto total:"))
        assertTrue(!escPos.contains("Peso ingresado:"))

        // Export JSON backup and restore into DB cleanly
        val backupRecord = repository.exportFullJsonBackup()
        val restoreRes = repository.restoreFromLocalBackup(backupRecord)
        assertTrue(restoreRes.isSuccess)
        val restored = repository.observeDeliveryById(deliveryId).first()!!
        assertEquals(3, com.example.domain.CalculationEngine.parseWeighedItemsJson(restored.itemsSnapshotJson).size)
        File(backupRecord.filePath).delete()
    }

    @Test
    fun `migration 1 to 2 adds itemsSnapshotJson cleanly`() {
        val dbFile = File(context.cacheDir, "migration_v1_test.db").apply { delete() }
        val helper = androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory().create(
            androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(dbFile.absolutePath)
                .callback(object : androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(1) {
                    override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS deliveries (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                folio TEXT NOT NULL,
                                clientId INTEGER NOT NULL,
                                clientName TEXT NOT NULL,
                                dateMillis INTEGER NOT NULL,
                                modality TEXT NOT NULL,
                                brand TEXT NOT NULL,
                                boxes REAL NOT NULL,
                                grossWeightKg REAL NOT NULL,
                                tareDeductionKg REAL NOT NULL,
                                netWeightKg REAL NOT NULL,
                                pricePerKg REAL NOT NULL,
                                rawAmountMxn REAL NOT NULL,
                                finalAmountMxn REAL NOT NULL,
                                paymentMethod TEXT NOT NULL,
                                initialPaymentMxn REAL NOT NULL,
                                pendingBalanceMxn REAL NOT NULL,
                                previousDebtSnapshotMxn REAL NOT NULL,
                                totalAccumulatedDebtSnapshotMxn REAL NOT NULL,
                                signaturePath TEXT,
                                status TEXT NOT NULL,
                                cancelledAtMillis INTEGER,
                                cancellationReason TEXT
                            )
                            """.trimIndent(),
                        )
                    }

                    override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build(),
        )
        val v1Db = helper.writableDatabase
        HyhDatabase.MIGRATION_1_2.migrate(v1Db)
        val cursor = v1Db.query("PRAGMA table_info(deliveries)")
        var foundCol = false
        while (cursor.moveToNext()) {
            val nameIdx = cursor.getColumnIndex("name")
            if (nameIdx >= 0 && cursor.getString(nameIdx) == "itemsSnapshotJson") {
                foundCol = true
            }
        }
        cursor.close()
        v1Db.close()
        dbFile.delete()
        assertTrue(foundCol)
    }

    @Test
    fun `registerDelivery persists egg price per kg across deliveries until edited`() = runTest {
        val regularClientId = repository.saveClient(
            name = "Cliente Regular",
            phone = "",
            address = "Calle 1",
            specialPricePerKg = null,
        )
        val specialClientId = repository.saveClient(
            name = "Cliente Especial",
            phone = "",
            address = "Calle 2",
            specialPricePerKg = 39.50,
        )

        // Initially 0.0 -> first delivery with 44.50 registers 44.50 in settings
        assertEquals(0.0, repository.getSettingsOnce().globalPricePerKg, 0.001)
        repository.registerDelivery(
            clientId = regularClientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "General",
            boxes = 1.0,
            grossWeightKg = 22.0,
            tareDeductionKg = 2.0,
            netWeightKg = 20.0,
            pricePerKg = 44.50,
            rawAmountMxn = 890.0,
            finalAmountMxn = 890.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 890.0,
            signatureBitmap = null,
        )
        assertEquals(44.50, repository.getSettingsOnce().globalPricePerKg, 0.001)

        // Delivery to client with special price keeps global 44.50 intact
        repository.registerDelivery(
            clientId = specialClientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "General",
            boxes = 1.0,
            grossWeightKg = 22.0,
            tareDeductionKg = 2.0,
            netWeightKg = 20.0,
            pricePerKg = 39.50,
            rawAmountMxn = 790.0,
            finalAmountMxn = 790.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 790.0,
            signatureBitmap = null,
        )
        assertEquals(44.50, repository.getSettingsOnce().globalPricePerKg, 0.001)

        // Editing price on a subsequent regular delivery updates registered price to 46.00
        repository.registerDelivery(
            clientId = regularClientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "General",
            boxes = 1.0,
            grossWeightKg = 22.0,
            tareDeductionKg = 2.0,
            netWeightKg = 20.0,
            pricePerKg = 46.00,
            rawAmountMxn = 920.0,
            finalAmountMxn = 920.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 920.0,
            signatureBitmap = null,
        )
        assertEquals(46.00, repository.getSettingsOnce().globalPricePerKg, 0.001)
    }

    @Test
    fun `multi-brand multi-price delivery deducts per-brand stock renders all prices and reverts both on cancel`() = runTest {
        val clientId = repository.saveClient(
            name = "Super La Esquina",
            phone = "5522334455",
            address = "Av. Principal 99",
            specialPricePerKg = null,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 10.0,
            brand = "Marca Alpha",
            grossWeightKg = 240.0,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 8.0,
            brand = "Marca Beta",
            grossWeightKg = 192.0,
        )

        val item1 = com.example.domain.CalculationEngine.calculateSingleBoxItem(
            id = 1L,
            modality = DeliveryModality.CAJA_COMPLETA,
            weightInputKg = "24.000",
            brand = "Marca Alpha",
            pricePerKg = java.math.BigDecimal("42.00"),
        ).getOrThrow()
        val item2 = com.example.domain.CalculationEngine.calculateSingleBoxItem(
            id = 2L,
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            weightInputKg = "15.500",
            brand = "Marca Beta",
            pricePerKg = java.math.BigDecimal("46.50"),
        ).getOrThrow()
        val items = listOf(item1, item2)
        val calc = com.example.domain.CalculationEngine.calculateDeliveryFromItems(
            items = items,
            pricePerKg = java.math.BigDecimal("46.50"),
        )

        val deliveryId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "Marca Alpha, Marca Beta",
            boxes = calc.boxesDecimal.toDouble(),
            grossWeightKg = calc.inputWeightKg.toDouble(),
            tareDeductionKg = calc.tareDeductionKg.toDouble(),
            netWeightKg = calc.netWeightKg.toDouble(),
            pricePerKg = calc.pricePerKg.toDouble(),
            rawAmountMxn = calc.rawAmountMxn.toDouble(),
            finalAmountMxn = calc.finalAmountMxn.toDouble(),
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = calc.finalAmountMxn.toDouble(),
            signatureBitmap = null,
            weighedItems = items,
        )

        val alphaStock = repository.observeInventoryBrands().first().first { it.brand == "Marca Alpha" }
        val betaStock = repository.observeInventoryBrands().first().first { it.brand == "Marca Beta" }
        assertEquals(9.0, alphaStock.remainingBoxes, 0.0001)
        assertEquals(7.5, betaStock.remainingBoxes, 0.0001)

        val saved = repository.observeDeliveryById(deliveryId).first()!!
        assertEquals("Marca Alpha, Marca Beta", saved.brand)
        val settings = repository.getSettingsOnce()
        val client = repository.getClientOnce(clientId)
        val estHeight = com.example.system.PdfDocumentGenerator.measureTicketHeight(
            context = context,
            delivery = saved,
            settings = settings,
            client = client,
        )
        val bmp = Bitmap.createBitmap(220, estHeight, Bitmap.Config.ARGB_8888)
        val drawn = com.example.system.PdfDocumentGenerator.renderTicketToCanvas(
            context = context,
            canvas = android.graphics.Canvas(bmp),
            delivery = saved,
            settings = settings,
            client = client,
        )
        assertTrue("Multi-brand PDF height ($drawn) must fit ($estHeight)", drawn <= estHeight)

        val escPos = String(
            com.example.system.ThermalPrinterManager(context)
                .buildEscPosTicketBytes(saved, settings, client),
            Charsets.US_ASCII,
        )
        assertTrue(escPos.contains("Marca Alpha"))
        assertTrue(escPos.contains("\$42.00"))
        assertTrue(escPos.contains("\$924.00"))
        assertTrue(escPos.contains("Marca Beta"))
        assertTrue(escPos.contains("\$46.50"))
        assertTrue(escPos.contains("\$697.50"))

        // Cancel delivery must revert BOTH brands accurately
        repository.cancelDelivery(deliveryId, "Ajuste multi-marca")
        val alphaAfterCancel = repository.observeInventoryBrands().first().first { it.brand == "Marca Alpha" }
        val betaAfterCancel = repository.observeInventoryBrands().first().first { it.brand == "Marca Beta" }
        assertEquals(10.0, alphaAfterCancel.remainingBoxes, 0.0001)
        assertEquals(8.0, betaAfterCancel.remainingBoxes, 0.0001)
    }

    @Test
    fun `migration 2 to 3 preserves all existing clients deliveries and settings without data loss`() = runTest {
        val dbFile = File(context.cacheDir, "migration_v2_to_v3_test.db").apply { delete() }
        val helper = androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory().create(
            androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(dbFile.absolutePath)
                .callback(object : androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(2) {
                    override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS clients (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                name TEXT NOT NULL,
                                phone TEXT NOT NULL,
                                address TEXT NOT NULL,
                                specialPricePerKg REAL,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS egg_purchases (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                purchaseDateMillis INTEGER NOT NULL,
                                boxes REAL NOT NULL,
                                brand TEXT NOT NULL,
                                grossWeightKg REAL NOT NULL,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS inventory_brands (
                                brand TEXT PRIMARY KEY NOT NULL,
                                availableBoxes REAL NOT NULL,
                                deliveredBoxes REAL NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS deliveries (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                folio TEXT NOT NULL,
                                clientId INTEGER NOT NULL,
                                clientName TEXT NOT NULL,
                                dateMillis INTEGER NOT NULL,
                                modality TEXT NOT NULL,
                                brand TEXT NOT NULL,
                                boxes REAL NOT NULL,
                                grossWeightKg REAL NOT NULL,
                                tareDeductionKg REAL NOT NULL,
                                netWeightKg REAL NOT NULL,
                                pricePerKg REAL NOT NULL,
                                rawAmountMxn REAL NOT NULL,
                                finalAmountMxn REAL NOT NULL,
                                paymentMethod TEXT NOT NULL,
                                initialPaymentMxn REAL NOT NULL,
                                pendingBalanceMxn REAL NOT NULL,
                                previousDebtSnapshotMxn REAL NOT NULL,
                                totalAccumulatedDebtSnapshotMxn REAL NOT NULL,
                                signaturePath TEXT,
                                status TEXT NOT NULL,
                                cancelledAtMillis INTEGER,
                                cancellationReason TEXT,
                                itemsSnapshotJson TEXT NOT NULL DEFAULT '[]'
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS abonos (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                clientId INTEGER NOT NULL,
                                deliveryId INTEGER NOT NULL,
                                deliveryFolio TEXT NOT NULL,
                                amountMxn REAL NOT NULL,
                                dateMillis INTEGER NOT NULL,
                                note TEXT NOT NULL,
                                isCancelled INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS reminders (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                clientId INTEGER NOT NULL,
                                clientName TEXT NOT NULL,
                                deliveryDateMillis INTEGER NOT NULL,
                                boxesNote TEXT NOT NULL,
                                note TEXT NOT NULL,
                                isCompleted INTEGER NOT NULL,
                                completedAtMillis INTEGER,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS daily_closings (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                folio TEXT NOT NULL,
                                dateKey TEXT NOT NULL,
                                createdAtMillis INTEGER NOT NULL,
                                totalDeliveries INTEGER NOT NULL,
                                totalBoxesDelivered REAL NOT NULL,
                                totalKgDelivered REAL NOT NULL,
                                cashSalesMxn REAL NOT NULL,
                                creditSalesMxn REAL NOT NULL,
                                abonosReceivedMxn REAL NOT NULL,
                                totalMoneyCollectedMxn REAL NOT NULL,
                                pendingDebtsMxn REAL NOT NULL,
                                clientsServedCount INTEGER NOT NULL,
                                movementsSnapshotJson TEXT NOT NULL,
                                pdfPath TEXT NOT NULL,
                                jsonPath TEXT NOT NULL,
                                hashSignature TEXT NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS backup_records (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                fileName TEXT NOT NULL,
                                filePath TEXT NOT NULL,
                                format TEXT NOT NULL,
                                sizeBytes INTEGER NOT NULL,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS business_settings (
                                id INTEGER NOT NULL PRIMARY KEY,
                                businessName TEXT NOT NULL,
                                slogan TEXT NOT NULL,
                                phone TEXT NOT NULL,
                                address TEXT NOT NULL,
                                globalPricePerKg REAL NOT NULL,
                                printerType TEXT NOT NULL,
                                printerName TEXT NOT NULL,
                                printerAddress TEXT NOT NULL,
                                nextFolioSequence INTEGER NOT NULL,
                                nextClosingSequence INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        // Insert existing production-like data before v2 -> v3 upgrade
                        db.execSQL(
                            "INSERT INTO clients (id, name, phone, address, specialPricePerKg, createdAtMillis) VALUES (1, 'Tienda Don Pepe', '5511112222', 'Calle 5 #10', 43.0, 1700000000000)",
                        )
                        db.execSQL(
                            "INSERT INTO deliveries (id, folio, clientId, clientName, dateMillis, modality, brand, boxes, grossWeightKg, tareDeductionKg, netWeightKg, pricePerKg, rawAmountMxn, finalAmountMxn, paymentMethod, initialPaymentMxn, pendingBalanceMxn, previousDebtSnapshotMxn, totalAccumulatedDebtSnapshotMxn, signaturePath, status, cancelledAtMillis, cancellationReason, itemsSnapshotJson) VALUES (1, 'HYH-2026-0009', 1, 'Tienda Don Pepe', 1700000000000, 'CAJA_COMPLETA', 'San Juan', 2.0, 44.0, 4.0, 40.0, 43.0, 1720.0, 1720.0, 'CREDITO', 500.0, 1220.0, 0.0, 1220.0, NULL, 'ACTIVA', NULL, NULL, '[]')",
                        )
                        db.execSQL(
                            "INSERT INTO business_settings (id, businessName, slogan, phone, address, globalPricePerKg, printerType, printerName, printerAddress, nextFolioSequence, nextClosingSequence) VALUES (1, 'H y H HUEVOS', 'LOS MAS FRESCOS DE LA ZONA', '5599998888', 'Bodega 1', 44.5, 'BLUETOOTH', '', '', 10, 4)",
                        )
                    }

                    override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build(),
        )
        helper.writableDatabase.close()

        // Open via Room with real MIGRATION_1_2 + MIGRATION_2_3 + MIGRATION_3_4 to validate full schema compatibility
        val upgradedDb = Room.databaseBuilder(context, HyhDatabase::class.java, dbFile.absolutePath)
            .addMigrations(HyhDatabase.MIGRATION_1_2, HyhDatabase.MIGRATION_2_3, HyhDatabase.MIGRATION_3_4)
            .allowMainThreadQueries()
            .build()
        val upgradedRepo = HyhRepository(context, upgradedDb)

        val clients = upgradedRepo.observeClients().first()
        val deliveries = upgradedRepo.observeDeliveries().first()
        val settings = upgradedRepo.getSettingsOnce()

        assertEquals(1, clients.size)
        assertEquals("Tienda Don Pepe", clients.first().name)
        assertEquals(null, clients.first().creditTermDays)

        assertEquals(1, deliveries.size)
        assertEquals("HYH-2026-0009", deliveries.first().folio)
        assertEquals(1220.0, deliveries.first().pendingBalanceMxn, 0.001)

        assertEquals(10, settings.nextFolioSequence)
        assertEquals(44.5, settings.globalPricePerKg, 0.001)
        assertEquals(7, settings.creditTermDays)
        assertEquals(0.0, settings.creditMoratoriumInterestPercent, 0.001)
        assertEquals("Válido con firma digital.", settings.creditLegendClosing)

        upgradedDb.close()
        dbFile.delete()
    }

    @Test
    fun `custom credit limit days and legend boxes render on credit ticket and survive json backup restore`() = runTest {
        val clientId = repository.saveClient(
            name = "Cremería La Palma",
            phone = "5544332211",
            address = "Av. Hidalgo 50",
            specialPricePerKg = null,
        )
        repository.updateCreditLegendSettings(
            creditTermDays = 15,
            moratoriumInterestPercent = 3.5,
            paymentPlace = "Bodega Central o transferencia",
            legendExtra = "Mercancía revisada al entregar",
            legendClosing = "Autorizado con firma digital.",
        )
        repository.updateClientCreditTermDays(clientId, 21)

        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 10.0,
            brand = "San Juan",
            grossWeightKg = 240.0,
        )
        val sig = Bitmap.createBitmap(120, 60, Bitmap.Config.ARGB_8888)
        val deliveryId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "San Juan",
            boxes = 2.0,
            grossWeightKg = 44.0,
            tareDeductionKg = 4.0,
            netWeightKg = 40.0,
            pricePerKg = 45.0,
            rawAmountMxn = 1800.0,
            finalAmountMxn = 1800.0,
            paymentMethod = PaymentMethod.CREDITO,
            initialPaymentMxn = 300.0,
            signatureBitmap = sig,
        )
        val delivery = repository.observeDeliveryById(deliveryId).first()!!
        val settings = repository.getSettingsOnce()
        val client = repository.getClientOnce(clientId)!!

        assertEquals(21, client.creditTermDays)
        val escPos = String(
            com.example.system.ThermalPrinterManager(context)
                .buildEscPosTicketBytes(delivery, settings, client),
            Charsets.US_ASCII,
        ).replace('\n', ' ')
        assertTrue(escPos.contains("plazo: 21 dias"))
        assertTrue(escPos.contains("3.5% de interes moratorio mensual"))
        assertTrue(escPos.contains("Lugar de pago: Bodega Central o transferencia."))
        assertTrue(escPos.contains("Mercancia revisada al entregar."))
        assertTrue(escPos.contains("Autorizado con firma digital."))

        val estHeight = com.example.system.PdfDocumentGenerator.measureTicketHeight(
            context = context,
            delivery = delivery,
            settings = settings,
            client = client,
        )
        val bmp = Bitmap.createBitmap(220, estHeight, Bitmap.Config.ARGB_8888)
        val drawn = com.example.system.PdfDocumentGenerator.renderTicketToCanvas(
            context = context,
            canvas = android.graphics.Canvas(bmp),
            delivery = delivery,
            settings = settings,
            client = client,
        )
        assertTrue("Custom credit legend PDF height ($drawn) must fit ($estHeight)", drawn <= estHeight)

        // Backup JSON & Restore preserves new settings and per-client creditTermDays
        val backup = repository.exportFullJsonBackup()
        val restoreRes = repository.restoreFromLocalBackup(backup)
        assertTrue(restoreRes.isSuccess)
        val restoredSettings = repository.getSettingsOnce()
        val restoredClient = repository.getClientOnce(clientId)!!
        assertEquals(15, restoredSettings.creditTermDays)
        assertEquals(3.5, restoredSettings.creditMoratoriumInterestPercent, 0.001)
        assertEquals("Bodega Central o transferencia", restoredSettings.creditPaymentPlace)
        assertEquals("Mercancía revisada al entregar", restoredSettings.creditLegendExtra)
        assertEquals("Autorizado con firma digital.", restoredSettings.creditLegendClosing)
        assertEquals(21, restoredClient.creditTermDays)
        File(backup.filePath).delete()
    }

    @Test
    fun `sugar purchases inventory mixed and sugar-only deliveries cancellation and backup restore work atomically`() = runTest {
        val clientId = repository.saveClient(
            name = "Panadería La Espiga",
            phone = "5577889900",
            address = "Av. Centenario 12",
            specialPricePerKg = null,
        )
        repository.registerPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            boxes = 10.0,
            brand = "San Juan",
            grossWeightKg = 240.0,
        )
        repository.registerSugarPurchase(
            purchaseDateMillis = System.currentTimeMillis(),
            sacks = 12.0,
            totalWeightKg = 600.0,
        )

        val initialSugarInv = repository.observeSugarInventory().first()
        assertEquals(12.0, initialSugarInv.remainingSacks, 0.0001)
        assertEquals(600.0, initialSugarInv.remainingWeightKg, 0.0001)

        // Mixed delivery: 1 egg box (20 kg net @ 40 = 800) + 3 sugar sacks (50 kg each @ 900 = 2700) -> 3500 MXN
        val eggItem = com.example.domain.CalculationEngine.calculateSingleBoxItem(
            id = 1L,
            modality = DeliveryModality.CAJA_COMPLETA,
            weightInputKg = "22.000",
            brand = "San Juan",
            pricePerKg = java.math.BigDecimal("40.00"),
        ).getOrThrow()
        val sugarSummary = com.example.domain.CalculationEngine.calculateSugarSummary("3", "50", "900")
        val calc = com.example.domain.CalculationEngine.calculateDeliveryWithSugar(
            items = listOf(eggItem),
            pricePerKg = java.math.BigDecimal("40.00"),
            sugarSummary = sugarSummary,
        )
        val mixedId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "San Juan",
            boxes = calc.boxesDecimal.toDouble(),
            grossWeightKg = calc.inputWeightKg.toDouble(),
            tareDeductionKg = calc.tareDeductionKg.toDouble(),
            netWeightKg = calc.netWeightKg.toDouble(),
            pricePerKg = calc.pricePerKg.toDouble(),
            rawAmountMxn = calc.rawAmountMxn.toDouble(),
            finalAmountMxn = calc.finalAmountMxn.toDouble(),
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = calc.finalAmountMxn.toDouble(),
            signatureBitmap = null,
            weighedItems = listOf(eggItem),
            sugarSacks = 3.0,
            sugarSackWeightKg = 50.0,
            sugarPricePerSackMxn = 900.0,
            sugarSubtotalMxn = 2700.0,
        )

        val sugarAfterMixed = repository.observeSugarInventory().first()
        assertEquals(9.0, sugarAfterMixed.remainingSacks, 0.0001)
        assertEquals(450.0, sugarAfterMixed.remainingWeightKg, 0.0001)

        val savedMixed = repository.observeDeliveryById(mixedId).first()!!
        val settings = repository.getSettingsOnce()
        val client = repository.getClientOnce(clientId)
        val escPosMixed = String(
            com.example.system.ThermalPrinterManager(context).buildEscPosTicketBytes(savedMixed, settings, client),
            Charsets.US_ASCII,
        )
        assertTrue(escPosMixed.contains("Azucar"))
        assertTrue(escPosMixed.contains("KILOS NETOS"))
        assertTrue(escPosMixed.contains("170.00 kg"))
        assertTrue(escPosMixed.contains("Subtotal:"))
        assertTrue(escPosMixed.contains("\$3,500.00"))

        val pdfFile = com.example.system.PdfDocumentGenerator.generateTicketPdf(context, savedMixed, settings, client)
        assertTrue(pdfFile.exists() && pdfFile.length() > 0L)
        pdfFile.delete()

        // Daily closing sums combined weight (20 + 150 = 170 kg)
        val closing = repository.generateDailyClosing()
        assertEquals(170.0, closing.totalKgDelivered, 0.01)

        // Sugar-only delivery (2 sacks x 25 kg @ 480 = 960)
        val sugarOnlyId = repository.registerDelivery(
            clientId = clientId,
            modality = DeliveryModality.CAJA_COMPLETA,
            brand = "Azúcar",
            boxes = 0.0,
            grossWeightKg = 0.0,
            tareDeductionKg = 0.0,
            netWeightKg = 0.0,
            pricePerKg = 0.0,
            rawAmountMxn = 960.0,
            finalAmountMxn = 960.0,
            paymentMethod = PaymentMethod.CONTADO,
            initialPaymentMxn = 960.0,
            signatureBitmap = null,
            weighedItems = emptyList(),
            sugarSacks = 2.0,
            sugarSackWeightKg = 25.0,
            sugarPricePerSackMxn = 480.0,
            sugarSubtotalMxn = 960.0,
        )
        val sugarAfterOnly = repository.observeSugarInventory().first()
        assertEquals(7.0, sugarAfterOnly.remainingSacks, 0.0001)
        assertEquals(400.0, sugarAfterOnly.remainingWeightKg, 0.0001)

        // Cancel mixed delivery -> reverts 3 sacks / 150 kg and 1 egg box
        repository.cancelDelivery(mixedId, "Cancelación mixta")
        val sugarAfterCancel = repository.observeSugarInventory().first()
        assertEquals(10.0, sugarAfterCancel.remainingSacks, 0.0001)
        assertEquals(550.0, sugarAfterCancel.remainingWeightKg, 0.0001)

        // JSON Backup & Restore preserves sugar purchases, sugar inventory, and sugar fields on deliveries
        val backup = repository.exportFullJsonBackup()
        val restoreRes = repository.restoreFromLocalBackup(backup)
        assertTrue(restoreRes.isSuccess)
        val restoredSugarInv = repository.observeSugarInventory().first()
        assertEquals(10.0, restoredSugarInv.remainingSacks, 0.0001)
        assertEquals(550.0, restoredSugarInv.remainingWeightKg, 0.0001)
        val restoredOnly = repository.observeDeliveryById(sugarOnlyId).first()!!
        assertEquals(2.0, restoredOnly.sugarSacks, 0.0001)
        assertEquals(25.0, restoredOnly.sugarSackWeightKg, 0.0001)
        assertEquals(960.0, restoredOnly.sugarSubtotalMxn, 0.001)
        File(backup.filePath).delete()
    }

    @Test
    fun `migration 3 to 4 preserves v3 clients deliveries and settings without data loss`() = runTest {
        val dbFile = File(context.cacheDir, "migration_v3_to_v4_test.db").apply { delete() }
        val helper = androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory().create(
            androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(dbFile.absolutePath)
                .callback(object : androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(3) {
                    override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS clients (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                name TEXT NOT NULL,
                                phone TEXT NOT NULL,
                                address TEXT NOT NULL,
                                specialPricePerKg REAL,
                                creditTermDays INTEGER,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS egg_purchases (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                purchaseDateMillis INTEGER NOT NULL,
                                boxes REAL NOT NULL,
                                brand TEXT NOT NULL,
                                grossWeightKg REAL NOT NULL,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS inventory_brands (
                                brand TEXT PRIMARY KEY NOT NULL,
                                availableBoxes REAL NOT NULL,
                                deliveredBoxes REAL NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS deliveries (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                folio TEXT NOT NULL,
                                clientId INTEGER NOT NULL,
                                clientName TEXT NOT NULL,
                                dateMillis INTEGER NOT NULL,
                                modality TEXT NOT NULL,
                                brand TEXT NOT NULL,
                                boxes REAL NOT NULL,
                                grossWeightKg REAL NOT NULL,
                                tareDeductionKg REAL NOT NULL,
                                netWeightKg REAL NOT NULL,
                                pricePerKg REAL NOT NULL,
                                rawAmountMxn REAL NOT NULL,
                                finalAmountMxn REAL NOT NULL,
                                paymentMethod TEXT NOT NULL,
                                initialPaymentMxn REAL NOT NULL,
                                pendingBalanceMxn REAL NOT NULL,
                                previousDebtSnapshotMxn REAL NOT NULL,
                                totalAccumulatedDebtSnapshotMxn REAL NOT NULL,
                                signaturePath TEXT,
                                status TEXT NOT NULL,
                                cancelledAtMillis INTEGER,
                                cancellationReason TEXT,
                                itemsSnapshotJson TEXT NOT NULL DEFAULT '[]'
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS abonos (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                clientId INTEGER NOT NULL,
                                deliveryId INTEGER NOT NULL,
                                deliveryFolio TEXT NOT NULL,
                                amountMxn REAL NOT NULL,
                                dateMillis INTEGER NOT NULL,
                                note TEXT NOT NULL,
                                isCancelled INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS reminders (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                clientId INTEGER NOT NULL,
                                clientName TEXT NOT NULL,
                                deliveryDateMillis INTEGER NOT NULL,
                                boxesNote TEXT NOT NULL,
                                note TEXT NOT NULL,
                                isCompleted INTEGER NOT NULL,
                                completedAtMillis INTEGER,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS daily_closings (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                folio TEXT NOT NULL,
                                dateKey TEXT NOT NULL,
                                createdAtMillis INTEGER NOT NULL,
                                totalDeliveries INTEGER NOT NULL,
                                totalBoxesDelivered REAL NOT NULL,
                                totalKgDelivered REAL NOT NULL,
                                cashSalesMxn REAL NOT NULL,
                                creditSalesMxn REAL NOT NULL,
                                abonosReceivedMxn REAL NOT NULL,
                                totalMoneyCollectedMxn REAL NOT NULL,
                                pendingDebtsMxn REAL NOT NULL,
                                clientsServedCount INTEGER NOT NULL,
                                movementsSnapshotJson TEXT NOT NULL,
                                pdfPath TEXT NOT NULL,
                                jsonPath TEXT NOT NULL,
                                hashSignature TEXT NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS backup_records (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                fileName TEXT NOT NULL,
                                filePath TEXT NOT NULL,
                                format TEXT NOT NULL,
                                sizeBytes INTEGER NOT NULL,
                                createdAtMillis INTEGER NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS business_settings (
                                id INTEGER NOT NULL PRIMARY KEY,
                                businessName TEXT NOT NULL,
                                slogan TEXT NOT NULL,
                                phone TEXT NOT NULL,
                                address TEXT NOT NULL,
                                globalPricePerKg REAL NOT NULL,
                                printerType TEXT NOT NULL,
                                printerName TEXT NOT NULL,
                                printerAddress TEXT NOT NULL,
                                nextFolioSequence INTEGER NOT NULL,
                                nextClosingSequence INTEGER NOT NULL,
                                creditTermDays INTEGER NOT NULL DEFAULT 7,
                                creditMoratoriumInterestPercent REAL NOT NULL DEFAULT 0.0,
                                creditPaymentPlace TEXT NOT NULL DEFAULT '',
                                creditLegendExtra TEXT NOT NULL DEFAULT '',
                                creditLegendClosing TEXT NOT NULL DEFAULT 'Válido con firma digital.'
                            )
                            """.trimIndent(),
                        )
                        db.execSQL(
                            "INSERT INTO clients (id, name, phone, address, specialPricePerKg, creditTermDays, createdAtMillis) VALUES (1, 'Abarrotes v3', '5533334444', 'Calle Sur 12', 42.0, 10, 1700000000000)",
                        )
                        db.execSQL(
                            "INSERT INTO deliveries (id, folio, clientId, clientName, dateMillis, modality, brand, boxes, grossWeightKg, tareDeductionKg, netWeightKg, pricePerKg, rawAmountMxn, finalAmountMxn, paymentMethod, initialPaymentMxn, pendingBalanceMxn, previousDebtSnapshotMxn, totalAccumulatedDebtSnapshotMxn, signaturePath, status, cancelledAtMillis, cancellationReason, itemsSnapshotJson) VALUES (1, 'HYH-2026-0042', 1, 'Abarrotes v3', 1700000000000, 'CAJA_COMPLETA', 'Tehuacán', 3.0, 66.0, 6.0, 60.0, 42.0, 2520.0, 2520.0, 'CREDITO', 520.0, 2000.0, 0.0, 2000.0, NULL, 'ACTIVA', NULL, NULL, '[]')",
                        )
                        db.execSQL(
                            "INSERT INTO business_settings (id, businessName, slogan, phone, address, globalPricePerKg, printerType, printerName, printerAddress, nextFolioSequence, nextClosingSequence, creditTermDays) VALUES (1, 'H y H HUEVOS', 'LOS MAS FRESCOS DE LA ZONA', '5599998888', 'Bodega 1', 44.5, 'BLUETOOTH', '', '', 43, 8, 14)",
                        )
                    }

                    override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build(),
        )
        helper.writableDatabase.close()

        val upgradedDb = Room.databaseBuilder(context, HyhDatabase::class.java, dbFile.absolutePath)
            .addMigrations(HyhDatabase.MIGRATION_1_2, HyhDatabase.MIGRATION_2_3, HyhDatabase.MIGRATION_3_4)
            .allowMainThreadQueries()
            .build()
        val upgradedRepo = HyhRepository(context, upgradedDb)

        val clients = upgradedRepo.observeClients().first()
        val deliveries = upgradedRepo.observeDeliveries().first()
        val settings = upgradedRepo.getSettingsOnce()
        val sugarInv = upgradedRepo.observeSugarInventory().first()

        assertEquals(1, clients.size)
        assertEquals("Abarrotes v3", clients.first().name)
        assertEquals(10, clients.first().creditTermDays)

        assertEquals(1, deliveries.size)
        assertEquals("HYH-2026-0042", deliveries.first().folio)
        assertEquals(2000.0, deliveries.first().pendingBalanceMxn, 0.001)
        assertEquals(0.0, deliveries.first().sugarSacks, 0.001)

        assertEquals(43, settings.nextFolioSequence)
        assertEquals(14, settings.creditTermDays)
        assertEquals(0.0, sugarInv.remainingSacks, 0.001)

        upgradedDb.close()
        dbFile.delete()
    }
}
