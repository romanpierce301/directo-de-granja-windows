using System.Text;
using HuevoControl.Application.Abstractions;
using HuevoControl.Domain.Entities;
using HuevoControl.Domain.Rules;
using HuevoControl.Infrastructure.Caching;
using HuevoControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

string dbProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
string sqliteConn = builder.Configuration.GetConnectionString("Sqlite")
    ?? "Data Source=data/directodegranja.db";
string? sqlConn = builder.Configuration.GetConnectionString("SqlServer");
string redisConn = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
string jwtKey = builder.Configuration["Jwt:SigningKey"]
    ?? throw new InvalidOperationException("Falta Jwt:SigningKey.");

builder.Services.AddDbContext<HuevoControlSqlServerDbContext>(o =>
{
    if (string.Equals(dbProvider, "SqlServer", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(sqlConn))
    {
        o.UseSqlServer(sqlConn);
    }
    else
    {
        o.UseSqlite(sqliteConn);
    }
});
builder.Services.AddScoped<IHuevoControlDbContext>(sp => sp.GetRequiredService<HuevoControlSqlServerDbContext>());
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConn));
builder.Services.AddSingleton<IRedisCacheService, RedisCacheService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "huevocontrol-api",
            ValidAudience = "huevocontrol-clients",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });
builder.Services.AddAuthorization(o => o.AddPolicy("RequireDueno", p => p.RequireRole("dueno")));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
Directory.CreateDirectory(Path.Combine(AppContext.BaseDirectory, "data"));
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<HuevoControlSqlServerDbContext>();
    db.Database.EnsureCreated();
}
app.UseSwagger();
app.UseSwaggerUI();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/ledger/deliveries", async (IHuevoControlDbContext db, CancellationToken ct) =>
{
    var list = await db.Deliveries.AsNoTracking()
        .Include(d => d.Boxes)
        .OrderByDescending(d => d.CreatedAtUtc)
        .Take(200)
        .ToListAsync(ct);
    return Results.Ok(list);
}).RequireAuthorization("RequireDueno");

app.MapPost("/api/ledger/prices", async (
    PublishPriceDto dto,
    IHuevoControlDbContext db,
    IRedisCacheService cache,
    CancellationToken ct) =>
{
    if (dto.PriceCentavosPerKg <= 0) return Results.BadRequest("Precio inválido.");
    var price = new DailyPrice
    {
        Id = Guid.NewGuid().ToString("N"),
        DateYmd = dto.DateYmd,
        PriceCentavosPerKg = dto.PriceCentavosPerKg,
        PublishedByUserId = dto.OwnerId,
        PublishedByName = dto.OwnerName,
        Origin = PriceOrigin.Dueno,
        ReviewedByOwner = true
    };
    db.DailyPrices.Add(price);
    await db.SaveChangesAsync(ct);
    await cache.SetAsync("daily_price:latest", price, TimeSpan.FromHours(12), ct);
    return Results.Created($"/api/ledger/prices/{price.Id}", price);
}).RequireAuthorization("RequireDueno");

app.MapPost("/api/ledger/closings", async (
    CreateClosingDto dto,
    IHuevoControlDbContext db,
    CancellationToken ct) =>
{
    var deliveries = await db.Deliveries.AsNoTracking().Where(d => d.VendorId == dto.VendorId).ToListAsync(ct);
    var payments = await db.Payments.AsNoTracking().Where(p => p.VendorId == dto.VendorId).ToListAsync(ct);
    var losses = await db.DailyLosses.AsNoTracking().Where(l => l.VendorId == dto.VendorId).ToListAsync(ct);
    var incidents = await db.MoneyIncidents.AsNoTracking().Where(i => i.VendorId == dto.VendorId).ToListAsync(ct);

    var calc = DeliveryCalculator.CalculateClosing(deliveries, payments, losses, incidents, dto.ActualCashHandedInCentavos);
    var closing = new CashClosing
    {
        Id = Guid.NewGuid().ToString("N"),
        VendorId = dto.VendorId,
        VendorName = dto.VendorName,
        DateYmd = dto.DateYmd,
        SoldCentavos = calc.SoldCentavos,
        CashCollectedCentavos = calc.CashCollectedCentavos,
        TransferVerifiedCentavos = calc.TransferVerifiedCentavos,
        TransferPendingCentavos = calc.TransferPendingCentavos,
        DailyLossGrams = calc.DailyLossGrams,
        IncidentsCentavos = calc.IncidentsCentavos,
        ExpectedCashToDeliverCentavos = calc.ExpectedCashToDeliverCentavos,
        ActualCashHandedInCentavos = calc.ActualCashHandedInCentavos,
        UnexplainedDifferenceCentavos = calc.UnexplainedDifferenceCentavos,
        ClosedByUserId = dto.OwnerId
    };
    db.CashClosings.Add(closing);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/ledger/closings/{closing.Id}", closing);
}).RequireAuthorization("RequireDueno");

app.Run();

public sealed record PublishPriceDto(string DateYmd, long PriceCentavosPerKg, string OwnerId, string OwnerName);
public sealed record CreateClosingDto(string VendorId, string VendorName, string DateYmd, long ActualCashHandedInCentavos, string OwnerId);
