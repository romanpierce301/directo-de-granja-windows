import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../shared/domain.ts';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// Deterministic fallback for local dev/preview when env var is not injected
const DEV_EPHEMERAL_JWT = 'fixed_dev_fallback_jwt_secret_key_32_chars_minimum';
const DEV_EPHEMERAL_AES = crypto.createHash('sha256').update('fixed_dev_fallback_aes_key_for_directo_de_granja').digest();

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

export function validateSecurityKeys(): void {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  let jwtSecret = process.env.JWT_SECRET?.trim();
  let aesKey = process.env.AES_ENCRYPTION_KEY?.trim();

  // If missing in dev and .env does not exist, initialize local .env (git-ignored)
  if ((!jwtSecret || !aesKey) && !isTest && process.env.NODE_ENV !== 'production') {
    const envFile = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envFile)) {
      const generatedJwt = crypto.randomBytes(32).toString('hex');
      const generatedAes = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(
        envFile,
        `# Claves de seguridad locales (Excluidas de Git mediante .gitignore)\nJWT_SECRET="${generatedJwt}"\nAES_ENCRYPTION_KEY="${generatedAes}"\nSQLITE_DB_PATH="data/directodegranja.db"\n`,
        'utf8'
      );
      process.env.JWT_SECRET = generatedJwt;
      process.env.AES_ENCRYPTION_KEY = generatedAes;
      jwtSecret = generatedJwt;
      aesKey = generatedAes;
    }
  }

  if (!jwtSecret || jwtSecret.length < 32) {
    if (isTest) {
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_32_characters_minimum_required';
    } else {
      console.error('FATAL: JWT_SECRET no está configurada o es menor a 32 caracteres. Deteniendo arranque.');
      process.exit(1);
    }
  }

  if (!aesKey || (aesKey.length < 32 && !/^[0-9a-fA-F]{64}$/.test(aesKey))) {
    if (isTest) {
      process.env.AES_ENCRYPTION_KEY = process.env.AES_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    } else {
      console.error('FATAL: AES_ENCRYPTION_KEY no está configurada o no tiene formato válido (64 hex / 32+ chars). Deteniendo arranque.');
      process.exit(1);
    }
  }
}

export function encryptField(val: string): string {
  if (!val) return '';
  if (val.startsWith('enc:')) return val;
  try {
    return 'enc:' + encryptSensitive(val);
  } catch {
    return val;
  }
}

export function decryptField(val: string): string {
  if (!val) return '';
  if (val.startsWith('enc:')) {
    try {
      return decryptSensitive(val.slice(4));
    } catch {
      return val;
    }
  }
  return val;
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

const MAX_PROFILE_IMAGE_DATA_URL_LEN = 1_800_000;
const RASTER_DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

export function sanitizeProfileImageDataUrl(
  input: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== 'string') {
    return { ok: false, error: 'La imagen de perfil debe ser una cadena de texto válida.' };
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, value: '' };
  }
  if (trimmed.length > MAX_PROFILE_IMAGE_DATA_URL_LEN) {
    return { ok: false, error: 'La imagen seleccionada excede el tamaño máximo permitido (1.2 MB).' };
  }
  if (!RASTER_DATA_URL_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'Solo se permiten imágenes PNG, JPG o WEBP codificadas en base64.',
    };
  }
  return { ok: true, value: trimmed };
}
