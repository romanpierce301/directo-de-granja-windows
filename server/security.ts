import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../shared/domain.ts';

// Ephemeral CSPRNG fallback for local dev/preview when env var is not injected
const DEV_EPHEMERAL_JWT = crypto.randomBytes(32).toString('hex');
const DEV_EPHEMERAL_AES = crypto.randomBytes(32);

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  return DEV_EPHEMERAL_JWT;
}

function getAesKey(): Buffer {
  const envKey = process.env.AES_ENCRYPTION_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (envKey && envKey.length >= 32) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  return DEV_EPHEMERAL_AES;
}

export interface JwtClaims {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  folioSeries: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtClaims;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function signJwt(claims: JwtClaims): string {
  return jwt.sign(claims, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '8h',
    issuer: 'huevocontrol-api',
    audience: 'huevocontrol-clients',
  });
}

export function verifyJwt(token: string): JwtClaims {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: 'huevocontrol-api',
    audience: 'huevocontrol-clients',
  }) as JwtClaims;
}

/**
 * Cifrado autenticado AES-256-GCM para datos sensibles (teléfonos, credenciales o secretos en almacenamiento).
 */
export function encryptSensitive(plaintext: string): string {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitive(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de texto cifrado inválido.');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = getAesKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token JWT requerido.' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    req.user = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada o token inválido.' });
  }
}

export function requireRole(...allowed: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        error: 'Acceso denegado: permisos insuficientes para esta operación.',
      });
      return;
    }
    next();
  };
}

export function sanitizePlainText(input: unknown, maxLen = 240): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen);
}
