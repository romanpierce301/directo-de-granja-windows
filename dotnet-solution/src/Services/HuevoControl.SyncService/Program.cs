using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using HuevoControl.Application.Abstractions;
using HuevoControl.Application.Services;
using HuevoControl.Infrastructure.Caching;
using HuevoControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

string sqlConn = builder.Configuration.GetConnectionString("SqlServer")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:SqlServer.");
string redisConn = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
string jwtKey = builder.Configuration["Jwt:SigningKey"]
    ?? throw new InvalidOperationException("Falta Jwt:SigningKey.");
if (jwtKey.Length < 32)
    throw new InvalidOperationException("Jwt:SigningKey debe tener al menos 32 caracteres aleatorios.");

builder.Services.AddDbContext<HuevoControlSqlServerDbContext>(o => o.UseSqlServer(sqlConn));
builder.Services.AddScoped<IHuevoControlDbContext>(sp => sp.GetRequiredService<HuevoControlSqlServerDbContext>());

builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConn));
builder.Services.AddSingleton<IRedisCacheService, RedisCacheService>();

builder.Services.AddSignalR().AddStackExchangeRedis(redisConn);
builder.Services.AddScoped<IRealtimeAlertPublisher, SignalRAlertPublisher>();
builder.Services.AddScoped<SyncProcessorService>();

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
builder.Services.AddAuthorization(options => options.AddPolicy("RequireVendedor", policy => policy.RequireRole("vendedor")));
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("SyncRateLimit", limiter =>
{
    limiter.Window = TimeSpan.FromMinutes(1);
    limiter.PermitLimit = 120;
    limiter.QueueLimit = 0;
}));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/api/sync/push", async (
    SyncPushRequest req,
    ClaimsPrincipal user,
    SyncProcessorService processor,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.DeviceId) || req.DeviceId.Length > 100 || req.Deliveries is null || req.Deliveries.Count > 500)
        return Results.BadRequest("Dispositivo o lote de sincronización inválido.");
    string? vendorId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrEmpty(vendorId)) return Results.Unauthorized();
    var result = await processor.ProcessAndroidPushAsync(vendorId, req, ct);
    return Results.Ok(result);
}).RequireAuthorization("RequireVendedor").RequireRateLimiting("SyncRateLimit");

app.MapGet("/api/sync/pull", async (
    IHuevoControlDbContext db,
    IRedisCacheService cache,
    CancellationToken ct) =>
{
    var cachedPrice = await cache.GetAsync<object>("daily_price:latest", ct);
    var price = cachedPrice ?? await db.DailyPrices.AsNoTracking()
        .OrderByDescending(p => p.CreatedAtUtc)
        .FirstOrDefaultAsync(ct);

    var customers = await db.Customers.AsNoTracking()
        .Where(c => c.Active && c.MergedIntoCustomerId == null)
        .ToListAsync(ct);

    return Results.Ok(new { serverTimeUtc = DateTime.UtcNow, dailyPrice = price, customers });
}).RequireAuthorization();

app.MapHub<RealtimeSyncHub>("/hubs/sync").RequireAuthorization();
app.Run();

public sealed class RealtimeSyncHub : Hub { }

public sealed class SignalRAlertPublisher : IRealtimeAlertPublisher
{
    private readonly IHubContext<RealtimeSyncHub> _hub;
    public SignalRAlertPublisher(IHubContext<RealtimeSyncHub> hub) => _hub = hub;
    public Task PublishEventAsync(string eventName, object payload, CancellationToken ct = default)
        => _hub.Clients.All.SendAsync(eventName, payload, ct);
}
