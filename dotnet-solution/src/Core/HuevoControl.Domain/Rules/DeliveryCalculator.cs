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
