using HuevoControl.Application.Abstractions;
using HuevoControl.Application.Services;
using HuevoControl.Domain.Entities;
using HuevoControl.Domain.Rules;
using HuevoControl.Infrastructure.Persistence;
using HuevoControl.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HuevoControl.UnitTests;

public sealed class DomainAndSecurityTests
{
    [Fact]
    public void Case_C1_C2_R1_FiveBoxes_ExactSumAndRounding()
    {
        var result = DeliveryCalculator.Calculate([25350, 24450, 25120, 22780, 22900], 3700);
        Assert.Equal(120600, result.TotalGrams);
        Assert.Equal(446200L, result.TotalToChargeCentavos); // $4,462
        Assert.Equal(366200L, result.TotalToChargeCentavos - 80000L); // Saldo $3,662
    }

    [Theory]
    [InlineData(24350, 3750, 91300L)] // C4: $913.125 -> $913
    [InlineData(12500, 3700, 46250L)] // R2: $462.50 -> $462.50
    [InlineData(25350, 3700, 93800L)] // R3: $937.95 -> $938
    [InlineData(12510, 3700, 46300L)] // R4: $462.87 -> $463
    [InlineData(12500, 3701, 46300L)] // R5: $462.625 -> $463
    public void Cases_C4_R2_To_R5_Rounding(int grams, long priceCentavos, long expectedCharge)
    {
        var result = DeliveryCalculator.Calculate([grams], priceCentavos);
        Assert.Equal(expectedCharge, result.TotalToChargeCentavos);
    }

    [Fact]
    public void Case_C5_Overpayment_Rejected()
    {
        Assert.Throws<InvalidOperationException>(() => DeliveryCalculator.ValidatePayment(500000L, 115900L));
    }

    [Fact]
    public void Case_I2_Closing_CashMinusIncidents_And_Difference()
    {
        var deliveries = new[]
        {
            new Delivery { Id = "d1", Status = DeliveryStatus.Vigente, TotalToChargeCentavos = 600000L }
        };
        var payments = new[]
        {
            new Payment { Id = "p1", DeliveryId = "d1", Method = PaymentMethod.Efectivo, AmountCentavos = 600000L }
        };
        var losses = new[]
        {
            new DailyLoss { Id = "l1", LostGrams = 6500, Note = "Caja rota" }
        };
        var incidents = new[]
        {
            new MoneyIncident { Id = "i1", AmountCentavos = 150000L, Description = "Robo" }
        };

        var closing = DeliveryCalculator.CalculateClosing(deliveries, payments, losses, incidents, 400000L);
        Assert.Equal(450000L, closing.ExpectedCashToDeliverCentavos);
        Assert.Equal(50000L, closing.UnexplainedDifferenceCentavos);
    }

    [Fact]
    public void Security_ExcelFormulaInjection_And_Aes256_And_Jwt()
    {
        Assert.Equal("'=CMD|'/C calc'!A0", ExcelSecuritySanitizer.EscapeForExport("=CMD|'/C calc'!A0"));
        Assert.Equal("'+SUM(A1:A2)", ExcelSecuritySanitizer.EscapeForExport("+SUM(A1:A2)"));
        Assert.Equal("cremeria la aurora", ExcelSecuritySanitizer.NormalizeName("Cremería La Aurora"));

        var aes = new Aes256EncryptionService("ClaveMaestraDePruebaSuperSegura2026!");
        string enc = aes.Encrypt("5512345678");
        Assert.NotContains("5512345678", enc);
        Assert.Equal("5512345678", aes.Decrypt(enc));

        var hasher = new BcryptPasswordHasher();
        string hash = hasher.Hash("Granja2026!");
        Assert.True(hasher.Verify("Granja2026!", hash));

        var jwt = new JwtTokenService("JwtSecretSuperSeguraDeAlMenos32Caracteres2026!");
        string token = jwt.GenerateToken(new UserAccount
        {
            Id = "u1",
            GoogleEmail = "dueno@directodegranja.mx",
            Name = "Dueño",
            Role = UserRole.Dueno,
            Status = UserStatus.Activa
        });
        Assert.Contains(".", token);
    }

    [Fact]
    public async Task SyncProcessor_Deduplicates_Repeated_Android_Deliveries()
    {
        var opts = new DbContextOptionsBuilder<HuevoControlSqlServerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new HuevoControlSqlServerDbContext(opts);
        db.Users.Add(new UserAccount
        {
            Id = "v1",
            GoogleEmail = "vendedor@directodegranja.mx",
            Name = "Tony",
            Role = UserRole.Vendedor,
            Status = UserStatus.Activa,
            FolioSeries = "A"
        });
        db.Customers.Add(new Customer { Id = "c1", BusinessName = "Abarrotes López", Active = true });
        await db.SaveChangesAsync();

        var publisher = new NoOpPublisher();
        var svc = new SyncProcessorService(db, publisher);
        var req = new SyncPushRequest("dev-1",
        [
            new SyncPushDeliveryDto("del-uuid-1", "c1", "Abarrotes López", "w1", "Chofer", 1, 3700, false, [25350], DateTime.UtcNow)
        ]);

        var first = await svc.ProcessAndroidPushAsync("v1", req);
        var second = await svc.ProcessAndroidPushAsync("v1", req);

        Assert.Equal(1, first.AcceptedCount);
        Assert.Equal(0, second.AcceptedCount);
        Assert.Equal(1, second.SkippedDuplicatesCount);
    }

    [Fact]
    public void Bodega_Torton_And_DirectSale_Deducts_And_Cancel_Restores()
    {
        var shipments = new[]
        {
            new WarehouseShipment
            {
                Id = "shp-1",
                VehicleType = VehicleType.Torton,
                Lines =
                [
                    new WarehouseShipmentLine
                    {
                        Id = "shl-1",
                        ShipmentId = "shp-1",
                        BrandKey = "enerhuevo",
                        BrandName = "Enerhuevo",
                        BoxesCount = 100,
                        TotalGrams = 2_450_000
                    }
                ]
            }
        };

        var deliveries = new List<Delivery>
        {
            new()
            {
                Id = "del-bd-1",
                CustomerName = "Sr. Pablo",
                Status = DeliveryStatus.Vigente,
                SourceType = "bodega",
                BrandKey = "enerhuevo",
                BrandName = "Enerhuevo",
                BoxesCount = 40,
                TotalGrams = 980_000
            }
        };

        var inv = DeliveryCalculator.CalculateBrandInventory(shipments, deliveries, []);
        var stock = DeliveryCalculator.ValidateBodegaSaleStock(inv, "Enerhuevo", 60);
        Assert.Equal(60, stock.BoxesAvailable);
        Assert.Equal(1_470_000L, stock.GramsAvailable);
        Assert.Throws<InvalidOperationException>(() => DeliveryCalculator.ValidateBodegaSaleStock(inv, "Enerhuevo", 61));

        deliveries[0].Status = DeliveryStatus.Cancelada;
        var restored = DeliveryCalculator.CalculateBrandInventory(shipments, deliveries, []);
        Assert.Equal(100, restored[0].BoxesAvailable);
    }

    private sealed class NoOpPublisher : IRealtimeAlertPublisher
    {
        public Task PublishEventAsync(string eventName, object payload, CancellationToken ct = default)
            => Task.CompletedTask;
    }
}
