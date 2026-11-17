using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using HuevoControl.Domain.Entities;

namespace HuevoControl.Domain.Rules;

public sealed record DeliveryCalculationResult(
    int TotalGrams,
    long ExactMilliCentavos,
    long TotalToChargeCentavos);

public sealed record ClosingCalculationResult(
    long SoldCentavos,
    long CashCollectedCentavos,
    long TransferVerifiedCentavos,
    long TransferPendingCentavos,
    int DailyLossGrams,
    long IncidentsCentavos,
    long ExpectedCashToDeliverCentavos,
    long ActualCashHandedInCentavos,
    long UnexplainedDifferenceCentavos);

public sealed record BrandInventorySummary(
    string BrandKey,
    string BrandName,
    int BoxesArrived,
    int BoxesSold,
    int BoxesAvailable,
    long GramsArrived,
    long GramsSold,
    long GramsAvailable);

public static class DeliveryCalculator
{
    /// <summary>
    /// Regla exacta de Directo de Granja (C1-C6, R1-R5):
    /// - Pesos en gramos enteros; dinero en centavos enteros (sin flotantes).
    /// - Centavos de 1 a 49 (&lt; 50,000 mili-centavos): baja al peso entero.
    /// - Exactamente 50 centavos (50,000): se queda en .50.
    /// - Centavos de 51 a 99 (&gt; 50,000, incluyendo 62.5): sube al siguiente peso entero.
    /// </summary>
    public static DeliveryCalculationResult Calculate(IReadOnlyCollection<int> boxesGrams, long priceCentavosPerKg)
    {
        if (boxesGrams.Count == 0)
            throw new ArgumentException("La entrega debe incluir al menos una caja.", nameof(boxesGrams));
        if (priceCentavosPerKg <= 0)
            throw new ArgumentOutOfRangeException(nameof(priceCentavosPerKg), "El precio por kilo debe ser mayor a 0.");

        int totalGrams = 0;
        foreach (int g in boxesGrams)
        {
            if (g <= 0)
                throw new ArgumentOutOfRangeException(nameof(boxesGrams), "Cada caja debe pesar más de 0 gramos.");
            totalGrams = checked(totalGrams + g);
        }

        long rawScaled = checked((long)totalGrams * priceCentavosPerKg);
        long pesos = rawScaled / 100_000L;
        long rem = rawScaled % 100_000L;

        long totalToChargeCentavos = rem switch
        {
            < 50_000L => pesos * 100L,
            50_000L => pesos * 100L + 50L,
            _ => (pesos + 1L) * 100L
        };

        return new DeliveryCalculationResult(totalGrams, rawScaled, totalToChargeCentavos);
    }

    public static void ValidatePayment(long paymentCentavos, long remainingCentavos)
    {
        if (paymentCentavos <= 0)
            throw new ArgumentOutOfRangeException(nameof(paymentCentavos), "El abono debe ser mayor a $0.");
        if (paymentCentavos > remainingCentavos)
            throw new InvalidOperationException("El abono no puede ser mayor al saldo pendiente.");
    }

    public static ClosingCalculationResult CalculateClosing(
        IEnumerable<Delivery> deliveries,
        IEnumerable<Payment> payments,
        IEnumerable<DailyLoss> losses,
        IEnumerable<MoneyIncident> incidents,
        long actualCashHandedInCentavos)
    {
        var deliveryList = deliveries.ToList();
        var cancelledIds = deliveryList
            .Where(d => d.Status == DeliveryStatus.Cancelada)
            .Select(d => d.Id)
            .ToHashSet();

        long sold = deliveryList
            .Where(d => d.Status == DeliveryStatus.Vigente)
            .Sum(d => d.TotalToChargeCentavos);

        var activePayments = payments
            .Where(p => string.IsNullOrEmpty(p.DeliveryId) || !cancelledIds.Contains(p.DeliveryId))
            .ToList();

        long cash = activePayments
            .Where(p => p.Method == PaymentMethod.Efectivo)
            .Sum(p => p.AmountCentavos);
        long transferVerified = activePayments
            .Where(p => p.Method == PaymentMethod.Transferencia && p.Status == PaymentStatus.Verificado)
            .Sum(p => p.AmountCentavos);
        long transferPending = activePayments
            .Where(p => p.Method == PaymentMethod.Transferencia && p.Status == PaymentStatus.PorVerificar)
            .Sum(p => p.AmountCentavos);

        int lossGrams = losses.Sum(l => l.LostGrams);
        long incidentSum = incidents.Sum(i => i.AmountCentavos);

        long expectedCash = cash - incidentSum;
        long unexplainedDiff = expectedCash - actualCashHandedInCentavos;

        return new ClosingCalculationResult(
            sold,
            cash,
            transferVerified,
            transferPending,
            lossGrams,
            incidentSum,
            expectedCash,
            actualCashHandedInCentavos,
            unexplainedDiff);
    }

