package com.example.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

enum class DeliveryModality(val dbValue: String, val label: String) {
    CAJA_COMPLETA("CAJA_COMPLETA", "Caja completa"),
    MEDIA_CAJA("MEDIA_CAJA", "Media caja"),
    MEDIA_CAJA_PESADA("MEDIA_CAJA_PESADA", "Media caja pesada");

    companion object {
        fun fromDb(value: String): DeliveryModality =
            entries.firstOrNull { it.dbValue == value } ?: CAJA_COMPLETA
    }
}

enum class PaymentMethod(val dbValue: String, val label: String) {
    CONTADO("CONTADO", "Contado"),
    CREDITO("CREDITO", "Crédito");

    companion object {
        fun fromDb(value: String): PaymentMethod =
            entries.firstOrNull { it.dbValue == value } ?: CONTADO
    }
}

data class WeighedBoxItem(
    val id: Long,
    val modality: DeliveryModality,
    val boxesDecimal: BigDecimal,
    val inputWeightKg: BigDecimal,
    val tareDeductionKg: BigDecimal,
    val netWeightKg: BigDecimal,
    val brand: String = "",
    val pricePerKg: BigDecimal = BigDecimal.ZERO,
)

data class BrandBreakdownItem(
    val brand: String,
    val boxesDecimal: BigDecimal,
    val netWeightKg: BigDecimal,
    val pricePerKg: BigDecimal,
    val subtotalMxn: BigDecimal,
)

data class SugarDeliverySummary(
    val sacks: BigDecimal = BigDecimal.ZERO,
    val weightPerSackKg: BigDecimal = BigDecimal.ZERO,
    val totalWeightKg: BigDecimal = BigDecimal.ZERO,
    val pricePerSackMxn: BigDecimal = BigDecimal.ZERO,
    val subtotalMxn: BigDecimal = BigDecimal.ZERO,
    val isPresent: Boolean = false,
    val isPartialError: Boolean = false,
)

data class DeliveryCalculationResult(
    val boxesDecimal: BigDecimal,
    val inputWeightKg: BigDecimal,
    val tareDeductionKg: BigDecimal,
    val netWeightKg: BigDecimal,
    val pricePerKg: BigDecimal,
    val rawAmountMxn: BigDecimal,
    val finalAmountMxn: BigDecimal,
    val roundingDiffMxn: BigDecimal,
    val isValid: Boolean,
    val sugarSummary: SugarDeliverySummary = SugarDeliverySummary(),
    val combinedNetWeightKg: BigDecimal = netWeightKg,
)

data class CreditLegendSegment(
    val text: String,
    val bold: Boolean = false,
)

object CalculationEngine {
    private val TWO = BigDecimal("2")
    private val HALF_KG = BigDecimal("0.500")
    private val HALF_BOX = BigDecimal("0.5")
    private val HALF_CENT = BigDecimal("0.50")

    private val mxSymbols = DecimalFormatSymbols(Locale("es", "MX")).apply {
        decimalSeparator = '.'
        groupingSeparator = ','
    }

