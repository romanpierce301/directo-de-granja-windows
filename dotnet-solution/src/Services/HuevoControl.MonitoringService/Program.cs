using HuevoControl.Domain.Entities;
using HuevoControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

string dbProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
string sqliteConn = builder.Configuration.GetConnectionString("Sqlite")
    ?? "Data Source=data/directodegranja.db";
string? sqlConn = builder.Configuration.GetConnectionString("SqlServer");
string redisConn = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";

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
builder.Services.AddHealthChecks()
    .AddCheck<PrimaryDatabaseHealthCheck>("sqlite")
    .AddRedis(redisConn, name: "redis");

builder.Services.AddSignalR();
builder.Services.AddHostedService<ProactiveAlertsWorker>();
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
app.MapHealthChecks("/api/monitoring/health");
app.MapHub<AlertsHub>("/hubs/alerts");
app.Run();

public sealed class PrimaryDatabaseHealthCheck : IHealthCheck
{
    private readonly IServiceScopeFactory _scopeFactory;
    public PrimaryDatabaseHealthCheck(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<HuevoControlSqlServerDbContext>();
        bool ok = await db.Database.CanConnectAsync(cancellationToken);
        return ok ? HealthCheckResult.Healthy("SQLite conectado.") : HealthCheckResult.Unhealthy("Sin conexión a SQLite.");
    }
}

public sealed class AlertsHub : Hub { }

public sealed class ProactiveAlertsWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<AlertsHub> _hub;

    public ProactiveAlertsWorker(IServiceScopeFactory scopeFactory, IHubContext<AlertsHub> hub)
    {
        _scopeFactory = scopeFactory;
        _hub = hub;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<HuevoControlSqlServerDbContext>();

            int pendingTransfers = await db.Payments.AsNoTracking()
                .CountAsync(p => p.Method == PaymentMethod.Transferencia && p.Status == PaymentStatus.PorVerificar, stoppingToken);
            int openIncidents = await db.MoneyIncidents.AsNoTracking()
                .CountAsync(i => i.Status == IncidentStatus.Reportado, stoppingToken);

            if (pendingTransfers > 0 || openIncidents > 0)
            {
                await _hub.Clients.All.SendAsync("alert:proactive", new
                {
                    pendingTransfers,
                    openIncidents,
                    timestampUtc = DateTime.UtcNow
                }, stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }
}
