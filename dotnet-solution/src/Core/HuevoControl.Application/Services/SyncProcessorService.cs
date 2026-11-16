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

        foreach (var dto in request.Deliveries)
        {
            bool exists = await _db.Deliveries.AnyAsync(d => d.Id == dto.Id, ct);
            if (exists)
            {
                skipped++;
                continue;
            }

            var calc = DeliveryCalculator.Calculate(dto.BoxesGrams.ToArray(), dto.PriceCentavosPerKg);
            string folioFormatted = $"{vendor.FolioSeries}-{dto.FolioNumber:D4}";

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
                CustomerName = dto.CustomerName,
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