    fun calculateSingleBoxItem(
        id: Long,
        modality: DeliveryModality,
        weightInputKg: String,
        brand: String = "",
        pricePerKg: BigDecimal = BigDecimal.ZERO,
    ): Result<WeighedBoxItem> {
        val weight = parsePositiveDecimal(weightInputKg)
        if (weight <= BigDecimal.ZERO) {
            return Result.failure(IllegalArgumentException("Ingresa un peso válido mayor a cero"))
        }
        val cleanBrand = brand.trim()
        val safeItemPrice = if (pricePerKg > BigDecimal.ZERO) pricePerKg.stripTrailingZeros() else BigDecimal.ZERO
        return when (modality) {
            DeliveryModality.CAJA_COMPLETA -> {
                val net = weight.subtract(TWO)
                if (net <= BigDecimal.ZERO) {
                    Result.failure(IllegalArgumentException("El peso bruto de la caja debe ser mayor a 2.000 kg"))
                } else {
                    Result.success(
                        WeighedBoxItem(
                            id = id,
                            modality = modality,
                            boxesDecimal = BigDecimal.ONE,
                            inputWeightKg = weight,
                            tareDeductionKg = TWO,
                            netWeightKg = net.stripTrailingZeros(),
                            brand = cleanBrand,
                            pricePerKg = safeItemPrice,
                        ),
                    )
                }
            }
            DeliveryModality.MEDIA_CAJA -> {
                val rawDiff = weight.subtract(TWO)
                if (rawDiff <= BigDecimal.ZERO) {
                    Result.failure(IllegalArgumentException("El peso bruto debe ser mayor a 2.000 kg"))
                } else {
                    val scale = maxOf(6, rawDiff.scale() + 2)
                    val net = rawDiff.divide(TWO, scale, RoundingMode.HALF_EVEN).stripTrailingZeros()
                    Result.success(
                        WeighedBoxItem(
                            id = id,
                            modality = modality,
                            boxesDecimal = HALF_BOX,
                            inputWeightKg = weight,
                            tareDeductionKg = TWO,
                            netWeightKg = net,
                            brand = cleanBrand,
                            pricePerKg = safeItemPrice,
                        ),
                    )
                }
            }
            DeliveryModality.MEDIA_CAJA_PESADA -> {
                val net = weight.subtract(HALF_KG)
                if (net <= BigDecimal.ZERO) {
                    Result.failure(IllegalArgumentException("El peso neto ingresado debe ser mayor a 0.500 kg"))
                } else {
                    Result.success(
                        WeighedBoxItem(
                            id = id,
                            modality = modality,
                            boxesDecimal = HALF_BOX,
                            inputWeightKg = weight,
                            tareDeductionKg = HALF_KG,
                            netWeightKg = net.stripTrailingZeros(),
                            brand = cleanBrand,
                            pricePerKg = safeItemPrice,
                        ),
                    )
                }
            }
        }
    }

    fun calculateDeliveryFromItems(
        items: List<WeighedBoxItem>,
        pricePerKg: BigDecimal,
    ): DeliveryCalculationResult {
        val safeFallbackPrice = if (pricePerKg > BigDecimal.ZERO) pricePerKg else BigDecimal.ZERO
        if (items.isEmpty()) {
            return buildResult(
                boxes = BigDecimal.ZERO,
                inputWeight = BigDecimal.ZERO,
                tare = BigDecimal.ZERO,
                net = BigDecimal.ZERO,
                pricePerKg = safeFallbackPrice,
                isValid = false,
            )
        }
        val totalBoxes = items.fold(BigDecimal.ZERO) { acc, item -> acc.add(item.boxesDecimal) }
        val totalInput = items.fold(BigDecimal.ZERO) { acc, item -> acc.add(item.inputWeightKg) }
        val totalTare = items.fold(BigDecimal.ZERO) { acc, item -> acc.add(item.tareDeductionKg) }
        val totalNet = items.fold(BigDecimal.ZERO) { acc, item -> acc.add(item.netWeightKg) }

        var rawAmount = BigDecimal.ZERO
        var allPricesValid = true
        val effectivePrices = mutableListOf<BigDecimal>()
        for (item in items) {
            val effPrice = if (item.pricePerKg > BigDecimal.ZERO) item.pricePerKg else safeFallbackPrice
            if (effPrice <= BigDecimal.ZERO) {
                allPricesValid = false
            }
            effectivePrices += effPrice.stripTrailingZeros()
            rawAmount = rawAmount.add(item.netWeightKg.multiply(effPrice))
        }

        val distinctPrices = effectivePrices.distinct()
        val displayPrice = when {
            distinctPrices.size == 1 -> distinctPrices.first()
            totalNet > BigDecimal.ZERO -> rawAmount.divide(totalNet, 2, RoundingMode.HALF_UP)
            else -> safeFallbackPrice
        }
        val finalAmount = roundMxnAmount(rawAmount)
        val diff = finalAmount.subtract(rawAmount.setScale(2, RoundingMode.HALF_UP))
        val valid = totalBoxes > BigDecimal.ZERO && totalNet > BigDecimal.ZERO && allPricesValid

        return DeliveryCalculationResult(
            boxesDecimal = totalBoxes,
            inputWeightKg = totalInput,
            tareDeductionKg = totalTare,
            netWeightKg = totalNet,
            pricePerKg = displayPrice,
            rawAmountMxn = rawAmount,
            finalAmountMxn = finalAmount,
            roundingDiffMxn = diff,
            isValid = valid,
        )
    }

