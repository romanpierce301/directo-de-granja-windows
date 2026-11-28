import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import {
  calculateBrandInventory,
  calculateCustomerLedger,
  calculateDeliveryTotals,
  calculateSugarLineSubtotalCentavos,
  calculateVendorClosing,
  deductCartonTareFromPerBoxWeights,
  deductCartonTareWithModalities,
  formatCurrencyFromCentavos,
  formatFolio,
  formatKgFromGrams,
  getMexicoCityYmd,
  isValidHalfUnitCount,
  normalizeBrandName,
  normalizeCustomerName,
  normalizePhone,
  normalizeProductKey,
  roundHalfUnits,
  sanitizeImportedCell,
  splitTotalGramsIntoBoxes,
  splitTotalGramsIntoHalfAwareBoxes,
  validateBodegaSaleStock,
  validatePaymentAmount,
  type BodegaProductType,
  type BodegaSaleItem,
  type Customer,
  type Delivery,
  type DeliveryBox,
  type HalfBoxWeighType,
  type Payment,
  type WarehouseShipment,
  type WarehouseShipmentLine,
} from './shared/domain.ts';
import {
  hashPassword,
  isAllowedOrigin,
  isForbiddenDemoPassword,
  isLocalHostOrIp,
  isValidEmail,
  isValidEntityId,
  isValidFolioSeries,
  isValidIsoUtc,
  isValidYmd,
  requireAuth as baseRequireAuth,
  requireRole,
  sanitizePlainText,
  sanitizeProfileImageDataUrl,
  signJwt,
  verifyJwt,
  verifyPassword,
  validateSecurityKeys,
  type AuthenticatedRequest,
} from './server/security.ts';
import { store } from './server/store.ts';
import { swaggerSpec } from './server/swagger.ts';

const PORT = Number(process.env.PORT) || 3000;

function getLanUrls(port: number): string[] {
  const urls: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const item of list) {
      if (item.family === 'IPv4' && !item.internal) {
        urls.push(`http://${item.address}:${port}`);
      }
    }
  }
  return urls;
}

export function requireAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction): void {
  baseRequireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }
    const db = store.getDb();
    const user = db.users.find((u) => u.id === req.user!.sub);
    if (!user || user.status !== 'activa') {
      res.status(403).json({ error: 'Cuenta inactiva, bloqueada o revocada.' });
      return;
    }

    // Verificar que el dispositivo del vendedor no haya sido revocado en cada solicitud protegida
    if (user.role === 'vendedor' && req.path !== '/api/devices/register') {
      const candidateDeviceId = sanitizePlainText(
        req.user.deviceId ??
          req.headers['x-device-id'] ??
          req.query?.deviceId ??
          req.body?.deviceId,
        80
      );
      const vendorDevices = db.devices.filter((d) => d.userId === user.id);
      if (candidateDeviceId) {
        const matched = vendorDevices.find((d) => d.id === candidateDeviceId);
        if (!matched || !matched.active) {
          res.status(403).json({
            error: 'Dispositivo revocado o pendiente de autorización por el dueño.',
          });
          return;
        }
      } else if (vendorDevices.length > 0 && !vendorDevices.some((d) => d.active)) {
        res.status(403).json({
          error: 'Todos los dispositivos de esta cuenta han sido revocados o bloqueados.',
        });
        return;
      }
    }

    next();
  });
}

