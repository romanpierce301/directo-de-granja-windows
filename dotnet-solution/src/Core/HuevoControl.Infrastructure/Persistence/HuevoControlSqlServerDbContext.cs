using HuevoControl.Application.Abstractions;
using HuevoControl.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace HuevoControl.Infrastructure.Persistence;

/// <summary>
/// Contexto principal de SQL Server con Entity Framework Core 8.
/// Configura índices únicos por serie/folio, BIGINT para centavos, INT para gramos y consultas optimizadas.
/// </summary>
public sealed class HuevoControlSqlServerDbContext : DbContext, IHuevoControlDbContext
{
    public HuevoControlSqlServerDbContext(DbContextOptions<HuevoControlSqlServerDbContext> options)
        : base(options) { }

    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<AuthorizedDevice> Devices => Set<AuthorizedDevice>();
    public DbSet<CrewMember> CrewMembers => Set<CrewMember>();
    public DbSet<Workday> Workdays => Set<Workday>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<DailyPrice> DailyPrices => Set<DailyPrice>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<DeliveryBox> DeliveryBoxes => Set<DeliveryBox>();
    public DbSet<DailyLoss> DailyLosses => Set<DailyLoss>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<MoneyIncident> MoneyIncidents => Set<MoneyIncident>();
    public DbSet<DeliveryEvent> DeliveryEvents => Set<DeliveryEvent>();
    public DbSet<CashClosing> CashClosings => Set<CashClosing>();
    public DbSet<AuditLogEntry> AuditLogs => Set<AuditLogEntry>();
    public DbSet<ExcelImportRecord> ExcelImports => Set<ExcelImportRecord>();
    public DbSet<WarehouseShipment> WarehouseShipments => Set<WarehouseShipment>();
    public DbSet<WarehouseShipmentLine> WarehouseShipmentLines => Set<WarehouseShipmentLine>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserAccount>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.GoogleEmail).IsUnique();
            e.Property(x => x.FolioSeries).HasMaxLength(8);
        });

        modelBuilder.Entity<AuthorizedDevice>(e =>
        {
            e.ToTable("devices");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<CrewMember>(e => { e.ToTable("crew_members"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<Workday>(e => { e.ToTable("workdays"); e.HasKey(x => x.Id); });

        modelBuilder.Entity<Customer>(e =>
        {
            e.ToTable("customers");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.BusinessName);
        });

        modelBuilder.Entity<DailyPrice>(e =>
        {
            e.ToTable("daily_prices");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.DateYmd);
        });

        modelBuilder.Entity<Delivery>(e =>
        {
            e.ToTable("deliveries");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Series, x.FolioNumber }).IsUnique();
            e.HasMany(x => x.Boxes).WithOne().HasForeignKey(b => b.DeliveryId);
        });

        modelBuilder.Entity<DeliveryBox>(e => { e.ToTable("delivery_boxes"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<DailyLoss>(e => { e.ToTable("daily_losses"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<Payment>(e => { e.ToTable("payments"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<MoneyIncident>(e => { e.ToTable("money_incidents"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<DeliveryEvent>(e => { e.ToTable("delivery_events"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<CashClosing>(e => { e.ToTable("cash_closings"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<AuditLogEntry>(e => { e.ToTable("audit_log"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<ExcelImportRecord>(e => { e.ToTable("excel_imports"); e.HasKey(x => x.Id); });
        modelBuilder.Entity<WarehouseShipment>(e =>
        {
            e.ToTable("warehouse_shipments");
            e.HasKey(x => x.Id);
            e.HasMany(x => x.Lines).WithOne().HasForeignKey(l => l.ShipmentId);
        });
        modelBuilder.Entity<WarehouseShipmentLine>(e =>
        {
            e.ToTable("warehouse_shipment_lines");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.BrandKey);
        });
        modelBuilder.Entity<AppSetting>(e => { e.ToTable("settings"); e.HasKey(x => x.Key); });
    }
}

/// <summary>
/// Caché SQLite local para la aplicación WPF de Windows (arranque instantáneo y respaldo sin conexión).
/// </summary>
public sealed class WindowsLocalSqliteCacheContext : DbContext
{
    public WindowsLocalSqliteCacheContext(DbContextOptions<WindowsLocalSqliteCacheContext> options)
        : base(options) { }

    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<DailyPrice> DailyPrices => Set<DailyPrice>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Delivery>().HasKey(x => x.Id);
        modelBuilder.Entity<Customer>().HasKey(x => x.Id);
        modelBuilder.Entity<DailyPrice>().HasKey(x => x.Id);
        modelBuilder.Entity<AppSetting>().HasKey(x => x.Key);
    }
}
