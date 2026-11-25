using HuevoControl.Application.Abstractions;
using HuevoControl.Domain.Entities;
using HuevoControl.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace HuevoControl.Application.Services;

public sealed record SyncPushDeliveryDto(
    string Id,
    string CustomerId,
    string CustomerName,
    string WorkdayId,
    string DriverName,
    int FolioNumber,
    long PriceCentavosPerKg,
    bool IsSpecialPrice,
    IReadOnlyList<int> BoxesGrams,
    DateTime CreatedAtUtc);

public sealed record SyncPushRequest(
    string DeviceId,
    IReadOnlyList<SyncPushDeliveryDto> Deliveries);

public sealed record SyncPushResult(int AcceptedCount, int SkippedDuplicatesCount, DateTime SyncedAtUtc);

public sealed class SyncProcessorService
{
    private readonly IHuevoControlDbContext _db;
    private readonly IRealtimeAlertPublisher _publisher;

    public SyncProcessorService(IHuevoControlDbContext db, IRealtimeAlertPublisher publisher)
    {
        _db = db;
        _publisher = publisher;
    }

    public async Task<SyncPushResult> ProcessAndroidPushAsync(
        string vendorId,
        SyncPushRequest request,
        CancellationToken ct = default)
    {
        var vendor = await _db.Users.FirstOrDefaultAsync(u => u.Id == vendorId, ct)
            ?? throw new InvalidOperationException("Vendedor no encontrado.");

        if (vendor.Status != UserStatus.Activa || string.IsNullOrEmpty(vendor.FolioSeries))
            throw new UnauthorizedAccessException("Cuenta pendiente o bloqueada.");

        int accepted = 0;
        int skipped = 0;
        DateTime now = DateTime.UtcNow;
        var batchIds = new HashSet<string>(StringComparer.Ordinal);
        var batchFolios = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var dto in request.Deliveries)
        {
            if (string.IsNullOrWhiteSpace(dto.Id) || dto.Id.Length > 80 ||
                string.IsNullOrWhiteSpace(dto.CustomerId) || dto.CustomerId.Length > 80 ||
                string.IsNullOrWhiteSpace(dto.WorkdayId) || dto.WorkdayId.Length > 80 ||
                dto.FolioNumber is < 1 or > 999_999 || dto.PriceCentavosPerKg is < 1 or > 50_000 ||
                dto.BoxesGrams is null || dto.BoxesGrams.Count is < 1 or > 500 ||
                dto.BoxesGrams.Any(g => g is < 1 or > 200_000))
                continue;

            if (!batchIds.Add(dto.Id))
            {
                skipped++;
                continue;
            }

            string folioFormatted = $"{vendor.FolioSeries}-{dto.FolioNumber:D4}";
            if (!batchFolios.Add(folioFormatted) || await _db.Deliveries.AnyAsync(d => d.FolioFormatted == folioFormatted, ct))
            {
                skipped++;
                continue;
            }

            bool exists = await _db.Deliveries.AnyAsync(d => d.Id == dto.Id, ct);
            if (exists)
            {
                skipped++;
                continue;
            }

            var customer = await _db.Customers.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.CustomerId && c.Active && c.MergedIntoCustomerId == null, ct);
            if (customer is null)
                continue;

            var calc = DeliveryCalculator.Calculate(dto.BoxesGrams.ToArray(), dto.PriceCentavosPerKg);
            var delivery = new Delivery
            {
                Id = dto.Id,
                VendorId = vendor.Id,
                VendorName = vendor.Name,
                WorkdayId = dto.WorkdayId,
                DriverName = dto.DriverName,
                Series = vendor.FolioSeries,
                FolioNumber = dto.FolioNumber,
                FolioFormatted = folioFormatted,
                CustomerId = dto.CustomerId,
                CustomerName = customer.BusinessName,
                CreatedAtUtc = dto.CreatedAtUtc,
                PriceCentavosPerKg = dto.PriceCentavosPerKg,
                IsSpecialPrice = dto.IsSpecialPrice,
                TotalGrams = calc.TotalGrams,
                TotalToChargeCentavos = calc.TotalToChargeCentavos,
                Status = DeliveryStatus.Vigente,
                SyncedAtUtc = now
            };

            int pos = 1;
            foreach (int grams in dto.BoxesGrams)
            {
                delivery.Boxes.Add(new DeliveryBox
                {
                    Id = Guid.NewGuid().ToString("N"),
                    DeliveryId = delivery.Id,
                    Position = pos++,
                    WeightGrams = grams
                });
            }

            _db.Deliveries.Add(delivery);
            _db.DeliveryEvents.Add(new DeliveryEvent
            {
                Id = Guid.NewGuid().ToString("N"),
                DeliveryId = delivery.Id,
                EventType = "sincronizacion",
                Detail = $"Entrega {folioFormatted} sincronizada desde Android",
                ActorUserId = vendor.Id,
                ActorName = vendor.Name,
                DeviceId = request.DeviceId,
                OccurredAtUtc = dto.CreatedAtUtc,
                ArrivedAtServerUtc = now
            });

            accepted++;
        }

        await _db.SaveChangesAsync(ct);

        if (accepted > 0)
        {
            await _publisher.PublishEventAsync(
                "delivery:synced",
                new { vendorId, accepted, syncedAtUtc = now },
                ct);
        }

        return new SyncPushResult(accepted, skipped, now);
    }
}
