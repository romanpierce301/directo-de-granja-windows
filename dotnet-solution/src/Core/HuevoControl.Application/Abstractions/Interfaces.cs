using HuevoControl.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace HuevoControl.Application.Abstractions;

public interface IHuevoControlDbContext
{
    DbSet<UserAccount> Users { get; }
    DbSet<AuthorizedDevice> Devices { get; }
    DbSet<CrewMember> CrewMembers { get; }
    DbSet<Workday> Workdays { get; }
    DbSet<Customer> Customers { get; }
    DbSet<DailyPrice> DailyPrices { get; }
    DbSet<Delivery> Deliveries { get; }
    DbSet<DeliveryBox> DeliveryBoxes { get; }
    DbSet<DailyLoss> DailyLosses { get; }
    DbSet<Payment> Payments { get; }
    DbSet<MoneyIncident> MoneyIncidents { get; }
    DbSet<DeliveryEvent> DeliveryEvents { get; }
    DbSet<CashClosing> CashClosings { get; }
    DbSet<AuditLogEntry> AuditLogs { get; }
    DbSet<ExcelImportRecord> ExcelImports { get; }
    DbSet<AppSetting> Settings { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IRedisCacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct = default);
    Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct = default);
    Task RemoveAsync(string key, CancellationToken ct = default);
}

public interface IAesEncryptionService
{
    string Encrypt(string plaintext);
    string Decrypt(string cipherPayload);
}

public interface IPasswordHasher
{
    string Hash(string plainPassword);
    bool Verify(string plainPassword, string storedHash);
}

public interface IJwtTokenService
{
    string GenerateToken(UserAccount user);
}

public interface IRealtimeAlertPublisher
{
    Task PublishEventAsync(string eventName, object payload, CancellationToken ct = default);
}
