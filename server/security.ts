import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../shared/domain.ts';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env if present (file is excluded from Git via .gitignore)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const TEST_ONLY_JWT = 'test_only_jwt_secret_key_32_chars_minimum_isolated';
const TEST_ONLY_AES = crypto.createHash('sha256').update('test_only_aes_key_isolated').digest();

// Precomputed SHA-256 digests of forbidden legacy demo passwords (never stored in plaintext)
const FORBIDDEN_DEMO_PASSWORD_DIGESTS = new Set([
  '24a868f718f3416f4e57bedce790aed35a3bf4566fa1a5e29cace4d147f05121',
  '7ca6cfb95ecfc7a5ffe9eab6bb891a1061480763e5b247cb4257e2e84bb63769',
]);

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

function isPlaceholderValue(val: string): boolean {
  const upper = val.toUpperCase();
  return (
    upper.includes('REPLACE_WITH') ||
    upper.includes('MY_') ||
    upper.includes('CHANGE_ME') ||
    upper.includes('CHANGEME') ||
    /^([a-zA-Z0-9])\1+$/.test(val)
  );
}

function readRawJwtSecret(): string | undefined {
  return (process.env.JWT_SECRET ?? process.env.JWT_SECRETO)?.trim();
}

function readRawAesKey(): string | undefined {
  return (process.env.AES_ENCRYPTION_KEY ?? process.env.CLAVE_DE_CIFRADO_AES)?.trim();
}

function isValidJwtSecretFormat(val: string | undefined): val is string {
  return Boolean(val && val.length >= 32 && val.length <= 512 && !isPlaceholderValue(val));
}

function isValidAesKeyFormat(val: string | undefined): val is string {
  if (!val || isPlaceholderValue(val)) return false;
  return /^[0-9a-fA-F]{64}$/.test(val) || (val.length >= 32 && val.length <= 256);
}

function getJwtSecret(): string {
  const envSecret = readRawJwtSecret();
  if (isValidJwtSecretFormat(envSecret)) {
    return envSecret;
  }
  if (isTestEnv()) {
    return TEST_ONLY_JWT;
  }
  throw new Error('FATAL: JWT_SECRET inválida o no configurada.');
}

function getAesKey(): Buffer {
  const envKey = readRawAesKey();
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey) && !isPlaceholderValue(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (isValidAesKeyFormat(envKey)) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  if (isTestEnv()) {
    return TEST_ONLY_AES;
  }
  throw new Error('FATAL: AES_ENCRYPTION_KEY inválida o no configurada.');
}

export function validateSecurityKeys(): void {
  const isTest = isTestEnv();
  let jwtSecret = readRawJwtSecret();
  let aesKey = readRawAesKey();

  // In local non-production dev only, auto-create git-ignored .env if completely absent
  if (!jwtSecret && !aesKey && !isTest && process.env.NODE_ENV !== 'production') {
    const envFile = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envFile)) {
      const generatedJwt = crypto.randomBytes(32).toString('hex');
      const generatedAes = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(
        envFile,
        `# Claves de seguridad locales (Excluidas de Git mediante .gitignore)\nJWT_SECRET="${generatedJwt}"\nAES_ENCRYPTION_KEY="${generatedAes}"\nSQLITE_DB_PATH="data/directodegranja.db"\n`,
        { encoding: 'utf8', mode: 0o600 }
      );
      process.env.JWT_SECRET = generatedJwt;
      process.env.AES_ENCRYPTION_KEY = generatedAes;
      jwtSecret = generatedJwt;
      aesKey = generatedAes;
    }
  }

  if (!isValidJwtSecretFormat(jwtSecret)) {
    if (isTest) {
      process.env.JWT_SECRET = TEST_ONLY_JWT;
    } else {
      console.error(
        'FATAL: JWT_SECRET (o JWT_SECRETO) falta, es placeholder o es menor a 32 caracteres. Deteniendo arranque.'
      );
      process.exit(1);
    }
  }

  if (!isValidAesKeyFormat(aesKey)) {
    if (isTest) {
      process.env.AES_ENCRYPTION_KEY = TEST_ONLY_AES.toString('hex');
    } else {
      console.error(
        'FATAL: AES_ENCRYPTION_KEY (o CLAVE_DE_CIFRADO_AES) falta, es placeholder o no tiene formato válido (64 hex o 32+ chars). Deteniendo arranque.'
      );
      process.exit(1);
    }
  }
}

export function isForbiddenDemoPassword(plain: string): boolean {
  if (!plain) return false;
  const digest = crypto.createHash('sha256').update(plain).digest('hex');
  return FORBIDDEN_DEMO_PASSWORD_DIGESTS.has(digest);
}

const LEGACY_DEMO_PASSWORDS_B64 = ['R3JhbmphMjAyNiE=', 'VmVuZGVkb3IyMDI2IQ=='];

export function isLegacyDemoPasswordHash(passwordHash: string | undefined): boolean {
  if (!passwordHash) return false;
  return LEGACY_DEMO_PASSWORDS_B64.some((b64) =>
    verifyPassword(Buffer.from(b64, 'base64').toString('utf8'), passwordHash)
  );
}

export function encryptField(val: string): string {
  if (!val) return '';
  if (val.startsWith('enc:')) return val;
  return 'enc:' + encryptSensitive(val);
}

export function decryptField(val: string): string {
  if (!val) return '';
  if (val.startsWith('enc:')) {
    try {
      return decryptSensitive(val.slice(4));
    } catch {
      return '[DATO CIFRADO NO LEGIBLE]';
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
  deviceId?: string;
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
 * Cifrado autenticado AES-256-GCM para datos sensibles (teléfonos, domicilios, contactos, notas).
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
  if (!token || token.length > 4096) {
    res.status(401).json({ error: 'Token JWT inválido.' });
    return;
  }
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

export function isValidEmail(email: string): boolean {
  return email.length >= 5 && email.length <= 140 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function isValidEntityId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9._:-]{1,80}$/.test(id);
}

export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const parsed = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === ymd;
}

export function isValidIsoUtc(iso: string): boolean {
  if (!iso || iso.length > 40) return false;
  const ms = Date.parse(iso);
  return !Number.isNaN(ms);
}

export function isValidFolioSeries(series: string): boolean {
  return /^[A-Z]{1,4}$/.test(series);
}

export function isLocalHostOrIp(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const hostname = hostHeader.split(':')[0].toLowerCase().trim();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function isAllowedOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined
): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (hostHeader && parsed.host.toLowerCase() === hostHeader.toLowerCase()) {
      return true;
    }
    if (isLocalHostOrIp(parsed.hostname)) {
      return true;
    }
    const allowedRaw = (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowedRaw.includes(parsed.origin.toLowerCase())) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
