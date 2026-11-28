package com.example.system

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.example.BuildConfig
import com.example.R
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.domain.CalculationEngine
import com.example.domain.PaymentMethod
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil

object PdfDocumentGenerator {

    private val dateFormatter = SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX"))
    private val timeFormatter = SimpleDateFormat("HH:mm", Locale.US)

    const val TICKET_PAGE_WIDTH_PT = 136 // 48 mm exactos (72 dpi)
    const val TICKET_PAGE_HEIGHT_PT = 369 // Altura base mínima 130 mm (72 dpi)

    fun generateTicketPdf(
        context: Context,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
        liveCustomerTotalDebtMxn: Double? = null,
    ): File {
        val dir = File(context.filesDir, "tickets").apply { mkdirs() }
        val file = File(dir, "Ticket_${delivery.folio}.pdf")

        val pageWidth = TICKET_PAGE_WIDTH_PT
        val margin = 6f
        val logoRaw = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo)
        val signatureRaw = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        }

        val pageHeight = measureTicketHeight(
            context = context,
            pageWidth = pageWidth,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )

        val pdf = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = pdf.startPage(pageInfo)
        renderTicketToCanvas(
            context = context,
            canvas = page.canvas,
            pageWidth = pageWidth,
            pageHeight = pageHeight,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )

        pdf.finishPage(page)
        FileOutputStream(file).use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    fun generateAbonoPdf(
        context: Context,
        abono: AbonoEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
    ): File {
        val dir = File(context.filesDir, "tickets").apply { mkdirs() }
        val folioSafe = abono.receiptFolio.trim().ifBlank { "AB-${abono.id.toString().padStart(4, '0')}" }
            .replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val file = File(dir, "Abono_$folioSafe.pdf")

        val pageWidth = TICKET_PAGE_WIDTH_PT
        val margin = 6f
        val logoRaw = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo)
        val clientName = client?.name ?: "Cliente"

        val naturalHeight = measureNaturalAbonoHeight(
            pageWidth = pageWidth,
            margin = margin,
            abono = abono,
            clientName = clientName,
            settings = settings,
            logoRaw = logoRaw,
        )
        val pageHeight = maxOf(TICKET_PAGE_HEIGHT_PT, ceil(naturalHeight).toInt() + 8)

        val pdf = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = pdf.startPage(pageInfo)
        page.canvas.drawColor(Color.WHITE)
        renderAbonoNaturalToCanvas(
            canvas = page.canvas,
            pageWidth = pageWidth,
            margin = margin,
            abono = abono,
            clientName = clientName,
            settings = settings,
            logoRaw = logoRaw,
        )
        pdf.finishPage(page)
        FileOutputStream(file).use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    internal fun renderTicketToCanvas(
        context: Context,
        canvas: Canvas,
        pageWidth: Int = TICKET_PAGE_WIDTH_PT,
        pageHeight: Int = TICKET_PAGE_HEIGHT_PT,
        margin: Float = 6f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
        liveCustomerTotalDebtMxn: Double? = null,
    ): Float {
        val naturalHeight = measureNaturalTicketHeight(
            context = context,
            pageWidth = pageWidth,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )
        canvas.drawColor(Color.WHITE)
        val availH = (pageHeight - 4f).coerceAtLeast(100f)
        val fitScale = if (naturalHeight > availH) {
            (availH / naturalHeight).coerceIn(0.45f, 1.0f)
        } else {
            1.0f
        }
        canvas.save()
        if (fitScale < 1.0f) {
            canvas.scale(fitScale, fitScale, pageWidth / 2f, 0f)
        }
        val rawDrawn = renderTicketNaturalToCanvas(
            canvas = canvas,
            pageWidth = pageWidth,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )
        canvas.restore()
        return rawDrawn * fitScale
    }

    private fun renderHeader(
        canvas: Canvas,
        pageWidth: Int,
        margin: Float,
        settings: BusinessSettingsEntity,
        logoRaw: Bitmap?,
        paint: Paint,
        boldPaint: Paint,
    ): Float {
        val contentWidth = (pageWidth - margin * 2).toInt()
        val sansBold = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        val isDirecto = BuildConfig.FLAVOR == "directodegranja" ||
            settings.businessName.contains("directo", ignoreCase = true)

        var y = 6f
        if (isDirecto) {
            val leftColW = (contentWidth * 0.46f).toInt()
            var headerH = 38f
            if (logoRaw != null && logoRaw.width > 0 && logoRaw.height > 0) {
                val ratio = minOf(leftColW.toFloat() / logoRaw.width.toFloat(), 44f / logoRaw.height.toFloat())
                val drawW = (logoRaw.width * ratio).toInt().coerceAtLeast(16)
                val drawH = (logoRaw.height * ratio).toInt().coerceAtLeast(16)
                val scaledLogo = Bitmap.createScaledBitmap(logoRaw, drawW, drawH, true)
                canvas.drawBitmap(scaledLogo, margin, y, null)
                headerH = maxOf(headerH, drawH.toFloat())
            }
            val rightCenterX = margin + leftColW + (contentWidth - leftColW) / 2f
            val brandBigPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = 9.5f
                typeface = sansBold
                textAlign = Paint.Align.CENTER
            }
            val brandSmallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = 6.0f
                typeface = sansBold
                textAlign = Paint.Align.CENTER
            }
            val textBase = y + (headerH - 26f).coerceAtLeast(0f) / 2f + 9f
            canvas.drawText("DIRECTO", rightCenterX, textBase, brandBigPaint)
            canvas.drawText("DE", rightCenterX, textBase + 7.5f, brandSmallPaint)
            canvas.drawText("GRANJA", rightCenterX, textBase + 17.5f, brandBigPaint)
            y += headerH + 4f
        } else if (logoRaw != null && logoRaw.width > 0 && logoRaw.height > 0) {
            val ratio = minOf(contentWidth.toFloat() / logoRaw.width.toFloat(), 36f / logoRaw.height.toFloat())
            val targetW = (logoRaw.width * ratio).toInt().coerceAtLeast(24)
            val targetH = (logoRaw.height * ratio).toInt().coerceAtLeast(20)
            val scaledLogo = Bitmap.createScaledBitmap(logoRaw, targetW, targetH, true)
            val logoLeft = margin + (contentWidth - targetW) / 2f
            canvas.drawBitmap(scaledLogo, logoLeft, y, null)
            y += targetH + 4f
        }

        if (settings.slogan.isNotBlank()) {
            val parts = settings.slogan.split(" a ", limit = 2)
            boldPaint.textSize = 5.6f
            y = drawWrapped(canvas, parts[0], boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
            if (parts.size > 1) {
                y = drawWrapped(canvas, "a ${parts[1]}", boldPaint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_CENTER)
            }
        }
        y += 2f
        paint.textSize = 5.4f
        if (settings.phone.isNotBlank()) {
            y = drawWrapped(canvas, "Tel. ${settings.phone}", paint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }
        if (settings.address.isNotBlank()) {
            y = drawWrapped(canvas, settings.address, paint, margin, y - 1f, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }
        return y
    }

    private fun renderTicketNaturalToCanvas(
        canvas: Canvas,
        pageWidth: Int,
        margin: Float,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity?,
        logoRaw: Bitmap?,
        signatureRaw: Bitmap?,
        liveCustomerTotalDebtMxn: Double?,
    ): Float {
        val contentWidth = (pageWidth - margin * 2).toInt()
        val monoRegular = Typeface.MONOSPACE
        val monoBold = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 5.6f
            typeface = monoRegular
        }
        val boldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 5.6f
            typeface = monoBold
        }
        val dashPaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 0.6f
        }
        val solidPaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 0.9f
        }

        val isCancelled = delivery.status == "CANCELADA"
        val effectivePaidMxn = if (!isCancelled) {
            (delivery.finalAmountMxn - delivery.pendingBalanceMxn).coerceIn(0.0, delivery.finalAmountMxn)
        } else {
            delivery.initialPaymentMxn
        }
        val totalCustomerDebtMxn = liveCustomerTotalDebtMxn
            ?: (delivery.previousDebtSnapshotMxn + delivery.pendingBalanceMxn)
        val weighedItems = CalculationEngine.parseWeighedItemsJson(delivery.itemsSnapshotJson)
        val hasEggs = delivery.boxes > 0.0 || weighedItems.isNotEmpty()
        val hasSugar = delivery.sugarSacks > 0.0
        val sugarWeightKg = if (hasSugar) {
            BigDecimal.valueOf(delivery.sugarSacks).multiply(BigDecimal.valueOf(delivery.sugarSackWeightKg))
        } else {
            BigDecimal.ZERO
        }
        val totalNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg).add(sugarWeightKg)
        val methodSummary = if (effectivePaidMxn > 0.0) "efectivo" else "crédito"

        var y = renderHeader(canvas, pageWidth, margin, settings, logoRaw, paint, boldPaint)

        if (isCancelled) {
            val cancelBoxPaint = Paint().apply {
                color = Color.rgb(214, 69, 69)
                style = Paint.Style.STROKE
                strokeWidth = 1.1f
            }
            val cancelTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(214, 69, 69)
                textSize = 6.2f
                typeface = monoBold
                textAlign = Paint.Align.CENTER
            }
            canvas.drawRect(margin, y + 1f, pageWidth - margin, y + 11f, cancelBoxPaint)
            canvas.drawText("CANCELADA", pageWidth / 2f, y + 8.5f, cancelTextPaint)
            y += 14f
        }

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 3f, dashPaint) + 8f

        // Folio + Fecha/Hora
        paint.textSize = 5.6f
        y = drawRow(
            canvas,
            "Folio: ${delivery.folio}",
            dateFormatter.format(Date(delivery.dateMillis)),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 7.5f,
        )
        y = drawRow(
            canvas,
            "",
            timeFormatter.format(Date(delivery.dateMillis)),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )

        // Cliente
        paint.textSize = 5.6f
        y = drawWrapped(canvas, "Cliente:", paint, margin, y - 3f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        val customerDisplay = delivery.clientName.ifBlank { client?.name ?: "Mostrador" }
        y = drawWrapped(canvas, customerDisplay, paint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_NORMAL)

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 3f, dashPaint) + 8f

        // Cajas / Productos
        paint.textSize = 5.6f
        if (weighedItems.isNotEmpty()) {
            weighedItems.forEachIndexed { idx, item ->
                y = drawRow(
                    canvas,
                    "Caja ${idx + 1}",
                    "${CalculationEngine.formatExactWeight(item.netWeightKg)} kg",
                    margin,
                    pageWidth - margin,
                    paint,
                    paint,
                    y,
                    rowStep = 8f,
                )
            }
        } else if (hasEggs) {
            y = drawRow(
                canvas,
                "Cajas (${CalculationEngine.formatExactBoxes(delivery.boxes)})",
                "${CalculationEngine.formatExactWeight(delivery.netWeightKg)} kg",
                margin,
                pageWidth - margin,
                paint,
                paint,
                y,
                rowStep = 8f,
            )
        }
        if (hasSugar) {
            y = drawRow(
                canvas,
                "Azúcar (${CalculationEngine.formatExactBoxes(delivery.sugarSacks)} bto)",
                "${CalculationEngine.formatExactWeight(sugarWeightKg)} kg",
                margin,
                pageWidth - margin,
                paint,
                paint,
                y,
                rowStep = 8f,
            )
        }

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 1f, dashPaint) + 8f

        // Totales
        boldPaint.textSize = 5.7f
        paint.textSize = 5.6f
        y = drawRow(
            canvas,
            "Kilos totales",
            "${CalculationEngine.formatExactWeight(totalNetWeightKg)} kg",
            margin,
            pageWidth - margin,
            boldPaint,
            boldPaint,
            y,
            rowStep = 8f,
        )
        if (hasEggs) {
            y = drawRow(
                canvas,
                "Precio por kilo",
                CalculationEngine.formatTicketMoney(delivery.pricePerKg, forceDecimals = true),
                margin,
                pageWidth - margin,
                paint,
                paint,
                y,
                rowStep = 8f,
            )
        } else if (hasSugar) {
            y = drawRow(
                canvas,
                "Precio por bulto",
                CalculationEngine.formatTicketMoney(delivery.sugarPricePerSackMxn, forceDecimals = true),
                margin,
                pageWidth - margin,
                paint,
                paint,
                y,
                rowStep = 8f,
            )
        }
        boldPaint.textSize = 6.0f
        y = drawRow(
            canvas,
            "TOTAL A COBRAR",
            CalculationEngine.formatTicketMoney(delivery.finalAmountMxn),
            margin,
            pageWidth - margin,
            boldPaint,
            boldPaint,
            y,
            rowStep = 8f,
        )

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 1f, dashPaint) + 8f

        // Pagos y Saldos
        paint.textSize = 5.4f
        boldPaint.textSize = 5.4f
        y = drawRow(
            canvas,
            "Pagado ($methodSummary)",
            CalculationEngine.formatTicketMoney(effectivePaidMxn),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )
        y = drawRow(
            canvas,
            "Saldo de esta entrega",
            CalculationEngine.formatTicketMoney(delivery.pendingBalanceMxn),
            margin,
            pageWidth - margin,
            boldPaint,
            boldPaint,
            y,
            rowStep = 8f,
        )
        y = drawRow(
            canvas,
            "Saldo total del cliente",
            CalculationEngine.formatTicketMoney(totalCustomerDebtMxn),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )

        y += 3f
        paint.textSize = 5.4f
        y = drawWrapped(
            canvas,
            "Comprobante de entrega,\nno es factura",
            paint,
            margin,
            y,
            contentWidth,
            Layout.Alignment.ALIGN_CENTER,
        )

        y += 4f
        y = drawWrapped(canvas, "Firma de recibido:", paint, margin, y, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        if (signatureRaw != null && signatureRaw.width > 0 && signatureRaw.height > 0) {
            val maxSigW = contentWidth.toFloat()
            val maxSigH = 26f
            val ratio = minOf(maxSigW / signatureRaw.width.toFloat(), maxSigH / signatureRaw.height.toFloat())
            val drawW = (signatureRaw.width * ratio).toInt().coerceAtLeast(1)
            val drawH = (signatureRaw.height * ratio).toInt().coerceAtLeast(1)
            val scaledSig = Bitmap.createScaledBitmap(signatureRaw, drawW, drawH, true)
            canvas.drawBitmap(scaledSig, margin + (contentWidth - drawW) / 2f, y, null)
            y += drawH + 4f
        } else {
            y += 18f
        }

        canvas.drawLine(margin, y, pageWidth - margin, y, solidPaint)
        y += 6f
        boldPaint.textSize = 5.8f
        y = drawWrapped(canvas, "¡Gracias por su compra!", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        return y + 6f
    }

    private fun renderAbonoNaturalToCanvas(
        canvas: Canvas,
        pageWidth: Int,
        margin: Float,
        abono: AbonoEntity,
        clientName: String,
        settings: BusinessSettingsEntity,
        logoRaw: Bitmap?,
    ): Float {
        val contentWidth = (pageWidth - margin * 2).toInt()
        val monoRegular = Typeface.MONOSPACE
        val monoBold = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 5.6f
            typeface = monoRegular
        }
        val boldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 5.6f
            typeface = monoBold
        }
        val dashPaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 0.6f
        }
        val solidPaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 0.9f
        }

        val displayFolio = abono.receiptFolio.trim().ifBlank { "AB-${abono.id.toString().padStart(4, '0')}" }
        val appliedToLabel = abono.deliveryFolio.trim().ifBlank { "Saldo de cuenta" }
        val methodLabel = if (abono.paymentMethod == "transferencia") "Transferencia" else "Efectivo"
        val statusLabel = if (abono.paymentMethod == "transferencia") "Por verificar" else "Verificado"

        var y = renderHeader(canvas, pageWidth, margin, settings, logoRaw, paint, boldPaint)

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 3f, dashPaint) + 6f

        boldPaint.textSize = 5.8f
        y = drawWrapped(canvas, "COMPROBANTE DE ABONO", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        y += 2f

        paint.textSize = 5.6f
        y = drawRow(
            canvas,
            "Folio: $displayFolio",
            dateFormatter.format(Date(abono.dateMillis)),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y + 3f,
            rowStep = 7.5f,
        )
        y = drawRow(
            canvas,
            "",
            timeFormatter.format(Date(abono.dateMillis)),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )

        y = drawWrapped(canvas, "Cliente:", paint, margin, y - 3f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        y = drawWrapped(canvas, clientName, paint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        y = drawRow(canvas, "Aplica a:", appliedToLabel, margin, pageWidth - margin, paint, paint, y + 5f, rowStep = 7.5f)

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 1f, dashPaint) + 8f

        paint.textSize = 5.6f
        boldPaint.textSize = 5.9f
        y = drawRow(
            canvas,
            "Saldo anterior",
            CalculationEngine.formatTicketMoney(abono.previousDebtSnapshotMxn),
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )
        y = drawRow(
            canvas,
            "ABONO RECIBIDO",
            CalculationEngine.formatTicketMoney(abono.amountMxn),
            margin,
            pageWidth - margin,
            boldPaint,
            boldPaint,
            y,
            rowStep = 8f,
        )
        y = drawRow(
            canvas,
            "Forma de pago",
            methodLabel,
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )
        y = drawRow(
            canvas,
            "Estado",
            statusLabel,
            margin,
            pageWidth - margin,
            paint,
            paint,
            y,
            rowStep = 8f,
        )
        if (abono.note.isNotBlank()) {
            paint.textSize = 5.2f
            y = drawWrapped(canvas, "Nota: ${abono.note.trim()}", paint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        }

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 2f, dashPaint) + 8f

        boldPaint.textSize = 5.9f
        y = drawRow(
            canvas,
            "SALDO RESTANTE",
            CalculationEngine.formatTicketMoney(abono.remainingDebtSnapshotMxn),
            margin,
            pageWidth - margin,
            boldPaint,
            boldPaint,
            y,
            rowStep = 8f,
        )

        y += 3f
        paint.textSize = 5.4f
        y = drawWrapped(
            canvas,
            "Comprobante de abono,\nno es factura",
            paint,
            margin,
            y,
            contentWidth,
            Layout.Alignment.ALIGN_CENTER,
        )

        y += 4f
        y = drawWrapped(canvas, "Firma de recibido:", paint, margin, y, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        y += 18f

        canvas.drawLine(margin, y, pageWidth - margin, y, solidPaint)
        y += 6f
        boldPaint.textSize = 5.8f
        y = drawWrapped(canvas, "¡Gracias por su abono!", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        return y + 6f
    }

    fun generateDailyClosingPdf(
        context: Context,
        closing: DailyClosingEntity,
        deliveries: List<DeliveryEntity>,
        settings: BusinessSettingsEntity,
    ): File {
        val dir = File(context.filesDir, "cierres").apply { mkdirs() }
        val file = File(dir, "Cierre_${closing.folio}.pdf")

        val pageWidth = 595
        val margin = 36f
        val contentWidth = (pageWidth - margin * 2).toInt()
        val pageHeight = (520 + deliveries.size * 34).coerceAtLeast(842)

        val pdf = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = pdf.startPage(pageInfo)
        val canvas = page.canvas
        canvas.drawColor(Color.WHITE)

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val subtitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.DKGRAY
            textSize = 11f
        }
        val boldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 11f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 10.5f
        }
        val divider = Paint().apply {
            color = Color.LTGRAY
            strokeWidth = 1f
        }

        var y = 44f
        canvas.drawText("${settings.businessName} — CIERRE DIARIO", margin, y, titlePaint)
        y += 18f
        canvas.drawText(settings.slogan, margin, y, subtitlePaint)
        y += 16f
        canvas.drawText("Folio Cierre: ${closing.folio}   |   Fecha: ${closing.dateKey}", margin, y, boldPaint)
        y += 14f
        canvas.drawLine(margin, y, pageWidth - margin, y, divider)
        y += 22f

        val summaryRows = listOf(
            "Total de entregas activas" to closing.totalDeliveries.toString(),
            "Clientes atendidos" to closing.clientsServedCount.toString(),
            "Cajas entregadas" to "${CalculationEngine.formatExactBoxes(closing.totalBoxesDelivered)} cajas",
            "Kilogramos entregados" to "${CalculationEngine.formatExactWeight(closing.totalKgDelivered)} kg",
            "Ventas de contado" to "${CalculationEngine.formatMoney(closing.cashSalesMxn)} MXN",
            "Ventas a crédito" to "${CalculationEngine.formatMoney(closing.creditSalesMxn)} MXN",
            "Abonos recibidos" to "${CalculationEngine.formatMoney(closing.abonosReceivedMxn)} MXN",
            "Dinero cobrado total" to "${CalculationEngine.formatMoney(closing.totalMoneyCollectedMxn)} MXN",
            "Deudas pendientes totales" to "${CalculationEngine.formatMoney(closing.pendingDebtsMxn)} MXN",
        )
        for ((label, value) in summaryRows) {
            y = drawRow(canvas, label, value, margin, pageWidth - margin, bodyPaint, boldPaint, y)
            y += 4f
        }

        y += 10f
        canvas.drawLine(margin, y, pageWidth - margin, y, divider)
        y += 20f
        canvas.drawText("Detalle de Entregas", margin, y, boldPaint.apply { textSize = 13f })
        y += 16f

        bodyPaint.textSize = 9.5f
        boldPaint.textSize = 9.5f
        for (d in deliveries) {
            if (y > pageHeight - 60f) break
            val statusSuffix = if (d.status == "CANCELADA") " [CANCELADO]" else ""
            val line1 = "${d.folio}$statusSuffix — ${d.clientName}"
            val sugarKg = d.sugarSacks * d.sugarSackWeightKg
            val totalKg = d.netWeightKg + sugarKg
            val qtyParts = buildList {
                if (d.boxes > 0.0) add("${CalculationEngine.formatExactBoxes(d.boxes)} cjs")
                if (d.sugarSacks > 0.0) add("${CalculationEngine.formatExactBoxes(d.sugarSacks)} bto azúcar")
            }.joinToString(" + ").ifBlank { "0 cjs" }
            val line2 = "  $qtyParts | ${CalculationEngine.formatExactWeight(totalKg)} kg | ${PaymentMethod.fromDb(d.paymentMethod).label} | ${CalculationEngine.formatMoney(d.finalAmountMxn)} MXN"
            canvas.drawText(line1.take(80), margin, y, boldPaint)
            y += 13f
            canvas.drawText(line2.take(contentWidth), margin, y, bodyPaint)
            y += 17f
        }

        pdf.finishPage(page)
        FileOutputStream(file).use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    internal fun measureTicketHeight(
        context: Context,
        pageWidth: Int = TICKET_PAGE_WIDTH_PT,
        margin: Float = 6f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity?,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
        liveCustomerTotalDebtMxn: Double? = null,
    ): Int {
        val natural = measureNaturalTicketHeight(
            context = context,
            pageWidth = pageWidth,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )
        return maxOf(TICKET_PAGE_HEIGHT_PT, ceil(natural).toInt() + 8)
    }

    internal fun measureNaturalTicketHeight(
        context: Context,
        pageWidth: Int = TICKET_PAGE_WIDTH_PT,
        margin: Float = 6f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity?,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
        liveCustomerTotalDebtMxn: Double? = null,
    ): Float {
        val picture = android.graphics.Picture()
        val recCanvas = picture.beginRecording(pageWidth, 4000)
        val measured = renderTicketNaturalToCanvas(
            canvas = recCanvas,
            pageWidth = pageWidth,
            margin = margin,
            delivery = delivery,
            settings = settings,
            client = client,
            logoRaw = logoRaw,
            signatureRaw = signatureRaw,
            liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
        )
        picture.endRecording()
        return measured
    }

    internal fun measureNaturalAbonoHeight(
        pageWidth: Int = TICKET_PAGE_WIDTH_PT,
        margin: Float = 6f,
        abono: AbonoEntity,
        clientName: String,
        settings: BusinessSettingsEntity,
        logoRaw: Bitmap?,
    ): Float {
        val picture = android.graphics.Picture()
        val recCanvas = picture.beginRecording(pageWidth, 4000)
        val measured = renderAbonoNaturalToCanvas(
            canvas = recCanvas,
            pageWidth = pageWidth,
            margin = margin,
            abono = abono,
            clientName = clientName,
            settings = settings,
            logoRaw = logoRaw,
        )
        picture.endRecording()
        return measured
    }

    private fun drawDashedLine(
        canvas: Canvas,
        startX: Float,
        endX: Float,
        y: Float,
        paint: Paint,
    ): Float {
        var x = startX
        val dash = 4f
        val gap = 3f
        while (x < endX) {
            canvas.drawLine(x, y, (x + dash).coerceAtMost(endX), y, paint)
            x += dash + gap
        }
        return y
    }

    private fun drawWrapped(
        canvas: Canvas,
        text: String,
        paint: Paint,
        leftX: Float,
        startY: Float,
        maxWidth: Int,
        alignment: Layout.Alignment,
    ): Float {
        val tp = TextPaint(paint)
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, tp, maxWidth)
            .setAlignment(alignment)
            .setLineSpacing(1f, 1.08f)
            .build()
        canvas.save()
        canvas.translate(leftX, startY)
        layout.draw(canvas)
        canvas.restore()
        return startY + layout.height + 2f
    }

    private fun drawRow(
        canvas: Canvas,
        left: String,
        right: String,
        leftX: Float,
        rightX: Float,
        leftPaint: Paint,
        rightPaint: Paint,
        y: Float,
        rowStep: Float = 10f,
        leftMaxLen: Int = 26,
    ): Float {
        val safeLeft = if (left.length > leftMaxLen) left.take(leftMaxLen - 1) + "…" else left
        val rightMaxLen = 24
        val safeRight = if (right.length > rightMaxLen) right.take(rightMaxLen - 1) + "…" else right
        if (safeLeft.isNotEmpty()) {
            canvas.drawText(safeLeft, leftX, y, leftPaint)
        }
        if (safeRight.isNotEmpty()) {
            val rightCopy = Paint(rightPaint).apply { textAlign = Paint.Align.RIGHT }
            canvas.drawText(safeRight, rightX, y, rightCopy)
        }
        return y + rowStep
    }
}