    fun calculateSugarSummary(
        sacksInput: String,
        weightPerSackInput: String,
        pricePerSackInput: String,
    ): SugarDeliverySummary {
        val anyTyped = sacksInput.isNotBlank() || weightPerSackInput.isNotBlank() || pricePerSackInput.isNotBlank()
        if (!anyTyped) return SugarDeliverySummary()
        val sacks = parsePositiveDecimal(sacksInput).stripTrailingZeros()
        val weightPerSack = parsePositiveDecimal(weightPerSackInput).stripTrailingZeros()
        val pricePerSack = parsePositiveDecimal(pricePerSackInput).stripTrailingZeros()
        val totalWeight = sacks.multiply(weightPerSack).stripTrailingZeros()
        val subtotal = sacks.multiply(pricePerSack)
        val valid = sacks > BigDecimal.ZERO && weightPerSack > BigDecimal.ZERO && pricePerSack > BigDecimal.ZERO
        return SugarDeliverySummary(
            sacks = sacks,
            weightPerSackKg = weightPerSack,
            totalWeightKg = totalWeight,
            pricePerSackMxn = pricePerSack,
            subtotalMxn = subtotal,
            isPresent = valid,
            isPartialError = !valid,
        )
    }

    fun calculateDeliveryWithSugar(
        items: List<WeighedBoxItem>,
        pricePerKg: BigDecimal,
        sugarSummary: SugarDeliverySummary,
    ): DeliveryCalculationResult {
        val eggResult = calculateDeliveryFromItems(items = items, pricePerKg = pricePerKg)
        if (sugarSummary.isPartialError) {
            return eggResult.copy(
                isValid = false,
                sugarSummary = sugarSummary,
                combinedNetWeightKg = eggResult.netWeightKg.add(sugarSummary.totalWeightKg),
            )
        }
        if (!sugarSummary.isPresent) {
            return eggResult
        }
        val eggsValidIfPresent = items.isEmpty() || eggResult.isValid
        val combinedRaw = eggResult.rawAmountMxn.add(sugarSummary.subtotalMxn)
        val combinedFinal = roundMxnAmount(combinedRaw)
        val combinedDiff = combinedFinal.subtract(combinedRaw.setScale(2, RoundingMode.HALF_UP))
        val combinedNet = eggResult.netWeightKg.add(sugarSummary.totalWeightKg)
        return DeliveryCalculationResult(
            boxesDecimal = eggResult.boxesDecimal,
            inputWeightKg = eggResult.inputWeightKg,
            tareDeductionKg = eggResult.tareDeductionKg,
            netWeightKg = eggResult.netWeightKg,
            pricePerKg = eggResult.pricePerKg,
            rawAmountMxn = combinedRaw,
            finalAmountMxn = combinedFinal,
            roundingDiffMxn = combinedDiff,
            isValid = eggsValidIfPresent && sugarSummary.subtotalMxn > BigDecimal.ZERO,
            sugarSummary = sugarSummary,
            combinedNetWeightKg = combinedNet,
        )
    }

