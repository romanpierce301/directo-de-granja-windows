using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

string jwtKey = builder.Configuration["Jwt:SigningKey"]
    ?? throw new InvalidOperationException("Falta configurar Jwt:SigningKey.");
if (jwtKey.Length < 32)
    throw new InvalidOperationException("Jwt:SigningKey debe tener al menos 32 caracteres aleatorios.");

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

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(opts =>
{
    opts.AddFixedWindowLimiter("SyncRateLimit", o =>
    {
        o.Window = TimeSpan.FromMinutes(1);
        o.PermitLimit = 120;
        o.QueueLimit = 0;
    });
});

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health");
app.MapReverseProxy();
app.Run();
