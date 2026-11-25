import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  calculateBrandInventory,
  calculateCustomerLedger,
  calculateDeliveryTotals,
  calculateDeliveryItemsTotals,
  calculateVendorClosing,
  formatCurrencyFromCentavos,
  formatFolio,
  formatKgFromGrams,
  getMexicoCityYmd,
  normalizeBrandName,
  normalizeCustomerName,
  normalizePhone,
  sanitizeImportedCell,
  splitTotalGramsIntoBoxes,
  validateBodegaSaleStock,
  validatePaymentAmount,
  type Customer,
  type Delivery,
  type DeliveryItem,
  type DeliveryBox,
  type Payment,
  type WarehouseShipment,
  type WarehouseShipmentLine,
} from './shared/domain.ts';
import {
  hashPassword,
  protectSensitive,
  revealSensitive,
  requireAuth,
  requireRole,
  sanitizePlainText,
  signJwt,
  validateSecurityConfiguration,
  verifyJwt,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/security.ts';
import { store } from './server/store.ts';
import { swaggerSpec } from './server/swagger.ts';

const PORT = 3000;

async function bootstrap() {
  validateSecurityConfiguration();
  const app = express();
  const httpServer = http.createServer(app);

  // Security headers compatible with AI Studio preview iframe
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      } : false,
      crossOriginEmbedderPolicy: false,
      xFrameOptions: false,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
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

  // WebSocket server for real-time sync & proactive alerts
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });
  const wsClients = new Set<{ ws: WebSocket; userId: string; role: string }>();

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token') ?? '';
      if (!token) {
        ws.close(4001, 'Token JWT requerido');
        return;
      }
      const claims = verifyJwt(token);
      const user = store.getRawUsers().find((u) => u.id === claims.sub && u.status === 'activa');
      if (!user) {
        ws.close(4003, 'Cuenta inactiva');
        return;
      }
      const client = { ws, userId: claims.sub, role: claims.role };
      wsClients.add(client);

      ws.send(
        JSON.stringify({
          type: 'telemetry:connected',
          timestampUtc: new Date().toISOString(),
          activeClients: wsClients.size,
        })
      );

      ws.on('close', () => {
        wsClients.delete(client);
      });
    } catch {
      ws.close(4003, 'Token JWT inválido');
    }
  });

  function broadcastEvent(type: string, payload: unknown) {
    const msg = JSON.stringify({
      type,
      payload,
      timestampUtc: new Date().toISOString(),
    });
    for (const c of wsClients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(msg);
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
    res.json({
      status: 'healthy',
      service: 'Directo de Granja — Te faltan huevos a nosotros nos sobran',
      timestampUtc: new Date().toISOString(),
    });
  });

  // Authentication
  app.post('/api/auth/login', authLimiter, (req, res) => {
    const email = sanitizePlainText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Correo y contraseña requeridos.' });
      return;
    }

    const user = store.getRawUsers().find((u) => u.googleEmail.toLowerCase() === email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    if (user.status === 'bloqueada') {
      res.status(403).json({ error: 'Cuenta bloqueada por el dueño.' });
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
    });

    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ token, user: safeUser });
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

  // First contact from a vendor phone creates a pending device for owner approval.
  app.post('/api/devices/register', requireAuth, requireRole('vendedor'), (req: AuthenticatedRequest, res) => {
    const deviceId = sanitizePlainText(req.body?.deviceId, 80);
    const deviceName = sanitizePlainText(req.body?.deviceName, 100);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId) || !deviceName) {
      res.status(400).json({ error: 'Se requiere identificador y nombre válidos del teléfono.' });
      return;
    }
    const db = store.getDb();
    const existing = db.devices.find((device) => device.id === deviceId);
    if (existing && existing.userId !== req.user!.sub) {
      res.status(409).json({ error: 'Este dispositivo ya está vinculado a otra cuenta.' });
      return;
    }
    const device = existing ?? {
      id: deviceId,
      userId: req.user!.sub,
      deviceName,
      active: false,
      lastSyncUtc: null,
      pendingSyncCount: 0,
    };
    device.deviceName = deviceName;
    if (!existing) db.devices.push(device);
    store.addAudit('devices', deviceId, existing ? 'ACTUALIZAR_DISPOSITIVO' : 'SOLICITAR_DISPOSITIVO',
      existing ? `El equipo ${deviceName} actualizó su registro.` : `El equipo ${deviceName} espera autorización.`,
      req.user!.sub, req.user!.name);
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'devices' });
    res.status(existing ? 200 : 202).json({ authorized: device.active, deviceId, status: device.active ? 'activa' : 'pendiente' });
  });

  app.post('/api/auth/users', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const name = sanitizePlainText(req.body?.name, 100);
    const email = sanitizePlainText(req.body?.email, 140).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'dueno' ? ('dueno' as const) : ('vendedor' as const);

    if (!name || !email.includes('@') || password.length < 8) {
      res.status(400).json({
        error: 'Nombre, correo válido y contraseña mínima de 8 caracteres son obligatorios.',
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

  // Full dashboard state for Owner Windows app
  app.get('/api/dashboard/state', requireAuth, requireRole('dueno'), (_req, res) => {
    res.json(store.getState());
  });

  // Vendors management: Approve, Block, Authorize single device
  app.post('/api/vendors/:id/approve', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const vendor = db.users.find((u) => u.id === req.params.id && u.role === 'vendedor');
    if (!vendor) {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }

    const requestedSeries = sanitizePlainText(req.body?.folioSeries, 4).toUpperCase();
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
    broadcastEvent('vendor:updated', { vendorId: vendor.id, status: 'bloqueada' });
    res.json({ ok: true });
  });

  app.post('/api/devices/:id/authorize', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const target = db.devices.find((d) => d.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Dispositivo no encontrado.' });
      return;
    }

    // Rule: Only 1 active device per vendor account
    db.devices
      .filter((d) => d.userId === target.userId)
      .forEach((d) => {
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
    broadcastEvent('sync:state_updated', { entity: 'devices' });
    res.json({ ok: true });
  });

  app.post('/api/sync/folios/reserve', syncLimiter, requireAuth, requireRole('vendedor'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const vendor = db.users.find((user) => user.id === req.user!.sub && user.role === 'vendedor' && user.status === 'activa');
    const deviceId = sanitizePlainText(req.body?.deviceId, 80);
    const device = db.devices.find((entry) => entry.id === deviceId && entry.userId === req.user!.sub && entry.active);
    const count = Number.isInteger(req.body?.count) ? Number(req.body.count) : 100;
    if (!vendor || !vendor.folioSeries || !device) {
      res.status(403).json({ error: 'Cuenta o teléfono sin autorización activa.' });
      return;
    }
    if (count < 1 || count > 500) {
      res.status(400).json({ error: 'El bloque debe contener entre 1 y 500 folios.' });
      return;
    }
    let first = 0;
    let last = 0;
    for (let i = 0; i < count; i++) {
      const reserved = store.reserveNextFolio(vendor.folioSeries);
      if (i === 0) first = reserved.folioNumber;
      last = reserved.folioNumber;
    }
    device.folioBlocks ??= [];
    device.folioBlocks.push({ series: vendor.folioSeries, start: first, end: last, usedNumbers: [] });
    store.addAudit('devices', device.id, 'RESERVAR_FOLIOS', `Bloque ${vendor.folioSeries}-${first} a ${last} reservado para ${device.deviceName}.`, req.user!.sub, req.user!.name);
    store.persist();
    res.status(201).json({ series: vendor.folioSeries, start: first, end: last, folios: Array.from({ length: count }, (_, index) => first + index) });
  });

  // Daily Price
  app.post('/api/prices', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const pricePesos = Number(req.body?.pricePesosPerKg);
    const dateYmd = sanitizePlainText(req.body?.dateYmd, 10) || getMexicoCityYmd();

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

  app.post('/api/deliveries/:id/review', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const decision = req.body?.decision === 'aprobar' ? 'aprobada' : req.body?.decision === 'rechazar' ? 'rechazada' : null;
    const note = sanitizePlainText(req.body?.note, 240);
    if (!decision || (decision === 'rechazada' && note.length < 4)) {
      res.status(400).json({ error: 'Seleccione aprobar o rechazar; para rechazar escriba un motivo.' });
      return;
    }
    const db = store.getDb();
    const delivery = db.deliveries.find((entry) => entry.id === req.params.id);
    if (!delivery) {
      res.status(404).json({ error: 'Entrega no encontrada.' });
      return;
    }
    if (delivery.reviewStatus !== 'pendiente') {
      res.status(409).json({ error: 'Esta entrega ya fue revisada.' });
      return;
    }
    delivery.reviewStatus = decision;
    delivery.reviewNote = note || null;
    db.payments.filter((payment) => payment.deliveryId === delivery.id && payment.reviewStatus === 'pendiente')
      .forEach((payment) => { payment.reviewStatus = decision; });
    const nowUtc = new Date().toISOString();
    db.deliveryEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      deliveryId: delivery.id,
      eventType: 'sincronizacion',
      detail: decision === 'aprobada' ? 'Entrega aprobada por el dueño en Windows.' : `Entrega rechazada por el dueño: ${note}`,
      actorUserId: req.user!.sub,
      actorName: req.user!.name,
      deviceId: 'win-owner-desktop',
      occurredAtUtc: nowUtc,
      arrivedAtServerUtc: nowUtc,
    });
    store.addAudit('deliveries', delivery.id, decision === 'aprobada' ? 'APROBAR_ENTREGA_ANDROID' : 'RECHAZAR_ENTREGA_ANDROID',
      `${delivery.folioFormatted} ${decision}${note ? `: ${note}` : ''}`, req.user!.sub, req.user!.name);
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'deliveries', deliveryId: delivery.id });
    res.json({ ok: true, delivery });
  });

  app.post('/api/deliveries/:id/reprint', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
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
    const specialPriceCentavosPerKg = rawSpecialPrice === '' || rawSpecialPrice === null || rawSpecialPrice === undefined
      ? null
      : Math.round(Number(rawSpecialPrice) * 100);
    const rawCreditDays = req.body?.creditTermDays;
    const creditTermDays = rawCreditDays === '' || rawCreditDays === null || rawCreditDays === undefined
      ? null
      : Number(rawCreditDays);

    if (!businessName) {
      res.status(400).json({ error: 'El nombre del negocio es obligatorio.' });
      return;
    }
    if (specialPriceCentavosPerKg !== null && (!Number.isInteger(specialPriceCentavosPerKg) || specialPriceCentavosPerKg <= 0 || specialPriceCentavosPerKg > 50_000)) {
      res.status(400).json({ error: 'La tarifa especial debe ser mayor a $0 y menor o igual a $500/kg.' });
      return;
    }
    if (creditTermDays !== null && (!Number.isInteger(creditTermDays) || creditTermDays < 0 || creditTermDays > 3650)) {
      res.status(400).json({ error: 'El plazo de crédito debe ser de 0 a 3650 días.' });
      return;
    }

    const db = store.getDb();
    const customer: Customer = {
      id: `cust-${crypto.randomUUID()}`,
      businessName,
      contactName: protectSensitive(contactName),
      phone: protectSensitive(phone),
      address: protectSensitive(address),
      notes: protectSensitive(notes),
      specialPriceCentavosPerKg,
      creditTermDays,
      active: true,
      createdByUserId: req.user!.sub,
      mergedIntoCustomerId: null,
      createdAtUtc: new Date().toISOString(),
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
    res.status(201).json({ customer: { ...customer, contactName, phone, address, notes } });
  });

  app.post('/api/customers/:id/payments', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
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

    // Apply by default to oldest unpaid delivery if applicable
    const oldestValid = db.deliveries
      .filter((d) => d.customerId === customer.id && d.status === 'vigente')
      .sort((a, b) => a.createdAtUtc.localeCompare(b.createdAtUtc))[0];

    const payment: Payment = {
      id: `pay-${crypto.randomUUID()}`,
      customerId: customer.id,
      deliveryId: oldestValid?.id ?? null,
      vendorId: req.user!.sub,
      amountCentavos,
      method,
      status: method === 'efectivo' ? 'verificado' : 'por_verificar',
      createdAtUtc: new Date().toISOString(),
      note,
    };

    db.payments.push(payment);
    if (oldestValid) {
      db.deliveryEvents.push({
        id: `evt-${crypto.randomUUID()}`,
        deliveryId: oldestValid.id,
        eventType: 'abono',
        detail: `Abono posterior ${formatCurrencyFromCentavos(amountCentavos)} (${method})`,
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
      `Abono ${formatCurrencyFromCentavos(amountCentavos)} registrado a ${customer.businessName}`,
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'payments' });
    res.status(201).json({ payment });
  });

  app.post('/api/customers/merge', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const primaryId = sanitizePlainText(req.body?.primaryId, 80);
    const duplicateId = sanitizePlainText(req.body?.duplicateId, 80);

    if (!primaryId || !duplicateId || primaryId === duplicateId) {
      res.status(400).json({ error: 'Seleccione dos clientes distintos para unir.' });
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
    broadcastEvent('incident:updated', { incidentId: incident.id, status: 'revisado' });
    res.json({ ok: true, incident });
  });

  // Cash Closing (Cierre general / por vendedor)
  app.post('/api/closings', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const vendorId = sanitizePlainText(req.body?.vendorId, 80);
    const dateYmd = sanitizePlainText(req.body?.dateYmd, 10) || getMexicoCityYmd();
    const rawActualCash = req.body?.actualCashPesos;
    const actualCashPesos =
      rawActualCash === '' || rawActualCash === null || rawActualCash === undefined
        ? NaN
        : Number(rawActualCash);

    if (!vendorId || !Number.isFinite(actualCashPesos) || actualCashPesos < 0 || actualCashPesos > 100_000_000) {
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
    broadcastEvent('closing:created', closing);
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
          .map((c) => `${normalizeCustomerName(c.businessName)}|${normalizePhone(revealSensitive(c.phone))}`)
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
          contactName: protectSensitive(contactName),
          phone: protectSensitive(phone),
          address: protectSensitive(address),
          notes: protectSensitive(notes),
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
    store.addAudit(
      'settings',
      'global',
      'ACTUALIZAR_AJUSTES',
      'Configuración del negocio y preferencias de Windows actualizadas',
      req.user!.sub,
      req.user!.name
    );
    store.persist();
    broadcastEvent('sync:state_updated', { entity: 'settings' });
    res.json({ settings: db.settings });
  });

  // Proactive Alerts Acknowledge
  app.post('/api/monitoring/alerts/:id/ack', requireAuth, requireRole('dueno'), (req, res) => {
    store.acknowledgeAlert(req.params.id);
    broadcastEvent('alert:acknowledged', { alertId: req.params.id });
    res.json({ ok: true });
  });

  // Bodega: Register Farm -> Warehouse Torton / Trailer Arrival
  app.post('/api/bodega/shipments', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const vehicleType = req.body?.vehicleType === 'trailer' ? ('trailer' as const) : ('torton' as const);
    const referenceCode = sanitizePlainText(req.body?.referenceCode, 80);
    const originFarm = sanitizePlainText(req.body?.originFarm, 120) || 'Granja origen';
    const driverName = sanitizePlainText(req.body?.driverName, 80);
    const notes = sanitizePlainText(req.body?.notes, 240);
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (rawLines.length === 0 || rawLines.length > 50) {
      res.status(400).json({ error: 'Debe agregar entre 1 y 50 lotes de marca de huevo al viaje.' });
      return;
    }

    const shipmentId = `shp-${crypto.randomUUID()}`;
    const lines: WarehouseShipmentLine[] = [];

    for (const raw of rawLines) {
      const brandName = sanitizePlainText(raw?.brandName, 80);
      const brandKey = normalizeBrandName(brandName);
      const boxesCount = Number(raw?.boxesCount);
      const totalKg = Number(raw?.totalKg);
      const totalGrams = Math.round(totalKg * 1000);

      if (
        !brandName ||
        !brandKey ||
        !Number.isInteger(boxesCount) ||
        boxesCount <= 0 ||
        boxesCount > 50_000 ||
        !Number.isFinite(totalKg) ||
        totalGrams <= 0 ||
        totalGrams > 50_000_000
      ) {
        res.status(400).json({
          error: 'Cada lote debe indicar marca válida, cajas enteras (> 0) y peso total en kg (> 0).',
        });
        return;
      }

      lines.push({
        id: `shl-${crypto.randomUUID()}`,
        shipmentId,
        brandKey,
        brandName,
        boxesCount,
        totalGrams,
      });
    }

    const db = store.getDb();
    const nowUtc = new Date().toISOString();
    const shipment: WarehouseShipment = {
      id: shipmentId,
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
      .map((l) => `${l.boxesCount} cajas ${l.brandName} (${formatKgFromGrams(l.totalGrams)})`)
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

  // Bodega: Direct Warehouse Egg Sale with Atomic Brand Inventory Deduction
  app.post('/api/bodega/sales', requireAuth, requireRole('dueno'), (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const todayYmd = getMexicoCityYmd();
    const nowUtc = new Date().toISOString();

    const customerIdInput = sanitizePlainText(req.body?.customerId, 80);
    const newCustomerName = sanitizePlainText(req.body?.newCustomerName, 120);
    const newCustomerPhone = normalizePhone(sanitizePlainText(req.body?.newCustomerPhone, 20));
    const brandInput = sanitizePlainText(req.body?.brandName, 80);
    const boxesCount = Number(req.body?.boxesCount);
    const weighMode = req.body?.weighMode === 'cajas' ? ('cajas' as const) : ('total' as const);
    const isSpecialPrice = Boolean(req.body?.isSpecialPrice);

    if (!brandInput) {
      res.status(400).json({ error: 'Seleccione la marca de huevo a vender.' });
      return;
    }

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
          contactName: protectSensitive('Cliente de bodega'),
          phone: protectSensitive(newCustomerPhone),
          address: protectSensitive('Compra directa en bodega'),
          notes: protectSensitive(''),
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

    if (!Number.isInteger(boxesCount) || boxesCount <= 0 || boxesCount > 5000) {
      res.status(400).json({ error: 'La cantidad de cajas por venta debe estar entre 1 y 5,000.' });
      return;
    }

    // 2. Validate available inventory for requested brand BEFORE mutating anything
    const inventory = calculateBrandInventory(db.warehouseShipments, db.deliveries, db.deliveryBoxes);
    let matchedStock;
    try {
      matchedStock = validateBodegaSaleStock(inventory, brandInput, boxesCount);
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }

    // 3. Build integer grams per box
    let boxesGrams: number[] = [];
    if (weighMode === 'cajas') {
      const rawBoxes = Array.isArray(req.body?.boxesGrams) ? req.body.boxesGrams : [];
      if (rawBoxes.length !== boxesCount || rawBoxes.length > 500) {
        res.status(400).json({
          error: `Debe capturar exactamente ${boxesCount} peso(s) individuales de caja.`,
        });
        return;
      }
      boxesGrams = rawBoxes.map((g: unknown) => Math.round(Number(g)));
      if (boxesGrams.some((g) => !Number.isInteger(g) || g <= 0 || g > 200_000)) {
        res.status(400).json({ error: 'Cada caja debe tener un peso válido mayor a 0.' });
        return;
      }
    } else {
      const totalKg = Number(req.body?.totalKg);
      const totalGrams = Math.round(totalKg * 1000);
      if (!Number.isFinite(totalKg) || totalGrams <= 0 || totalGrams > 50_000_000) {
        res.status(400).json({ error: 'Ingrese el peso total en báscula (kg) mayor a 0.' });
        return;
      }
      try {
        boxesGrams = splitTotalGramsIntoBoxes(totalGrams, boxesCount);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    // 4. Resolve price per kg
    const latestPrice = db.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? db.dailyPrices[0];
    const requestedPricePesos = Number(req.body?.pricePesosPerKg);
    let priceCentavosPerKg: number;
    if (isSpecialPrice || !latestPrice) {
      priceCentavosPerKg = Math.round(requestedPricePesos * 100);
    } else {
      priceCentavosPerKg = Number.isFinite(requestedPricePesos) && requestedPricePesos > 0
        ? Math.round(requestedPricePesos * 100)
        : latestPrice.priceCentavosPerKg;
    }

    if (!Number.isInteger(priceCentavosPerKg) || priceCentavosPerKg <= 0 || priceCentavosPerKg > 50_000) {
      res.status(400).json({ error: 'El precio por kilo debe ser mayor a $0 (publique el precio del día o capture uno válido).' });
      return;
    }

    let calc;
    try {
      calc = calculateDeliveryTotals(boxesGrams, priceCentavosPerKg);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

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
        validatePaymentAmount(paidCentavos, calc.totalToChargeCentavos);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    // 6. Commit Bodega Sale & Inventory Deduction atomically
    const folioInfo = store.reserveNextFolio('BD');
    const deliveryId = `del-bd-${crypto.randomUUID()}`;
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
      priceCentavosPerKg,
      isSpecialPrice,
      totalGrams: calc.totalGrams,
      calculatedTotalExactMilliCentavos: calc.calculatedExactMilliCentavos,
      totalToChargeCentavos: calc.totalToChargeCentavos,
      status: 'vigente',
      cancellationReason: null,
      syncedAtUtc: nowUtc,
      sourceType: 'bodega',
      brandKey: matchedStock.brandKey,
      brandName: matchedStock.brandName,
      boxesCount,
    };

    const createdBoxes: DeliveryBox[] = boxesGrams.map((wg, i) => ({
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
        note: `Pago en bodega · ${boxesCount} cajas ${matchedStock.brandName}`,
      };
      db.payments.push(createdPayment);
    }

    db.deliveryEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      deliveryId,
      eventType: 'creacion',
      detail: `Venta directa en bodega ${delivery.folioFormatted}: ${boxesCount} cajas de ${matchedStock.brandName} (${formatKgFromGrams(calc.totalGrams)})`,
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
      `${delivery.folioFormatted} · ${customer.businessName}: -${boxesCount} cajas ${matchedStock.brandName} (${formatKgFromGrams(calc.totalGrams)}) = ${formatCurrencyFromCentavos(calc.totalToChargeCentavos)}`,
      req.user!.sub,
      req.user!.name
    );

    store.persist();
    broadcastEvent('bodega:updated', { deliveryId, brandKey: matchedStock.brandKey });
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

  // Android Real-Time Sync Endpoints (POST /api/sync/push & GET /api/sync/pull)
  // Supports both real Android apps (role: vendedor) and live Owner simulation test
  app.post('/api/sync/push', syncLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const isOwnerSim = req.user!.role === 'dueno' && req.body?.simulateFromVendorId;
    const vendorId = isOwnerSim ? String(req.body.simulateFromVendorId) : req.user!.sub;
    const vendor = db.users.find((u) => u.id === vendorId && u.role === 'vendedor');

    if (!vendor) {
      res.status(404).json({ error: 'Vendedor inválido para sincronización.' });
      return;
    }
    if (vendor.status !== 'activa' || !vendor.folioSeries) {
      res.status(403).json({ error: 'La cuenta del vendedor no está aprobada o está bloqueada.' });
      return;
    }

    const deviceId = sanitizePlainText(req.body?.deviceId, 80);
    const authorizedDevice = isOwnerSim
      ? null
      : db.devices.find((device) => device.id === deviceId && device.userId === vendor.id && device.active);
    if (!isOwnerSim && !authorizedDevice) {
      res.status(403).json({ error: 'Este teléfono no está autorizado por el dueño para sincronizar.' });
      return;
    }

    const incomingDeliveries = Array.isArray(req.body?.deliveries) ? req.body.deliveries : [];
    const incomingPayments = Array.isArray(req.body?.payments) ? req.body.payments : [];
    const incomingLosses = Array.isArray(req.body?.losses) ? req.body.losses : [];
    const incomingIncidents = Array.isArray(req.body?.incidents) ? req.body.incidents : [];

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
        skippedDuplicates++;
        acceptedDeliveryIds.push(delId);
        continue;
      }

      const customer = db.customers.find((c) => c.id === rawDel.customerId);
      if (!customer) continue;

      let rawItems = Array.isArray(rawDel.items) ? rawDel.items.slice(0, 500) : [];
      if (!rawItems.length && typeof rawDel.itemsSnapshotJson === 'string') {
        try {
          const parsedItems = JSON.parse(rawDel.itemsSnapshotJson);
          if (Array.isArray(parsedItems)) rawItems = parsedItems.slice(0, 500);
        } catch { /* malformed local snapshot is rejected below */ }
      }
      const items: DeliveryItem[] = rawItems.map((item: any, index: number) => {
        const grossGrams = Number.isFinite(Number(item.grossGrams))
          ? Math.round(Number(item.grossGrams))
          : Math.round(Number(item.inputWeightKg ?? item.inputKg) * 1000);
        const tareGrams = Number.isFinite(Number(item.tareGrams))
          ? Math.round(Number(item.tareGrams))
          : Math.round(Number(item.tareDeductionKg ?? item.tareKg) * 1000);
        const netGrams = Number.isFinite(Number(item.netGrams))
          ? Math.round(Number(item.netGrams))
          : Math.round(Number(item.netWeightKg ?? item.netKg) * 1000);
        const priceCentavosPerKg = Number.isFinite(Number(item.priceCentavosPerKg))
          ? Math.round(Number(item.priceCentavosPerKg))
          : Math.round(Number(item.pricePerKg ?? item.priceKg) * 100);
        return {
          id: sanitizePlainText(item.id, 80) || `item-${index + 1}`,
          brand: sanitizePlainText(item.brand, 80),
          modality: sanitizePlainText(item.modality, 40) || 'CAJA_COMPLETA',
          boxesMilli: Math.round(Number(item.boxesMilli ?? Number(item.boxesDecimal ?? item.boxes ?? 1) * 1000)),
          grossGrams,
          tareGrams,
          netGrams,
          priceCentavosPerKg,
          subtotalMilliCentavos: netGrams * priceCentavosPerKg,
        };
      }).filter((item: DeliveryItem) =>
        Number.isSafeInteger(item.boxesMilli) && item.boxesMilli > 0 && item.boxesMilli <= 5_000_000 &&
        item.grossGrams > 0 && item.grossGrams <= 200_000 &&
        item.tareGrams >= 0 && item.netGrams > 0 && item.netGrams <= item.grossGrams &&
        item.priceCentavosPerKg > 0 && item.priceCentavosPerKg <= 50_000
      );
      const boxesGrams: number[] = Array.isArray(rawDel.boxesGrams)
        ? rawDel.boxesGrams.slice(0, 500).map((g: unknown) => Math.round(Number(g)))
        : [];
      const priceCentavosPerKg = Math.round(Number(rawDel.priceCentavosPerKg));
      const rawSugar = rawDel.sugar && typeof rawDel.sugar === 'object'
        ? rawDel.sugar
        : Number(rawDel.sugarSacks) > 0
          ? { sacks: rawDel.sugarSacks, weightPerSackKg: rawDel.sugarSackWeightKg, pricePerSackMxn: rawDel.sugarPricePerSackMxn }
          : null;
      const sugarSacksMilli = Math.round(Number(rawSugar?.sacksMilli ?? Number(rawSugar?.sacks ?? 0) * 1000));
      const sugarWeightPerSackGrams = Math.round(Number(rawSugar?.weightPerSackGrams ?? Number(rawSugar?.weightPerSackKg ?? 0) * 1000));
      const sugarPricePerSackCentavos = Math.round(Number(rawSugar?.pricePerSackCentavos ?? Number(rawSugar?.pricePerSackMxn ?? 0) * 100));
      const sugarMilliCentavos = sugarSacksMilli * sugarPricePerSackCentavos;
      const sugarGrams = Math.round(sugarSacksMilli * sugarWeightPerSackGrams / 1000);
      const sugar = sugarSacksMilli > 0 && sugarWeightPerSackGrams > 0 && sugarPricePerSackCentavos > 0
        ? {
            sacksMilli: sugarSacksMilli,
            weightPerSackGrams: sugarWeightPerSackGrams,
            pricePerSackCentavos: sugarPricePerSackCentavos,
            subtotalMilliCentavos: sugarMilliCentavos,
            subtotalCentavos: Math.floor(sugarMilliCentavos / 1000 + 0.5),
          }
        : undefined;
      if (rawSugar && !sugar) continue;
      let calc;
      try {
        if (items.length || sugar) {
          calc = calculateDeliveryItemsTotals(
            items,
            sugar?.subtotalMilliCentavos ?? 0,
            sugarGrams,
          );
        } else {
          if (boxesGrams.length === 0 ||
              boxesGrams.some((g) => !Number.isInteger(g) || g <= 0 || g > 200_000) ||
              !Number.isInteger(priceCentavosPerKg) || priceCentavosPerKg <= 0 || priceCentavosPerKg > 50_000) continue;
          calc = calculateDeliveryTotals(boxesGrams, priceCentavosPerKg);
        }
      } catch {
        continue;
      }

      const requestedFolioNumber = Number(rawDel.folioNumber);
      const assignedFolioBlock = !isOwnerSim && authorizedDevice
        ? authorizedDevice.folioBlocks?.find((block) =>
            block.series === vendor.folioSeries &&
            Number.isInteger(requestedFolioNumber) &&
            requestedFolioNumber >= block.start && requestedFolioNumber <= block.end &&
            !block.usedNumbers.includes(requestedFolioNumber))
        : undefined;
      if (!isOwnerSim && !assignedFolioBlock) continue;

      const folioInfo =
        Number.isInteger(rawDel.folioNumber) &&
        rawDel.folioNumber > 0 &&
        rawDel.folioNumber <= 999_999
          ? {
              folioNumber: rawDel.folioNumber,
              folioFormatted: formatFolio(vendor.folioSeries, rawDel.folioNumber),
            }
          : store.reserveNextFolio(vendor.folioSeries);

      // Avoid duplicate folio collision
      if (db.deliveries.some((d) => d.folioFormatted === folioInfo.folioFormatted)) {
        skippedDuplicates++;
        continue;
      }

      const delivery: Delivery = {
        id: delId,
        vendorId: vendor.id,
        vendorName: vendor.name,
        workdayId: sanitizePlainText(rawDel.workdayId, 60) || `wd-${vendor.id}`,
        driverName: sanitizePlainText(rawDel.driverName ?? rawDel.routeDriverName, 80) || 'Chofer de ruta',
        helpersNames: Array.isArray(rawDel.helpersNames)
          ? rawDel.helpersNames.map((h: unknown) => sanitizePlainText(h, 60))
          : sanitizePlainText(rawDel.routeHelperName, 60) ? [sanitizePlainText(rawDel.routeHelperName, 60)] : [],
        series: vendor.folioSeries,
        folioNumber: folioInfo.folioNumber,
        folioFormatted: folioInfo.folioFormatted,
        customerId: customer.id,
        customerName: customer.businessName,
        createdAtUtc: sanitizePlainText(rawDel.createdAtUtc, 40) || nowUtc,
        priceCentavosPerKg: items[0]?.priceCentavosPerKg ?? priceCentavosPerKg,
        isSpecialPrice: Boolean(rawDel.isSpecialPrice),
        totalGrams: calc.totalGrams,
        calculatedTotalExactMilliCentavos: calc.calculatedExactMilliCentavos,
        totalToChargeCentavos: calc.totalToChargeCentavos,
        paymentTerm: rawDel.paymentTerm === 'CREDITO' || rawDel.paymentMethod === 'CREDITO'
          ? 'CREDITO'
          : 'CONTADO',
        ...(items.length ? { items } : {}),
        ...(sugar ? { sugar } : {}),
        ...(!isOwnerSim ? { reviewStatus: 'pendiente' as const, reviewNote: null } : {}),
        status: 'vigente',
        cancellationReason: null,
        syncedAtUtc: nowUtc,
      };
      db.deliveries.unshift(delivery);
      if (assignedFolioBlock) assignedFolioBlock.usedNumbers.push(folioInfo.folioNumber);

      const syncedBoxWeights = items.length ? items.map((item) => item.grossGrams) : boxesGrams;
      syncedBoxWeights.forEach((wg, i) => {
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
          detail: `Entrega ${delivery.folioFormatted} registrada (${syncedBoxWeights.length} pesajes)`,
          actorUserId: vendor.id,
          actorName: vendor.name,
          deviceId: deviceId || 'owner-simulation',
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
          deviceId: deviceId || 'owner-simulation',
          occurredAtUtc: nowUtc,
          arrivedAtServerUtc: nowUtc,
        }
      );
      acceptedDeliveries++;
      acceptedDeliveryIds.push(delivery.id);
    }

    for (const rawPay of incomingPayments) {
      const payId = sanitizePlainText(rawPay.id, 80) || `pay-${crypto.randomUUID()}`;
      if (db.payments.some((p) => p.id === payId)) { acceptedPaymentIds.push(payId); continue; }
      const method = rawPay.method === 'transferencia' ? 'transferencia' : 'efectivo';
      const amountCentavos = Math.round(Number(rawPay.amountCentavos));
      if (!Number.isInteger(amountCentavos) || amountCentavos <= 0 || amountCentavos > 100_000_000) continue;

      const customerId = sanitizePlainText(rawPay.customerId, 80);
      if (!db.customers.some((c) => c.id === customerId)) continue;
      const deliveryId = rawPay.deliveryId ? sanitizePlainText(rawPay.deliveryId, 80) : null;
      if (deliveryId) {
        const linkedDel = db.deliveries.find((d) => d.id === deliveryId);
        if (!linkedDel || amountCentavos > linkedDel.totalToChargeCentavos) continue;
      }

      db.payments.push({
        id: payId,
        customerId,
        deliveryId,
        vendorId: vendor.id,
        amountCentavos,
        method,
        status: method === 'efectivo' ? 'verificado' : 'por_verificar',
        createdAtUtc: sanitizePlainText(rawPay.createdAtUtc, 40) || nowUtc,
        note: sanitizePlainText(rawPay.note, 160) || 'Cobro en ruta Android',
        ...(!isOwnerSim ? { reviewStatus: 'pendiente' as const } : {}),
      });
      acceptedPaymentIds.push(payId);
    }

    for (const rawLoss of incomingLosses) {
      const lossId = sanitizePlainText(rawLoss.id, 80) || `loss-${crypto.randomUUID()}`;
      if (db.dailyLosses.some((l) => l.id === lossId)) { acceptedLossIds.push(lossId); continue; }
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
          driverName: sanitizePlainText(rawLoss.driverName, 80),
          helpersNames: Array.isArray(rawLoss.helpersNames)
            ? rawLoss.helpersNames.slice(0, 5).map((name: unknown) => sanitizePlainText(name, 60))
            : [],
          createdAtUtc: nowUtc,
        });
        acceptedLossIds.push(lossId);
      }
    }

    for (const rawInc of incomingIncidents) {
      const incId = sanitizePlainText(rawInc.id, 80) || `inc-${crypto.randomUUID()}`;
      if (db.moneyIncidents.some((i) => i.id === incId)) { acceptedIncidentIds.push(incId); continue; }
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
          peoplePresent: [
            vendor.name,
            sanitizePlainText(rawInc.driverName, 80),
            ...(Array.isArray(rawInc.helpersNames) ? rawInc.helpersNames.slice(0, 5).map((name: unknown) => sanitizePlainText(name, 60)) : []),
          ].filter(Boolean),
          status: 'reportado',
          ownerNote: null,
        });
        acceptedIncidentIds.push(incId);
      }
    }

    // Update vendor device lastSyncUtc
    const activeDevice = isOwnerSim
      ? db.devices.find((d) => d.userId === vendor.id && d.active)
      : authorizedDevice;
    if (activeDevice) {
      activeDevice.lastSyncUtc = nowUtc;
      activeDevice.pendingSyncCount = 0;
    }

    store.persist();
    broadcastEvent('delivery:synced', {
      vendorId: vendor.id,
      vendorName: vendor.name,
      acceptedDeliveries,
      skippedDuplicates,
    });
    const rejectedDeliveryIds = incomingDeliveries
      .map((rawDel: any) => sanitizePlainText(rawDel?.id, 80))
      .filter((id: string) => id && !acceptedDeliveryIds.includes(id));
    res.json({ ok: true, acceptedDeliveries, skippedDuplicates, acceptedDeliveryIds, rejectedDeliveryIds, acceptedPaymentIds, acceptedLossIds, acceptedIncidentIds, syncedAtUtc: nowUtc });
  });

  app.get('/api/sync/pull', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = store.getDb();
    const todayYmd = getMexicoCityYmd();
    const latestPrice = db.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? db.dailyPrices[0];
    const user = db.users.find((u) => u.id === req.user!.sub);
    if (!user || user.status !== 'activa') {
      res.status(403).json({ error: 'La cuenta no está activa.' });
      return;
    }
    if (user.role === 'vendedor') {
      const deviceId = sanitizePlainText(req.query.deviceId, 80);
      const authorized = db.devices.some((device) => device.id === deviceId && device.userId === user.id && device.active);
      if (!authorized) {
        res.status(403).json({ error: 'Este teléfono no está autorizado por el dueño para sincronizar.' });
        return;
      }
    }

    res.json({
      serverTimeUtc: new Date().toISOString(),
      accountStatus: user?.status ?? 'bloqueada',
      folioSeries: user?.folioSeries ?? null,
      dailyPrice: latestPrice ?? null,
      customers: db.customers
        .filter((c) => !c.mergedIntoCustomerId && c.active)
        .map((customer) => ({
          ...customer,
          phone: revealSensitive(customer.phone),
          contactName: revealSensitive(customer.contactName),
          address: revealSensitive(customer.address),
          notes: revealSensitive(customer.notes),
        })),
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Directo de Granja Windows Desktop & Real-Time Backend running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