    fun calculateDelivery(
        modality: DeliveryModality,
        boxesInput: String,
        weightInputKg: String,
        pricePerKg: BigDecimal,
    ): DeliveryCalculationResult {
        val weight = parsePositiveDecimal(weightInputKg)
        val safePrice = if (pricePerKg > BigDecimal.ZERO) pricePerKg else BigDecimal.ZERO

        return when (modality) {
            DeliveryModality.CAJA_COMPLETA -> {
                val boxes = parsePositiveDecimal(boxesInput)
                val tare = TWO.multiply(boxes)
                val net = weight.subtract(tare)
                val valid = boxes > BigDecimal.ZERO && net > BigDecimal.ZERO && safePrice > BigDecimal.ZERO
                buildResult(boxes, weight, tare, if (net > BigDecimal.ZERO) net else BigDecimal.ZERO, safePrice, valid)
            }
            DeliveryModality.MEDIA_CAJA -> {
                val boxes = HALF_BOX
                val tare = TWO
                val rawDiff = weight.subtract(TWO)
                val net = if (rawDiff > BigDecimal.ZERO) {
                    val scale = maxOf(6, rawDiff.scale() + 2)
                    rawDiff.divide(TWO, scale, RoundingMode.HALF_EVEN).stripTrailingZeros()
                } else {
                    BigDecimal.ZERO
                }
                val valid = net > BigDecimal.ZERO && safePrice > BigDecimal.ZERO
                buildResult(boxes, weight, tare, net, safePrice, valid)
            }
            DeliveryModality.MEDIA_CAJA_PESADA -> {
                val boxes = HALF_BOX
                val tare = HALF_KG
                val net = weight.subtract(HALF_KG)
                val valid = net > BigDecimal.ZERO && safePrice > BigDecimal.ZERO
                buildResult(boxes, weight, tare, if (net > BigDecimal.ZERO) net else BigDecimal.ZERO, safePrice, valid)
            }
        }
    }

    private fun buildResult(
        boxes: BigDecimal,
        inputWeight: BigDecimal,
        tare: BigDecimal,
        net: BigDecimal,
        pricePerKg: BigDecimal,
        isValid: Boolean,
    ): DeliveryCalculationResult {
        val rawAmount = net.multiply(pricePerKg)
        val finalAmount = roundMxnAmount(rawAmount)
        val diff = finalAmount.subtract(rawAmount.setScale(2, RoundingMode.HALF_UP))
        return DeliveryCalculationResult(
            boxesDecimal = boxes,
            inputWeightKg = inputWeight,
            tareDeductionKg = tare,
            netWeightKg = net,
            pricePerKg = pricePerKg,
            rawAmountMxn = rawAmount,
            finalAmountMxn = finalAmount,
            roundingDiffMxn = diff,
            isValid = isValid,
        )
    }

    /**
     * Regla oficial de redondeo monetario MXN (Sección 6.3):
     * - Si los centavos son menores de 50, bajar al peso entero anterior.
     * - Si son exactamente 50 centavos, conservar los 50 centavos.
     * - Si son mayores de 50 centavos, subir al siguiente peso entero.
     */
    fun roundMxnAmount(rawAmount: BigDecimal): BigDecimal {
        if (rawAmount <= BigDecimal.ZERO) return BigDecimal("0.00")
        val scaledCents = rawAmount.setScale(2, RoundingMode.HALF_UP)
        val integerPart = scaledCents.setScale(0, RoundingMode.DOWN)
        val cents = scaledCents.subtract(integerPart)
        return when {
            cents.compareTo(HALF_CENT) < 0 -> integerPart.setScale(2, RoundingMode.UNNECESSARY)
            cents.compareTo(HALF_CENT) == 0 -> integerPart.add(HALF_CENT).setScale(2, RoundingMode.UNNECESSARY)
            else -> integerPart.add(BigDecimal.ONE).setScale(2, RoundingMode.UNNECESSARY)
        }
    }

    fun parsePositiveDecimal(input: String): BigDecimal {
        val cleaned = input.trim().replace(",", ".")
        if (cleaned.isEmpty()) return BigDecimal.ZERO
        return try {
            val parsed = BigDecimal(cleaned)
            if (parsed >= BigDecimal.ZERO) parsed else BigDecimal.ZERO
        } catch (_: NumberFormatException) {
            BigDecimal.ZERO
        }
    }

    fun formatMoney(amount: Double): String {
        val df = DecimalFormat("#,##0.00", mxSymbols)
        return "$" + df.format(amount)
    }

    fun formatMoney(amount: BigDecimal): String {
        val df = DecimalFormat("#,##0.00", mxSymbols)
        return "$" + df.format(amount)
    }

    fun formatExactWeight(kg: Double): String {
        val bd = BigDecimal.valueOf(kg).stripTrailingZeros()
        val scale = maxOf(2, minOf(bd.scale().coerceAtLeast(0), 3))
        val pattern = if (scale == 3) "#,##0.000" else "#,##0.00"
        return DecimalFormat(pattern, mxSymbols).format(bd)
    }

