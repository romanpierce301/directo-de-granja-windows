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
import com.example.R
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DailyClosingEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.SalesChannel
import com.example.domain.CalculationEngine
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfDocumentGenerator {

    private val dateFormatter = SimpleDateFormat("dd 'de' MMMM, yyyy", Locale("es", "MX"))
    private val timeFormatter = SimpleDateFormat("hh:mm a", Locale.US)

    const val TICKET_PAGE_WIDTH_PT = 170 // 60 mm exactos (72 dpi)
    const val TICKET_PAGE_HEIGHT_PT = 369 // 130 mm exactos (72 dpi)

    fun generateTicketPdf(
        context: Context,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
    ): File {
        val dir = File(context.filesDir, "tickets").apply { mkdirs() }
        val file = File(dir, "Ticket_${delivery.folio}.pdf")

        val pageWidth = TICKET_PAGE_WIDTH_PT
        val pageHeight = TICKET_PAGE_HEIGHT_PT
        val margin = 8f

        val logoRaw = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo)
        val signatureRaw = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        }

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
        margin: Float = 8f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
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
        )
        canvas.drawColor(Color.WHITE)
        val availH = (pageHeight - 4f).coerceAtLeast(100f)
        val fitScale = if (naturalHeight > availH) {
            (availH / naturalHeight).coerceIn(0.35f, 1.0f)
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
        )
        canvas.restore()
        return rawDrawn * fitScale
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
    ): Float {
        val contentWidth = (pageWidth - margin * 2).toInt()

        val monoRegular = Typeface.MONOSPACE
        val monoBold = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 6.2f
            typeface = monoRegular
        }
        val boldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 6.2f
            typeface = monoBold
        }
        val thickLinePaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 1.3f
        }
        val thinLinePaint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 0.7f
        }
        val dashPaint = Paint().apply {
            color = Color.DKGRAY
            strokeWidth = 0.7f
        }

        val isCancelled = delivery.status == "CANCELADA"
        val isCredit = delivery.paymentMethod == PaymentMethod.CREDITO.dbValue
        val weighedItems = CalculationEngine.parseWeighedItemsJson(delivery.itemsSnapshotJson)
        val hasEggs = delivery.boxes > 0.0 || weighedItems.isNotEmpty()
        val hasSugar = delivery.sugarSacks > 0.0
        val sugarWeightKg = if (hasSugar) {
            BigDecimal.valueOf(delivery.sugarSacks).multiply(BigDecimal.valueOf(delivery.sugarSackWeightKg))
        } else {
            BigDecimal.ZERO
        }
        val totalNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg).add(sugarWeightKg)
        val modalityLabel = CalculationEngine.resolveModalityLabel(delivery.modality, weighedItems)
        val brandBreakdown = if (hasEggs) {
            CalculationEngine.summarizeBrandBreakdown(
                items = weighedItems,
                fallbackBrand = delivery.brand,
                fallbackPricePerKg = BigDecimal.valueOf(delivery.pricePerKg),
                fallbackBoxes = BigDecimal.valueOf(delivery.boxes),
                fallbackNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg),
            )
        } else {
            emptyList()
        }
        val headerBrandSummary = if (hasEggs) {
            CalculationEngine.resolveBrandSummaryLabel(delivery.brand, weighedItems)
        } else {
            ""
        }
        val currentAccum = delivery.previousDebtSnapshotMxn + delivery.pendingBalanceMxn
        val effectivePaidMxn = if (!isCancelled) {
            (delivery.finalAmountMxn - delivery.pendingBalanceMxn).coerceIn(0.0, delivery.finalAmountMxn)
        } else {
            delivery.initialPaymentMxn
        }
        val rawSubtotal = BigDecimal.valueOf(delivery.rawAmountMxn).setScale(2, RoundingMode.HALF_UP)
        val finalBd = BigDecimal.valueOf(delivery.finalAmountMxn).setScale(2, RoundingMode.HALF_UP)
        val roundingDiff = finalBd.subtract(rawSubtotal).setScale(2, RoundingMode.HALF_UP)
        val statusText = when {
            isCancelled -> "CANCELADO"
            delivery.pendingBalanceMxn > 0.0 -> "ENTREGADO / PENDIENTE LIQUIDACIÓN"
            else -> "LIQUIDADO"
        }

        var y = 6f

        // Logotipo térmico 1-bit centrado y proporcionado para 60mm x 130mm
        if (logoRaw != null && logoRaw.width > 0 && logoRaw.height > 0) {
            val maxLogoH = 42f
            val ratio = minOf(contentWidth.toFloat() / logoRaw.width.toFloat(), maxLogoH / logoRaw.height.toFloat())
            val targetW = (logoRaw.width * ratio).toInt().coerceAtLeast(24)
            val targetH = (logoRaw.height * ratio).toInt().coerceAtLeast(20)
            val scaledLogo = Bitmap.createScaledBitmap(logoRaw, targetW, targetH, true)
            val logoLeft = margin + (contentWidth - targetW) / 2f
            canvas.drawBitmap(scaledLogo, logoLeft, y, null)
            y += targetH + 3f
        }

        if (settings.address.isNotBlank()) {
            y = drawWrapped(canvas, settings.address, paint.apply { textSize = 5.6f }, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }
        if (settings.phone.isNotBlank()) {
            y = drawWrapped(canvas, "Tel: ${settings.phone}", paint.apply { textSize = 5.6f }, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }

        y += 2f
        canvas.drawLine(margin, y, pageWidth - margin, y, thickLinePaint)
        y += 7f

        if (isCancelled) {
            val cancelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = 10f
                typeface = monoBold
                textAlign = Paint.Align.CENTER
            }
            val boxPaint = Paint().apply {
                color = Color.BLACK
                style = Paint.Style.STROKE
                strokeWidth = 1.3f
            }
            canvas.drawRect(margin, y - 7f, pageWidth - margin, y + 6f, boxPaint)
            canvas.drawText("CANCELADO", pageWidth / 2f, y + 3f, cancelPaint)
            y += 12f
        }

        boldPaint.textSize = 6.8f
        y = drawWrapped(canvas, "COMPROBANTE DE REMISIÓN", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        if (delivery.salesChannel == SalesChannel.CREMERIA) {
            boldPaint.textSize = 5.8f
            y = drawWrapped(canvas, "VENTA PARA CREMERÍA DEL PATRÓN", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }
        boldPaint.textSize = 8.4f
        y = drawWrapped(canvas, delivery.folio, boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        y += 2f

        paint.textSize = 6.0f
        boldPaint.textSize = 6.0f
        y = drawRow(canvas, "Fecha:", dateFormatter.format(Date(delivery.dateMillis)), margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f)
        y = drawRow(canvas, "Hora:", timeFormatter.format(Date(delivery.dateMillis)), margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f)
        boldPaint.textSize = 5.8f
        y = drawWrapped(canvas, statusText, boldPaint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_CENTER)

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 2f, dashPaint) + 5f

        // Bloque CLIENTE
        boldPaint.textSize = 6.0f
        y = drawWrapped(canvas, "CLIENTE", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        boldPaint.textSize = 6.8f
        y = drawWrapped(canvas, delivery.clientName, boldPaint, margin, y - 1f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        paint.textSize = 5.6f
        if (!client?.address.isNullOrBlank()) {
            y = drawWrapped(canvas, client?.address.orEmpty(), paint, margin, y - 1f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        }
        if (!client?.phone.isNullOrBlank()) {
            y = drawWrapped(canvas, "Tel: ${client?.phone.orEmpty()}", paint, margin, y - 1f, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        }

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 2f, dashPaint) + 5f

        // Resumen por marca (y azúcar si aplica), sin detalle individual de pesos/tara/cajas/bruto
        val productHeader = when {
            hasEggs && hasSugar -> "$headerBrandSummary • $modalityLabel + Azúcar"
            hasSugar -> "Azúcar (Bultos)"
            else -> "$headerBrandSummary • $modalityLabel"
        }
        paint.textSize = 5.8f
        y = drawWrapped(canvas, productHeader, paint, margin, y, contentWidth, Layout.Alignment.ALIGN_NORMAL)
        y += 2f

        paint.textSize = 5.8f
        boldPaint.textSize = 5.8f
        brandBreakdown.forEach { b ->
            val leftPart = "${b.brand.take(12)} ${CalculationEngine.formatExactWeight(b.netWeightKg)}kg×${CalculationEngine.formatMoney(b.pricePerKg)}"
            val rightPart = CalculationEngine.formatMoney(b.subtotalMxn.setScale(2, RoundingMode.HALF_UP))
            y = drawRow(canvas, leftPart, rightPart, margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f, leftMaxLen = 33)
        }
        if (hasSugar) {
            val sLeft = "Azúcar ${CalculationEngine.formatExactBoxes(delivery.sugarSacks)}bto×${CalculationEngine.formatExactWeight(delivery.sugarSackWeightKg)}kg"
            val sRight = CalculationEngine.formatMoney(delivery.sugarSubtotalMxn)
            y = drawRow(canvas, sLeft, sRight, margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f, leftMaxLen = 33)
        }

        // Recuadro KILOS NETOS total
        y += 1f
        val boxStroke = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 1.0f
        }
        val netBoxTop = y - 4f
        val netBoxBottom = y + 9f
        canvas.drawRect(RectF(margin, netBoxTop, pageWidth - margin, netBoxBottom), boxStroke)
        boldPaint.textSize = 6.6f
        drawRow(
            canvas,
            "KILOS NETOS",
            "${CalculationEngine.formatExactWeight(totalNetWeightKg)} kg",
            margin + 4f,
            pageWidth - margin - 4f,
            boldPaint,
            boldPaint,
            y + 5f,
            rowStep = 9f,
        )
        y = netBoxBottom + 9f

        paint.textSize = 6.0f
        boldPaint.textSize = 6.0f
        y = drawRow(canvas, "Subtotal:", CalculationEngine.formatMoney(rawSubtotal), margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f)
        if (roundingDiff.compareTo(BigDecimal.ZERO) != 0) {
            val sign = if (roundingDiff > BigDecimal.ZERO) "+" else "-"
            y = drawRow(
                canvas,
                "Redondeo:",
                "$sign${CalculationEngine.formatMoney(roundingDiff.abs())}",
                margin,
                pageWidth - margin,
                paint,
                boldPaint,
                y,
                rowStep = 9f,
            )
        }

        y += 1f
        canvas.drawLine(margin, y, pageWidth - margin, y, thickLinePaint)
        y += 10f

        boldPaint.textSize = 8.0f
        y = drawRow(canvas, "TOTAL", "${CalculationEngine.formatMoney(delivery.finalAmountMxn)} MXN", margin, pageWidth - margin, boldPaint, boldPaint, y, rowStep = 10f)
        boldPaint.textSize = 5.6f
        y = drawWrapped(canvas, CalculationEngine.amountInWordsMxn(delivery.finalAmountMxn), boldPaint, margin, y - 3f, contentWidth, Layout.Alignment.ALIGN_NORMAL)

        y += 2f
        canvas.drawLine(margin, y, pageWidth - margin, y, thickLinePaint)
        y += 9f

        paint.textSize = 6.0f
        boldPaint.textSize = 6.0f
        y = drawRow(canvas, "Pagado / Abono:", "${CalculationEngine.formatMoney(effectivePaidMxn)} MXN", margin, pageWidth - margin, paint, boldPaint, y, rowStep = 9f)
        paint.textSize = 5.7f
        y = drawWrapped(canvas, "Forma de pago: ${PaymentMethod.fromDb(delivery.paymentMethod).label}", paint, margin, y - 3f, contentWidth, Layout.Alignment.ALIGN_NORMAL)

        // Barra negra invertida RESTA ENTREGA / LIQUIDADO
        y += 2f
        val barTop = y
        val barBottom = y + 13f
        val fillBlack = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.FILL
        }
        val whiteBold = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 6.5f
            typeface = monoBold
        }
        canvas.drawRect(RectF(margin, barTop, pageWidth - margin, barBottom), fillBlack)
        drawRow(
            canvas,
            if (delivery.pendingBalanceMxn > 0.0) "RESTA ENTREGA" else "LIQUIDADO",
            "${CalculationEngine.formatMoney(delivery.pendingBalanceMxn)} MXN",
            margin + 4f,
            pageWidth - margin - 4f,
            whiteBold,
            whiteBold,
            barTop + 9f,
            rowStep = 9f,
        )
        y = barBottom

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 4f, dashPaint) + 9f

        boldPaint.textSize = 6.0f
        y = drawRow(canvas, "Saldo anterior:", "${CalculationEngine.formatMoney(delivery.previousDebtSnapshotMxn)} MXN", margin, pageWidth - margin, boldPaint, boldPaint, y, rowStep = 9f)
        y = drawRow(canvas, "Esta remisión:", "+${CalculationEngine.formatMoney(delivery.pendingBalanceMxn)} MXN", margin, pageWidth - margin, boldPaint, boldPaint, y, rowStep = 9f)
        boldPaint.textSize = 6.8f
        y = drawRow(canvas, "SALDO TOTAL", "${CalculationEngine.formatMoney(currentAccum)} MXN", margin, pageWidth - margin, boldPaint, boldPaint, y, rowStep = 9f)

        // Solo Crédito (pendiente o liquidado) lleva leyenda + firmabox + Recibí de conformidad
        if (isCredit) {
            y = drawDashedLine(canvas, margin, pageWidth - margin, y + 2f, dashPaint) + 5f
            val legendText = when {
                isCancelled -> "Nota cancelada. Las obligaciones de pago y entrega correspondientes fueron revertidas."
                delivery.pendingBalanceMxn > 0.0 ->
                    CalculationEngine.buildPendingCreditLegendSegments(
                        deliveryDateMillis = delivery.dateMillis,
                        pendingBalanceMxn = delivery.pendingBalanceMxn,
                        totalDebtMxn = currentAccum,
                        effectiveTermDays = client?.creditTermDays ?: settings.creditTermDays,
                        moratoriumInterestPercent = settings.creditMoratoriumInterestPercent,
                        paymentPlace = settings.creditPaymentPlace,
                        extraCondition = settings.creditLegendExtra,
                        closingNote = settings.creditLegendClosing,
                    ).joinToString("") { it.text }
                else ->
                    "Recibí la mercancía descrita en esta remisión a mi entera satisfacción y cubrí el importe total señalado. Acepto mi firma digitalizada como constancia de recepción."
            }
            paint.textSize = 5.4f
            y = drawWrapped(canvas, legendText, paint, margin, y, contentWidth, Layout.Alignment.ALIGN_NORMAL)
            y += 2f

            val sigBoxHeight = 40f
            val sigBoxTop = y
            val sigBoxBottom = y + sigBoxHeight
            canvas.drawRect(RectF(margin, sigBoxTop, pageWidth - margin, sigBoxBottom), thinLinePaint.apply { style = Paint.Style.STROKE })
            if (signatureRaw != null && signatureRaw.width > 0 && signatureRaw.height > 0) {
                val maxSigW = (contentWidth - 6).toFloat()
                val maxSigH = sigBoxHeight - 4f
                val ratio = minOf(maxSigW / signatureRaw.width.toFloat(), maxSigH / signatureRaw.height.toFloat())
                val drawW = (signatureRaw.width * ratio).toInt().coerceAtLeast(1)
                val drawH = (signatureRaw.height * ratio).toInt().coerceAtLeast(1)
                val scaledSig = Bitmap.createScaledBitmap(signatureRaw, drawW, drawH, true)
                val left = margin + (contentWidth - drawW) / 2f
                val top = sigBoxTop + (sigBoxHeight - drawH) / 2f
                canvas.drawBitmap(scaledSig, left, top, null)
            }
            y = sigBoxBottom + 3f

            paint.textSize = 5.6f
            y = drawWrapped(canvas, "Recibí de conformidad", paint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
            boldPaint.textSize = 6.0f
            y = drawWrapped(canvas, delivery.clientName, boldPaint, margin, y - 2f, contentWidth, Layout.Alignment.ALIGN_CENTER)
        }

        y = drawDashedLine(canvas, margin, pageWidth - margin, y + 3f, dashPaint) + 5f
        boldPaint.textSize = 6.4f
        y = drawWrapped(canvas, "¡Gracias por su preferencia!", boldPaint, margin, y, contentWidth, Layout.Alignment.ALIGN_CENTER)
        paint.textSize = 5.6f
        y = drawWrapped(canvas, "Calidad y frescura en cada huevo", paint, margin, y - 1f, contentWidth, Layout.Alignment.ALIGN_CENTER)
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
        margin: Float = 8f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity?,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
    ): Int {
        // El comprobante impreso en PDF siempre mide exactamente 60mm x 130mm (170 x 369 pt)
        @Suppress("UNUSED_EXPRESSION")
        measureNaturalTicketHeight(context, pageWidth, margin, delivery, settings, client, logoRaw, signatureRaw)
        return TICKET_PAGE_HEIGHT_PT
    }

    internal fun measureNaturalTicketHeight(
        context: Context,
        pageWidth: Int = TICKET_PAGE_WIDTH_PT,
        margin: Float = 8f,
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity?,
        logoRaw: Bitmap? = BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo),
        signatureRaw: Bitmap? = delivery.signaturePath?.let { path ->
            val sigFile = File(path)
            if (sigFile.exists()) BitmapFactory.decodeFile(sigFile.absolutePath) else null
        },
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
        val dash = 5f
        val gap = 4f
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
        rowStep: Float = 12f,
        leftMaxLen: Int = 28,
    ): Float {
        val safeLeft = if (left.length > leftMaxLen) left.take(leftMaxLen - 1) + "…" else left
        val rightMaxLen = 26
        val safeRight = if (right.length > rightMaxLen) right.take(rightMaxLen - 1) + "…" else right
        canvas.drawText(safeLeft, leftX, y, leftPaint)
        val rightCopy = Paint(rightPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText(safeRight, rightX, y, rightCopy)
        return y + rowStep
    }
}
