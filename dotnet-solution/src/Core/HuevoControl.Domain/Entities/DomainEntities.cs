namespace HuevoControl.Domain.Entities;

public enum UserRole { Dueno, Vendedor }
public enum UserStatus { Pendiente, Activa, Bloqueada }
public enum PriceOrigin { Dueno, Vendedor }
public enum DeliveryStatus { Vigente, Cancelada }
public enum PaymentMethod { Efectivo, Transferencia }
public enum PaymentStatus { Verificado, PorVerificar }
public enum IncidentType { Perdida, Robo, Faltante, Otro }
public enum IncidentStatus { Reportado, Revisado }
public enum VehicleType { Torton, Trailer }

public sealed class UserAccount
{
    public string Id { get; set; } = string.Empty;
    public string GoogleEmail { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; }
    public string? FolioSeries { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string? EncryptedPhone { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AuthorizedDevice
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public bool Active { get; set; }
    public DateTime? LastSyncUtc { get; set; }
    public int PendingSyncCount { get; set; }
}

public sealed class CrewMember
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string RoleTitle { get; set; } = "chalan";
    public bool Active { get; set; } = true;
}

public sealed class Workday
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DateYmd { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public string HelpersNamesJson { get; set; } = "[]";
}

public sealed class Customer
{
    public string Id { get; set; } = string.Empty;
    public string BusinessName { get; set; } = string.Empty;
    public string ContactName { get; set; } = string.Empty;
    public string EncryptedPhone { get; set; } = string.Empty;
    public string PhonePlainOrMasked { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
    public string CreatedByUserId { get; set; } = string.Empty;
    public string? MergedIntoCustomerId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class DailyPrice
{
    public string Id { get; set; } = string.Empty;
    public string DateYmd { get; set; } = string.Empty;
    public long PriceCentavosPerKg { get; set; }
    public string PublishedByUserId { get; set; } = string.Empty;
    public string PublishedByName { get; set; } = string.Empty;
    public PriceOrigin Origin { get; set; }
    public bool ReviewedByOwner { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class Delivery
{
    public string Id { get; set; } = string.Empty;
    public string VendorId { get; set; } = string.Empty;
    public string VendorName { get; set; } = string.Empty;
    public string WorkdayId { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public string HelpersNamesJson { get; set; } = "[]";
    public string Series { get; set; } = string.Empty;
    public int FolioNumber { get; set; }
    public string FolioFormatted { get; set; } = string.Empty;
    public string CustomerId { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public long PriceCentavosPerKg { get; set; }
    public bool IsSpecialPrice { get; set; }
    public int TotalGrams { get; set; }
    public long TotalToChargeCentavos { get; set; }
    public DeliveryStatus Status { get; set; } = DeliveryStatus.Vigente;
    public string? CancellationReason { get; set; }
    public DateTime? SyncedAtUtc { get; set; }
    public string SourceType { get; set; } = "ruta";
    public string? BrandKey { get; set; }
    public string? BrandName { get; set; }
    public int? BoxesCount { get; set; }
    public List<DeliveryBox> Boxes { get; set; } = new();
}

public sealed class WarehouseShipment
{
    public string Id { get; set; } = string.Empty;
    public VehicleType VehicleType { get; set; } = VehicleType.Torton;
    public string ReferenceCode { get; set; } = string.Empty;
    public string OriginFarm { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public DateTime ArrivedAtUtc { get; set; } = DateTime.UtcNow;
    public string RegisteredByUserId { get; set; } = string.Empty;
    public string RegisteredByName { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public List<WarehouseShipmentLine> Lines { get; set; } = new();
}

public sealed class WarehouseShipmentLine
{
    public string Id { get; set; } = string.Empty;
    public string ShipmentId { get; set; } = string.Empty;
    public string BrandKey { get; set; } = string.Empty;
    public string BrandName { get; set; } = string.Empty;
    public int BoxesCount { get; set; }
    public int TotalGrams { get; set; }
}

public sealed class DeliveryBox
{
    public string Id { get; set; } = string.Empty;
    public string DeliveryId { get; set; } = string.Empty;
    public int Position { get; set; }
    public int WeightGrams { get; set; }
}

public sealed class DailyLoss
{
    public string Id { get; set; } = string.Empty;
    public string VendorId { get; set; } = string.Empty;
    public string VendorName { get; set; } = string.Empty;
    public string WorkdayId { get; set; } = string.Empty;
    public string DateYmd { get; set; } = string.Empty;
    public int LostGrams { get; set; }
    public string Note { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class Payment
{
    public string Id { get; set; } = string.Empty;
    public string CustomerId { get; set; } = string.Empty;
    public string? DeliveryId { get; set; }
    public string VendorId { get; set; } = string.Empty;
    public long AmountCentavos { get; set; }
    public PaymentMethod Method { get; set; }
    public PaymentStatus Status { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string Note { get; set; } = string.Empty;
}

public sealed class MoneyIncident
{
    public string Id { get; set; } = string.Empty;
    public string VendorId { get; set; } = string.Empty;
    public string VendorName { get; set; } = string.Empty;
    public IncidentType Type { get; set; }
    public long AmountCentavos { get; set; }
    public DateTime OccurredAtUtc { get; set; }
    public string? RelatedDeliveryId { get; set; }
    public string? RelatedCustomerId { get; set; }
    public string Description { get; set; } = string.Empty;
    public string PeoplePresentJson { get; set; } = "[]";
    public IncidentStatus Status { get; set; } = IncidentStatus.Reportado;
    public string? OwnerNote { get; set; }
}

public sealed class DeliveryEvent
{
    public string Id { get; set; } = string.Empty;
    public string DeliveryId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string Detail { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; }
    public DateTime? ArrivedAtServerUtc { get; set; }
}

public sealed class CashClosing
{
    public string Id { get; set; } = string.Empty;
    public string VendorId { get; set; } = string.Empty;
    public string VendorName { get; set; } = string.Empty;
    public string DateYmd { get; set; } = string.Empty;
    public long SoldCentavos { get; set; }
    public long CashCollectedCentavos { get; set; }
    public long TransferVerifiedCentavos { get; set; }
    public long TransferPendingCentavos { get; set; }
    public int DailyLossGrams { get; set; }
    public long IncidentsCentavos { get; set; }
    public long ExpectedCashToDeliverCentavos { get; set; }
    public long ActualCashHandedInCentavos { get; set; }
    public long UnexplainedDifferenceCentavos { get; set; }
    public DateTime ClosedAtUtc { get; set; } = DateTime.UtcNow;
    public string ClosedByUserId { get; set; } = string.Empty;
}

public sealed class AuditLogEntry
{
    public string Id { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Detail { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class ExcelImportRecord
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ImportType { get; set; } = "clientes";
    public DateTime ImportedAtUtc { get; set; } = DateTime.UtcNow;
    public int RowsRead { get; set; }
    public int RowsCreated { get; set; }
    public int RowsRejected { get; set; }
}

public sealed class AppSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