    fun formatExactWeight(kg: BigDecimal): String {
        val clean = kg.stripTrailingZeros()
        val scale = maxOf(2, minOf(clean.scale().coerceAtLeast(0), 4))
        val pattern = "#,##0." + "0".repeat(scale)
        return DecimalFormat(pattern, mxSymbols).format(clean)
    }

    fun formatExactBoxes(boxes: Double): String {
        val bd = BigDecimal.valueOf(boxes).stripTrailingZeros()
        return if (bd.scale() <= 0) {
            DecimalFormat("#,##0", mxSymbols).format(bd)
        } else {
            bd.toPlainString()
        }
    }

    fun formatExactBoxes(boxes: BigDecimal): String {
        val clean = boxes.stripTrailingZeros()
        return if (clean.scale() <= 0) {
            DecimalFormat("#,##0", mxSymbols).format(clean)
        } else {
            clean.toPlainString()
        }
    }

    /**
     * Convierte un importe MXN en texto oficial de comprobante:
     * ej. 5999.00 -> "Cinco mil novecientos noventa y nueve pesos 00/100 M.N."
     */
    fun amountInWordsMxn(amount: Double): String {
        val bd = BigDecimal.valueOf(if (amount.isFinite() && amount >= 0.0) amount else 0.0)
            .setScale(2, RoundingMode.HALF_UP)
        val whole = bd.toLong()
        val cents = bd.subtract(BigDecimal.valueOf(whole)).multiply(BigDecimal(100)).toInt().coerceIn(0, 99)

        val words = apocopeSpanish(wholeToSpanishWords(whole))
        val adjusted = if (whole > 0L && whole % 1_000_000L == 0L) "$words de" else words
        val capitalized = adjusted.replaceFirstChar {
            if (it.isLowerCase()) it.titlecase(Locale("es", "MX")) else it.toString()
        }
        val unitWord = if (whole == 1L) "peso" else "pesos"
        return String.format(Locale.US, "%s %s %02d/100 M.N.", capitalized, unitWord, cents)
    }

    private fun wholeToSpanishWords(n: Long): String {
        if (n == 0L) return "cero"
        val millions = n / 1_000_000L
        val thousands = (n % 1_000_000L) / 1000L
        val remainder = (n % 1000L).toInt()
        val parts = mutableListOf<String>()
        if (millions > 0L) {
            parts += if (millions == 1L) "un millón" else "${apocopeSpanish(wholeToSpanishWords(millions))} millones"
        }
        if (thousands > 0L) {
            parts += if (thousands == 1L) "mil" else "${apocopeSpanish(underThousandWords(thousands.toInt()))} mil"
        }
        if (remainder > 0) {
            parts += underThousandWords(remainder)
        }
        return parts.joinToString(" ")
    }

    private fun underThousandWords(n: Int): String {
        if (n == 100) return "cien"
        val hundreds = listOf(
            "", "ciento", "doscientos", "trescientos", "cuatrocientos",
            "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos",
        )
        val c = n / 100
        val res = n % 100
        return buildString {
            if (c > 0) append(hundreds[c])
            if (c > 0 && res > 0) append(" ")
            if (res > 0) append(underHundredWords(res))
        }
    }

    private fun underHundredWords(n: Int): String {
        val units = listOf(
            "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
            "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
            "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
            "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
        )
        val tens = listOf(
            "", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa",
        )
        if (n < 30) return units[n]
        val d = n / 10
        val u = n % 10
        return if (u == 0) tens[d] else "${tens[d]} y ${units[u]}"
    }

    private fun apocopeSpanish(text: String): String =
        text.replace(Regex("veintiuno$"), "veintiún").replace(Regex("uno$"), "un")

    fun formatPlainDecimal(value: Double): String {
        if (!value.isFinite() || value <= 0.0) return ""
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
    }

    fun computeCreditDueDateMillis(deliveryDateMillis: Long, termDays: Int): Long {
        val safeDays = termDays.coerceIn(0, 3650)
        return Calendar.getInstance().apply {
            timeInMillis = deliveryDateMillis
            add(Calendar.DAY_OF_YEAR, safeDays)
        }.timeInMillis
    }