    public static IReadOnlyList<int> SplitTotalGramsIntoBoxes(int totalGrams, int boxesCount)
    {
        if (totalGrams <= 0)
            throw new ArgumentOutOfRangeException(nameof(totalGrams), "El peso total debe ser mayor a 0 gramos.");
        if (boxesCount <= 0)
            throw new ArgumentOutOfRangeException(nameof(boxesCount), "La cantidad de cajas debe ser mayor a 0.");
        if (totalGrams < boxesCount)
            throw new InvalidOperationException("El peso total en gramos debe ser al menos 1 gramo por caja.");

        int baseGrams = totalGrams / boxesCount;
        int rem = totalGrams % boxesCount;
        var list = new int[boxesCount];
        for (int i = 0; i < boxesCount; i++)
            list[i] = i < rem ? baseGrams + 1 : baseGrams;
        return list;
    }

    public static IReadOnlyList<BrandInventorySummary> CalculateBrandInventory(
        IEnumerable<WarehouseShipment> shipments,
        IEnumerable<Delivery> deliveries,
        IEnumerable<DeliveryBox> deliveryBoxes)
    {
        var boxCountsByDelivery = deliveryBoxes
            .GroupBy(b => b.DeliveryId)
            .ToDictionary(g => g.Key, g => g.Count());

        var map = new Dictionary<string, (string BrandName, int BoxesArrived, int BoxesSold, long GramsArrived, long GramsSold)>();

        foreach (var s in shipments)
        {
            foreach (var l in s.Lines)
            {
                string key = string.IsNullOrWhiteSpace(l.BrandKey)
                    ? ExcelSecuritySanitizer.NormalizeName(l.BrandName)
                    : l.BrandKey;
                if (string.IsNullOrEmpty(key)) continue;
                map.TryGetValue(key, out var cur);
                string name = string.IsNullOrEmpty(cur.BrandName) ? l.BrandName.Trim() : cur.BrandName;
                map[key] = (name, cur.BoxesArrived + l.BoxesCount, cur.BoxesSold, cur.GramsArrived + l.TotalGrams, cur.GramsSold);
            }
        }

        foreach (var d in deliveries)
        {
            if (d.Status != DeliveryStatus.Vigente) continue;
            string key = !string.IsNullOrWhiteSpace(d.BrandKey)
                ? d.BrandKey!
                : ExcelSecuritySanitizer.NormalizeName(d.BrandName);
            if (string.IsNullOrEmpty(key)) continue;
            int boxes = d.BoxesCount is > 0
                ? d.BoxesCount.Value
                : (boxCountsByDelivery.TryGetValue(d.Id, out int cnt) ? cnt : 0);

            map.TryGetValue(key, out var cur);
            string name = string.IsNullOrEmpty(cur.BrandName) ? (d.BrandName ?? key) : cur.BrandName;
            map[key] = (name, cur.BoxesArrived, cur.BoxesSold + boxes, cur.GramsArrived, cur.GramsSold + d.TotalGrams);
        }

        return map
            .Select(kv => new BrandInventorySummary(
                kv.Key,
                kv.Value.BrandName,
                kv.Value.BoxesArrived,
                kv.Value.BoxesSold,
                kv.Value.BoxesArrived - kv.Value.BoxesSold,
                kv.Value.GramsArrived,
                kv.Value.GramsSold,
                Math.Max(0L, kv.Value.GramsArrived - kv.Value.GramsSold)))
            .OrderBy(x => x.BrandName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static BrandInventorySummary ValidateBodegaSaleStock(
        IEnumerable<BrandInventorySummary> inventory,
        string brandNameOrKey,
        int boxesRequested)
    {
        if (boxesRequested <= 0)
            throw new ArgumentOutOfRangeException(nameof(boxesRequested), "La cantidad de cajas debe ser mayor a 0.");
        string key = ExcelSecuritySanitizer.NormalizeName(brandNameOrKey);
        var stock = inventory.FirstOrDefault(i => i.BrandKey == key);
        if (stock is null || stock.BoxesArrived <= 0)
            throw new InvalidOperationException($"No hay inventario registrado en bodega para la marca \"{brandNameOrKey}\".");
        if (stock.BoxesAvailable < boxesRequested)
            throw new InvalidOperationException($"Inventario insuficiente de {stock.BrandName}: disponibles {stock.BoxesAvailable} cajas, solicitadas {boxesRequested} cajas.");
        return stock;
    }
}

public static class ExcelSecuritySanitizer
{
    private static readonly char[] DangerousLeadingChars = ['=', '+', '-', '@', '\t', '\r'];

    public static string EscapeForExport(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        string cleaned = value.Replace("\r", " ");
        return DangerousLeadingChars.Contains(cleaned[0]) ? $"'{cleaned}" : cleaned;
    }

    public static string NormalizeName(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        string decomposed = input.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (char c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        string clean = Regex.Replace(sb.ToString().ToLowerInvariant(), @"[^a-z0-9\s]", " ");
        return Regex.Replace(clean, @"\s+", " ").Trim();
    }

    public static string NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
        return Regex.Replace(phone, @"\D", "");
    }
}
