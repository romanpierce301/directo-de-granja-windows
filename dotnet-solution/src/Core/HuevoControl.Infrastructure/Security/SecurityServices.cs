using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using HuevoControl.Application.Abstractions;
using HuevoControl.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace HuevoControl.Infrastructure.Security;

public sealed class Aes256EncryptionService : IAesEncryptionService
{
    private readonly byte[] _key;

    public Aes256EncryptionService(string base64OrHexKey)
    {
        if (string.IsNullOrWhiteSpace(base64OrHexKey))
            throw new ArgumentException("Se requiere clave AES-256.", nameof(base64OrHexKey));

        _key = SHA256.HashData(Encoding.UTF8.GetBytes(base64OrHexKey));
    }

    public string Encrypt(string plaintext)
    {
        byte[] nonce = RandomNumberGenerator.GetBytes(12);
        byte[] plainBytes = Encoding.UTF8.GetBytes(plaintext);
        byte[] cipherBytes = new byte[plainBytes.Length];
        byte[] tag = new byte[16];

        using var aes = new AesGcm(_key, 16);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        return $"{Convert.ToHexString(nonce)}:{Convert.ToHexString(tag)}:{Convert.ToHexString(cipherBytes)}";
    }

    public string Decrypt(string cipherPayload)
    {
        string[] parts = cipherPayload.Split(':');
        if (parts.Length != 3)
            throw new FormatException("Formato AES-GCM inválido.");

        byte[] nonce = Convert.FromHexString(parts[0]);
        byte[] tag = Convert.FromHexString(parts[1]);
        byte[] cipherBytes = Convert.FromHexString(parts[2]);
        byte[] plainBytes = new byte[cipherBytes.Length];

        using var aes = new AesGcm(_key, 16);
        aes.Decrypt(nonce, cipherBytes, tag, plainBytes);
        return Encoding.UTF8.GetString(plainBytes);
    }
}

public sealed class BcryptPasswordHasher : IPasswordHasher
{
    public string Hash(string plainPassword) => BCrypt.Net.BCrypt.HashPassword(plainPassword, workFactor: 12);
    public bool Verify(string plainPassword, string storedHash) => BCrypt.Net.BCrypt.Verify(plainPassword, storedHash);
}

public sealed class JwtTokenService : IJwtTokenService
{
    private readonly string _signingKey;
    private readonly string _issuer;
    private readonly string _audience;

    public JwtTokenService(string signingKey, string issuer = "huevocontrol-api", string audience = "huevocontrol-clients")
    {
        if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
            throw new ArgumentException("La clave JWT debe tener al menos 32 caracteres.", nameof(signingKey));
        _signingKey = signingKey;
        _issuer = issuer;
        _audience = audience;
    }

    public string GenerateToken(UserAccount user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_signingKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.GoogleEmail),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role == UserRole.Dueno ? "dueno" : "vendedor"),
            new("folio_series", user.FolioSeries ?? string.Empty)
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