    fun formatCreditDueDate(deliveryDateMillis: Long, termDays: Int): String {
        val dueMillis = computeCreditDueDateMillis(deliveryDateMillis, termDays)
        val fmt = SimpleDateFormat("dd 'de' MMMM, yyyy", Locale("es", "MX"))
        return fmt.format(Date(dueMillis))
    }

    fun buildPendingCreditLegendSegments(
        deliveryDateMillis: Long,
        pendingBalanceMxn: Double,
        totalDebtMxn: Double,
        effectiveTermDays: Int,
        moratoriumInterestPercent: Double = 0.0,
        paymentPlace: String = "",
        extraCondition: String = "",
        closingNote: String = "Válido con firma digital.",
    ): List<CreditLegendSegment> {
        val safeDays = effectiveTermDays.coerceIn(0, 3650)
        val dueDateText = formatCreditDueDate(deliveryDateMillis, safeDays)
        val segments = mutableListOf(
            CreditLegendSegment("Recibí mercancía a entera satisfacción y reconozco el saldo pendiente de "),
            CreditLegendSegment("${formatMoney(pendingBalanceMxn)} MXN", bold = true),
            CreditLegendSegment(" (total adeudado: "),
            CreditLegendSegment("${formatMoney(totalDebtMxn)} MXN", bold = true),
        )
        if (safeDays == 0) {
            segments += CreditLegendSegment("), a liquidar el mismo día ")
            segments += CreditLegendSegment(dueDateText, bold = true)
        } else {
            val dayLabel = if (safeDays == 1) "1 día" else "$safeDays días"
            segments += CreditLegendSegment("), a pagar a más tardar el ")
            segments += CreditLegendSegment(dueDateText, bold = true)
            segments += CreditLegendSegment(" (plazo: $dayLabel)")
        }
        if (moratoriumInterestPercent.isFinite() && moratoriumInterestPercent > 0.0) {
            segments += CreditLegendSegment(", con ${formatPlainDecimal(moratoriumInterestPercent)}% de interés moratorio mensual por retraso")
        }
        segments += CreditLegendSegment(".")

        val cleanPlace = paymentPlace.trim()
        if (cleanPlace.isNotEmpty()) {
            val suffix = if (cleanPlace.endsWith(".")) "" else "."
            segments += CreditLegendSegment(" Lugar de pago: $cleanPlace$suffix")
        }
        val cleanExtra = extraCondition.trim()
        if (cleanExtra.isNotEmpty()) {
            val suffix = if (cleanExtra.endsWith(".")) "" else "."
            segments += CreditLegendSegment(" $cleanExtra$suffix")
        }
        val cleanClosing = closingNote.trim().ifBlank { "Válido con firma digital." }
        segments += CreditLegendSegment(" $cleanClosing")
        return segments
    }

    fun resolveModalityLabel(dbValue: String, items: List<WeighedBoxItem>): String {
        val distinct = items.map { it.modality }.distinct()
        return when {
            distinct.size > 1 -> "Mixta (Cajas y Medias)"
            distinct.size == 1 -> distinct.first().label
            dbValue == "MIXTA" -> "Mixta (Cajas y Medias)"
            else -> DeliveryModality.fromDb(dbValue).label
        }
    }

    fun resolveBrandSummaryLabel(fallbackBrand: String, items: List<WeighedBoxItem>): String {
        val distinct = items.map { it.brand.trim() }.filter { it.isNotEmpty() }.distinct()
        return if (distinct.isNotEmpty()) {
            distinct.joinToString(", ")
        } else {
            fallbackBrand.trim().ifBlank { "General" }
        }
    }

