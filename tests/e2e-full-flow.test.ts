import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { WebSocket } from 'ws';
import {
  buildEscPosAbonoTicketBytes,
  buildEscPosDeliveryTicketBytes,
  buildEscPosTestTicketBytes,
} from '../src/services/windowsPrinter.ts';
import type { AppSettings, Delivery, Payment } from '../shared/domain.ts';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

describe('E2E Full Production Flow: Windows Desktop + Android Sync + SQLite + Printers', () => {
  let tmpDir = '';
  let baseUrl = '';
  let wsBaseUrl = '';
  let closeServer: (() => Promise<void>) | null = null;
  let sqlitePath = '';

  let ownerToken = '';
  let vendorToken = '';
  let vendorId = '';
  const vendorDeviceId = 'android-e2e-device-01';
  let customerId = '';
  let warehouseDeliveryId = '';
  let vendorDeliveryId = '';
  let syncedTransferPaymentId = '';
  let syncedStandaloneAbonoId = '';

  async function api(
    endpoint: string,
    options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json };
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-e2e-'));
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    wsBaseUrl = `ws://127.0.0.1:${port}`;

    process.env.JWT_SECRET = '9f4b8c1d7e2a6f0398d4c5b2a1e7f6d8c4b3a291807f6e5d4c3b2a1908f7e6d5';
    process.env.AES_ENCRYPTION_KEY =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    process.env.APP_USER_DATA_DIR = tmpDir;
    process.env.SQLITE_DB_PATH = 'data/directodegranja.db';
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_HTTP = 'true';
    process.env.SKIP_AUTO_START = '1';

    sqlitePath = path.join(tmpDir, 'data', 'directodegranja.db');

    const { startBackendServer } = await import('../server.ts');
    const started = await startBackendServer();
    closeServer = started.close;
  });

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. Primer arranque exige dueño real (sin cuentas demo) y bloquea contraseñas prohibidas', async () => {
    const statusRes = await api('/api/auth/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.json.bootstrapped).toBe(false);
    expect(statusRes.json.hasActiveOwner).toBe(false);
    expect(statusRes.json.userCount).toBe(0);

    const forbiddenDemoPass = Buffer.from('R3JhbmphMjAyNiE=', 'base64').toString('utf8');
    const demoAttempt = await api('/api/auth/bootstrap', {
      method: 'POST',
      body: {
        name: 'Dueño',
        email: 'admin@bodega.mx',
        password: forbiddenDemoPass,
      },
    });
    expect(demoAttempt.status).toBe(400);

    const bootRes = await api('/api/auth/bootstrap', {
      method: 'POST',
      body: {
        name: 'Alejandro Garza',
        email: 'alejandro@granja.mx',
        password: 'ClaveReal#Segura2026!',
      },
    });
    expect(bootRes.status).toBe(201);
    expect(bootRes.json.token).toBeTruthy();
    expect(bootRes.json.user.role).toBe('dueno');
    ownerToken = bootRes.json.token;

    const secondBoot = await api('/api/auth/bootstrap', {
      method: 'POST',
      body: {
        name: 'Otro',
        email: 'otro@granja.mx',
        password: 'ClaveReal#Segura9999!',
      },
    });
    expect(secondBoot.status).toBe(403);
  });

  it('2. Guarda y cifra datos del negocio + configuración de impresora térmica 48mm en SQLite', async () => {
    const setRes = await api('/api/settings', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessPhone: '5544332211',
        businessAddress: 'Bodega 14 Nave Sur',
        themeMode: 'dark',
        reduceAnimations: false,
        printerConfig: {
          mode: 'electron',
          printerName: 'Xprinter XP-58',
          paperWidthMm: 48,
          baudRate: 9600,
        },
      },
    });
    expect(setRes.status).toBe(200);
    expect(setRes.json.settings.printerConfig).toEqual({
      mode: 'electron',
      printerName: 'Xprinter XP-58',
      paperWidthMm: 48,
      baudRate: 9600,
    });

    const rawDb = new Database(sqlitePath, { readonly: true });
    const row = rawDb.prepare('SELECT * FROM app_settings WHERE id = 1').get() as any;
    rawDb.close();
    expect(row.business_phone).toMatch(/^enc:/);
    expect(row.business_address).toMatch(/^enc:/);
    expect(row.business_phone).not.toContain('5544332211');
    expect(JSON.parse(row.printer_config_json).printerName).toBe('Xprinter XP-58');
  });

  it('3. Crea y actualiza clientes con cifrado AES-256-GCM en reposo, tarifa especial y plazo de crédito', async () => {
    const custRes = await api('/api/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessName: 'Abarrotes La Esperanza',
        contactName: 'Sra. Martha',
        phone: '5599887766',
        address: 'Calz. Ermita 450',
        notes: 'Recibe antes de medio día',
        specialPricePesosPerKg: 38.5,
        creditTermDays: 14,
      },
    });
    expect(custRes.status).toBe(201);
    customerId = custRes.json.customer.id;
    expect(custRes.json.customer.specialPriceCentavosPerKg).toBe(3850);
    expect(custRes.json.customer.creditTermDays).toBe(14);

    const patchRes = await api(`/api/customers/${customerId}`, {
      method: 'PATCH',
      token: ownerToken,
      body: { creditTermDays: 10 },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.customer.creditTermDays).toBe(10);

    const rawDb = new Database(sqlitePath, { readonly: true });
    const rawCust = rawDb.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    rawDb.close();
    expect(rawCust.contact_name).toMatch(/^enc:/);
    expect(rawCust.phone).toMatch(/^enc:/);
    expect(rawCust.address).toMatch(/^enc:/);
    expect(rawCust.notes).toMatch(/^enc:/);
    expect(rawCust.phone).not.toContain('5599887766');
  });

  it('4. Registra entrada a bodega (E-0001), venta directa mixta (BD-0001) y precio del día', async () => {
    const shipRes = await api('/api/bodega/shipments', {
      method: 'POST',
      token: ownerToken,
      body: {
        vehicleType: 'torton',
        referenceCode: 'TORTON-01',
        originFarm: 'Granja Jalisco',
        driverName: 'Roberto Ruiz',
        notes: 'Llegada limpia',
        lines: [
          { productType: 'huevo', brandName: 'San Juan', boxesCount: 20, totalKg: 480 },
          { productType: 'azucar', brandName: 'Azúcar Estándar', boxesCount: 10, weightPerBultoKg: 50, totalKg: 500 },
        ],
      },
    });
    expect(shipRes.status).toBe(201);
    expect(shipRes.json.shipment.folioFormatted).toBe('E-0001');

    const priceRes = await api('/api/prices', {
      method: 'POST',
      token: ownerToken,
      body: { pricePesosPerKg: 40 },
    });
    expect(priceRes.status).toBe(201);

    const saleRes = await api('/api/bodega/sales', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        items: [
          {
            productType: 'huevo',
            brandName: 'San Juan',
            fullBoxes: 2,
            halfBoxes: 0,
            weighMode: 'cajas',
            fullBoxesGrossGrams: [22000, 22000], // -4 kg tara (2*2) = 40 kg netos * $38.50 = $1,540
            halfBoxesGrossGrams: [],
            pricePesosPerKg: 38.5,
            isSpecialPrice: true,
          },
          {
            productType: 'azucar',
            brandName: 'Azúcar Estándar',
            bultosCount: 1,
            weightPerBultoKg: 50,
            pricePerBultoPesos: 900,
          },
        ],
        paidPesos: 440,
        paymentMethod: 'efectivo',
      },
    });
    expect(saleRes.status).toBe(201);
    warehouseDeliveryId = saleRes.json.delivery.id;
    expect(saleRes.json.delivery.folioFormatted).toBe('BD-0001');
    // 1540 + 900 = 2440 MXN = 244000 centavos
    expect(saleRes.json.delivery.totalToChargeCentavos).toBe(244000);
  });

  it('5. Crea vendedor, valida RBAC/autorización de dispositivo y bloquea simulación externa', async () => {
    const userRes = await api('/api/auth/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'Carlos Ruta',
        email: 'carlos.ruta@granja.mx',
        password: 'RutaVendedor#2026!',
        role: 'vendedor',
      },
    });
    expect(userRes.status).toBe(201);
    vendorId = userRes.json.user.id;
    expect(userRes.json.user.folioSeries).toBe('A');

    // Owner cannot bypass /api/sync/push with simulateFromVendorId anymore
    const simRemovedRes = await api('/api/sync/push', {
      method: 'POST',
      token: ownerToken,
      body: {
        simulateFromVendorId: vendorId,
        deviceId: 'fake-sim',
        deliveries: [],
      },
    });
    expect(simRemovedRes.status).toBe(403);

    const loginRes = await api('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'carlos.ruta@granja.mx',
        password: 'RutaVendedor#2026!',
        deviceId: vendorDeviceId,
      },
    });
    expect(loginRes.status).toBe(200);
    vendorToken = loginRes.json.token;

    // RBAC: vendedor cannot access owner endpoints
    const ownerOnlyRes = await api('/api/dashboard/state', { token: vendorToken });
    expect(ownerOnlyRes.status).toBe(403);

    // Register Android device -> pending approval
    const regRes = await api('/api/devices/register', {
      method: 'POST',
      token: vendorToken,
      body: { deviceId: vendorDeviceId, deviceName: 'Motorola Moto G Ruta' },
    });
    expect(regRes.status).toBe(201);
    expect(regRes.json.device.active).toBe(false);

    // Pending device blocked on pull
    const blockedPull = await api(`/api/sync/pull?deviceId=${vendorDeviceId}`, {
      token: vendorToken,
    });
    expect(blockedPull.status).toBe(403);

    // Owner authorizes device
    const authRes = await api(`/api/devices/${vendorDeviceId}/authorize`, {
      method: 'POST',
      token: ownerToken,
    });
    expect(authRes.status).toBe(200);
  });

  it('6. Sincronización en vivo Android <-> Windows (pull, reserve folios, push entrega + abono independiente AB-XXXX + WS)', async () => {
    // Pull real catalog & encrypted-at-rest decrypted phone/address
    const pullRes = await api(`/api/sync/pull?deviceId=${vendorDeviceId}`, {
      token: vendorToken,
    });
    expect(pullRes.status).toBe(200);
    expect(pullRes.json.deviceAuthorized).toBe(true);
    expect(pullRes.json.folioSeries).toBe('A');
    expect(pullRes.json.settings.businessPhone).toBe('5544332211');
    expect(pullRes.json.settings.businessAddress).toBe('Bodega 14 Nave Sur');
    const pulledCustomer = pullRes.json.customers.find((c: any) => c.id === customerId);
    expect(pulledCustomer).toBeTruthy();
    expect(pulledCustomer.activeDebtCentavos).toBe(200000); // 244000 - 44000

    // Reserve official folios
    const reserveRes = await api('/api/sync/folios/reserve', {
      method: 'POST',
      token: vendorToken,
      body: { deviceId: vendorDeviceId, count: 5 },
    });
    expect(reserveRes.status).toBe(200);
    expect(reserveRes.json.folios).toEqual([1, 2, 3, 4, 5]);

    // Connect owner WebSocket + vendor WebSocket and verify real-time sync broadcast
    const ownerWs = new WebSocket(`${wsBaseUrl}/ws?token=${encodeURIComponent(ownerToken)}`);
    const vendorWs = new WebSocket(
      `${wsBaseUrl}/ws?token=${encodeURIComponent(vendorToken)}&deviceId=${encodeURIComponent(vendorDeviceId)}`
    );

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        ownerWs.once('open', () => resolve());
        ownerWs.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        vendorWs.once('open', () => resolve());
        vendorWs.once('error', reject);
      }),
    ]);

    const ownerReceivedSync = new Promise<any>((resolve) => {
      ownerWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'delivery:synced') resolve(msg);
      });
    });

    vendorDeliveryId = 'del-android-e2e-001';
    syncedTransferPaymentId = 'pay-android-del-001';
    syncedStandaloneAbonoId = 'pay-android-abono-001';

    const pushPayload = {
      deviceId: vendorDeviceId,
      deliveries: [
        {
          id: vendorDeliveryId,
          customerId,
          boxesGrams: [20000, 20000], // 40 kg * 38.50 = 1540 MXN
          priceCentavosPerKg: 3850,
          isSpecialPrice: true,
          driverName: 'Roberto Ruiz',
          helpersNames: ['Luis'],
          brandName: 'San Juan',
          createdAtUtc: '2026-11-27T15:00:00.000Z',
        },
      ],
      payments: [
        {
          id: syncedTransferPaymentId,
          customerId,
          deliveryId: vendorDeliveryId,
          amountCentavos: 54000,
          method: 'transferencia',
          note: 'Abono inicial transferencia',
        },
        {
          id: syncedStandaloneAbonoId,
          customerId,
          deliveryId: null,
          amountCentavos: 50000,
          method: 'efectivo',
          receiptFolio: 'AB-0001',
          note: 'Abono independiente en cobranza',
        },
      ],
      losses: [{ id: 'loss-e2e-1', lostGrams: 1200, note: 'Caja golpeada en camino' }],
      incidents: [
        {
          id: 'inc-e2e-1',
          type: 'faltante',
          amountCentavos: 10000,
          description: 'Cambio pendiente',
        },
      ],
    };

    const pushRes = await api('/api/sync/push', {
      method: 'POST',
      token: vendorToken,
      body: pushPayload,
    });
    expect(pushRes.status).toBe(200);
    expect(pushRes.json.acceptedDeliveries).toBe(1);
    expect(pushRes.json.acceptedPaymentIds).toContain(syncedTransferPaymentId);
    expect(pushRes.json.acceptedPaymentIds).toContain(syncedStandaloneAbonoId);
    expect(pushRes.json.acceptedLossIds).toContain('loss-e2e-1');
    expect(pushRes.json.acceptedIncidentIds).toContain('inc-e2e-1');

    const wsEvent = await ownerReceivedSync;
    expect(wsEvent.payload.vendorId).toBe(vendorId);
    expect(wsEvent.payload.acceptedDeliveries).toBe(1);

    // Idempotent duplicate push
    const dupRes = await api('/api/sync/push', {
      method: 'POST',
      token: vendorToken,
      body: pushPayload,
    });
    expect(dupRes.status).toBe(200);
    expect(dupRes.json.acceptedDeliveries).toBe(0);
    expect(dupRes.json.skippedDuplicates).toBe(1);

    // Revoking device closes active vendor WebSocket and blocks subsequent API requests
    const vendorClosedPromise = new Promise<number>((resolve) => {
      vendorWs.once('close', (code) => resolve(code));
    });
    const revokeRes = await api(`/api/devices/${vendorDeviceId}/revoke`, {
      method: 'POST',
      token: ownerToken,
    });
    expect(revokeRes.status).toBe(200);
    const closedCode = await vendorClosedPromise;
    expect(closedCode).toBe(4003);

    const revokedPull = await api(`/api/sync/pull?deviceId=${vendorDeviceId}`, {
      token: vendorToken,
    });
    expect(revokedPull.status).toBe(403);

    ownerWs.close();
  });

  it('7. Verificación de transferencias, abono oficina AB-XXXX, cancelación de entrega, cierre y respaldo cifrado AES-256-GCM', async () => {
    // Verify synced transfer payment
    const verifyRes = await api(`/api/payments/${syncedTransferPaymentId}/verify`, {
      method: 'POST',
      token: ownerToken,
    });
    expect(verifyRes.status).toBe(200);

    // Record office standalone partial abono
    // Balance before: (244000 + 154000) - (44000 + 54000 + 50000) = 398000 - 148000 = 250000 centavos ($2,500)
    const abonoRes = await api(`/api/customers/${customerId}/payments`, {
      method: 'POST',
      token: ownerToken,
      body: {
        amountPesos: 1000,
        method: 'efectivo',
        note: 'Abono en mostrador Windows',
      },
    });
    expect(abonoRes.status).toBe(201);
    expect(abonoRes.json.payment.receiptFolio).toMatch(/^AB-\d{4}$/);
    expect(abonoRes.json.previousBalanceCentavos).toBe(250000);
    expect(abonoRes.json.newBalanceCentavos).toBe(150000);

    // Cancel the Android delivery and confirm state updates cleanly
    const cancelRes = await api(`/api/deliveries/${vendorDeliveryId}/cancel`, {
      method: 'POST',
      token: ownerToken,
      body: { reason: 'Error de captura en prueba E2E' },
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.json.delivery.status).toBe('cancelada');

    // Daily closing
    const dashBeforeBackup = await api('/api/dashboard/state', { token: ownerToken });
    expect(dashBeforeBackup.status).toBe(200);
    expect(dashBeforeBackup.json.deliveries.length).toBeGreaterThanOrEqual(2);
    expect(
      dashBeforeBackup.json.deliveries.find((d: any) => d.id === warehouseDeliveryId).status
    ).toBe('vigente');

    // Encrypted backup create -> verify -> restore
    const backupCreate = await api('/api/backups/create', {
      method: 'POST',
      token: ownerToken,
    });
    expect(backupCreate.status).toBe(201);
    expect(backupCreate.json.fileName).toMatch(/\.dgbackup$/);

    const backupVerify = await api('/api/backups/verify', {
      method: 'POST',
      token: ownerToken,
      body: { fileName: backupCreate.json.fileName },
    });
    expect(backupVerify.status).toBe(200);
    expect(backupVerify.json.valid).toBe(true);

    const backupRestore = await api('/api/backups/restore', {
      method: 'POST',
      token: ownerToken,
      body: { fileName: backupCreate.json.fileName },
    });
    expect(backupRestore.status).toBe(200);
    expect(backupRestore.json.ok).toBe(true);

    const dashAfterRestore = await api('/api/dashboard/state', { token: ownerToken });
    expect(dashAfterRestore.status).toBe(200);
    expect(dashAfterRestore.json.settings.printerConfig.printerName).toBe('Xprinter XP-58');
  });

  it('8. Genera comandos ESC/POS 48mm idénticos para ticket de prueba, entrega y abono en Windows', () => {
    const settings: AppSettings = {
      businessName: 'DIRECTO DE GRANJA',
      slogan: 'Te faltan huevos a nosotros nos sobran',
      businessPhone: '5544332211',
      businessAddress: 'Bodega 14 Nave Sur',
      reduceAnimations: false,
      themeMode: 'dark',
      nextFolioBySeries: { A: 2, AB: 2 },
    };

    const testTxt = Buffer.from(buildEscPosTestTicketBytes(settings)).toString('ascii');
    expect(testTxt).toContain('DIRECTO DE GRANJA');
    expect(testTxt).toContain('PRUEBA DE IMPRESION 48MM');
    expect(testTxt).toContain('CONEXION VERIFICADA');

    const del: Delivery = {
      id: 'd-1',
      vendorId: 'v-1',
      vendorName: 'Carlos Ruta',
      workdayId: 'w-1',
      driverName: 'Chofer',
      helpersNames: [],
      series: 'A',
      folioNumber: 1,
      folioFormatted: 'A-0001',
      customerId: 'c-1',
      customerName: 'Abarrotes La Esperanza',
      createdAtUtc: '2026-11-27T16:00:00.000Z',
      priceCentavosPerKg: 3850,
      isSpecialPrice: true,
      totalGrams: 40000,
      calculatedTotalExactMilliCentavos: 154000000,
      totalToChargeCentavos: 154000,
      status: 'vigente',
      cancellationReason: null,
      syncedAtUtc: null,
    };

    const delTxt = Buffer.from(
      buildEscPosDeliveryTicketBytes({
        delivery: del,
        boxes: [
          { id: 'b1', deliveryId: 'd-1', position: 1, weightGrams: 20000 },
          { id: 'b2', deliveryId: 'd-1', position: 2, weightGrams: 20000 },
        ],
        payments: [],
        customerTotalBalanceCentavos: 154000,
        settings,
        isCopy: true,
      })
    ).toString('ascii');

    expect(delTxt).toContain('[ COPIA ]');
    expect(delTxt).toContain('Folio: A-0001');
    expect(delTxt).toContain('Kilos totales');
    expect(delTxt).toContain('TOTAL A COBRAR');
    expect(delTxt).toContain('Saldo de esta entrega');
    expect(delTxt).toContain('Saldo total del cliente');
    expect(delTxt).toContain('!Gracias por su compra!');

    const pay: Payment = {
      id: 'p-1',
      customerId: 'c-1',
      deliveryId: null,
      vendorId: 'v-1',
      amountCentavos: 50000,
      method: 'transferencia',
      status: 'por_verificar',
      createdAtUtc: '2026-11-27T17:00:00.000Z',
      note: 'Abono a cuenta',
      receiptFolio: 'AB-0001',
    };

    const abonoTxt = Buffer.from(
      buildEscPosAbonoTicketBytes({
        payment: pay,
        customerName: 'Abarrotes La Esperanza',
        previousBalanceCentavos: 154000,
        remainingBalanceCentavos: 104000,
        appliedToLabel: 'Saldo de cuenta',
        settings,
        isCopy: false,
      })
    ).toString('ascii');

    expect(abonoTxt).toContain('COMPROBANTE DE ABONO');
    expect(abonoTxt).toContain('Folio: AB-0001');
    expect(abonoTxt).toContain('Aplica a:');
    expect(abonoTxt).toContain('Saldo anterior');
    expect(abonoTxt).toContain('ABONO RECIBIDO');
    expect(abonoTxt).toContain('Transferencia');
    expect(abonoTxt).toContain('Por verificar');
    expect(abonoTxt).toContain('SALDO RESTANTE');
    expect(abonoTxt).toContain('!Gracias por su abono!');
  });
});
