package com.example.system

import android.content.Context
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.EggPurchaseEntity
import com.example.data.local.entity.InventoryBrandEntity
import com.example.data.local.entity.ReminderEntity
import com.example.data.local.entity.SugarInventoryEntity
import com.example.BuildConfig
import com.example.data.local.entity.SugarPurchaseEntity
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object JsonExporter {

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)

    fun deliveryToJson(delivery: DeliveryEntity, settings: BusinessSettingsEntity): JSONObject {
        return JSONObject().apply {
            put("empresa", settings.businessName)
            put("eslogan", settings.slogan)
            put("telefono_negocio", settings.phone)
            put("direccion_negocio", settings.address)
            put("folio", delivery.folio)
            put("canal_venta", delivery.salesChannel)
            put("fecha", isoFormat.format(Date(delivery.dateMillis)))
            put("fecha_millis", delivery.dateMillis)
            put("cliente_id", delivery.clientId)
            put("cliente_nombre", delivery.clientName)
            put("marca", delivery.brand)
            put("modalidad", delivery.modality)
            put("cajas", delivery.boxes)
            put("peso_ingresado_kg", delivery.grossWeightKg)
            put("tara_kg", delivery.tareDeductionKg)
            put("peso_neto_kg", delivery.netWeightKg)
            put("precio_por_kg_mxn", delivery.pricePerKg)
            put("importe_calculado_mxn", delivery.rawAmountMxn)
            put("importe_final_mxn", delivery.finalAmountMxn)
            put("forma_pago", delivery.paymentMethod)
            put("abono_inicial_mxn", delivery.initialPaymentMxn)
            put("saldo_pendiente_entrega_mxn", delivery.pendingBalanceMxn)
            put("deuda_anterior_mxn", delivery.previousDebtSnapshotMxn)
            put("deuda_total_acumulada_mxn", delivery.previousDebtSnapshotMxn + delivery.pendingBalanceMxn)
            put("estado", delivery.status)
            put("firma_archivo", delivery.signaturePath ?: JSONObject.NULL)
            put("cancelado_fecha_millis", delivery.cancelledAtMillis ?: JSONObject.NULL)
            put("cancelado_motivo", delivery.cancellationReason ?: JSONObject.NULL)
            put("bultos_azucar", delivery.sugarSacks)
            put("peso_bulto_azucar_kg", delivery.sugarSackWeightKg)
            put("precio_bulto_azucar_mxn", delivery.sugarPricePerSackMxn)
            put("subtotal_azucar_mxn", delivery.sugarSubtotalMxn)
            put(
                "cajas_detalle",
                runCatching { JSONArray(delivery.itemsSnapshotJson.ifBlank { "[]" }) }
                    .getOrElse { JSONArray() },
            )
        }
    }

    fun writeDeliveryJsonFile(context: Context, delivery: DeliveryEntity, settings: BusinessSettingsEntity): File {
        val dir = File(context.filesDir, "tickets").apply { mkdirs() }
        val file = File(dir, "Ticket_${delivery.folio}.json")
        file.writeText(deliveryToJson(delivery, settings).toString(2), Charsets.UTF_8)
        return file
    }

    fun closingToJson(
        closing: DailyClosingEntity,
        deliveries: List<DeliveryEntity>,
        settings: BusinessSettingsEntity,
    ): JSONObject {
        val deliveriesArray = JSONArray()
        deliveries.forEach { deliveriesArray.put(deliveryToJson(it, settings)) }
        return JSONObject().apply {
            put("folio_cierre", closing.folio)
            put("fecha_cierre", closing.dateKey)
            put("creado_en", isoFormat.format(Date(closing.createdAtMillis)))
            put("total_entregas", closing.totalDeliveries)
            put("clientes_atendidos", closing.clientsServedCount)
            put("cajas_entregadas", closing.totalBoxesDelivered)
            put("kilogramos_entregados", closing.totalKgDelivered)
            put("ventas_contado_mxn", closing.cashSalesMxn)
            put("ventas_credito_mxn", closing.creditSalesMxn)
            put("abonos_recibidos_mxn", closing.abonosReceivedMxn)
            put("dinero_cobrado_mxn", closing.totalMoneyCollectedMxn)
            put("deudas_pendientes_mxn", closing.pendingDebtsMxn)
            put("hash", closing.hashSignature)
            put("entregas", deliveriesArray)
        }
    }

    fun buildFullDatabaseJson(
        settings: BusinessSettingsEntity,
        clients: List<ClientEntity>,
        purchases: List<EggPurchaseEntity>,
        inventory: List<InventoryBrandEntity>,
        deliveries: List<DeliveryEntity>,
        abonos: List<AbonoEntity>,
        reminders: List<ReminderEntity>,
        closings: List<DailyClosingEntity>,
        sugarPurchases: List<SugarPurchaseEntity> = emptyList(),
        sugarInventory: SugarInventoryEntity? = null,
    ): JSONObject {
        val clientsArr = JSONArray().apply {
            clients.forEach { c ->
                put(
                    JSONObject().apply {
                        put("id", c.id)
                        put("windowsId", c.windowsId ?: JSONObject.NULL)
                        put("name", c.name)
                        put("phone", c.phone)
                        put("address", c.address)
                        put("specialPricePerKg", c.specialPricePerKg ?: JSONObject.NULL)
                        put("creditTermDays", c.creditTermDays ?: JSONObject.NULL)
                        put("windowsSyncedDebtMxn", c.windowsSyncedDebtMxn)
                        put("createdAtMillis", c.createdAtMillis)
                    },
                )
            }
        }
        val purchasesArr = JSONArray().apply {
            purchases.forEach { p ->
                put(
                    JSONObject().apply {
                        put("id", p.id)
                        put("purchaseDateMillis", p.purchaseDateMillis)
                        put("boxes", p.boxes)
                        put("brand", p.brand)
                        put("grossWeightKg", p.grossWeightKg)
                        put("createdAtMillis", p.createdAtMillis)
                    },
                )
            }
        }
        val inventoryArr = JSONArray().apply {
            inventory.forEach { inv ->
                put(
                    JSONObject().apply {
                        put("brand", inv.brand)
                        put("availableBoxes", inv.availableBoxes)
                        put("deliveredBoxes", inv.deliveredBoxes)
                    },
                )
            }
        }
        val deliveriesArr = JSONArray().apply {
            deliveries.forEach { d ->
                put(
                    JSONObject().apply {
                        put("id", d.id)
                        put("folio", d.folio)
                        put("salesChannel", d.salesChannel)
                        put("clientId", d.clientId)
                        put("clientName", d.clientName)
                        put("dateMillis", d.dateMillis)
                        put("modality", d.modality)
                        put("brand", d.brand)
                        put("boxes", d.boxes)
                        put("grossWeightKg", d.grossWeightKg)
                        put("tareDeductionKg", d.tareDeductionKg)
                        put("netWeightKg", d.netWeightKg)
                        put("pricePerKg", d.pricePerKg)
                        put("rawAmountMxn", d.rawAmountMxn)
                        put("finalAmountMxn", d.finalAmountMxn)
                        put("paymentMethod", d.paymentMethod)
                        put("initialPaymentMxn", d.initialPaymentMxn)
                        put("pendingBalanceMxn", d.pendingBalanceMxn)
                        put("previousDebtSnapshotMxn", d.previousDebtSnapshotMxn)
                        put("totalAccumulatedDebtSnapshotMxn", d.totalAccumulatedDebtSnapshotMxn)
                        put("signaturePath", d.signaturePath ?: JSONObject.NULL)
                        put("status", d.status)
                        put("cancelledAtMillis", d.cancelledAtMillis ?: JSONObject.NULL)
                        put("cancellationReason", d.cancellationReason ?: JSONObject.NULL)
                        put("itemsSnapshotJson", d.itemsSnapshotJson)
                        put("sugarSacks", d.sugarSacks)
                        put("sugarSackWeightKg", d.sugarSackWeightKg)
                        put("sugarPricePerSackMxn", d.sugarPricePerSackMxn)
                        put("sugarSubtotalMxn", d.sugarSubtotalMxn)
                    },
                )
            }
        }
        val abonosArr = JSONArray().apply {
            abonos.forEach { a ->
                put(
                    JSONObject().apply {
                        put("id", a.id)
                        put("clientId", a.clientId)
                        put("deliveryId", a.deliveryId)
                        put("deliveryFolio", a.deliveryFolio)
                        put("amountMxn", a.amountMxn)
                        put("dateMillis", a.dateMillis)
                        put("note", a.note)
                        put("isCancelled", a.isCancelled)
                        put("salesChannel", a.salesChannel)
                    },
                )
            }
        }
        val remindersArr = JSONArray().apply {
            reminders.forEach { r ->
                put(
                    JSONObject().apply {
                        put("id", r.id)
                        put("clientId", r.clientId)
                        put("clientName", r.clientName)
                        put("deliveryDateMillis", r.deliveryDateMillis)
                        put("boxesNote", r.boxesNote)
                        put("note", r.note)
                        put("isCompleted", r.isCompleted)
                        put("completedAtMillis", r.completedAtMillis ?: JSONObject.NULL)
                        put("createdAtMillis", r.createdAtMillis)
                    },
                )
            }
        }
        val closingsArr = JSONArray().apply {
            closings.forEach { c ->
                put(
                    JSONObject().apply {
                        put("id", c.id)
                        put("folio", c.folio)
                        put("dateKey", c.dateKey)
                        put("createdAtMillis", c.createdAtMillis)
                        put("totalDeliveries", c.totalDeliveries)
                        put("totalBoxesDelivered", c.totalBoxesDelivered)
                        put("totalKgDelivered", c.totalKgDelivered)
                        put("cashSalesMxn", c.cashSalesMxn)
                        put("creditSalesMxn", c.creditSalesMxn)
                        put("abonosReceivedMxn", c.abonosReceivedMxn)
                        put("totalMoneyCollectedMxn", c.totalMoneyCollectedMxn)
                        put("pendingDebtsMxn", c.pendingDebtsMxn)
                        put("clientsServedCount", c.clientsServedCount)
                        put("movementsSnapshotJson", c.movementsSnapshotJson)
                        put("pdfPath", c.pdfPath)
                        put("jsonPath", c.jsonPath)
                        put("hashSignature", c.hashSignature)
                    },
                )
            }
        }

        val settingsObj = JSONObject().apply {
            put("businessName", settings.businessName)
            put("slogan", settings.slogan)
            put("phone", settings.phone)
            put("address", settings.address)
            put("globalPricePerKg", settings.globalPricePerKg)
            put("printerType", settings.printerType)
            put("printerName", settings.printerName)
            put("printerAddress", settings.printerAddress)
            put("printerTransport", settings.printerTransport)
            put("nextFolioSequence", settings.nextFolioSequence)
            put("nextCremeriaFolioSequence", settings.nextCremeriaFolioSequence)
            put("nextClosingSequence", settings.nextClosingSequence)
            put("creditTermDays", settings.creditTermDays)
            put("creditMoratoriumInterestPercent", settings.creditMoratoriumInterestPercent)
            put("creditPaymentPlace", settings.creditPaymentPlace)
            put("creditLegendExtra", settings.creditLegendExtra)
            put("creditLegendClosing", settings.creditLegendClosing)
        }

        val sugarPurchasesArr = JSONArray().apply {
            sugarPurchases.forEach { sp ->
                put(
                    JSONObject().apply {
                        put("id", sp.id)
                        put("purchaseDateMillis", sp.purchaseDateMillis)
                        put("sacks", sp.sacks)
                        put("totalWeightKg", sp.totalWeightKg)
                        put("createdAtMillis", sp.createdAtMillis)
                    },
                )
            }
        }
        val sugarInvObj = sugarInventory?.let { si ->
            JSONObject().apply {
                put("id", si.id)
                put("availableSacks", si.availableSacks)
                put("deliveredSacks", si.deliveredSacks)
                put("availableWeightKg", si.availableWeightKg)
                put("deliveredWeightKg", si.deliveredWeightKg)
            }
        }

        return JSONObject().apply {
            put("schemaVersion", 2)
            put("exportedAt", isoFormat.format(Date()))
            put("settings", settingsObj)
            put("clients", clientsArr)
            put("purchases", purchasesArr)
            put("inventory", inventoryArr)
            put("deliveries", deliveriesArr)
            put("abonos", abonosArr)
            put("reminders", remindersArr)
            put("closings", closingsArr)
            put("sugarPurchases", sugarPurchasesArr)
            if (sugarInvObj != null) put("sugarInventory", sugarInvObj)
        }
    }

    fun createFullBackupZip(
        context: Context,
        settings: BusinessSettingsEntity,
        clients: List<ClientEntity>,
        purchases: List<EggPurchaseEntity>,
        inventory: List<InventoryBrandEntity>,
        deliveries: List<DeliveryEntity>,
        abonos: List<AbonoEntity>,
        reminders: List<ReminderEntity>,
        closings: List<DailyClosingEntity>,
        sugarPurchases: List<SugarPurchaseEntity> = emptyList(),
        sugarInventory: SugarInventoryEntity? = null,
    ): File {
        val dir = File(context.filesDir, "backups").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val zipFile = File(dir, "Respaldo_${BuildConfig.BRAND_FILE_PREFIX}_$stamp.zip")

        val fullJson = buildFullDatabaseJson(
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

        val metadataJson = JSONObject().apply {
            put("app", BuildConfig.BRAND_APP_NAME)
            put("eslogan", settings.slogan)
            put("fecha_respaldo", isoFormat.format(Date()))
            put("total_clientes", clients.size)
            put("total_entregas", deliveries.size)
            put("total_compras", purchases.size)
            put("total_cierres", closings.size)
            put("total_recordatorios", reminders.size)
        }

        ZipOutputStream(FileOutputStream(zipFile)).use { zos ->
            zos.putNextEntry(ZipEntry("datos_generales.json"))
            zos.write(fullJson.toString(2).toByteArray(Charsets.UTF_8))
            zos.closeEntry()

            zos.putNextEntry(ZipEntry("metadata.json"))
            zos.write(metadataJson.toString(2).toByteArray(Charsets.UTF_8))
            zos.closeEntry()

            deliveries.forEach { d ->
                val ticketJson = deliveryToJson(d, settings).toString(2)
                zos.putNextEntry(ZipEntry("tickets/Ticket_${d.folio}.json"))
                zos.write(ticketJson.toByteArray(Charsets.UTF_8))
                zos.closeEntry()

                d.signaturePath?.let { path ->
                    val sigFile = File(path)
                    if (sigFile.exists()) {
                        zos.putNextEntry(ZipEntry("firmas/${sigFile.name}"))
                        FileInputStream(sigFile).use { it.copyTo(zos) }
                        zos.closeEntry()
                    }
                }
            }

            closings.forEach { c ->
                val pdfFile = File(c.pdfPath)
                if (pdfFile.exists()) {
                    zos.putNextEntry(ZipEntry("cierres/${pdfFile.name}"))
                    FileInputStream(pdfFile).use { it.copyTo(zos) }
                    zos.closeEntry()
                }
                val jsonFile = File(c.jsonPath)
                if (jsonFile.exists()) {
                    zos.putNextEntry(ZipEntry("cierres/${jsonFile.name}"))
                    FileInputStream(jsonFile).use { it.copyTo(zos) }
                    zos.closeEntry()
                }
            }
        }
        return zipFile
    }
}