    fun summarizeBrandBreakdown(
        items: List<WeighedBoxItem>,
        fallbackBrand: String = "General",
        fallbackPricePerKg: BigDecimal = BigDecimal.ZERO,
        fallbackBoxes: BigDecimal = BigDecimal.ZERO,
        fallbackNetWeightKg: BigDecimal = BigDecimal.ZERO,
    ): List<BrandBreakdownItem> {
        val cleanFallbackBrand = fallbackBrand.trim().ifBlank { "General" }
        val safeFallbackPrice = if (fallbackPricePerKg > BigDecimal.ZERO) {
            fallbackPricePerKg.stripTrailingZeros()
        } else {
            BigDecimal.ZERO
        }
        if (items.isEmpty()) {
            return if (fallbackNetWeightKg > BigDecimal.ZERO) {
                listOf(
                    BrandBreakdownItem(
                        brand = cleanFallbackBrand,
                        boxesDecimal = fallbackBoxes,
                        netWeightKg = fallbackNetWeightKg,
                        pricePerKg = safeFallbackPrice,
                        subtotalMxn = fallbackNetWeightKg.multiply(safeFallbackPrice),
                    ),
                )
            } else {
                emptyList()
            }
        }

        val grouped = LinkedHashMap<Pair<String, BigDecimal>, MutableList<WeighedBoxItem>>()
        for (item in items) {
            val itemBrand = item.brand.trim().ifBlank { cleanFallbackBrand }
            val effPrice = if (item.pricePerKg > BigDecimal.ZERO) {
                item.pricePerKg.stripTrailingZeros()
            } else {
                safeFallbackPrice
            }
            val key = itemBrand to effPrice
            grouped.getOrPut(key) { mutableListOf() }.add(item)
        }

        return grouped.map { (key, groupItems) ->
            val (brand, price) = key
            val totalBoxes = groupItems.fold(BigDecimal.ZERO) { acc, it -> acc.add(it.boxesDecimal) }
            val totalNet = groupItems.fold(BigDecimal.ZERO) { acc, it -> acc.add(it.netWeightKg) }
            val subtotal = totalNet.multiply(price)
            BrandBreakdownItem(
                brand = brand,
                boxesDecimal = totalBoxes,
                netWeightKg = totalNet,
                pricePerKg = price,
                subtotalMxn = subtotal,
            )
        }
    }

    fun encodeWeighedItemsJson(items: List<WeighedBoxItem>): String {
        if (items.isEmpty()) return "[]"
        return items.joinToString(prefix = "[", postfix = "]", separator = ",") { item ->
            val escapedBrand = escapeJsonString(item.brand.trim())
            val priceStr = if (item.pricePerKg > BigDecimal.ZERO) {
                item.pricePerKg.stripTrailingZeros().toPlainString()
            } else {
                "0"
            }
            "{\"id\":${item.id}," +
                "\"modality\":\"${item.modality.dbValue}\"," +
                "\"boxes\":\"${item.boxesDecimal.stripTrailingZeros().toPlainString()}\"," +
                "\"inputKg\":\"${item.inputWeightKg.stripTrailingZeros().toPlainString()}\"," +
                "\"tareKg\":\"${item.tareDeductionKg.stripTrailingZeros().toPlainString()}\"," +
                "\"netKg\":\"${item.netWeightKg.stripTrailingZeros().toPlainString()}\"," +
                "\"brand\":\"$escapedBrand\"," +
                "\"priceKg\":\"$priceStr\"}"
        }
    }

