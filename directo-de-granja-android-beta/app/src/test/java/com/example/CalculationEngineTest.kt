package com.example

import com.example.domain.CalculationEngine
import com.example.domain.DeliveryModality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CalculationEngineTest {

    @Test
    fun `caja completa single item deducts 2kg tare only without 500g`() {
        val itemRes = CalculationEngine.calculateSingleBoxItem(
            id = 1L,
            modality = DeliveryModality.CAJA_COMPLETA,
            weightInputKg = "24.255",
        )
        assertTrue(itemRes.isSuccess)
        val item = itemRes.getOrThrow()
        assertEquals(0, item.boxesDecimal.compareTo(BigDecimal("1")))
        assertEquals(0, item.tareDeductionKg.compareTo(BigDecimal("2")))
        assertEquals(0, item.netWeightKg.compareTo(BigDecimal("22.255")))
    }

    @Test
    fun `media caja single item applies (gross - 2) divided by 2 and 0_5 box without 500g`() {
        val itemRes = CalculationEngine.calculateSingleBoxItem(
            id = 2L,
            modality = DeliveryModality.MEDIA_CAJA,
            weightInputKg = "23.455",
        )
        assertTrue(itemRes.isSuccess)
        val item = itemRes.getOrThrow()
        assertEquals(0, item.boxesDecimal.compareTo(BigDecimal("0.5")))
        assertEquals(0, item.tareDeductionKg.compareTo(BigDecimal("2")))
        // (23.455 - 2) / 2 = 21.455 / 2 = 10.7275 exact
        assertEquals(0, item.netWeightKg.compareTo(BigDecimal("10.7275")))
    }

    @Test
    fun `media caja pesada single item deducts 500g from entered net weight without 2kg tare`() {
        val itemRes = CalculationEngine.calculateSingleBoxItem(
            id = 3L,
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            weightInputKg = "15,00",
        )
        assertTrue(itemRes.isSuccess)
        val item = itemRes.getOrThrow()
        assertEquals(0, item.boxesDecimal.compareTo(BigDecimal("0.5")))
        assertEquals(0, item.tareDeductionKg.compareTo(BigDecimal("0.500")))
        assertEquals(0, item.netWeightKg.compareTo(BigDecimal("14.50")))
    }

    @Test
    fun `single item validation rejects weights at or below tare deduction`() {
        assertTrue(CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.CAJA_COMPLETA, "2.000").isFailure)
        assertTrue(CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.CAJA_COMPLETA, "-5").isFailure)
        assertTrue(CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.MEDIA_CAJA, "1.999").isFailure)
        assertTrue(CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.MEDIA_CAJA_PESADA, "0.500").isFailure)
        assertTrue(CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.MEDIA_CAJA_PESADA, "abc").isFailure)
    }

    @Test
    fun `calculateDeliveryFromItems aggregates mixed boxes with exact precision and MXN rounding`() {
        val item1 = CalculationEngine.calculateSingleBoxItem(1L, DeliveryModality.CAJA_COMPLETA, "24.250").getOrThrow()
        val item2 = CalculationEngine.calculateSingleBoxItem(2L, DeliveryModality.MEDIA_CAJA, "24.000").getOrThrow()
        val item3 = CalculationEngine.calculateSingleBoxItem(3L, DeliveryModality.MEDIA_CAJA_PESADA, "15.000").getOrThrow()

        val result = CalculationEngine.calculateDeliveryFromItems(
            items = listOf(item1, item2, item3),
            pricePerKg = BigDecimal("42.50"),
        )
        assertTrue(result.isValid)
        // boxes: 1 + 0.5 + 0.5 = 2.0
        assertEquals(0, result.boxesDecimal.compareTo(BigDecimal("2")))
        // tare: 2 + 2 + 0.5 = 4.5
        assertEquals(0, result.tareDeductionKg.compareTo(BigDecimal("4.5")))
        // net: 22.250 + 11.000 + 14.500 = 47.750
        assertEquals(0, result.netWeightKg.compareTo(BigDecimal("47.750")))
        // 47.750 * 42.50 = 2029.375 -> 2029.38 -> <50c drops to 2029.00
        assertEquals(0, result.finalAmountMxn.compareTo(BigDecimal("2029.00")))

        val emptyItemsResult = CalculationEngine.calculateDeliveryFromItems(emptyList(), BigDecimal("42.50"))
        assertFalse(emptyItemsResult.isValid)

        val zeroPriceResult = CalculationEngine.calculateDeliveryFromItems(listOf(item1), BigDecimal.ZERO)
        assertFalse(zeroPriceResult.isValid)
    }

    @Test
    fun `weighed items JSON encoding and parsing round-trips losslessly`() {
        val items = listOf(
            CalculationEngine.calculateSingleBoxItem(
                id = 1L,
                modality = DeliveryModality.CAJA_COMPLETA,
                weightInputKg = "24.125",
                brand = "Blanco \"Especial\" {A}",
                pricePerKg = BigDecimal("43.50"),
            ).getOrThrow(),
            CalculationEngine.calculateSingleBoxItem(
                id = 2L,
                modality = DeliveryModality.MEDIA_CAJA_PESADA,
                weightInputKg = "12.500",
                brand = "Rojo",
                pricePerKg = BigDecimal("47.00"),
            ).getOrThrow(),
        )
        val json = CalculationEngine.encodeWeighedItemsJson(items)
        val parsed = CalculationEngine.parseWeighedItemsJson(json)
        assertEquals(2, parsed.size)
        assertEquals(DeliveryModality.CAJA_COMPLETA, parsed[0].modality)
        assertEquals(0, parsed[0].netWeightKg.compareTo(BigDecimal("22.125")))
        assertEquals("Blanco \"Especial\" {A}", parsed[0].brand)
        assertEquals(0, parsed[0].pricePerKg.compareTo(BigDecimal("43.50")))
        assertEquals(DeliveryModality.MEDIA_CAJA_PESADA, parsed[1].modality)
        assertEquals(0, parsed[1].netWeightKg.compareTo(BigDecimal("12.000")))
        assertEquals("Rojo", parsed[1].brand)
        assertEquals(0, parsed[1].pricePerKg.compareTo(BigDecimal("47.00")))
        assertEquals("Mixta (Cajas y Medias)", CalculationEngine.resolveModalityLabel("MIXTA", parsed))

        // Legacy JSON without brand/priceKg must still parse cleanly
        val legacyJson = """[{"id":5,"modality":"CAJA_COMPLETA","boxes":"1","inputKg":"22","tareKg":"2","netKg":"20"}]"""
        val legacyParsed = CalculationEngine.parseWeighedItemsJson(legacyJson)
        assertEquals(1, legacyParsed.size)
        assertEquals("", legacyParsed[0].brand)
        assertEquals(0, legacyParsed[0].pricePerKg.compareTo(BigDecimal.ZERO))
    }

    @Test
    fun `multi-brand and multi-price items in single delivery compute exact breakdown and MXN total`() {
        val item1 = CalculationEngine.calculateSingleBoxItem(
            id = 1L,
            modality = DeliveryModality.CAJA_COMPLETA,
            weightInputKg = "24.000", // 22 net * 42.00 = 924.00
            brand = "Marca A",
            pricePerKg = BigDecimal("42.00"),
        ).getOrThrow()
        val item2 = CalculationEngine.calculateSingleBoxItem(
            id = 2L,
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            weightInputKg = "15.500", // 15.00 net * 46.50 = 697.50
            brand = "Marca B",
            pricePerKg = BigDecimal("46.50"),
        ).getOrThrow()
        val item3 = CalculationEngine.calculateSingleBoxItem(
            id = 3L,
            modality = DeliveryModality.MEDIA_CAJA,
            weightInputKg = "22.000", // 10 net * 44.20 = 442.00
            brand = "Marca A",
            pricePerKg = BigDecimal("44.20"),
        ).getOrThrow()

        val items = listOf(item1, item2, item3)
        val result = CalculationEngine.calculateDeliveryFromItems(items, BigDecimal.ZERO)
        assertTrue(result.isValid)
        // boxes: 1 + 0.5 + 0.5 = 2
        assertEquals(0, result.boxesDecimal.compareTo(BigDecimal("2")))
        // net: 22 + 15 + 10 = 47
        assertEquals(0, result.netWeightKg.compareTo(BigDecimal("47")))
        // raw: 924.00 + 697.50 + 442.00 = 2063.50
        assertEquals(0, result.rawAmountMxn.compareTo(BigDecimal("2063.50")))
        assertEquals(BigDecimal("2063.50"), result.finalAmountMxn)

        val breakdown = CalculationEngine.summarizeBrandBreakdown(items)
        assertEquals(3, breakdown.size)
        assertEquals("Marca A", breakdown[0].brand)
        assertEquals(0, breakdown[0].pricePerKg.compareTo(BigDecimal("42.00")))
        assertEquals("Marca B", breakdown[1].brand)
        assertEquals(0, breakdown[1].pricePerKg.compareTo(BigDecimal("46.50")))
        assertEquals("Marca A", breakdown[2].brand)
        assertEquals(0, breakdown[2].pricePerKg.compareTo(BigDecimal("44.20")))
        assertEquals("Marca A, Marca B", CalculationEngine.resolveBrandSummaryLabel("Fallback", items))
    }

    @Test
    fun `caja completa deducts 2kg per box with exact weight`() {
        val result = CalculationEngine.calculateDelivery(
            modality = DeliveryModality.CAJA_COMPLETA,
            boxesInput = "3",
            weightInputKg = "68.450",
            pricePerKg = BigDecimal("42.50"),
        )
        assertTrue(result.isValid)
        assertEquals(0, result.boxesDecimal.compareTo(BigDecimal("3")))
        assertEquals(0, result.tareDeductionKg.compareTo(BigDecimal("6")))
        assertEquals(0, result.netWeightKg.compareTo(BigDecimal("62.450")))
        // 62.450 * 42.50 = 2654.125 -> 2654.13 -> <50c drops to 2654.00
        assertEquals(0, result.finalAmountMxn.compareTo(BigDecimal("2654.00")))
    }

    @Test
    fun `media caja applies (gross - 2) divided by 2 and 0_5 box`() {
        val result = CalculationEngine.calculateDelivery(
            modality = DeliveryModality.MEDIA_CAJA,
            boxesInput = "99", // ignored in MEDIA_CAJA
            weightInputKg = "34.000",
            pricePerKg = BigDecimal("40.00"),
        )
        assertTrue(result.isValid)
        assertEquals(0, result.boxesDecimal.compareTo(BigDecimal("0.5")))
        assertEquals(0, result.tareDeductionKg.compareTo(BigDecimal("2")))
        assertEquals(0, result.netWeightKg.compareTo(BigDecimal("16")))
        assertEquals(0, result.finalAmountMxn.compareTo(BigDecimal("640.00")))
    }

    @Test
    fun `media caja pesada deducts 500g from entered net weight without 2kg tare`() {
        val result = CalculationEngine.calculateDelivery(
            modality = DeliveryModality.MEDIA_CAJA_PESADA,
            boxesInput = "",
            weightInputKg = "15.00",
            pricePerKg = BigDecimal("40.00"),
        )
        assertTrue(result.isValid)
        assertEquals(0, result.boxesDecimal.compareTo(BigDecimal("0.5")))
        assertEquals(0, result.tareDeductionKg.compareTo(BigDecimal("0.500")))
        assertEquals(0, result.netWeightKg.compareTo(BigDecimal("14.50")))
        assertEquals(0, result.finalAmountMxn.compareTo(BigDecimal("580.00")))
    }

    @Test
    fun `official MXN rounding matches all Master Document Section 6_3 cases`() {
        assertEquals(BigDecimal("820.00"), CalculationEngine.roundMxnAmount(BigDecimal("820.20")))
        assertEquals(BigDecimal("820.00"), CalculationEngine.roundMxnAmount(BigDecimal("820.49")))
        assertEquals(BigDecimal("820.50"), CalculationEngine.roundMxnAmount(BigDecimal("820.50")))
        assertEquals(BigDecimal("821.00"), CalculationEngine.roundMxnAmount(BigDecimal("820.51")))
        assertEquals(BigDecimal("821.00"), CalculationEngine.roundMxnAmount(BigDecimal("820.75")))
        assertEquals(BigDecimal("865.00"), CalculationEngine.roundMxnAmount(BigDecimal("865.00")))
    }

    @Test
    fun `amountInWordsMxn formats Spanish currency text accurately`() {
        assertEquals("Cero pesos 00/100 M.N.", CalculationEngine.amountInWordsMxn(0.0))
        assertEquals("Un peso 00/100 M.N.", CalculationEngine.amountInWordsMxn(1.0))
        assertEquals(
            "Ochocientos veinte pesos 50/100 M.N.",
            CalculationEngine.amountInWordsMxn(820.50),
        )
        assertEquals(
            "Cinco mil novecientos noventa y nueve pesos 00/100 M.N.",
            CalculationEngine.amountInWordsMxn(5999.0),
        )
        assertEquals(
            "Un millón de pesos 00/100 M.N.",
            CalculationEngine.amountInWordsMxn(1_000_000.0),
        )
    }

    @Test
    fun `calculateSugarSummary handles empty valid and partial inputs without defaults`() {
        val empty = CalculationEngine.calculateSugarSummary("", "", "")
        assertFalse(empty.isPresent)
        assertFalse(empty.isPartialError)
        assertEquals(0, empty.subtotalMxn.compareTo(BigDecimal.ZERO))

        val partial = CalculationEngine.calculateSugarSummary("3", "50", "")
        assertFalse(partial.isPresent)
        assertTrue(partial.isPartialError)

        val valid = CalculationEngine.calculateSugarSummary("3", "50", "920.50")
        assertTrue(valid.isPresent)
        assertFalse(valid.isPartialError)
        assertEquals(0, valid.sacks.compareTo(BigDecimal("3")))
        assertEquals(0, valid.totalWeightKg.compareTo(BigDecimal("150")))
        assertEquals(0, valid.subtotalMxn.compareTo(BigDecimal("2761.50")))
    }

    @Test
    fun `calculateDeliveryWithSugar integrates egg and sugar balances and supports sugar-only`() {
        val eggItem = CalculationEngine.calculateSingleBoxItem(
            id = 1L,
            modality = DeliveryModality.CAJA_COMPLETA,
            weightInputKg = "24.000", // 22 net * 40.00 = 880.00
            brand = "San Juan",
            pricePerKg = BigDecimal("40.00"),
        ).getOrThrow()
        val sugar = CalculationEngine.calculateSugarSummary("2", "50", "850.25") // 100 kg, 1700.50 MXN

        val mixed = CalculationEngine.calculateDeliveryWithSugar(
            items = listOf(eggItem),
            pricePerKg = BigDecimal("40.00"),
            sugarSummary = sugar,
        )
        assertTrue(mixed.isValid)
        assertEquals(0, mixed.netWeightKg.compareTo(BigDecimal("22")))
        assertEquals(0, mixed.combinedNetWeightKg.compareTo(BigDecimal("122")))
        // 880.00 + 1700.50 = 2580.50 (== 50c keeps .50)
        assertEquals(BigDecimal("2580.50"), mixed.finalAmountMxn)

        // Sugar-only delivery (0 egg boxes)
        val sugarOnly = CalculationEngine.calculateDeliveryWithSugar(
            items = emptyList(),
            pricePerKg = BigDecimal.ZERO,
            sugarSummary = sugar,
        )
        assertTrue(sugarOnly.isValid)
        assertEquals(0, sugarOnly.boxesDecimal.compareTo(BigDecimal.ZERO))
        assertEquals(0, sugarOnly.combinedNetWeightKg.compareTo(BigDecimal("100")))
        assertEquals(BigDecimal("1700.50"), sugarOnly.finalAmountMxn)

        // Partial sugar input invalidates overall delivery
        val partialSugar = CalculationEngine.calculateSugarSummary("2", "", "850")
        val invalid = CalculationEngine.calculateDeliveryWithSugar(
            items = listOf(eggItem),
            pricePerKg = BigDecimal("40.00"),
            sugarSummary = partialSugar,
        )
        assertFalse(invalid.isValid)
    }

    @Test
    fun `summarizeBrandBreakdown falls back cleanly for legacy deliveries without itemsSnapshotJson`() {
        val breakdown = CalculationEngine.summarizeBrandBreakdown(
            items = emptyList(),
            fallbackBrand = "Tehuacán",
            fallbackPricePerKg = BigDecimal("45.00"),
            fallbackBoxes = BigDecimal("2"),
            fallbackNetWeightKg = BigDecimal("44.00"),
        )
        assertEquals(1, breakdown.size)
        assertEquals("Tehuacán", breakdown[0].brand)
        assertEquals(0, breakdown[0].subtotalMxn.compareTo(BigDecimal("1980.00")))
    }
}