export async function startBackendServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  validateSecurityKeys();
  const app = express();
  const httpServer = http.createServer(app);
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    app.set('trust proxy', 1);

    // Exigir HTTPS fuera de la red local en producción
    app.use((req, res, next) => {
      if (process.env.ALLOW_INSECURE_HTTP === 'true') {
        next();
        return;
      }
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      if (!isHttps && !isLocalHostOrIp(req.headers.host)) {
        if (req.path.startsWith('/api/')) {
          res.status(426).json({
            error: 'Se requiere conexión HTTPS segura fuera de la red local.',
          });
          return;
        }
        const host = req.headers.host;
        if (host) {
          res.redirect(301, `https://${host}${req.originalUrl}`);
          return;
        }
      }
      next();
    });

    // Restringir orígenes CORS en producción (sin wildcard *)
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && !isAllowedOrigin(origin, req.headers.host)) {
        res.status(403).json({ error: 'Origen no autorizado.' });
        return;
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });

    // Cabeceras web seguras + CSP compatible con la app en producción
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/docs')) {
        helmet({ contentSecurityPolicy: false })(req, res, next);
        return;
      }
      const localHttp =
        isLocalHostOrIp(req.headers.host) || process.env.ALLOW_INSECURE_HTTP === 'true';
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: localHttp ? null : [],
          },
        },
        ...(localHttp ? { strictTransportSecurity: false } : {}),
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      })(req, res, next);
    });
  } else {
    // Desarrollo / vista previa AI Studio (configuración separada compatible con iframe y Vite)
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        xFrameOptions: false,
      })
    );
  }

  app.use(express.json({ limit: '2mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones al servidor. Espere un momento.' },
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de autenticación. Espere un minuto.' },
  });

  const syncLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de peticiones de sincronización excedido.' },
  });

  // WebSocket server protegido igual que la API (límite 16 KB por mensaje)
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 16 * 1024,
  });
  const wsClients = new Set<{
    ws: WebSocket;
    userId: string;
    role: string;
    deviceId?: string;
    msgTimestamps: number[];
  }>();

  function closeUserSockets(userId: string, onlyDeviceId?: string, reason = 'Sesión o dispositivo revocado') {
    for (const c of wsClients) {
      if (c.userId !== userId) continue;
      if (onlyDeviceId && c.deviceId && c.deviceId !== onlyDeviceId) continue;
      try {
        c.ws.close(4003, reason);
      } catch {
        // Ignore close errors on terminating socket
      }
      wsClients.delete(c);
    }
  }

  wss.on('connection', (ws, req) => {
    try {
      if (isProduction) {
        if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
          ws.close(4003, 'Origen WebSocket no autorizado');
          return;
        }
        const isHttps =
          Boolean((req.socket as { encrypted?: boolean }).encrypted) ||
          req.headers['x-forwarded-proto'] === 'https';
        if (
          process.env.ALLOW_INSECURE_HTTP !== 'true' &&
          !isHttps &&
          !isLocalHostOrIp(req.headers.host)
        ) {
          ws.close(4003, 'Se requiere WSS seguro fuera de la red local');
          return;
        }
      }

      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const authHeader = req.headers.authorization;
      const bearerToken =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : '';
      const token = bearerToken || (url.searchParams.get('token') ?? '');
      if (!token || token.length > 4096) {
        ws.close(4001, 'Token JWT requerido');
        return;
      }

      const claims = verifyJwt(token);
      const db = store.getDb();
      const user = db.users.find((u) => u.id === claims.sub);
      if (!user || user.status !== 'activa') {
        ws.close(4003, 'Cuenta inactiva o bloqueada');
        return;
      }

      const deviceId = sanitizePlainText(
        claims.deviceId ?? url.searchParams.get('deviceId') ?? req.headers['x-device-id'],
        80
      );
      if (user.role === 'vendedor') {
        const vendorDevices = db.devices.filter((d) => d.userId === user.id);
        if (deviceId) {
          const matched = vendorDevices.find((d) => d.id === deviceId);
          if (!matched || !matched.active) {
            ws.close(4003, 'Dispositivo revocado o no autorizado');
            return;
          }
        } else if (vendorDevices.length > 0 && !vendorDevices.some((d) => d.active)) {
          ws.close(4003, 'Sin dispositivo activo autorizado');
          return;
        }
      }

      const client = {
        ws,
        userId: claims.sub,
        role: claims.role,
        deviceId: deviceId || undefined,
        msgTimestamps: [] as number[],
      };
      wsClients.add(client);

      ws.send(
        JSON.stringify({
          type: 'telemetry:connected',
          timestampUtc: new Date().toISOString(),
          activeClients: wsClients.size,
        })
      );

      // Limitar tamaño y frecuencia de mensajes entrantes WebSocket
      ws.on('message', (rawData) => {
        const byteLen = Buffer.isBuffer(rawData)
          ? rawData.byteLength
          : Buffer.byteLength(String(rawData), 'utf8');
        if (byteLen > 4096) {
          ws.close(1009, 'Mensaje WebSocket demasiado grande');
          wsClients.delete(client);
          return;
        }
        const now = Date.now();
        client.msgTimestamps = client.msgTimestamps.filter((ts) => now - ts < 10_000);
        client.msgTimestamps.push(now);
        if (client.msgTimestamps.length > 15) {
          ws.close(1008, 'Límite de frecuencia de mensajes WebSocket excedido');
          wsClients.delete(client);
          return;
        }
      });

      ws.on('close', () => {
        wsClients.delete(client);
      });
    } catch {
      ws.close(4003, 'Token JWT inválido');
    }
  });

  function broadcastEvent(type: string, payload: unknown, targetUserId?: string) {
    const db = store.getDb();
    const timestampUtc = new Date().toISOString();
    const ownerMsg = JSON.stringify({
      type,
      payload,
      timestampUtc,
    });
    const vendorSafeMsg = JSON.stringify({
      type,
      timestampUtc,
    });
    const ownerOnlyOrTargeted =
      type === 'closing:created' ||
      type === 'incident:updated' ||
      type === 'vendor:updated' ||
      type === 'device:authorized' ||
      type === 'alert:acknowledged';

    for (const c of wsClients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      const currentUser = db.users.find((u) => u.id === c.userId);
      if (!currentUser || currentUser.status !== 'activa') {
        try {
          c.ws.close(4003, 'Cuenta bloqueada o inactiva');
        } catch {
          // Ignore
        }
        wsClients.delete(c);
        continue;
      }
      if (c.role === 'dueno') {
        c.ws.send(ownerMsg);
      } else if (ownerOnlyOrTargeted) {
        if (targetUserId && c.userId === targetUserId) {
          c.ws.send(vendorSafeMsg);
        }
      } else {
        c.ws.send(vendorSafeMsg);
      }
    }
  }

  // Swagger API Documentation
  app.get('/api/swagger.json', (_req, res) => {
    res.json(swaggerSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Health & real-time telemetry endpoint
  app.get('/api/health', (_req, res) => {
    const db = store.getDb();
    const sqliteHealthy = store.pingSqlite();
    const storageInfo = store.getStorageInfo();
    res.status(sqliteHealthy ? 200 : 503).json({
      status: sqliteHealthy ? 'healthy' : 'degraded',
      service: 'Directo de Granja — Te faltan huevos a nosotros nos sobran',
      storageEngine: storageInfo.engine,
      storage: storageInfo,
      timestampUtc: new Date().toISOString(),
      activeWsClients: wsClients.size,
      lanUrls: getLanUrls(PORT),
      metrics: {
        deliveriesCount: db.deliveries.length,
        customersCount: db.customers.filter((c) => !c.mergedIntoCustomerId).length,
        vendorsCount: db.users.filter((u) => u.role === 'vendedor').length,
        pendingAlertsCount: store.computeProactiveAlerts().filter((a) => !a.acknowledged).length,
      },
    });
  });

  // Authentication status & bootstrap
  app.get('/api/auth/status', (_req, res) => {
    const db = store.getDb();
    const hasActiveOwner = db.users.some((u) => u.role === 'dueno' && u.status === 'activa');
    res.json({
      bootstrapped: hasActiveOwner,
      hasActiveOwner,
      userCount: db.users.length,
    });
  });

  app.post('/api/auth/bootstrap', authLimiter, (req, res) => {
    const db = store.getDb();
    const hasActiveOwner = db.users.some((u) => u.role === 'dueno' && u.status === 'activa');
    if (hasActiveOwner) {
      res.status(403).json({ error: 'El sistema ya cuenta con un dueño registrado.' });
      return;
    }
    const name = sanitizePlainText(req.body?.name, 100);
    const email = sanitizePlainText(req.body?.email, 140).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !isValidEmail(email) || password.length < 8 || password.length > 128) {
      res.status(400).json({
        error: 'Nombre, correo válido y contraseña (8 a 128 caracteres) son obligatorios.',
      });
      return;
    }
    if (isForbiddenDemoPassword(password)) {
      res.status(400).json({
        error: 'No se permite usar contraseñas de demostración conocidas. Elija una clave propia segura.',
      });
      return;
    }

    const ownerUser = {
      id: `usr-${crypto.randomUUID()}`,
      googleEmail: email,
      name,
      role: 'dueno' as const,
      status: 'activa' as const,
      folioSeries: null,
      createdAtUtc: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };
    db.users = db.users.filter(
      (u) =>
        !(u.status === 'bloqueada' && u.role === 'dueno')
    );
    db.users.push(ownerUser);
    store.addAudit(
      'users',
      ownerUser.id,
      'REGISTRAR_DUENO_INICIAL',
      `Dueño inicial registrado: ${name}`,
      ownerUser.id,
      name
    );
    store.persist();
    const token = signJwt({
      sub: ownerUser.id,
      email: ownerUser.googleEmail,
      name: ownerUser.name,
      role: ownerUser.role,
      folioSeries: ownerUser.folioSeries,
    });
    const { passwordHash: _ph, ...safe } = ownerUser;
    res.status(201).json({ token, user: safe });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const email = sanitizePlainText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const deviceId = sanitizePlainText(req.body?.deviceId, 80);

    if (!isValidEmail(email) || !password || password.length > 128) {
      res.status(400).json({ error: 'Correo válido y contraseña requeridos.' });
      return;
    }

    const user = store.getRawUsers().find((u) => u.googleEmail.toLowerCase() === email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    if (user.status === 'bloqueada') {
      res.status(403).json({
        error: 'Cuenta bloqueada por el dueño o por usar credenciales heredadas. Solicite al dueño restablecer su contraseña.',
      });
      return;
    }
    if (user.status === 'pendiente') {
      res.status(403).json({ error: 'Cuenta pendiente de aprobación del dueño.' });
      return;
    }

    const token = signJwt({
      sub: user.id,
      email: user.googleEmail,
      name: user.name,
      role: user.role,
      folioSeries: user.folioSeries,
      ...(deviceId ? { deviceId } : {}),
    });

    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  app.post('/api/auth/change-password', authLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'Contraseña actual y nueva contraseña (8 a 128 caracteres) requeridas.' });
      return;
    }
    if (isForbiddenDemoPassword(newPassword)) {
      res.status(400).json({ error: 'No se permiten contraseñas de demostración conocidas.' });
      return;
    }
    const db = store.getDb();
    const user = db.users.find((u) => u.id === req.user!.sub);
    if (!user || !user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    store.addAudit(
      'users',
      user.id,
      'CAMBIAR_CONTRASENA',
      `Contraseña actualizada por ${user.name}`,
      user.id,
      user.name
    );
    store.persist();
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = store.getRawUsers().find((u) => u.id === req.user!.sub);
    if (!user || user.status !== 'activa') {
      res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
      return;
    }
    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // Owner user creation with encrypted password hash
  app.get('/api/auth/users', requireAuth, requireRole('dueno'), (_req, res) => {
    const state = store.getState();
    res.json({ users: state.users, devices: state.devices });
  });

  app.post('/api/auth/users', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const name = sanitizePlainText(req.body?.name, 100);
    const email = sanitizePlainText(req.body?.email, 140).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'dueno' ? ('dueno' as const) : ('vendedor' as const);

    if (!name || !isValidEmail(email) || password.length < 8 || password.length > 128) {
      res.status(400).json({
        error: 'Nombre, correo válido y contraseña (8 a 128 caracteres) son obligatorios.',
      });
      return;
    }
    if (isForbiddenDemoPassword(password)) {
      res.status(400).json({
        error: 'No se permite asignar contraseñas de demostración conocidas.',
      });
      return;
    }

    const db = store.getDb();
    if (db.users.some((u) => u.googleEmail.toLowerCase() === email)) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
      return;
    }

    const series = role === 'vendedor' ? store.nextSeriesLetter() : null;
    const newUser = {
      id: `usr-${crypto.randomUUID()}`,
      googleEmail: email,
      name,
      role,
      status: 'activa' as const,
      folioSeries: series,
      createdAtUtc: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };
    db.users.push(newUser);
    if (series && !db.settings.nextFolioBySeries[series]) {
      db.settings.nextFolioBySeries[series] = 1;
    }
    store.addAudit(
      'users',
      newUser.id,
      'CREAR_USUARIO',
      `Cuenta creada (${role}) para ${name}${series ? ` con serie ${series}` : ''}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'users' });
    const { passwordHash: _ph, ...safe } = newUser;
    res.status(201).json({ user: safe });
  });

  app.post('/api/auth/users/:id/password', authLimiter, requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de usuario inválido.' });
      return;
    }
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const reactivate = Boolean(req.body?.reactivate);
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' });
      return;
    }
    if (isForbiddenDemoPassword(newPassword)) {
      res.status(400).json({ error: 'No se permiten contraseñas de demostración conocidas.' });
      return;
    }
    const db = store.getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    target.passwordHash = hashPassword(newPassword);
    if (reactivate && target.status === 'bloqueada') {
      target.status = 'activa';
    }
    store.addAudit(
      'users',
      target.id,
      'RESTABLECER_CONTRASENA',
      `Contraseña restablecida por el dueño para ${target.name}${reactivate ? ' (cuenta reactivada)' : ''}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    closeUserSockets(target.id, undefined, 'Credenciales actualizadas por el dueño');
    broadcastEvent('sync:state_updated', { entity: 'users' });
    res.json({ ok: true, status: target.status });
  });

  // Full dashboard state for Owner Windows app
  app.get('/api/dashboard/state', requireAuth, requireRole('dueno'), (_req, res) => {
    res.json(store.getState());
  });

  // Vendors management: Approve, Block, Authorize / Revoke single device
  app.post('/api/vendors/:id/approve', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de vendedor inválido.' });
      return;
    }
    const db = store.getDb();
    const vendor = db.users.find((u) => u.id === req.params.id && u.role === 'vendedor');
    if (!vendor) {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }

    const requestedSeries = sanitizePlainText(req.body?.folioSeries, 4).toUpperCase();
    if (requestedSeries && !isValidFolioSeries(requestedSeries)) {
      res.status(400).json({ error: 'La serie de folios debe contener entre 1 y 4 letras mayúsculas.' });
      return;
    }
    const series = vendor.folioSeries || requestedSeries || store.nextSeriesLetter();

    const seriesConflict = db.users.find(
      (u) => u.id !== vendor.id && u.folioSeries === series
    );
    if (seriesConflict) {
      res.status(409).json({ error: `La serie ${series} ya está asignada a ${seriesConflict.name}.` });
      return;
    }

    vendor.status = 'activa';
    vendor.folioSeries = series;
    if (!db.settings.nextFolioBySeries[series]) {
      db.settings.nextFolioBySeries[series] = 1;
    }

    // Activate most recent device for this vendor (1 active device rule)
    const vendorDevices = db.devices.filter((d) => d.userId === vendor.id);
    if (vendorDevices.length > 0) {
      vendorDevices.forEach((d, idx) => {
        d.active = idx === vendorDevices.length - 1;
      });
    }

    store.addAudit(
      'users',
      vendor.id,
      'APROBAR_VENDEDOR',
      `Vendedor ${vendor.name} aprobado con serie ${series}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('vendor:updated', { vendorId: vendor.id, status: 'activa', series });
    res.json({ ok: true, vendorId: vendor.id, series });
  });

  app.post('/api/vendors/:id/block', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de vendedor inválido.' });
      return;
    }
    const db = store.getDb();
    const vendor = db.users.find((u) => u.id === req.params.id && u.role === 'vendedor');
    if (!vendor) {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }

    vendor.status = 'bloqueada';
    // Deactivate active devices; historical records remain untouched
    db.devices.filter((d) => d.userId === vendor.id).forEach((d) => {
      d.active = false;
    });

    store.addAudit(
      'users',
      vendor.id,
      'BLOQUEAR_VENDEDOR',
      `Cuenta de ${vendor.name} bloqueada (registros conservados)`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    closeUserSockets(vendor.id, undefined, 'Cuenta bloqueada por el dueño');
    broadcastEvent('vendor:updated', { vendorId: vendor.id, status: 'bloqueada' });
    res.json({ ok: true });
  });

  app.post('/api/devices/register', syncLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const user = db.users.find((u) => u.id === req.user!.sub);
    if (!user || user.status !== 'activa') {
      res.status(403).json({ error: 'Cuenta inactiva o bloqueada por el dueño.' });
      return;
    }

    const deviceId = sanitizePlainText(req.body?.deviceId, 80);
    const deviceName = sanitizePlainText(req.body?.deviceName, 100) || 'Android';
    if (!isValidEntityId(deviceId)) {
      res.status(400).json({ error: 'El identificador del dispositivo es obligatorio y debe ser válido.' });
      return;
    }

    const nowUtc = new Date().toISOString();
    const existing = db.devices.find((d) => d.id === deviceId);
    if (existing) {
      if (existing.userId !== user.id) {
        res.status(403).json({ error: 'Este equipo está vinculado a otra cuenta de usuario.' });
        return;
      }
      existing.deviceName = deviceName;
      existing.lastSyncUtc = nowUtc;
      store.persist();
      broadcastEvent('sync:state_updated', { entity: 'devices', deviceId });
      res.json({ ok: true, device: existing });
      return;
    }

    const newDevice = {
      id: deviceId,
      userId: user.id,
      deviceName,
      active: false,
      lastSyncUtc: nowUtc,
      pendingSyncCount: 0,
    };
    db.devices.push(newDevice);
    store.addAudit(
      'devices',
      newDevice.id,
      'REGISTRAR_DISPOSITIVO',
      `Teléfono registrado para aprobación: ${deviceName} (${user.name})`,
      user.id,
      user.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'devices', deviceId });
    res.status(201).json({ ok: true, device: newDevice });
  });

  app.post('/api/devices/:id/authorize', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de dispositivo inválido.' });
      return;
    }
    const db = store.getDb();
    const target = db.devices.find((d) => d.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Dispositivo no encontrado.' });
      return;
    }

    // Rule: Only 1 active device per vendor account; close WebSockets on revoked devices
    const revokedIds: string[] = [];
    db.devices
      .filter((d) => d.userId === target.userId)
      .forEach((d) => {
        if (d.id !== target.id && d.active) {
          revokedIds.push(d.id);
        }
        d.active = d.id === target.id;
      });

    store.addAudit(
      'devices',
      target.id,
      'AUTORIZAR_DISPOSITIVO',
      `Equipo único autorizado: ${target.deviceName}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    for (const revId of revokedIds) {
      closeUserSockets(target.userId, revId, 'Dispositivo reemplazado por otro equipo autorizado');
    }
    broadcastEvent('device:authorized', { userId: target.userId, deviceId: target.id }, target.userId);
    broadcastEvent('sync:state_updated', { entity: 'devices' }, target.userId);
    res.json({ ok: true });
  });

  app.post('/api/devices/:id/revoke', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de dispositivo inválido.' });
      return;
    }
    const db = store.getDb();
    const target = db.devices.find((d) => d.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Dispositivo no encontrado.' });
      return;
    }
    target.active = false;
    store.addAudit(
      'devices',
      target.id,
      'REVOCAR_DISPOSITIVO',
      `Dispositivo revocado: ${target.deviceName}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    closeUserSockets(target.userId, target.id, 'Dispositivo revocado por el dueño');
    broadcastEvent('sync:state_updated', { entity: 'devices' }, target.userId);
    res.json({ ok: true });
  });

  // Daily Price
  app.post('/api/prices', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const pricePesos = Number(req.body?.pricePesosPerKg);
    const rawDate = sanitizePlainText(req.body?.dateYmd, 10);
    const dateYmd = rawDate || getMexicoCityYmd();

    if (!isValidYmd(dateYmd)) {
      res.status(400).json({ error: 'La fecha debe tener formato válido YYYY-MM-DD.' });
      return;
    }
    if (!Number.isFinite(pricePesos) || pricePesos <= 0 || pricePesos > 500) {
      res.status(400).json({ error: 'El precio por kilo debe ser mayor a $0.' });
      return;
    }
    const priceCentavosPerKg = Math.round(pricePesos * 100);
    const db = store.getDb();

    const record = {
      id: `prc-${crypto.randomUUID()}`,
      dateYmd,
      priceCentavosPerKg,
      publishedByUserId: req.user!.sub,
      publishedByName: req.user!.name,
      origin: 'dueno' as const,
      reviewedByOwner: true,
      createdAtUtc: new Date().toISOString(),
    };
    db.dailyPrices.unshift(record);
    store.addAudit(
      'daily_prices',
      record.id,
      'PUBLICAR_PRECIO',
      `Precio publicado: ${formatCurrencyFromCentavos(priceCentavosPerKg, true)}/kg para ${dateYmd}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('price:published', record);
    res.status(201).json({ price: record });
  });

  app.post('/api/prices/:id/review', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de precio inválido.' });
      return;
    }
    const db = store.getDb();
    const price = db.dailyPrices.find((p) => p.id === req.params.id);
    if (!price) {
      res.status(404).json({ error: 'Precio no encontrado.' });
      return;
    }
    price.reviewedByOwner = true;
    store.addAudit(
      'daily_prices',
      price.id,
      'REVISAR_PRECIO_VENDEDOR',
      `Precio manual de ${price.publishedByName} revisado (${formatCurrencyFromCentavos(price.priceCentavosPerKg, true)}/kg)`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'daily_prices' });
    res.json({ ok: true });
  });

  // Deliveries: Cancel with reason & Reprint log
  app.post('/api/deliveries/:id/cancel', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de entrega inválido.' });
      return;
    }
    const reason = sanitizePlainText(req.body?.reason, 200);
    if (reason.length < 4) {
      res.status(400).json({ error: 'El motivo de cancelación es obligatorio (mínimo 4 caracteres).' });
      return;
    }

    const db = store.getDb();
    const delivery = db.deliveries.find((d) => d.id === req.params.id);
    if (!delivery) {
      res.status(404).json({ error: 'Entrega no encontrada.' });
      return;
    }
    if (delivery.status === 'cancelada') {
      res.status(409).json({ error: 'La entrega ya se encuentra cancelada.' });
      return;
    }

    delivery.status = 'cancelada';
    delivery.cancellationReason = reason;
    const nowUtc = new Date().toISOString();

    db.deliveryEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      deliveryId: delivery.id,
      eventType: 'cancelacion',
      detail: `Cancelada por dueño. Motivo: ${reason}`,
      actorUserId: req.user!.sub,
      actorName: req.user!.name,
      deviceId: 'win-owner-desktop',
      occurredAtUtc: nowUtc,
      arrivedAtServerUtc: nowUtc,
    });
    store.addAudit(
      'deliveries',
      delivery.id,
      'CANCELAR_ENTREGA',
      `Folio ${delivery.folioFormatted} cancelado${delivery.brandName ? ` (inventario restaurado: ${delivery.boxesCount ?? 0} cajas de ${delivery.brandName})` : ''}: ${reason}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'deliveries', deliveryId: delivery.id });
    if (delivery.brandName) {
      broadcastEvent('bodega:updated', { deliveryId: delivery.id, restored: true });
    }
    res.json({ ok: true, delivery });
  });

  app.post('/api/deliveries/:id/reprint', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de entrega inválido.' });
      return;
    }
    const db = store.getDb();
    const delivery = db.deliveries.find((d) => d.id === req.params.id);
    if (!delivery) {
      res.status(404).json({ error: 'Entrega no encontrada.' });
      return;
    }
    const nowUtc = new Date().toISOString();
    const evt = {
      id: `evt-${crypto.randomUUID()}`,
      deliveryId: delivery.id,
      eventType: 'remision' as const,
      detail: 'Reimpresión COPIA de ticket 48mm desde Windows',
      actorUserId: req.user!.sub,
      actorName: req.user!.name,
      deviceId: 'win-owner-desktop',
      occurredAtUtc: nowUtc,
      arrivedAtServerUtc: nowUtc,
    };
    db.deliveryEvents.push(evt);
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'delivery_events', deliveryId: delivery.id });
    res.json({ ok: true, event: evt });
  });

  // Verify bank transfer payment
  app.post('/api/payments/:id/verify', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de pago inválido.' });
      return;
    }
    const db = store.getDb();
    const payment = db.payments.find((p) => p.id === req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Pago no encontrado.' });
      return;
    }
    if (payment.status === 'verificado') {
      res.json({ ok: true, payment });
      return;
    }

    payment.status = 'verificado';
    const nowUtc = new Date().toISOString();
    if (payment.deliveryId) {
      db.deliveryEvents.push({
        id: `evt-${crypto.randomUUID()}`,
        deliveryId: payment.deliveryId,
        eventType: 'pago',
        detail: `Transferencia ${formatCurrencyFromCentavos(payment.amountCentavos)} verificada por el dueño`,
        actorUserId: req.user!.sub,
        actorName: req.user!.name,
        deviceId: 'win-owner-desktop',
        occurredAtUtc: nowUtc,
        arrivedAtServerUtc: nowUtc,
      });
    }
    store.addAudit(
      'payments',
      payment.id,
      'VERIFICAR_TRANSFERENCIA',
      `Transferencia por ${formatCurrencyFromCentavos(payment.amountCentavos)} verificada`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('transfer:verified', { paymentId: payment.id });
    res.json({ ok: true, payment });
  });

  // Customers: Create, Record Abono, Merge Duplicates
  app.post('/api/customers', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const businessName = sanitizePlainText(req.body?.businessName, 120);
    const contactName = sanitizePlainText(req.body?.contactName, 100);
    const phone = normalizePhone(sanitizePlainText(req.body?.phone, 20));
    const address = sanitizePlainText(req.body?.address, 200);
    const notes = sanitizePlainText(req.body?.notes, 240);
    const rawSpecialPrice = req.body?.specialPricePesosPerKg;
    const specialPriceCentavosPerKg =
      rawSpecialPrice !== undefined && rawSpecialPrice !== null && rawSpecialPrice !== ''
        ? Math.round(Number(rawSpecialPrice) * 100)
        : null;
    const rawCreditDays = req.body?.creditTermDays;
    const creditTermDays =
      rawCreditDays !== undefined && rawCreditDays !== null && rawCreditDays !== ''
        ? Math.round(Number(rawCreditDays))
        : null;

    if (!businessName) {
      res.status(400).json({ error: 'El nombre del negocio es obligatorio.' });
      return;
    }
    if (
      specialPriceCentavosPerKg !== null &&
      (!Number.isInteger(specialPriceCentavosPerKg) ||
        specialPriceCentavosPerKg <= 0 ||
        specialPriceCentavosPerKg > 50_000)
    ) {
      res.status(400).json({ error: 'El precio especial debe ser mayor a $0.' });
      return;
    }
    if (
      creditTermDays !== null &&
      (!Number.isInteger(creditTermDays) || creditTermDays < 0 || creditTermDays > 3650)
    ) {
      res.status(400).json({ error: 'El plazo de crédito debe estar entre 0 y 3650 días.' });
      return;
    }

    const db = store.getDb();
    const customer: Customer = {
      id: `cust-${crypto.randomUUID()}`,
      businessName,
      contactName,
      phone,
      address,
      notes,
      active: true,
      createdByUserId: req.user!.sub,
      mergedIntoCustomerId: null,
      createdAtUtc: new Date().toISOString(),
      specialPriceCentavosPerKg,
      creditTermDays,
    };
    db.customers.push(customer);
    store.addAudit(
      'customers',
      customer.id,
      'CREAR_CLIENTE',
      `Cliente creado: ${businessName}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'customers' });
    res.status(201).json({ customer });
  });

  app.patch('/api/customers/:id', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de cliente inválido.' });
      return;
    }
    const db = store.getDb();
    const customer = db.customers.find(
      (c) => c.id === req.params.id && !c.mergedIntoCustomerId
    );
    if (!customer) {
      res.status(404).json({ error: 'Cliente no encontrado.' });
      return;
    }

    if (req.body?.businessName !== undefined) {
      const nextName = sanitizePlainText(req.body.businessName, 120);
      if (!nextName) {
        res.status(400).json({ error: 'El nombre del negocio no puede estar vacío.' });
        return;
      }
      customer.businessName = nextName;
    }
    if (req.body?.contactName !== undefined) {
      customer.contactName = sanitizePlainText(req.body.contactName, 100);
    }
    if (req.body?.phone !== undefined) {
      customer.phone = normalizePhone(sanitizePlainText(req.body.phone, 20));
    }
    if (req.body?.address !== undefined) {
      customer.address = sanitizePlainText(req.body.address, 200);
    }
    if (req.body?.notes !== undefined) {
      customer.notes = sanitizePlainText(req.body.notes, 240);
    }

    if (req.body?.specialPricePesosPerKg !== undefined) {
      const rawSpecial = req.body.specialPricePesosPerKg;
      if (rawSpecial === null || rawSpecial === '') {
        customer.specialPriceCentavosPerKg = null;
      } else {
        const parsed = Math.round(Number(rawSpecial) * 100);
        if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 50_000) {
          res.status(400).json({ error: 'El precio especial debe ser mayor a $0.' });
          return;
        }
        customer.specialPriceCentavosPerKg = parsed;
      }
    }

    if (req.body?.creditTermDays !== undefined) {
      const rawDays = req.body.creditTermDays;
      if (rawDays === null || rawDays === '') {
        customer.creditTermDays = null;
      } else {
        const parsedDays = Math.round(Number(rawDays));
        if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 3650) {
          res.status(400).json({ error: 'El plazo de crédito debe estar entre 0 y 3650 días.' });
          return;
        }
        customer.creditTermDays = parsedDays;
      }
    }

    store.addAudit(
      'customers',
      customer.id,
      'ACTUALIZAR_CLIENTE',
      `Cliente actualizado: ${customer.businessName}${customer.specialPriceCentavosPerKg ? ` (Tarifa: ${formatCurrencyFromCentavos(customer.specialPriceCentavosPerKg)}/kg)` : ''}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'customers', customerId: customer.id });
    res.json({ ok: true, customer });
  });

  app.post('/api/customers/:id/payments', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de cliente inválido.' });
      return;
    }
    const db = store.getDb();
    const customer = db.customers.find(
      (c) => c.id === req.params.id && !c.mergedIntoCustomerId
    );
    if (!customer) {
      res.status(404).json({ error: 'Cliente no encontrado.' });
      return;
    }

    const amountPesos = Number(req.body?.amountPesos);
    const amountCentavos = Math.round(amountPesos * 100);
    const method = req.body?.method === 'transferencia' ? 'transferencia' : 'efectivo';
    const note = sanitizePlainText(req.body?.note, 160) || 'Abono posterior en oficina';

    const ledger = calculateCustomerLedger(customer.id, db.deliveries, db.payments);
    try {
      validatePaymentAmount(amountCentavos, ledger.balanceCentavos);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    // Apply by default to oldest actually-unpaid delivery (FIFO), or account-level if none/general
    const paidByDelivery = new Map<string, number>();
    for (const p of db.payments) {
      if (p.deliveryId) {
        paidByDelivery.set(p.deliveryId, (paidByDelivery.get(p.deliveryId) ?? 0) + p.amountCentavos);
      }
    }
    const oldestUnpaid = db.deliveries
      .filter((d) => {
        if (d.customerId !== customer.id || d.status !== 'vigente') return false;
        const paid = paidByDelivery.get(d.id) ?? 0;
        return paid < d.totalToChargeCentavos;
      })
      .sort((a, b) => a.createdAtUtc.localeCompare(b.createdAtUtc))[0];

    const abonoFolio = store.reserveNextFolio('AB').folioFormatted;
    const previousBalanceCentavos = ledger.balanceCentavos;
    const newBalanceCentavos = Math.max(0, previousBalanceCentavos - amountCentavos);

    const payment: Payment = {
      id: `pay-${crypto.randomUUID()}`,
      customerId: customer.id,
      deliveryId: oldestUnpaid?.id ?? null,
      vendorId: req.user!.sub,
      amountCentavos,
      method,
      status: method === 'efectivo' ? 'verificado' : 'por_verificar',
      createdAtUtc: new Date().toISOString(),
      note,
      receiptFolio: abonoFolio,
    };

    db.payments.push(payment);
    if (oldestUnpaid) {
      db.deliveryEvents.push({
        id: `evt-${crypto.randomUUID()}`,
        deliveryId: oldestUnpaid.id,
        eventType: 'abono',
        detail: `Abono ${abonoFolio} ${formatCurrencyFromCentavos(amountCentavos)} (${method})`,
        actorUserId: req.user!.sub,
        actorName: req.user!.name,
        deviceId: 'win-owner-desktop',
        occurredAtUtc: payment.createdAtUtc,
        arrivedAtServerUtc: payment.createdAtUtc,
      });
    }
    store.addAudit(
      'payments',
      payment.id,
      'ABONO_CLIENTE',
      `Abono ${abonoFolio} por ${formatCurrencyFromCentavos(amountCentavos)} registrado a ${customer.businessName}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'payments', customerId: customer.id });
    res.status(201).json({
      ok: true,
      payment,
      previousBalanceCentavos,
      newBalanceCentavos,
    });
  });

  app.post('/api/customers/merge', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const primaryId = sanitizePlainText(req.body?.primaryId, 80);
    const duplicateId = sanitizePlainText(req.body?.duplicateId, 80);

    if (!isValidEntityId(primaryId) || !isValidEntityId(duplicateId) || primaryId === duplicateId) {
      res.status(400).json({ error: 'Seleccione dos clientes distintos válidos para unir.' });
      return;
    }

    const db = store.getDb();
    const primary = db.customers.find((c) => c.id === primaryId && !c.mergedIntoCustomerId);
    const duplicate = db.customers.find((c) => c.id === duplicateId && !c.mergedIntoCustomerId);

    if (!primary || !duplicate) {
      res.status(404).json({ error: 'Uno o ambos clientes no están disponibles para unir.' });
      return;
    }

    // Move deliveries, payments, and incidents from duplicate to primary (Case S3)
    let movedDeliveries = 0;
    for (const d of db.deliveries) {
      if (d.customerId === duplicate.id) {
        d.customerId = primary.id;
        d.customerName = primary.businessName;
        movedDeliveries++;
      }
    }
    for (const p of db.payments) {
      if (p.customerId === duplicate.id) {
        p.customerId = primary.id;
      }
    }
    for (const inc of db.moneyIncidents) {
      if (inc.relatedCustomerId === duplicate.id) {
        inc.relatedCustomerId = primary.id;
      }
    }

    duplicate.mergedIntoCustomerId = primary.id;
    duplicate.active = false;

    store.addAudit(
      'customers',
      primary.id,
      'UNIR_CLIENTES_DUPLICADOS',
      `Cliente "${duplicate.businessName}" unido con "${primary.businessName}" (${movedDeliveries} entregas reasignadas)`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'customers' });
    res.json({ ok: true, primaryId: primary.id, movedDeliveries });
  });

  // Money Incidents: Review
  app.post('/api/incidents/:id/review', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    if (!isValidEntityId(req.params.id)) {
      res.status(400).json({ error: 'Identificador de incidente inválido.' });
      return;
    }
    const ownerNote = sanitizePlainText(req.body?.ownerNote, 240);
    const db = store.getDb();
    const incident = db.moneyIncidents.find((i) => i.id === req.params.id);
    if (!incident) {
      res.status(404).json({ error: 'Incidente no encontrado.' });
      return;
    }

    incident.status = 'revisado';
    incident.ownerNote = ownerNote || 'Revisado por el dueño en Windows';
    store.addAudit(
      'money_incidents',
      incident.id,
      'REVISAR_INCIDENTE',
      `Incidente ${formatCurrencyFromCentavos(incident.amountCentavos)} de ${incident.vendorName} marcado como Revisado`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('incident:updated', { incidentId: incident.id, status: 'revisado' }, incident.vendorId);
    res.json({ ok: true, incident });
  });

  // Cash Closing (Cierre general / por vendedor)
  app.post('/api/closings', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const vendorId = sanitizePlainText(req.body?.vendorId, 80);
    const rawDate = sanitizePlainText(req.body?.dateYmd, 10);
    const dateYmd = rawDate || getMexicoCityYmd();
    const rawActualCash = req.body?.actualCashPesos;
    const actualCashPesos =
      rawActualCash === '' || rawActualCash === null || rawActualCash === undefined
        ? NaN
        : Number(rawActualCash);

    if (!isValidYmd(dateYmd)) {
      res.status(400).json({ error: 'La fecha de cierre debe tener formato YYYY-MM-DD válido.' });
      return;
    }
    if (!isValidEntityId(vendorId) || !Number.isFinite(actualCashPesos) || actualCashPesos < 0 || actualCashPesos > 100_000_000) {
      res.status(400).json({ error: 'Vendedor y efectivo recibido válido son requeridos.' });
      return;
    }

    const db = store.getDb();
    const vendor = db.users.find((u) => u.id === vendorId && u.role === 'vendedor');
    if (!vendor) {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }

    const vendorDeliveries = db.deliveries.filter((d) => d.vendorId === vendor.id);
    const vendorPayments = db.payments.filter((p) => p.vendorId === vendor.id);
    const vendorLosses = db.dailyLosses.filter((l) => l.vendorId === vendor.id);
    const vendorIncidents = db.moneyIncidents.filter((i) => i.vendorId === vendor.id);

    const calc = calculateVendorClosing({
      deliveries: vendorDeliveries,
      payments: vendorPayments,
      losses: vendorLosses,
      incidents: vendorIncidents,
      actualCashHandedInCentavos: Math.round(actualCashPesos * 100),
    });

    const closing = {
      id: `cls-${crypto.randomUUID()}`,
      vendorId: vendor.id,
      vendorName: vendor.name,
      dateYmd,
      soldCentavos: calc.soldCentavos,
      cashCollectedCentavos: calc.cashCollectedCentavos,
      transferVerifiedCentavos: calc.transferVerifiedCentavos,
      transferPendingCentavos: calc.transferPendingCentavos,
      dailyLossGrams: calc.dailyLossGrams,
      incidentsCentavos: calc.incidentsCentavos,
      expectedCashToDeliverCentavos: calc.expectedCashToDeliverCentavos,
      actualCashHandedInCentavos: calc.actualCashHandedInCentavos,
      unexplainedDifferenceCentavos: calc.unexplainedDifferenceCentavos,
      closedAtUtc: new Date().toISOString(),
      closedByUserId: req.user!.sub,
    };

    db.cashClosings.unshift(closing);
    store.addAudit(
      'cash_closings',
      closing.id,
      'CIERRE_CAJA',
      `Cierre de ${vendor.name}: Vendido ${formatCurrencyFromCentavos(closing.soldCentavos)}, Diferencia ${formatCurrencyFromCentavos(closing.unexplainedDifferenceCentavos)}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('closing:created', closing, vendor.id);
    res.status(201).json({ closing });
  });

  // Excel Import (Validated, deduplicated, formula-injection safe)
  app.post('/api/excel/import', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const fileName = sanitizePlainText(req.body?.fileName, 120) || 'importacion.xlsx';
    const importType = req.body?.importType === 'precios' ? ('precios' as const) : ('clientes' as const);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (rows.length === 0 || rows.length > 2000) {
      res.status(400).json({ error: 'El archivo debe contener entre 1 y 2000 filas.' });
      return;
    }

    const db = store.getDb();
    let created = 0;
    let rejected = 0;

    if (importType === 'clientes') {
      const existingKeys = new Set(
        db.customers
          .filter((c) => !c.mergedIntoCustomerId)
          .map((c) => `${normalizeCustomerName(c.businessName)}|${normalizePhone(c.phone)}`)
      );

      for (const r of rows) {
        const businessName = sanitizeImportedCell(r.businessName);
        const phone = normalizePhone(sanitizeImportedCell(r.phone));
        const contactName = sanitizeImportedCell(r.contactName);
        const address = sanitizeImportedCell(r.address);
        const notes = sanitizeImportedCell(r.notes);

        const phoneValid = phone.length >= 8 && phone.length <= 15;
        const key = `${normalizeCustomerName(businessName)}|${phone}`;
        if (!businessName || !phoneValid || existingKeys.has(key)) {
          rejected++;
          continue;
        }
        existingKeys.add(key);
        db.customers.push({
          id: `cust-${crypto.randomUUID()}`,
          businessName,
          contactName,
          phone,
          address,
          notes,
          active: true,
          createdByUserId: req.user!.sub,
          mergedIntoCustomerId: null,
          createdAtUtc: new Date().toISOString(),
        });
        created++;
      }
    } else {
      for (const r of rows) {
        const dateYmd = sanitizeImportedCell(r.dateYmd);
        const pricePesos = Number(r.pricePesosPerKg);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !Number.isFinite(pricePesos) || pricePesos <= 0) {
          rejected++;
          continue;
        }
        db.dailyPrices.unshift({
          id: `prc-${crypto.randomUUID()}`,
          dateYmd,
          priceCentavosPerKg: Math.round(pricePesos * 100),
          publishedByUserId: req.user!.sub,
          publishedByName: req.user!.name,
          origin: 'dueno',
          reviewedByOwner: true,
          createdAtUtc: new Date().toISOString(),
        });
        created++;
      }
    }

    const importRecord = {
      id: `imp-${crypto.randomUUID()}`,
      userId: req.user!.sub,
      userName: req.user!.name,
      fileName,
      importType,
      importedAtUtc: new Date().toISOString(),
      rowsRead: rows.length,
      rowsCreated: created,
      rowsRejected: rejected,
    };

    db.excelImports.unshift(importRecord);
    store.addAudit(
      'excel_imports',
      importRecord.id,
      'IMPORTAR_EXCEL',
      `${fileName} (${importType}): ${created} creados, ${rejected} rechazados/duplicados`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'excel_imports' });
    res.json({ importRecord });
  });

  // Settings
  app.post('/api/settings', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    if (typeof req.body?.businessPhone === 'string') {
      db.settings.businessPhone = sanitizePlainText(req.body.businessPhone, 40) || '000 000 0000';
    }
    if (typeof req.body?.businessAddress === 'string') {
      db.settings.businessAddress = sanitizePlainText(req.body.businessAddress, 120) || 'Dirección del negocio';
    }
    if (typeof req.body?.reduceAnimations === 'boolean') {
      db.settings.reduceAnimations = req.body.reduceAnimations;
    }
    if (req.body?.themeMode === 'dark' || req.body?.themeMode === 'light') {
      db.settings.themeMode = req.body.themeMode;
    }
    if (typeof req.body?.profilePictureUrl !== 'undefined') {
      const imgCheck = sanitizeProfileImageDataUrl(req.body.profilePictureUrl);
      if (!imgCheck.ok) {
        res.status(400).json({ error: imgCheck.error });
        return;
      }
      db.settings.profilePictureUrl = imgCheck.value;
    }
    if (req.body?.printerConfig && typeof req.body.printerConfig === 'object') {
      const pc = req.body.printerConfig as Record<string, unknown>;
      const mode =
        pc.mode === 'electron' || pc.mode === 'usb_serial' || pc.mode === 'system'
          ? pc.mode
          : null;
      if (!mode) {
        res.status(400).json({ error: 'Modo de impresora inválido.' });
        return;
      }
      const printerName = sanitizePlainText(pc.printerName, 120);
      const rawBaud = pc.baudRate !== undefined ? Number(pc.baudRate) : 9600;
      if (!Number.isInteger(rawBaud) || rawBaud < 1200 || rawBaud > 921600) {
        res.status(400).json({ error: 'Velocidad (baud rate) de impresora inválida.' });
        return;
      }
      const vendorId =
        pc.vendorId !== undefined && Number.isInteger(Number(pc.vendorId)) && Number(pc.vendorId) >= 0
          ? Number(pc.vendorId)
          : undefined;
      const productId =
        pc.productId !== undefined && Number.isInteger(Number(pc.productId)) && Number(pc.productId) >= 0
          ? Number(pc.productId)
          : undefined;
      db.settings.printerConfig = {
        mode,
        printerName,
        paperWidthMm: 48,
        baudRate: rawBaud,
        ...(vendorId !== undefined ? { vendorId } : {}),
        ...(productId !== undefined ? { productId } : {}),
      };
    }
    store.addAudit(
      'settings',
      'global',
      'ACTUALIZAR_AJUSTES',
      'Configuración del negocio, impresora y preferencias de Windows actualizadas',
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'settings' });
    res.json({ settings: db.settings });
  });

  // Proactive Alerts Acknowledge
  app.post('/api/monitoring/alerts/:id/ack', requireAuth, requireRole('dueno'), (req, res) => {
    const alertId = sanitizePlainText(req.params.id, 120);
    if (!alertId) {
      res.status(400).json({ error: 'Identificador de alerta inválido.' });
      return;
    }
    store.acknowledgeAlert(alertId);
    broadcastEvent('alert:acknowledged', { alertId });
    res.json({ ok: true });
  });

  // Encrypted & Verified SQLite Backups (Owner only)
  app.get('/api/backups', requireAuth, requireRole('dueno'), (_req, res) => {
    res.json({ backups: store.listBackups() });
  });

  app.post('/api/backups/create', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    try {
      const backup = store.createEncryptedBackup('manual');
      store.addAudit(
        'backups',
        backup.fileName,
        'CREAR_RESPALDO_CIFRADO',
        `Respaldo cifrado AES-256-GCM verificado: ${backup.fileName} (${backup.counts.deliveries} entregas, ${backup.counts.customers} clientes)`,
        req.user!.sub,
        req.user!.name
      );
      store.persist();
      res.status(201).json(backup);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/backups/verify', requireAuth, requireRole('dueno'), (req, res) => {
    try {
      let envelope = typeof req.body?.envelope === 'string' ? req.body.envelope : '';
      if (!envelope && typeof req.body?.fileName === 'string') {
        envelope = store.readEncryptedBackupFile(req.body.fileName);
      }
      const verified = store.verifyEncryptedBackupEnvelope(envelope);
      res.json({
        valid: true,
        createdAtUtc: verified.createdAtUtc,
        sha256: verified.sha256,
        counts: verified.counts,
      });
    } catch (err) {
      res.status(400).json({ valid: false, error: (err as Error).message });
    }
  });

  app.post('/api/backups/restore', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    try {
      let envelope = typeof req.body?.envelope === 'string' ? req.body.envelope : '';
      if (!envelope && typeof req.body?.fileName === 'string') {
        envelope = store.readEncryptedBackupFile(req.body.fileName);
      }
      const result = store.restoreFromEncryptedBackupEnvelope(envelope);
      store.addAudit(
        'backups',
        result.safetyBackupFileName,
        'RESTAURAR_RESPALDO_CIFRADO',
        `Base SQLite restaurada desde respaldo verificado (copia previa: ${result.safetyBackupFileName})`,
        req.user!.sub,
        req.user!.name
      );
      store.persist();
      broadcastEvent('sync:state_updated', { entity: 'restore' });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Bodega: Register Farm -> Warehouse Torton / Trailer Arrival (Eggs & Sugar Sacks)
  app.post('/api/bodega/shipments', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const vehicleType = req.body?.vehicleType === 'trailer' ? ('trailer' as const) : ('torton' as const);
    const referenceCode = sanitizePlainText(req.body?.referenceCode, 80);
    const originFarm = sanitizePlainText(req.body?.originFarm, 120) || 'Granja origen';
    const driverName = sanitizePlainText(req.body?.driverName, 80);
    const notes = sanitizePlainText(req.body?.notes, 240);
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (rawLines.length === 0 || rawLines.length > 50) {
      res.status(400).json({ error: 'Debe agregar entre 1 y 50 lotes de producto al viaje.' });
      return;
    }

    const shipmentId = `shp-${crypto.randomUUID()}`;
    const lines: WarehouseShipmentLine[] = [];

    for (const raw of rawLines) {
      const productType: BodegaProductType = raw?.productType === 'azucar' ? 'azucar' : 'huevo';
      const brandName = sanitizePlainText(raw?.brandName, 80);
      const brandKey = normalizeProductKey(brandName, productType);
      const boxesCount = roundHalfUnits(Number(raw?.boxesCount));
      const weightPerBultoKg = Number(raw?.weightPerBultoKg);
      const totalKgInput = Number(raw?.totalKg);
      const computedTotalKg =
        productType === 'azucar' && Number.isFinite(weightPerBultoKg) && weightPerBultoKg > 0
          ? boxesCount * weightPerBultoKg
          : totalKgInput;
      const totalGrams = Math.round(computedTotalKg * 1000);

      const qtyValid =
        productType === 'azucar'
          ? Number.isInteger(boxesCount) && boxesCount > 0 && boxesCount <= 50_000
          : isValidHalfUnitCount(boxesCount) && boxesCount <= 50_000;

      if (
        !brandName ||
        !brandKey ||
        !qtyValid ||
        !Number.isFinite(computedTotalKg) ||
        totalGrams <= 0 ||
        totalGrams > 50_000_000
      ) {
        res.status(400).json({
          error:
            productType === 'azucar'
              ? 'Cada lote de azúcar debe indicar producto válido, bultos enteros (> 0) y peso (> 0).'
              : 'Cada lote de huevo debe indicar marca válida, cajas (> 0 en múltiplos de 0.5) y peso total en kg (> 0).',
        });
        return;
      }

      lines.push({
        id: `shl-${crypto.randomUUID()}`,
        shipmentId,
        productType,
        brandKey,
        brandName,
        boxesCount,
        totalGrams,
      });
    }

    const db = store.getDb();
    const nowUtc = new Date().toISOString();
    const folioInfo = store.reserveNextFolio('E');
    const shipment: WarehouseShipment = {
      id: shipmentId,
      series: 'E',
      folioNumber: folioInfo.folioNumber,
      folioFormatted: folioInfo.folioFormatted,
      vehicleType,
      referenceCode: referenceCode || `VIAJE-${db.warehouseShipments.length + 1}`,
      originFarm,
      driverName,
      arrivedAtUtc: nowUtc,
      registeredByUserId: req.user!.sub,
      registeredByName: req.user!.name,
      notes,
      lines,
    };

    db.warehouseShipments.unshift(shipment);
    const summaryText = lines
      .map((l) =>
        l.productType === 'azucar'
          ? `${l.boxesCount} bultos ${l.brandName} (${formatKgFromGrams(l.totalGrams)})`
          : `${l.boxesCount} cajas ${l.brandName} (${formatKgFromGrams(l.totalGrams)})`
      )
      .join(', ');
    store.addAudit(
      'warehouse_shipments',
      shipment.id,
      'REGISTRAR_ENTRADA_BODEGA',
      `${vehicleType.toUpperCase()} (${shipment.referenceCode}): ${summaryText}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('bodega:updated', { shipmentId: shipment.id });
    res.status(201).json({
      shipment,
      inventory: calculateBrandInventory(db.warehouseShipments, db.deliveries, db.deliveryBoxes),
    });
  });

  // Bodega: Direct Multi-Brand Egg & Sugar Warehouse Sale with Atomic Inventory Deduction
  app.post('/api/bodega/sales', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const todayYmd = getMexicoCityYmd();
    const nowUtc = new Date().toISOString();

    const customerIdInput = sanitizePlainText(req.body?.customerId, 80);
    const newCustomerName = sanitizePlainText(req.body?.newCustomerName, 120);
    const newCustomerPhone = normalizePhone(sanitizePlainText(req.body?.newCustomerPhone, 20));

    // 1. Validate customer (existing or quick walk-in creation)
    let customer = customerIdInput
      ? db.customers.find((c) => c.id === customerIdInput && !c.mergedIntoCustomerId)
      : undefined;

    if (!customer && newCustomerName) {
      const normalizedNew = normalizeCustomerName(newCustomerName);
      customer = db.customers.find(
        (c) => !c.mergedIntoCustomerId && normalizeCustomerName(c.businessName) === normalizedNew
      );
      if (!customer) {
        customer = {
          id: `cust-${crypto.randomUUID()}`,
          businessName: newCustomerName,
          contactName: 'Cliente de bodega',
          phone: newCustomerPhone,
          address: 'Compra directa en bodega',
          notes: '',
          active: true,
          createdByUserId: req.user!.sub,
          mergedIntoCustomerId: null,
          createdAtUtc: nowUtc,
        };
        db.customers.push(customer);
      }
    }

    if (!customer) {
      res.status(400).json({ error: 'Seleccione un cliente o ingrese el nombre del comprador.' });
      return;
    }

    // Support both multi-item `items` array and legacy single-item payload
    const rawItems: Record<string, unknown>[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [
          {
            productType: 'huevo',
            brandName: req.body?.brandName,
            fullBoxes: req.body?.boxesCount,
            halfBoxes: 0,
            weighMode: req.body?.weighMode,
            totalKg: req.body?.totalKg,
            boxesGrams: req.body?.boxesGrams,
            pricePesosPerKg: req.body?.pricePesosPerKg,
            isSpecialPrice: req.body?.isSpecialPrice,
          },
        ];

    if (rawItems.length === 0 || rawItems.length > 30) {
      res.status(400).json({ error: 'Agregue entre 1 y 30 conceptos de producto en la venta.' });
      return;
    }

    const inventory = calculateBrandInventory(db.warehouseShipments, db.deliveries, db.deliveryBoxes);
    const latestPrice = db.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? db.dailyPrices[0];

    const requestedQtyByKey = new Map<
      string,
      { productType: BodegaProductType; brandName: string; qty: number }
    >();
    const builtItems: BodegaSaleItem[] = [];
    const allBoxesGrams: number[] = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const raw = rawItems[idx] ?? {};
      const productType: BodegaProductType = raw.productType === 'azucar' ? 'azucar' : 'huevo';
      const brandInput = sanitizePlainText(raw.brandName, 80);

      if (!brandInput) {
        res.status(400).json({
          error: `Concepto #${idx + 1}: seleccione la marca o producto a vender.`,
        });
        return;
      }

      if (productType === 'azucar') {
        const bultosCount = Number(raw.bultosCount ?? raw.fullBoxes ?? raw.boxesCount);
        const weightPerBultoKg = Number(raw.weightPerBultoKg);
        const pricePerBultoPesos = Number(raw.pricePerBultoPesos);
        const isSpecialPrice = Boolean(raw.isSpecialPrice);

        if (!Number.isInteger(bultosCount) || bultosCount <= 0 || bultosCount > 5000) {
          res.status(400).json({
            error: `Azúcar #${idx + 1}: la cantidad de bultos debe ser un entero entre 1 y 5,000.`,
          });
          return;
        }
        const weightPerBultoGrams = Math.round(weightPerBultoKg * 1000);
        if (
          !Number.isFinite(weightPerBultoKg) ||
          weightPerBultoGrams <= 0 ||
          weightPerBultoGrams > 200_000
        ) {
          res.status(400).json({
            error: `Azúcar #${idx + 1}: ingrese el peso por bulto en kg mayor a 0.`,
          });
          return;
        }
        const pricePerBultoCentavos = Math.round(pricePerBultoPesos * 100);
        if (
          !Number.isFinite(pricePerBultoPesos) ||
          !Number.isInteger(pricePerBultoCentavos) ||
          pricePerBultoCentavos <= 0 ||
          pricePerBultoCentavos > 10_000_000
        ) {
          res.status(400).json({
            error: `Azúcar #${idx + 1}: ingrese el precio por bulto mayor a $0.`,
          });
          return;
        }

        let matchedStock;
        try {
          matchedStock = validateBodegaSaleStock(inventory, brandInput, bultosCount, 'azucar');
        } catch (err) {
          res.status(409).json({ error: (err as Error).message });
          return;
        }

        const prevReq = requestedQtyByKey.get(matchedStock.brandKey);
        const combinedQty = (prevReq?.qty ?? 0) + bultosCount;
        requestedQtyByKey.set(matchedStock.brandKey, {
          productType: 'azucar',
          brandName: matchedStock.brandName,
          qty: combinedQty,
        });

        const totalGrams = bultosCount * weightPerBultoGrams;
        const subtotalCentavos = calculateSugarLineSubtotalCentavos(
          bultosCount,
          pricePerBultoCentavos
        );
        const itemBoxesGrams =
          bultosCount <= 200
            ? Array.from({ length: bultosCount }, () => weightPerBultoGrams)
            : splitTotalGramsIntoBoxes(totalGrams, 200);

        allBoxesGrams.push(...itemBoxesGrams);
        builtItems.push({
          id: `bsi-${crypto.randomUUID()}`,
          productType: 'azucar',
          brandKey: matchedStock.brandKey,
          brandName: matchedStock.brandName,
          fullBoxes: bultosCount,
          halfBoxes: 0,
          quantity: bultosCount,
          tareGrams: 0,
          totalGrams,
          unitPriceCentavos: pricePerBultoCentavos,
          isSpecialPrice,
          subtotalCentavos,
          boxesGrams: itemBoxesGrams,
        });
      } else {
        const fullBoxes = Number(raw.fullBoxes ?? raw.boxesCount ?? 0);
        const halfBoxes = Number(raw.halfBoxes ?? 0);
        const weighMode = raw.weighMode === 'cajas' ? ('cajas' as const) : ('total' as const);
        const isSpecialPrice = Boolean(raw.isSpecialPrice);

        if (
          !Number.isInteger(fullBoxes) ||
          fullBoxes < 0 ||
          !Number.isInteger(halfBoxes) ||
          halfBoxes < 0 ||
          fullBoxes + halfBoxes <= 0 ||
          fullBoxes + halfBoxes > 5000
        ) {
          res.status(400).json({
            error: `Huevo #${idx + 1}: indique cajas completas o medias cajas válidas (> 0).`,
          });
          return;
        }

        const quantity = roundHalfUnits(fullBoxes + halfBoxes * 0.5);
        let matchedStock;
        try {
          matchedStock = validateBodegaSaleStock(inventory, brandInput, quantity, 'huevo');
        } catch (err) {
          res.status(409).json({ error: (err as Error).message });
          return;
        }

        const prevReq = requestedQtyByKey.get(matchedStock.brandKey);
        const combinedQty = roundHalfUnits((prevReq?.qty ?? 0) + quantity);
        requestedQtyByKey.set(matchedStock.brandKey, {
          productType: 'huevo',
          brandName: matchedStock.brandName,
          qty: combinedQty,
        });

        let netBoxesGrams: number[] = [];
        let tareGrams = 0;

        if (weighMode === 'cajas') {
          if (
            Array.isArray(raw.fullBoxesGrossGrams) ||
            Array.isArray(raw.halfBoxesGrossGrams)
          ) {
            const rawFull = Array.isArray(raw.fullBoxesGrossGrams)
              ? raw.fullBoxesGrossGrams
              : [];
            const rawHalf = Array.isArray(raw.halfBoxesGrossGrams)
              ? raw.halfBoxesGrossGrams
              : [];
            if (
              rawFull.length !== fullBoxes ||
              rawHalf.length !== halfBoxes ||
              rawFull.length + rawHalf.length > 500
            ) {
              res.status(400).json({
                error: `Huevo #${idx + 1}: debe capturar los pesos brutos de ${fullBoxes} caja(s) y ${halfBoxes} media(s) caja(s).`,
              });
              return;
            }
            const grossFullGrams = rawFull.map((g: unknown) => Math.round(Number(g)));
            const grossHalfGrams = rawHalf.map((g: unknown) => Math.round(Number(g)));
            if (
              grossFullGrams.some((g) => !Number.isInteger(g) || g > 200_000) ||
              grossHalfGrams.some((g) => !Number.isInteger(g) || g > 200_000)
            ) {
              res.status(400).json({
                error: `Huevo #${idx + 1}: verifique que los pesos capturados sean válidos.`,
              });
              return;
            }
            const halfBoxWeighType: HalfBoxWeighType =
              raw.halfBoxWeighType === 'partida'
                ? 'partida'
                : raw.halfBoxWeighType === 'pesada'
                  ? 'pesada'
                  : 'directa';
            try {
              const tareResult = deductCartonTareWithModalities(
                grossFullGrams,
                grossHalfGrams,
                halfBoxWeighType
              );
              netBoxesGrams = tareResult.netBoxesGrams;
              tareGrams = tareResult.tareGrams;
            } catch (err) {
              res.status(400).json({ error: (err as Error).message });
              return;
            }
          } else {
            // Backward-compatible pre-netted boxesGrams field
            const rawBoxes = Array.isArray(raw.boxesGrams) ? raw.boxesGrams : [];
            if (rawBoxes.length !== fullBoxes + halfBoxes || rawBoxes.length > 500) {
              res.status(400).json({
                error: `Debe capturar exactamente ${fullBoxes + halfBoxes} peso(s) individuales de caja.`,
              });
              return;
            }
            netBoxesGrams = rawBoxes.map((g: unknown) => Math.round(Number(g)));
            if (netBoxesGrams.some((g) => !Number.isInteger(g) || g <= 0 || g > 200_000)) {
              res.status(400).json({ error: 'Cada caja debe tener un peso válido mayor a 0.' });
              return;
            }
          }
        } else {
          const totalKg = Number(raw.totalKg);
          const totalGrams = Math.round(totalKg * 1000);
          if (!Number.isFinite(totalKg) || totalGrams <= 0 || totalGrams > 50_000_000) {
            res.status(400).json({
              error: `Huevo #${idx + 1}: ingrese el peso total en báscula (kg) mayor a 0.`,
            });
            return;
          }
          try {
            netBoxesGrams = splitTotalGramsIntoHalfAwareBoxes(totalGrams, fullBoxes, halfBoxes);
          } catch (err) {
            res.status(400).json({ error: (err as Error).message });
            return;
          }
        }

        const requestedPricePesos = Number(raw.pricePesosPerKg);
        let priceCentavosPerKg: number;
        if (isSpecialPrice || !latestPrice) {
          priceCentavosPerKg = Math.round(requestedPricePesos * 100);
        } else {
          priceCentavosPerKg =
            Number.isFinite(requestedPricePesos) && requestedPricePesos > 0
              ? Math.round(requestedPricePesos * 100)
              : latestPrice.priceCentavosPerKg;
        }

        if (
          !Number.isInteger(priceCentavosPerKg) ||
          priceCentavosPerKg <= 0 ||
          priceCentavosPerKg > 50_000
        ) {
          res.status(400).json({
            error: `Huevo #${idx + 1}: el precio por kilo debe ser mayor a $0 (publique el precio del día o capture uno válido).`,
          });
          return;
        }

        let calc;
        try {
          calc = calculateDeliveryTotals(netBoxesGrams, priceCentavosPerKg);
        } catch (err) {
          res.status(400).json({ error: (err as Error).message });
          return;
        }

        allBoxesGrams.push(...netBoxesGrams);
        builtItems.push({
          id: `bsi-${crypto.randomUUID()}`,
          productType: 'huevo',
          brandKey: matchedStock.brandKey,
          brandName: matchedStock.brandName,
          fullBoxes,
          halfBoxes,
          quantity,
          weighMode,
          tareGrams,
          totalGrams: calc.totalGrams,
          unitPriceCentavos: priceCentavosPerKg,
          isSpecialPrice,
          subtotalCentavos: calc.totalToChargeCentavos,
          calculatedExactLabel: calc.calculatedExactLabel,
          boxesGrams: netBoxesGrams,
        });
      }
    }

    // Verify aggregated stock across all lines in this ticket (prevents splitting same brand to exceed stock)
    for (const reqSum of requestedQtyByKey.values()) {
      try {
        validateBodegaSaleStock(inventory, reqSum.brandName, reqSum.qty, reqSum.productType);
      } catch (err) {
        res.status(409).json({ error: (err as Error).message });
        return;
      }
    }

    if (allBoxesGrams.length > 2500) {
      res.status(400).json({ error: 'El ticket excede el máximo de 2,500 bultos/cajas por operación.' });
      return;
    }

    const totalGrams = builtItems.reduce((acc, it) => acc + it.totalGrams, 0);
    const totalToChargeCentavos = builtItems.reduce((acc, it) => acc + it.subtotalCentavos, 0);
    const totalQuantity = roundHalfUnits(builtItems.reduce((acc, it) => acc + it.quantity, 0));
    const singleEggItem =
      builtItems.length === 1 && builtItems[0].productType === 'huevo' ? builtItems[0] : null;
    const effectivePriceCentavosPerKg = singleEggItem
      ? singleEggItem.unitPriceCentavos
      : totalGrams > 0
      ? Math.max(1, Math.round((totalToChargeCentavos * 1000) / totalGrams))
      : 100;
    const anySpecialPrice = builtItems.some((it) => it.isSpecialPrice);

    // 5. Optional initial payment validation
    const rawPaid = req.body?.paidPesos;
    const paidPesos =
      rawPaid === '' || rawPaid === null || rawPaid === undefined ? 0 : Number(rawPaid);
    if (!Number.isFinite(paidPesos) || paidPesos < 0) {
      res.status(400).json({ error: 'El pago inicial no puede ser negativo.' });
      return;
    }
    const paidCentavos = Math.round(paidPesos * 100);
    if (paidCentavos > 0) {
      try {
        validatePaymentAmount(paidCentavos, totalToChargeCentavos);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    // 6. Commit Bodega Sale & Inventory Deduction atomically
    const folioInfo = store.reserveNextFolio('BD');
    const deliveryId = `del-bd-${crypto.randomUUID()}`;
    const summaryLabel = builtItems
      .map((it) =>
        it.productType === 'azucar'
          ? `${it.brandName} (${it.quantity} bultos)`
          : `${it.brandName} (${it.quantity} cjs)`
      )
      .join(', ');

    const delivery: Delivery = {
      id: deliveryId,
      vendorId: req.user!.sub,
      vendorName: `${req.user!.name} (Bodega)`,
      workdayId: `wd-bodega-${todayYmd}`,
      driverName: 'Entrega en bodega',
      helpersNames: [],
      series: 'BD',
      folioNumber: folioInfo.folioNumber,
      folioFormatted: folioInfo.folioFormatted,
      customerId: customer.id,
      customerName: customer.businessName,
      createdAtUtc: nowUtc,
      priceCentavosPerKg: effectivePriceCentavosPerKg,
      isSpecialPrice: anySpecialPrice,
      totalGrams,
      calculatedTotalExactMilliCentavos: totalToChargeCentavos * 1000,
      totalToChargeCentavos,
      status: 'vigente',
      cancellationReason: null,
      syncedAtUtc: nowUtc,
      sourceType: 'bodega',
      brandKey: builtItems.length === 1 ? builtItems[0].brandKey : 'multi',
      brandName: builtItems.length === 1 ? builtItems[0].brandName : summaryLabel,
      boxesCount: totalQuantity,
      saleItems: builtItems,
    };

    const createdBoxes: DeliveryBox[] = allBoxesGrams.map((wg, i) => ({
      id: `box-${crypto.randomUUID()}`,
      deliveryId,
      position: i + 1,
      weightGrams: wg,
    }));

    db.deliveries.unshift(delivery);
    db.deliveryBoxes.push(...createdBoxes);

    let createdPayment: Payment | null = null;
    if (paidCentavos > 0) {
      const method = req.body?.paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo';
      createdPayment = {
        id: `pay-${crypto.randomUUID()}`,
        customerId: customer.id,
        deliveryId,
        vendorId: req.user!.sub,
        amountCentavos: paidCentavos,
        method,
        status: method === 'efectivo' ? 'verificado' : 'por_verificar',
        createdAtUtc: nowUtc,
        note: `Pago en bodega · ${summaryLabel}`,
      };
      db.payments.push(createdPayment);
    }

    db.deliveryEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      deliveryId,
      eventType: 'creacion',
      detail: `Venta directa en bodega ${delivery.folioFormatted}: ${summaryLabel} (${formatKgFromGrams(totalGrams)})`,
      actorUserId: req.user!.sub,
      actorName: req.user!.name,
      deviceId: 'win-owner-desktop',
      occurredAtUtc: nowUtc,
      arrivedAtServerUtc: nowUtc,
    });

    store.addAudit(
      'deliveries',
      deliveryId,
      'VENTA_BODEGA',
      `${delivery.folioFormatted} · ${customer.businessName}: ${summaryLabel} (${formatKgFromGrams(totalGrams)}) = ${formatCurrencyFromCentavos(totalToChargeCentavos)}`,
      req.user!.sub,
      req.user!.name
    );

    store.persist();
    broadcastEvent('bodega:updated', { deliveryId, itemsCount: builtItems.length });
    broadcastEvent('delivery:synced', { deliveryId, folio: delivery.folioFormatted });

    const nextInventory = calculateBrandInventory(
      db.warehouseShipments,
      db.deliveries,
      db.deliveryBoxes
    );
    res.status(201).json({
      delivery,
      boxes: createdBoxes,
      payment: createdPayment,
      inventory: nextInventory,
    });
  });

  // Android Real-Time Sync Endpoints:
  // POST /api/sync/folios/reserve, POST /api/sync/push, GET /api/sync/pull
  app.post('/api/sync/folios/reserve', syncLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const vendor = db.users.find((u) => u.id === req.user!.sub && u.role === 'vendedor');
    if (!vendor) {
      res.status(403).json({ error: 'Solo las cuentas de vendedor pueden reservar folios de ruta.' });
      return;
    }
    if (vendor.status !== 'activa' || !vendor.folioSeries) {
      res.status(403).json({ error: 'La cuenta del vendedor no está aprobada o está bloqueada.' });
      return;
    }

    const deviceId = sanitizePlainText(req.body?.deviceId, 80);
    if (!deviceId) {
      res.status(400).json({ error: 'El identificador del dispositivo es obligatorio.' });
      return;
    }
    const device = db.devices.find((d) => d.id === deviceId && d.userId === vendor.id);
    if (!device || !device.active) {
      res.status(403).json({
        error: 'Este teléfono aún no está autorizado por el dueño en Windows (Vendedores).',
      });
      return;
    }

    const requestedCount = Number(req.body?.count ?? 100);
    const count =
      Number.isInteger(requestedCount) && requestedCount >= 1 && requestedCount <= 200
        ? requestedCount
        : 100;

    const folios: number[] = [];
    for (let i = 0; i < count; i++) {
      const next = store.reserveNextFolio(vendor.folioSeries);
      folios.push(next.folioNumber);
    }
    device.lastSyncUtc = new Date().toISOString();

    store.addAudit(
      'devices',
      device.id,
      'RESERVAR_FOLIOS',
      `${vendor.name} reservó ${folios.length} folios serie ${vendor.folioSeries} (${folios[0]}..${folios[folios.length - 1]})`,
      vendor.id,
      vendor.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'folios', vendorId: vendor.id });
    res.json({
      ok: true,
      folioSeries: vendor.folioSeries,
      folios,
    });
  });

  app.post('/api/sync/push', syncLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    if (req.user!.role !== 'vendedor') {
      res.status(403).json({ error: 'Solo cuentas de vendedor autorizadas pueden sincronizar entregas.' });
      return;
    }
    const vendor = db.users.find((u) => u.id === req.user!.sub && u.role === 'vendedor');

    if (!vendor) {
      res.status(404).json({ error: 'Vendedor inválido para sincronización.' });
      return;
    }
    if (vendor.status !== 'activa' || !vendor.folioSeries) {
      res.status(403).json({ error: 'La cuenta del vendedor no está aprobada o está bloqueada.' });
      return;
    }

    const deviceId = sanitizePlainText(req.body?.deviceId, 80) || 'android-app';
    const registeredDevice = db.devices.find((d) => d.id === deviceId && d.userId === vendor.id);
    if (!registeredDevice || !registeredDevice.active) {
      res.status(403).json({
        error: 'Este teléfono no está autorizado como equipo activo del vendedor en Windows.',
      });
      return;
    }

    const incomingDeliveries = Array.isArray(req.body?.deliveries)
      ? req.body.deliveries.slice(0, 500)
      : [];
    const incomingPayments = Array.isArray(req.body?.payments)
      ? req.body.payments.slice(0, 500)
      : [];
    const incomingLosses = Array.isArray(req.body?.losses)
      ? req.body.losses.slice(0, 200)
      : [];
    const incomingIncidents = Array.isArray(req.body?.incidents)
      ? req.body.incidents.slice(0, 200)
      : [];

    let acceptedDeliveries = 0;
    let skippedDuplicates = 0;
    const acceptedDeliveryIds: string[] = [];
    const acceptedPaymentIds: string[] = [];
    const acceptedLossIds: string[] = [];
    const acceptedIncidentIds: string[] = [];
    const nowUtc = new Date().toISOString();

    for (const rawDel of incomingDeliveries) {
      const delId = sanitizePlainText(rawDel.id, 80) || `del-${crypto.randomUUID()}`;
      if (db.deliveries.some((d) => d.id === delId)) {
        acceptedDeliveryIds.push(delId);
        skippedDuplicates++;
        continue;
      }

      let customer = db.customers.find((c) => c.id === rawDel.customerId);
      const seenCustIds = new Set<string>();
      while (customer && customer.mergedIntoCustomerId && !seenCustIds.has(customer.id)) {
        seenCustIds.add(customer.id);
        customer = db.customers.find((c) => c.id === customer!.mergedIntoCustomerId);
      }
      if (!customer || customer.mergedIntoCustomerId) continue;

      const rawItems = Array.isArray(rawDel.items) ? rawDel.items.slice(0, 500) : [];
      const rawSugar =
        rawDel.sugar && typeof rawDel.sugar === 'object' ? rawDel.sugar : null;

      let allBoxesGrams: number[] = [];
      let totalGrams = 0;
      let calculatedTotalExactMilliCentavos = 0;
      let totalToChargeCentavos = 0;
      let effectivePriceCentavosPerKg = 0;
      let boxesCountTotal = 0;
      let resolvedBrandKey: string | undefined;
      let resolvedBrandName: string | undefined;
      let builtSaleItems: BodegaSaleItem[] | undefined;

      if (rawItems.length > 0 || rawSugar) {
        const saleItems: BodegaSaleItem[] = [];
        const fallbackPriceCentavos = Math.round(Number(rawDel.priceCentavosPerKg) || 0);
        let totalRawMilliCentavos = 0n;
        let invalidLine = false;

        // Group egg weighed items by (brandKey, unitPriceCentavos) so inventory & breakdown stay compact and exact
        const eggGroups = new Map<
          string,
          {
            brandKey: string;
            brandName: string;
            unitPriceCentavos: number;
            fullBoxes: number;
            halfBoxes: number;
            tareGrams: number;
            totalGrams: number;
            boxesGrams: number[];
          }
        >();

        for (const item of rawItems) {
          const itemBrandName =
            sanitizePlainText(item?.brand, 80) ||
            sanitizePlainText(rawDel.brandName, 80) ||
            'General';
          const itemBrandKey = normalizeProductKey(itemBrandName, 'huevo') || 'general';
          const netKg = Number(item?.netWeightKg);
          const itemGrams = Math.round(netKg * 1000);
          const tareKg = Number(item?.tareDeductionKg ?? 0);
          const itemTareGrams = Number.isFinite(tareKg) && tareKg > 0 ? Math.round(tareKg * 1000) : 0;
          const boxesDec = roundHalfUnits(Number(item?.boxesDecimal ?? 1));
          const itemPricePerKg = Number(item?.pricePerKg);
          const itemUnitPriceCentavos =
            Number.isFinite(itemPricePerKg) && itemPricePerKg > 0
              ? Math.round(itemPricePerKg * 100)
              : fallbackPriceCentavos;

          if (
            !Number.isInteger(itemGrams) ||
            itemGrams <= 0 ||
            itemGrams > 50_000_000 ||
            !Number.isFinite(boxesDec) ||
            boxesDec <= 0 ||
            boxesDec > 5000 ||
            !Number.isInteger(itemUnitPriceCentavos) ||
            itemUnitPriceCentavos <= 0 ||
            itemUnitPriceCentavos > 50_000
          ) {
            invalidLine = true;
            break;
          }

          const fullPart = Math.floor(boxesDec + 1e-6);
          const halfPart = Math.abs(boxesDec - fullPart - 0.5) < 1e-6 ? 1 : 0;
          const perBoxList = splitTotalGramsIntoHalfAwareBoxes(
            itemGrams,
            Math.max(0, fullPart),
            halfPart
          );

          const gKey = `${itemBrandKey}::${itemUnitPriceCentavos}`;
          const prev = eggGroups.get(gKey);
          if (!prev) {
            eggGroups.set(gKey, {
              brandKey: itemBrandKey,
              brandName: itemBrandName,
              unitPriceCentavos: itemUnitPriceCentavos,
              fullBoxes: fullPart,
              halfBoxes: halfPart,
              tareGrams: itemTareGrams,
              totalGrams: itemGrams,
              boxesGrams: [...perBoxList],
            });
          } else {
            prev.fullBoxes += fullPart;
            prev.halfBoxes += halfPart;
            prev.tareGrams += itemTareGrams;
            prev.totalGrams += itemGrams;
            prev.boxesGrams.push(...perBoxList);
          }
        }

        if (invalidLine) continue;

        for (const grp of eggGroups.values()) {
          const calcGrp = calculateDeliveryTotals(grp.boxesGrams, grp.unitPriceCentavos);
          totalRawMilliCentavos += BigInt(calcGrp.calculatedExactMilliCentavos);
          totalGrams += calcGrp.totalGrams;
          allBoxesGrams.push(...grp.boxesGrams);
          const qty = roundHalfUnits(grp.fullBoxes + grp.halfBoxes * 0.5);
          boxesCountTotal = roundHalfUnits(boxesCountTotal + qty);
          saleItems.push({
            id: `bsi-${crypto.randomUUID()}`,
            productType: 'huevo',
            brandKey: grp.brandKey,
            brandName: grp.brandName,
            fullBoxes: grp.fullBoxes,
            halfBoxes: grp.halfBoxes,
            quantity: qty,
            tareGrams: grp.tareGrams,
            totalGrams: calcGrp.totalGrams,
            unitPriceCentavos: grp.unitPriceCentavos,
            isSpecialPrice: Boolean(rawDel.isSpecialPrice),
            subtotalCentavos: calcGrp.totalToChargeCentavos,
            calculatedExactLabel: calcGrp.calculatedExactLabel,
            boxesGrams: grp.boxesGrams,
          });
        }

        if (rawSugar) {
          const sacks = Number(rawSugar.sacks);
          const weightPerSackKg = Number(rawSugar.weightPerSackKg);
          const pricePerSackMxn = Number(rawSugar.pricePerSackMxn);
          if (
            !Number.isFinite(sacks) ||
            sacks <= 0 ||
            sacks > 5000 ||
            !Number.isFinite(weightPerSackKg) ||
            weightPerSackKg <= 0 ||
            weightPerSackKg > 500 ||
            !Number.isFinite(pricePerSackMxn) ||
            pricePerSackMxn <= 0 ||
            pricePerSackMxn > 500_000
          ) {
            continue;
          }
          const sugarGrams = Math.round(sacks * weightPerSackKg * 1000);
          const pricePerBultoCentavos = Math.round(pricePerSackMxn * 100);
          const sugarSubtotalCentavos = Math.round(sacks * pricePerBultoCentavos);
          const explicitSugarBrand = sanitizePlainText(rawSugar.brandName, 80);
          let sugarBrandName = explicitSugarBrand || 'Azúcar';
          let sugarBrandKey = normalizeProductKey(sugarBrandName, 'azucar') || 'azucar:azucar';
          if (!explicitSugarBrand) {
            const warehouseInv = calculateBrandInventory(
              db.warehouseShipments,
              db.deliveries,
              db.deliveryBoxes
            );
            const activeSugar =
              warehouseInv.find((i) => i.productType === 'azucar' && i.boxesAvailable > 0) ??
              warehouseInv.find((i) => i.productType === 'azucar' && i.boxesArrived > 0);
            if (activeSugar) {
              sugarBrandName = activeSugar.brandName;
              sugarBrandKey = activeSugar.brandKey;
            }
          }
          const sugarBoxes = Number.isInteger(sacks)
            ? splitTotalGramsIntoHalfAwareBoxes(sugarGrams, sacks, 0)
            : [sugarGrams];

          totalRawMilliCentavos += BigInt(sugarSubtotalCentavos) * 1000n;
          totalGrams += sugarGrams;
          allBoxesGrams.push(...sugarBoxes);
          boxesCountTotal = roundHalfUnits(boxesCountTotal + sacks);

          saleItems.push({
            id: `bsi-${crypto.randomUUID()}`,
            productType: 'azucar',
            brandKey: sugarBrandKey,
            brandName: sugarBrandName,
            fullBoxes: Math.floor(sacks),
            halfBoxes: 0,
            quantity: sacks,
            tareGrams: 0,
            totalGrams: sugarGrams,
            unitPriceCentavos: pricePerBultoCentavos,
            isSpecialPrice: false,
            subtotalCentavos: sugarSubtotalCentavos,
            boxesGrams: sugarBoxes,
          });
        }

        if (saleItems.length === 0 || totalGrams <= 0) continue;

        // Official rounding rule on combined exact millicentavos
        const pesos = totalRawMilliCentavos / 100000n;
        const rem = totalRawMilliCentavos % 100000n;
        if (rem < 50000n) {
          totalToChargeCentavos = Number(pesos * 100n);
        } else if (rem === 50000n) {
          totalToChargeCentavos = Number(pesos * 100n + 50n);
        } else {
          totalToChargeCentavos = Number((pesos + 1n) * 100n);
        }
        calculatedTotalExactMilliCentavos = Number(totalRawMilliCentavos);

        const singleEgg =
          saleItems.length === 1 && saleItems[0].productType === 'huevo'
            ? saleItems[0]
            : null;
        effectivePriceCentavosPerKg = singleEgg
          ? singleEgg.unitPriceCentavos
          : Math.max(1, Math.round((totalToChargeCentavos * 1000) / totalGrams));

        builtSaleItems = saleItems;
        resolvedBrandKey = saleItems.length === 1 ? saleItems[0].brandKey : 'multi';
        resolvedBrandName = saleItems
          .map((it) =>
            it.productType === 'azucar'
              ? `${it.brandName} (${it.quantity} bultos)`
              : `${it.brandName} (${it.quantity} cjs)`
          )
          .join(', ');
      } else {
        // Carga plana boxesGrams compatible con clientes de sincronización móviles
        const boxesGrams: number[] = Array.isArray(rawDel.boxesGrams)
          ? rawDel.boxesGrams.slice(0, 500).map((g: unknown) => Math.round(Number(g)))
          : [];
        if (
          boxesGrams.length === 0 ||
          boxesGrams.some((g) => !Number.isInteger(g) || g <= 0 || g > 200_000)
        ) {
          continue;
        }

        const priceCentavosPerKg = Math.round(Number(rawDel.priceCentavosPerKg));
        if (
          !Number.isInteger(priceCentavosPerKg) ||
          priceCentavosPerKg <= 0 ||
          priceCentavosPerKg > 50_000
        ) {
          continue;
        }
        let calc;
        try {
          calc = calculateDeliveryTotals(boxesGrams, priceCentavosPerKg);
        } catch {
          continue;
        }

        allBoxesGrams = boxesGrams;
        totalGrams = calc.totalGrams;
        calculatedTotalExactMilliCentavos = calc.calculatedExactMilliCentavos;
        totalToChargeCentavos = calc.totalToChargeCentavos;
        effectivePriceCentavosPerKg = priceCentavosPerKg;
        boxesCountTotal = boxesGrams.length;
        const rawBrandName = sanitizePlainText(rawDel.brandName, 80);
        resolvedBrandName = rawBrandName || undefined;
        resolvedBrandKey = rawBrandName ? normalizeBrandName(rawBrandName) : undefined;
      }

      const folioInfo =
        Number.isInteger(rawDel.folioNumber) &&
        rawDel.folioNumber > 0 &&
        rawDel.folioNumber <= 999_999
          ? {
              folioNumber: rawDel.folioNumber,
              folioFormatted: formatFolio(vendor.folioSeries, rawDel.folioNumber),
            }
          : store.reserveNextFolio(vendor.folioSeries);

      // Avoid duplicate folio collision (advance server folio sequence past reserved number if needed)
      if (db.deliveries.some((d) => d.folioFormatted === folioInfo.folioFormatted)) {
        skippedDuplicates++;
        continue;
      }
      const nextSeriesSeq = db.settings.nextFolioBySeries[vendor.folioSeries] ?? 1;
      if (folioInfo.folioNumber >= nextSeriesSeq) {
        db.settings.nextFolioBySeries[vendor.folioSeries] = folioInfo.folioNumber + 1;
      }

      const rawCreatedAt = sanitizePlainText(rawDel.createdAtUtc, 40);
      const safeCreatedAtUtc =
        rawCreatedAt && !Number.isNaN(Date.parse(rawCreatedAt)) ? rawCreatedAt : nowUtc;

      const delivery: Delivery = {
        id: delId,
        vendorId: vendor.id,
        vendorName: vendor.name,
        workdayId: sanitizePlainText(rawDel.workdayId, 60) || `wd-${vendor.id}`,
        driverName: sanitizePlainText(rawDel.driverName, 80) || 'Chofer de ruta',
        helpersNames: Array.isArray(rawDel.helpersNames)
          ? rawDel.helpersNames.map((h: unknown) => sanitizePlainText(h, 60)).filter(Boolean)
          : [],
        series: vendor.folioSeries,
        folioNumber: folioInfo.folioNumber,
        folioFormatted: folioInfo.folioFormatted,
        customerId: customer.id,
        customerName: customer.businessName,
        createdAtUtc: safeCreatedAtUtc,
        priceCentavosPerKg: effectivePriceCentavosPerKg,
        isSpecialPrice: Boolean(rawDel.isSpecialPrice),
        totalGrams,
        calculatedTotalExactMilliCentavos,
        totalToChargeCentavos,
        status: 'vigente',
        cancellationReason: null,
        syncedAtUtc: nowUtc,
        sourceType: 'ruta',
        brandKey: resolvedBrandKey,
        brandName: resolvedBrandName,
        boxesCount: boxesCountTotal,
        ...(builtSaleItems ? { saleItems: builtSaleItems } : {}),
      };
      db.deliveries.unshift(delivery);

      allBoxesGrams.forEach((wg, i) => {
        const box: DeliveryBox = {
          id: `box-${crypto.randomUUID()}`,
          deliveryId: delivery.id,
          position: i + 1,
          weightGrams: wg,
        };
        db.deliveryBoxes.push(box);
      });

      db.deliveryEvents.push(
        {
          id: `evt-${crypto.randomUUID()}`,
          deliveryId: delivery.id,
          eventType: 'creacion',
          detail: `Entrega ${delivery.folioFormatted} registrada (${boxesCountTotal} cjs/bultos · ${formatKgFromGrams(totalGrams)})`,
          actorUserId: vendor.id,
          actorName: vendor.name,
          deviceId,
          occurredAtUtc: delivery.createdAtUtc,
          arrivedAtServerUtc: nowUtc,
        },
        {
          id: `evt-${crypto.randomUUID()}`,
          deliveryId: delivery.id,
          eventType: 'sincronizacion',
          detail: 'Sincronizado en tiempo real hacia backend y Windows',
          actorUserId: vendor.id,
          actorName: vendor.name,
          deviceId,
          occurredAtUtc: nowUtc,
          arrivedAtServerUtc: nowUtc,
        }
      );
      acceptedDeliveryIds.push(delId);
      acceptedDeliveries++;
    }

    for (const rawPay of incomingPayments) {
      const payId = sanitizePlainText(rawPay.id, 80) || `pay-${crypto.randomUUID()}`;
      if (db.payments.some((p) => p.id === payId)) {
        acceptedPaymentIds.push(payId);
        continue;
      }
      const method = rawPay.method === 'transferencia' ? 'transferencia' : 'efectivo';
      const amountCentavos = Math.round(Number(rawPay.amountCentavos));
      if (!Number.isInteger(amountCentavos) || amountCentavos <= 0 || amountCentavos > 100_000_000) continue;

      const customerId = sanitizePlainText(rawPay.customerId, 80);
      const customerRecord = db.customers.find((c) => c.id === customerId && !c.mergedIntoCustomerId);
      if (!customerRecord) continue;
      const deliveryId = rawPay.deliveryId ? sanitizePlainText(rawPay.deliveryId, 80) : null;
      if (deliveryId) {
        const linkedDel = db.deliveries.find((d) => d.id === deliveryId);
        if (!linkedDel || linkedDel.customerId !== customerId || linkedDel.status === 'cancelada') continue;
        const alreadyPaid = db.payments
          .filter((p) => p.deliveryId === deliveryId)
          .reduce((acc, p) => acc + p.amountCentavos, 0);
        if (alreadyPaid + amountCentavos > linkedDel.totalToChargeCentavos) continue;
      } else {
        // Standalone partial abono without a specific delivery: verify against customer ledger balance
        const customerLedger = calculateCustomerLedger(customerId, db.deliveries, db.payments);
        if (customerLedger.balanceCentavos <= 0 || amountCentavos > customerLedger.balanceCentavos) {
          continue;
        }
      }

      const rawPayCreated = sanitizePlainText(rawPay.createdAtUtc, 40);
      const safePayCreatedUtc =
        rawPayCreated && isValidIsoUtc(rawPayCreated) ? rawPayCreated : nowUtc;
      const receiptFolio =
        sanitizePlainText(rawPay.receiptFolio, 40) || store.reserveNextFolio('AB').folioFormatted;
      db.payments.push({
        id: payId,
        customerId,
        deliveryId,
        vendorId: vendor.id,
        amountCentavos,
        method,
        status: method === 'efectivo' ? 'verificado' : 'por_verificar',
        createdAtUtc: safePayCreatedUtc,
        note: sanitizePlainText(rawPay.note, 160) || 'Abono en ruta Android',
        receiptFolio,
      });
      store.addAudit(
        'payments',
        payId,
        'ABONO_RUTA_ANDROID',
        `Abono ${receiptFolio} por ${formatCurrencyFromCentavos(amountCentavos)} (${method}) sincronizado para ${customerRecord.businessName}`,
        vendor.id,
        vendor.name
      );
      acceptedPaymentIds.push(payId);
    }

    for (const rawLoss of incomingLosses) {
      const lossId = sanitizePlainText(rawLoss.id, 80) || `loss-${crypto.randomUUID()}`;
      if (db.dailyLosses.some((l) => l.id === lossId)) {
        acceptedLossIds.push(lossId);
        continue;
      }
      const lostGrams = Math.round(Number(rawLoss.lostGrams));
      const note = sanitizePlainText(rawLoss.note, 200);
      if (Number.isInteger(lostGrams) && lostGrams > 0 && lostGrams <= 5_000_000 && note) {
        db.dailyLosses.unshift({
          id: lossId,
          vendorId: vendor.id,
          vendorName: vendor.name,
          workdayId: `wd-${vendor.id}`,
          dateYmd: getMexicoCityYmd(),
          lostGrams,
          note,
          createdAtUtc: nowUtc,
        });
        acceptedLossIds.push(lossId);
      }
    }

    for (const rawInc of incomingIncidents) {
      const incId = sanitizePlainText(rawInc.id, 80) || `inc-${crypto.randomUUID()}`;
      if (db.moneyIncidents.some((i) => i.id === incId)) {
        acceptedIncidentIds.push(incId);
        continue;
      }
      const amountCentavos = Math.round(Number(rawInc.amountCentavos));
      const description = sanitizePlainText(rawInc.description, 200);
      const allowedTypes = new Set(['perdida', 'robo', 'faltante', 'otro'] as const);
      const safeType = allowedTypes.has(rawInc.type) ? rawInc.type : 'otro';
      if (Number.isInteger(amountCentavos) && amountCentavos > 0 && amountCentavos <= 100_000_000 && description) {
        db.moneyIncidents.unshift({
          id: incId,
          vendorId: vendor.id,
          vendorName: vendor.name,
          type: safeType,
          amountCentavos,
          occurredAtUtc: nowUtc,
          relatedDeliveryId: null,
          relatedCustomerId: null,
          description,
          peoplePresent: [vendor.name],
          status: 'reportado',
          ownerNote: null,
        });
        acceptedIncidentIds.push(incId);
      }
    }

    // Update vendor device lastSyncUtc
    if (registeredDevice) {
      registeredDevice.lastSyncUtc = nowUtc;
      registeredDevice.pendingSyncCount = 0;
    }

    store.persist();
    broadcastEvent('delivery:synced', {
      vendorId: vendor.id,
      vendorName: vendor.name,
      acceptedDeliveries,
      skippedDuplicates,
    });
    broadcastEvent('bodega:updated', { source: 'android_sync', vendorId: vendor.id });
    res.json({
      ok: true,
      acceptedDeliveries,
      skippedDuplicates,
      acceptedDeliveryIds,
      acceptedPaymentIds,
      acceptedLossIds,
      acceptedIncidentIds,
      syncedAtUtc: nowUtc,
    });
  });

  app.get('/api/sync/pull', syncLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const todayYmd = getMexicoCityYmd();
    const latestPrice = db.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? db.dailyPrices[0];
    const user = db.users.find((u) => u.id === req.user!.sub);

    if (!user || user.status !== 'activa') {
      res.status(403).json({
        error: 'Cuenta inactiva o bloqueada por el dueño.',
        accountStatus: user?.status ?? 'bloqueada',
      });
      return;
    }

    let deviceAuthorized = true;
    const queryDeviceId = sanitizePlainText(req.query.deviceId ?? req.headers['x-device-id'], 80);
    if (user.role === 'vendedor') {
      if (!queryDeviceId || !isValidEntityId(queryDeviceId)) {
        res.status(400).json({ error: 'El identificador del dispositivo es obligatorio para sincronizar.' });
        return;
      }
      const device = db.devices.find((d) => d.id === queryDeviceId && d.userId === user.id);
      if (!device || !device.active) {
        deviceAuthorized = false;
        res.status(403).json({
          error: 'Este teléfono aún no está autorizado por el dueño en Windows (Vendedores).',
          accountStatus: user.status,
          deviceAuthorized: false,
        });
        return;
      }
      device.lastSyncUtc = new Date().toISOString();
      store.persist();
    }

    const inventory = calculateBrandInventory(
      db.warehouseShipments,
      db.deliveries,
      db.deliveryBoxes
    );
    const activeCustomers = db.customers
      .filter((c) => !c.mergedIntoCustomerId && c.active)
      .map((c) => ({
        ...c,
        activeDebtCentavos: calculateCustomerLedger(c.id, db.deliveries, db.payments)
          .balanceCentavos,
      }));

    res.json({
      serverTimeUtc: new Date().toISOString(),
      accountStatus: user.status,
      deviceAuthorized,
      folioSeries: user.folioSeries ?? null,
      dailyPrice: latestPrice ?? null,
      customers: activeCustomers,
      inventory,
      crewMembers: db.crewMembers.filter((m) => m.active),
      settings: {
        businessName: db.settings.businessName,
        slogan: db.settings.slogan,
        businessPhone: db.settings.businessPhone,
        businessAddress: db.settings.businessAddress,
      },
    });
  });

  // Vite dev middleware vs static production build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = process.env.APP_DIST_DIR?.trim()
      ? path.resolve(process.env.APP_DIST_DIR.trim())
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Directo de Granja Windows Desktop & Real-Time Backend running on http://0.0.0.0:${PORT}`);
      resolve();
    });
  });

  return {
    port: PORT,
    close: async () => {
      for (const client of wsClients) {
        try {
          client.ws.close(1001, 'Cerrando aplicación de escritorio');
        } catch {
          // Ignore close error
        }
      }
      await new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => {
            try {
              store.close();
            } catch {
              // Ignore
            }
            resolve();
          });
        });
      });
    },
  };
}

if (process.env.SKIP_AUTO_START !== '1') {
  startBackendServer().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