    private fun escapeJsonString(raw: String): String = buildString(raw.length) {
        for (ch in raw) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (ch.code < 0x20) {
                    append(String.format(Locale.US, "\\u%04x", ch.code))
                } else {
                    append(ch)
                }
            }
        }
    }

    fun parseWeighedItemsJson(json: String?): List<WeighedBoxItem> {
        if (json.isNullOrBlank() || json.trim() == "[]") return emptyList()
        return splitTopLevelJsonObjects(json).mapNotNull { objStr ->
            runCatching {
                val idStr = extractJsonScalarOrString(objStr, "id") ?: return@runCatching null
                val modStr = extractJsonString(objStr, "modality") ?: return@runCatching null
                val boxesStr = extractJsonString(objStr, "boxes") ?: return@runCatching null
                val inputStr = extractJsonString(objStr, "inputKg") ?: return@runCatching null
                val tareStr = extractJsonString(objStr, "tareKg") ?: return@runCatching null
                val netStr = extractJsonString(objStr, "netKg") ?: return@runCatching null
                val brandStr = extractJsonString(objStr, "brand").orEmpty().trim()
                val priceStr = extractJsonScalarOrString(objStr, "priceKg")
                val parsedPrice = priceStr?.let(::parsePositiveDecimal) ?: BigDecimal.ZERO
                WeighedBoxItem(
                    id = idStr.toLong(),
                    modality = DeliveryModality.fromDb(modStr),
                    boxesDecimal = BigDecimal(boxesStr),
                    inputWeightKg = BigDecimal(inputStr),
                    tareDeductionKg = BigDecimal(tareStr),
                    netWeightKg = BigDecimal(netStr),
                    brand = brandStr,
                    pricePerKg = if (parsedPrice > BigDecimal.ZERO) parsedPrice.stripTrailingZeros() else BigDecimal.ZERO,
                )
            }.getOrNull()
        }
    }

    private fun splitTopLevelJsonObjects(json: String): List<String> {
        val result = mutableListOf<String>()
        var inString = false
        var escaped = false
        var depth = 0
        var objStart = -1
        for (i in json.indices) {
            val ch = json[i]
            if (escaped) {
                escaped = false
                continue
            }
            if (inString) {
                when (ch) {
                    '\\' -> escaped = true
                    '"' -> inString = false
                }
                continue
            }
            when (ch) {
                '"' -> inString = true
                '{' -> {
                    if (depth == 0) objStart = i
                    depth++
                }
                '}' -> {
                    if (depth > 0) {
                        depth--
                        if (depth == 0 && objStart >= 0) {
                            result += json.substring(objStart, i + 1)
                            objStart = -1
                        }
                    }
                }
            }
        }
        return result
    }

    private fun extractJsonString(objJson: String, key: String): String? {
        val keyIndex = findJsonKeyValueStart(objJson, key) ?: return null
        if (keyIndex >= objJson.length || objJson[keyIndex] != '"') return null
        val sb = StringBuilder()
        var i = keyIndex + 1
        while (i < objJson.length) {
            val ch = objJson[i]
            if (ch == '"') return sb.toString()
            if (ch == '\\' && i + 1 < objJson.length) {
                val next = objJson[i + 1]
                when (next) {
                    '"' -> sb.append('"')
                    '\\' -> sb.append('\\')
                    '/' -> sb.append('/')
                    'b' -> sb.append('\b')
                    'f' -> sb.append('\u000C')
                    'n' -> sb.append('\n')
                    'r' -> sb.append('\r')
                    't' -> sb.append('\t')
                    'u' -> if (i + 5 < objJson.length) {
                        val hex = objJson.substring(i + 2, i + 6)
                        hex.toIntOrNull(16)?.let { sb.append(it.toChar()) }
                        i += 4
                    }
                    else -> sb.append(next)
                }
                i += 2
            } else {
                sb.append(ch)
                i++
            }
        }
        return null
    }

    private fun extractJsonScalarOrString(objJson: String, key: String): String? {
        val keyIndex = findJsonKeyValueStart(objJson, key) ?: return null
        if (keyIndex >= objJson.length) return null
        if (objJson[keyIndex] == '"') return extractJsonString(objJson, key)
        var end = keyIndex
        while (end < objJson.length && objJson[end] != ',' && objJson[end] != '}' && !objJson[end].isWhitespace()) {
            end++
        }
        return objJson.substring(keyIndex, end).trim().takeIf { it.isNotEmpty() && it != "null" }
    }

    private fun findJsonKeyValueStart(objJson: String, key: String): Int? {
        var inString = false
        var escaped = false
        var stringStart = -1
        var i = 0
        while (i < objJson.length) {
            val ch = objJson[i]
            if (escaped) {
                escaped = false
                i++
                continue
            }
            if (inString) {
                if (ch == '\\') {
                    escaped = true
                } else if (ch == '"') {
                    val token = objJson.substring(stringStart, i)
                    inString = false
                    var j = i + 1
                    while (j < objJson.length && objJson[j].isWhitespace()) j++
                    if (j < objJson.length && objJson[j] == ':' && token == key) {
                        j++
                        while (j < objJson.length && objJson[j].isWhitespace()) j++
                        return j
                    }
                }
                i++
                continue
            }
            if (ch == '"') {
                inString = true
                stringStart = i + 1
            }
            i++
        }
        return null
    }
}
