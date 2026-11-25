using System.Text;
using System.Threading.RateLimiting;
using HuevoControl.Application.Abstractions;
using HuevoControl.Domain.Entities;
using HuevoControl.Infrastructure.Persistence;
using HuevoControl.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

string sqlConn = builder.Configuration.GetConnectionString("SqlServer")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:SqlServer.");
string jwtKey = builder.Configuration["Jwt:SigningKey"]
    ?? throw new InvalidOperationException("Falta Jwt:SigningKey.");
string aesKey = builder.Configuration["Security:AesKey"]
    ?? throw new InvalidOperationException("Falta Security:AesKey.");
if (jwtKey.Length < 32 || aesKey.Length < 32)
    throw new InvalidOperationException("Jwt:SigningKey y Security:AesKey deben tener al menos 32 caracteres aleatorios.");

builder.Services.AddDbContext<HuevoControlSqlServerDbContext>(o => o.UseSqlServer(sqlConn));
builder.Services.AddScoped<IHuevoControlDbContext>(sp => sp.GetRequiredService<HuevoControlSqlServerDbContext>());
builder.Services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddSingleton<IAesEncryptionService>(_ => new Aes256EncryptionService(aesKey));
builder.Services.AddSingleton<IJwtTokenService>(_ => new JwtTokenService(jwtKey));

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

builder.Services.AddAuthorization(opts =>
{
    opts.AddPolicy("RequireDueno", p => p.RequireRole("dueno"));
});
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("LoginRateLimit", limiter =>
{
    limiter.Window = TimeSpan.FromMinutes(1);
    limiter.PermitLimit = 30;
    limiter.QueueLimit = 0;
}));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "HuevoControl AuthService", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Token JWT Bearer",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/api/auth/login", async (
    LoginDto req,
    IHuevoControlDbContext db,
    IPasswordHasher hasher,
    IJwtTokenService jwt) =>
{
    var user = await db.Users.AsNoTracking()
        .FirstOrDefaultAsync(u => u.GoogleEmail == req.Email.ToLowerInvariant());

    if (user is null || !hasher.Verify(req.Password, user.PasswordHash))
        return Results.Unauthorized();

    if (user.Status != UserStatus.Activa)
        return Results.Forbid();

    return Results.Ok(new { token = jwt.GenerateToken(user), user.Id, user.Name, user.Role, user.FolioSeries });
}).RequireRateLimiting("LoginRateLimit");

app.MapPost("/api/auth/users", async (
    CreateUserDto req,
    IHuevoControlDbContext db,
    IPasswordHasher hasher,
    IAesEncryptionService aes) =>
{
    if (await db.Users.AnyAsync(u => u.GoogleEmail == req.Email.ToLowerInvariant()))
        return Results.Conflict("Correo ya registrado.");

    var user = new UserAccount
    {
        Id = Guid.NewGuid().ToString("N"),
        GoogleEmail = req.Email.ToLowerInvariant(),
        Name = req.Name,
        Role = req.Role,
        Status = UserStatus.Activa,
        FolioSeries = req.FolioSeries,
        PasswordHash = hasher.Hash(req.Password),
        EncryptedPhone = string.IsNullOrWhiteSpace(req.Phone) ? null : aes.Encrypt(req.Phone)
    };
    db.Users.Add(user);
    await db.SaveChangesAsync();
    return Results.Created($"/api/auth/users/{user.Id}", new { user.Id, user.Name, user.Role, user.FolioSeries });
}).RequireAuthorization("RequireDueno");

app.Run();

public sealed record LoginDto(string Email, string Password);
public sealed record CreateUserDto(string Name, string Email, string Password, UserRole Role, string? FolioSeries, string? Phone);
