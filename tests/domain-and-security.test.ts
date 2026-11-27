import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  calculateBrandInventory,
  calculateCustomerLedger,
  calculateDeliveryTotals,
  calculateSugarLineSubtotalCentavos,
  calculateVendorClosing,
  deductCartonTareFromPerBoxWeights,
  escapeExcelFormulaInjection,
  normalizeCustomerName,
  splitTotalGramsIntoBoxes,
  splitTotalGramsIntoHalfAwareBoxes,
  validateBodegaSaleStock,
  validatePaymentAmount,
  type DailyLoss,
  type Delivery,
  type MoneyIncident,
  type Payment,
  type WarehouseShipment,
} from '../shared/domain.ts';
import Database from 'better-sqlite3';
import {
  decryptSensitive,
  encryptSensitive,
  hashPassword,
  isAllowedOrigin,
  isForbiddenDemoPassword,
  isLegacyDemoPasswordHash,
  isLocalHostOrIp,
  isValidEmail,
  isValidEntityId,
  isValidFolioSeries,
  isValidIsoUtc,
  isValidYmd,
  sanitizePlainText,
  sanitizeProfileImageDataUrl,
  signJwt,
  verifyJwt,
  verifyPassword,
} from '../server/security.ts';
import { createLedgerStore } from '../server/store.ts';

describe('Casos de aceptación C1-C6 y R1-R5 (Documento Maestro)', () => {
  it('C1 & R1: 25.35 + 24.45 + 25.12 + 22.78 + 22.90 kg a $37 => 120.60 kg, $4,462.20 -> $4,462', () => {
    const res = calculateDeliveryTotals([25350, 24450, 25120, 22780, 22900], 3700);
    expect(res.totalGrams).toBe(120600);
    expect(res.calculatedExactLabel).toBe('$4,462.20');
    expect(res.totalToChargeCentavos).toBe(446200);
  });

  it('C2: C1 con abono de $800 => saldo $3,662', () => {
    const res = calculateDeliveryTotals([25350, 24450, 25120, 22780, 22900], 3700);
    const balance = res.totalToChargeCentavos - 80000;
    expect(balance).toBe(366200);
  });

  it('C3: 30.5 kg a $38 con abono $800 => $1,159.00, saldo $359.00', () => {
    const res = calculateDeliveryTotals([30500], 3800);
    expect(res.totalToChargeCentavos).toBe(115900);
    expect(res.totalToChargeCentavos - 80000).toBe(35900);
  });

  it('C4: 24.35 kg a $37.50 => exacto $913.125, baja a $913', () => {
    const res = calculateDeliveryTotals([24350], 3750);
    expect(res.totalToChargeCentavos).toBe(91300);
  });

  it('C5: Abono de $5,000 sobre total $1,159.00 se rechaza con mensaje claro', () => {
    expect(() => validatePaymentAmount(500000, 115900)).toThrow(/no puede ser mayor/);
  });

  it('C6: Entrega sin cajas o sin precio mayor a 0 se rechaza', () => {
    expect(() => calculateDeliveryTotals([], 3700)).toThrow();
    expect(() => calculateDeliveryTotals([25000], 0)).toThrow();
  });

  it('R2: 12.50 kg a $37 => $462.50 (50 centavos exactos se queda en .50)', () => {
    const res = calculateDeliveryTotals([12500], 3700);
    expect(res.totalToChargeCentavos).toBe(46250);
  });

  it('R3: 25.35 kg a $37 => $937.95 -> $938 (sube)', () => {
    const res = calculateDeliveryTotals([25350], 3700);
    expect(res.totalToChargeCentavos).toBe(93800);
  });

  it('R4: 12.51 kg a $37 => $462.87 -> $463 (sube)', () => {
    const res = calculateDeliveryTotals([12510], 3700);
    expect(res.totalToChargeCentavos).toBe(46300);
  });

  it('R5: 12.50 kg a $37.01 => $462.625 -> $463 (62.5 centavos suben)', () => {
    const res = calculateDeliveryTotals([12500], 3701);
    expect(res.totalToChargeCentavos).toBe(46300);
  });
});

describe('Merma del día (MD1, MD3), Incidentes (I2) y Saldos', () => {
  it('MD1/MD3 & I2: Merma no cambia cobros; Efectivo $6,000 - Incidente $1,500 = $4,500 a entregar; entrega $4,000 => $500 diferencia', () => {
    const deliveries: Delivery[] = [
      {
        id: 'd1',
        vendorId: 'v1',
        vendorName: 'Tony',
        workdayId: 'w1',
        driverName: 'Hunter',
        helpersNames: [],
        series: 'A',
        folioNumber: 1,
        folioFormatted: 'A-0001',
        customerId: 'c1',
        customerName: 'Cliente',
        createdAtUtc: '2026-11-16T12:00:00Z',
        priceCentavosPerKg: 3700,
        isSpecialPrice: false,
        totalGrams: 100000,
        calculatedTotalExactMilliCentavos: 370000000,
        totalToChargeCentavos: 600000,
        status: 'vigente',
        cancellationReason: null,
        syncedAtUtc: '2026-11-16T12:00:00Z',
      },
    ];
    const payments: Payment[] = [
      {
        id: 'p1',
        customerId: 'c1',
        deliveryId: 'd1',
        vendorId: 'v1',
        amountCentavos: 600000,
        method: 'efectivo',
        status: 'verificado',
        createdAtUtc: '2026-11-16T12:00:00Z',
        note: 'Pago',
      },
    ];
    const losses: DailyLoss[] = [
      {
        id: 'l1',
        vendorId: 'v1',
        vendorName: 'Tony',
        workdayId: 'w1',
        dateYmd: '2026-11-16',
        lostGrams: 6500,
        note: 'Caja rota',
        createdAtUtc: '2026-11-16T12:00:00Z',
      },
      {
        id: 'l2',
        vendorId: 'v1',
        vendorName: 'Tony',
        workdayId: 'w1',
        dateYmd: '2026-11-16',
        lostGrams: 2000,
        note: 'Huevo estrellado',
        createdAtUtc: '2026-11-16T13:00:00Z',
      },
    ];
    const incidents: MoneyIncident[] = [
      {
        id: 'i1',
        vendorId: 'v1',
        vendorName: 'Tony',
        type: 'robo',
        amountCentavos: 150000,
        occurredAtUtc: '2026-11-16T14:00:00Z',
        relatedDeliveryId: null,
        relatedCustomerId: null,
        description: 'Robo en ruta',
        peoplePresent: ['Tony'],
        status: 'reportado',
        ownerNote: null,
      },
    ];

    const closing = calculateVendorClosing({
      deliveries,
      payments,
      losses,
      incidents,
      actualCashHandedInCentavos: 400000,
    });

    expect(closing.soldCentavos).toBe(600000); // Merma no altera venta
    expect(closing.dailyLossGrams).toBe(8500); // MD3: 6.50 + 2.00 = 8.50 kg
    expect(closing.expectedCashToDeliverCentavos).toBe(450000); // I2: $6,000 - $1,500 = $4,500
    expect(closing.unexplainedDifferenceCentavos).toBe(50000); // I2: $4,500 - $4,000 = $500

    const ledger = calculateCustomerLedger('c1', deliveries, payments);
    expect(ledger.balanceCentavos).toBe(0);
  });
});

describe('Seguridad Red Team: Excel Injection (X2/X3), JWT, Cifrado AES-256-GCM y Sanitización', () => {
  it('X3: Escapa celdas que inician con =, +, -, @ para prevenir inyección de fórmulas en Excel', () => {
    expect(escapeExcelFormulaInjection('=CMD|"/C calc"!A0')).toBe('\'=CMD|"/C calc"!A0');
    expect(escapeExcelFormulaInjection('+SUM(A1:A2)')).toBe('\'+SUM(A1:A2)');
    expect(escapeExcelFormulaInjection('-1+1')).toBe('\'-1+1');
    expect(escapeExcelFormulaInjection('@SUM(1,2)')).toBe('\'@SUM(1,2)');
    expect(escapeExcelFormulaInjection('Abarrotes López')).toBe('Abarrotes López');
  });

  it('Normaliza nombres sin acentos ni mayúsculas para detección de duplicados', () => {
    expect(normalizeCustomerName('  Cremería   La Aurora ')).toBe('cremeria la aurora');
    expect(normalizeCustomerName('Cremeria La Aurora')).toBe('cremeria la aurora');
  });

  it('Cifrado AES-256-GCM autenticado protege datos y detecta manipulación', () => {
    const cipher = encryptSensitive('5512345678');
    expect(cipher).not.toContain('5512345678');
    expect(decryptSensitive(cipher)).toBe('5512345678');

    const parts = cipher.split(':');
    parts[1] = '00' + parts[1].slice(2);
    const tampered = parts.join(':');
    expect(() => decryptSensitive(tampered)).toThrow();
  });

  it('JWT HS256 y hashing bcrypt (costo 12) validan roles y contraseñas correctamente', () => {
    const sampleSecret = 'ClavePrivadaSegura#2026';
    const hash = hashPassword(sampleSecret);
    expect(hash.startsWith('$2a$12$') || hash.startsWith('$2b$12$')).toBe(true);
    expect(verifyPassword(sampleSecret, hash)).toBe(true);
    expect(verifyPassword('WrongPass', hash)).toBe(false);

    const token = signJwt({
      sub: 'usr-1',
      email: 'dueno@ejemplo.mx',
      name: 'Dueño',
      role: 'dueno',
      folioSeries: null,
      deviceId: 'dev-1',
    });
    const decoded = verifyJwt(token);
    expect(decoded.role).toBe('dueno');
    expect(decoded.sub).toBe('usr-1');
    expect(decoded.deviceId).toBe('dev-1');
  });

  it('Sanitiza intentos de XSS HTML en entradas de texto', () => {
    expect(sanitizePlainText('<script>alert(1)</script>Abarrotes')).toBe(
      'scriptalert(1)/scriptAbarrotes'
    );
  });

  it('Imagen de perfil: acepta PNG/JPG/WEBP base64 (> 600 chars) y rechaza SVG XSS o URLs maliciosas', () => {
    const validLongPng = `data:image/png;base64,${'A'.repeat(1200)}`;
    const okRes = sanitizeProfileImageDataUrl(validLongPng);
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.value.length).toBe(validLongPng.length);
    }

    expect(sanitizeProfileImageDataUrl('')).toEqual({ ok: true, value: '' });
    expect(sanitizeProfileImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toMatchObject({
      ok: false,
    });
    expect(sanitizeProfileImageDataUrl('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(sanitizeProfileImageDataUrl(`data:image/jpeg;base64,${'A'.repeat(1_900_000)}`)).toMatchObject({
      ok: false,
    });
  });
});

describe('Bodega: Tortón/Tráiler, Inventario por Marca y Descuento por Venta Directa', () => {
  it('Agrega tortón y tráiler por marca normalizada, descuenta 40 cajas a Sr. Pablo, rechaza sobreventa y restaura al cancelar', () => {
    const shipments: WarehouseShipment[] = [
      {
        id: 'shp-1',
        series: 'E',
        folioNumber: 1,
        folioFormatted: 'E-0001',
        vehicleType: 'torton',
        referenceCode: 'REM-101',
        originFarm: 'Granja Norte',
        driverName: 'Hunter',
        arrivedAtUtc: '2026-11-16T08:00:00Z',
        registeredByUserId: 'usr-owner-01',
        registeredByName: 'Don Juan',
        notes: '',
        lines: [
          {
            id: 'shl-1',
            shipmentId: 'shp-1',
            brandKey: 'enerhuevo',
            brandName: 'Enerhuevo',
            boxesCount: 100,
            totalGrams: 2_450_000,
          },
        ],
      },
      {
        id: 'shp-2',
        series: 'E',
        folioNumber: 2,
        folioFormatted: 'E-0002',
        vehicleType: 'trailer',
        referenceCode: 'REM-102',
        originFarm: 'Granja Sur',
        driverName: 'Victor',
        arrivedAtUtc: '2026-11-16T10:00:00Z',
        registeredByUserId: 'usr-owner-01',
        registeredByName: 'Don Juan',
        notes: '',
        lines: [
          {
            id: 'shl-2',
            shipmentId: 'shp-2',
            brandKey: 'enerhuevo',
            brandName: 'ÉnerHuevo',
            boxesCount: 50,
            totalGrams: 1_225_000,
          },
          {
            id: 'shl-3',
            shipmentId: 'shp-2',
            brandKey: 'san juan',
            brandName: 'San Juan',
            boxesCount: 80,
            totalGrams: 1_920_000,
          },
        ],
      },
    ];

    const saleBoxes = splitTotalGramsIntoBoxes(980_000, 40);
    expect(saleBoxes.length).toBe(40);
    expect(saleBoxes.reduce((a, b) => a + b, 0)).toBe(980_000);

    const calc = calculateDeliveryTotals(saleBoxes, 3700);
    expect(calc.totalToChargeCentavos).toBe(3626000); // 980 kg * $37 = $36,260

    const deliveries: Delivery[] = [
      {
        id: 'del-bd-1',
        vendorId: 'usr-owner-01',
        vendorName: 'Don Juan (Bodega)',
        workdayId: 'wd-bodega-2026-11-16',
        driverName: 'Entrega en bodega',
        helpersNames: [],
        series: 'BD',
        folioNumber: 1,
        folioFormatted: 'BD-0001',
        customerId: 'cust-pablo',
        customerName: 'Sr. Pablo',
        createdAtUtc: '2026-11-16T12:00:00Z',
        priceCentavosPerKg: 3700,
        isSpecialPrice: false,
        totalGrams: calc.totalGrams,
        calculatedTotalExactMilliCentavos: calc.calculatedExactMilliCentavos,
        totalToChargeCentavos: calc.totalToChargeCentavos,
        status: 'vigente',
        cancellationReason: null,
        syncedAtUtc: '2026-11-16T12:00:00Z',
        sourceType: 'bodega',
        brandKey: 'enerhuevo',
        brandName: 'Enerhuevo',
        boxesCount: 40,
      },
    ];

    const invAfterSale = calculateBrandInventory(shipments, deliveries, []);
    const ener = invAfterSale.find((b) => b.brandKey === 'enerhuevo')!;
    expect(ener.boxesArrived).toBe(150);
    expect(ener.boxesSold).toBe(40);
    expect(ener.boxesAvailable).toBe(110);
    expect(ener.gramsAvailable).toBe(2_695_000);

    // Rejects oversell (111 > 110 available)
    expect(() => validateBodegaSaleStock(invAfterSale, 'enerhuevo', 111)).toThrow(
      /Inventario insuficiente/
    );

    // Cancelling the sale restores the 40 boxes back to inventory
    deliveries[0].status = 'cancelada';
    const invAfterCancel = calculateBrandInventory(shipments, deliveries, []);
    const enerRestored = invAfterCancel.find((b) => b.brandKey === 'enerhuevo')!;
    expect(enerRestored.boxesSold).toBe(0);
    expect(enerRestored.boxesAvailable).toBe(150);
    expect(enerRestored.gramsAvailable).toBe(3_675_000);
  });
});

describe('Almacenamiento principal en SQLite (WAL, persistencia tras reinicio y parametrización)', () => {
  it('Persiste clientes, entradas de camión, entregas y folios en SQLite WAL y recarga tras reiniciar', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-sqlite-test-'));
    const dbPath = path.join(tmpDir, 'test-directodegranja.db');

    try {
      const store1 = createLedgerStore(dbPath);
      expect(store1.pingSqlite()).toBe(true);
      expect(store1.getStorageInfo()).toEqual({
        engine: 'sqlite',
        walMode: true,
        dbFileName: 'test-directodegranja.db',
      });

      const db1 = store1.getDb();
      expect(db1.users.length).toBe(0);
      expect(db1.customers.length).toBe(0);

      const sqliName = "Sr. Pablo'; DROP TABLE users; --";
      db1.customers.push({
        id: 'cust-sqli-1',
        businessName: sqliName,
        contactName: 'Pablo',
        phone: '5511223344',
        address: 'Bodega 4',
        notes: 'Prueba parametrizada',
        active: true,
        createdByUserId: 'usr-owner-01',
        mergedIntoCustomerId: null,
        createdAtUtc: '2026-11-25T10:00:00Z',
      });

      const shpFolio = store1.reserveNextFolio('E');
      db1.warehouseShipments.push({
        id: 'shp-sqlite-1',
        series: 'E',
        folioNumber: shpFolio.folioNumber,
        folioFormatted: shpFolio.folioFormatted,
        vehicleType: 'torton',
        referenceCode: 'REM-777',
        originFarm: 'Granja Central',
        driverName: 'Hunter',
        arrivedAtUtc: '2026-11-25T10:05:00Z',
        registeredByUserId: 'usr-owner-01',
        registeredByName: 'Don Juan',
        notes: '',
        lines: [
          {
            id: 'shl-sqlite-1',
            shipmentId: 'shp-sqlite-1',
            productType: 'huevo',
            brandKey: 'enerhuevo',
            brandName: 'Enerhuevo',
            boxesCount: 40.5,
            totalGrams: 992_250,
          },
          {
            id: 'shl-sqlite-2',
            shipmentId: 'shp-sqlite-1',
            productType: 'azucar',
            brandKey: 'azucar:azucar estandar',
            brandName: 'Azúcar Estándar',
            boxesCount: 20,
            totalGrams: 1_000_000,
          },
        ],
      });

      store1.persist();
      store1.close();

      // Simular reinicio del servidor cargando desde el mismo archivo SQLite
      const store2 = createLedgerStore(dbPath);
      expect(store2.pingSqlite()).toBe(true);
      const db2 = store2.getDb();
      expect(db2.users.length).toBe(0);
      expect(db2.customers).toHaveLength(1);
      expect(db2.customers[0].businessName).toBe(sqliName);
      expect(db2.warehouseShipments).toHaveLength(1);
      expect(db2.warehouseShipments[0].folioFormatted).toBe('E-0001');
      expect(db2.warehouseShipments[0].lines[0].boxesCount).toBe(40.5);
      expect(db2.warehouseShipments[0].lines[1].productType).toBe('azucar');
      expect(db2.settings.nextFolioBySeries.E).toBe(2);
      store2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Bodega avanzado: Tara de cartón 2 kg, medias cajas, bultos de azúcar y ticket multimarca', () => {
  it('Descuenta 2 kg por caja completa y 1 kg por media caja en peso por caja', () => {
    const res = deductCartonTareFromPerBoxWeights([26_500, 27_000], [13_500]);
    expect(res.tareGrams).toBe(5000);
    expect(res.netBoxesGrams).toEqual([24_500, 25_000, 12_500]);

    expect(() => deductCartonTareFromPerBoxWeights([2000], [])).toThrow(/2\.00 kg/);
    expect(() => deductCartonTareFromPerBoxWeights([], [1000])).toThrow(/1\.00 kg/);
  });

  it('Divide peso total proporcionalmente entre cajas completas y medias cajas sin perder gramos', () => {
    const split = splitTotalGramsIntoHalfAwareBoxes(62_000, 2, 1);
    expect(split).toHaveLength(3);
    expect(split.reduce((a, b) => a + b, 0)).toBe(62_000);
    expect(split[0]).toBeGreaterThan(split[2]);
  });

  it('Descuenta múltiples marcas de huevo (con medias cajas y distinto precio) y bultos de azúcar en el mismo ticket', () => {
    const shipments: WarehouseShipment[] = [
      {
        id: 'shp-mix-1',
        series: 'E',
        folioNumber: 1,
        folioFormatted: 'E-0001',
        vehicleType: 'trailer',
        referenceCode: 'REM-500',
        originFarm: 'Granja Origen',
        driverName: 'Hunter',
        arrivedAtUtc: '2026-11-25T08:00:00Z',
        registeredByUserId: 'usr-owner-01',
        registeredByName: 'Don Juan',
        notes: '',
        lines: [
          {
            id: 'l-1',
            shipmentId: 'shp-mix-1',
            productType: 'huevo',
            brandKey: 'enerhuevo',
            brandName: 'Enerhuevo',
            boxesCount: 20,
            totalGrams: 490_000,
          },
          {
            id: 'l-2',
            shipmentId: 'shp-mix-1',
            productType: 'huevo',
            brandKey: 'san juan',
            brandName: 'San Juan',
            boxesCount: 10.5,
            totalGrams: 252_000,
          },
          {
            id: 'l-3',
            shipmentId: 'shp-mix-1',
            productType: 'azucar',
            brandKey: 'azucar:azucar estandar',
            brandName: 'Azúcar Estándar',
            boxesCount: 15,
            totalGrams: 750_000,
          },
        ],
      },
    ];

    const sugarSubtotal = calculateSugarLineSubtotalCentavos(3, 115_000);
    expect(sugarSubtotal).toBe(345_000);

    const multiSale: Delivery = {
      id: 'del-multi-1',
      vendorId: 'usr-owner-01',
      vendorName: 'Don Juan (Bodega)',
      workdayId: 'wd-bodega-2026-11-25',
      driverName: 'Entrega en bodega',
      helpersNames: [],
      series: 'BD',
      folioNumber: 1,
      folioFormatted: 'BD-0001',
      customerId: 'cust-1',
      customerName: 'Cliente Bodega',
      createdAtUtc: '2026-11-25T09:00:00Z',
      priceCentavosPerKg: 3800,
      isSpecialPrice: false,
      totalGrams: 199_000,
      calculatedTotalExactMilliCentavos: 530_000_000,
      totalToChargeCentavos: 530_000,
      status: 'vigente',
      cancellationReason: null,
      syncedAtUtc: '2026-11-25T09:00:00Z',
      sourceType: 'bodega',
      brandKey: 'multi',
      brandName: 'Enerhuevo (1.5 cjs), San Juan (0.5 cjs), Azúcar Estándar (3 bultos)',
      boxesCount: 5,
      saleItems: [
        {
          id: 'si-1',
          productType: 'huevo',
          brandKey: 'enerhuevo',
          brandName: 'Enerhuevo',
          fullBoxes: 1,
          halfBoxes: 1,
          quantity: 1.5,
          weighMode: 'cajas',
          tareGrams: 3000,
          totalGrams: 37_000,
          unitPriceCentavos: 3700,
          isSpecialPrice: false,
          subtotalCentavos: 136_900,
          boxesGrams: [24_500, 12_500],
        },
        {
          id: 'si-2',
          productType: 'huevo',
          brandKey: 'san juan',
          brandName: 'San Juan',
          fullBoxes: 0,
          halfBoxes: 1,
          quantity: 0.5,
          weighMode: 'total',
          tareGrams: 0,
          totalGrams: 12_000,
          unitPriceCentavos: 4000,
          isSpecialPrice: true,
          subtotalCentavos: 48_000,
          boxesGrams: [12_000],
        },
        {
          id: 'si-3',
          productType: 'azucar',
          brandKey: 'azucar:azucar estandar',
          brandName: 'Azúcar Estándar',
          fullBoxes: 3,
          halfBoxes: 0,
          quantity: 3,
          tareGrams: 0,
          totalGrams: 150_000,
          unitPriceCentavos: 115_000,
          isSpecialPrice: false,
          subtotalCentavos: 345_000,
          boxesGrams: [50_000, 50_000, 50_000],
        },
      ],
    };

    const invAfter = calculateBrandInventory(shipments, [multiSale], []);
    expect(invAfter.find((i) => i.brandKey === 'enerhuevo')!.boxesAvailable).toBe(18.5);
    expect(invAfter.find((i) => i.brandKey === 'san juan')!.boxesAvailable).toBe(10);
    expect(invAfter.find((i) => i.brandKey === 'azucar:azucar estandar')!.boxesAvailable).toBe(12);
    expect(invAfter.find((i) => i.brandKey === 'azucar:azucar estandar')!.gramsAvailable).toBe(600_000);

    expect(() => validateBodegaSaleStock(invAfter, 'Azúcar Estándar', 13, 'azucar')).toThrow(
      /Inventario insuficiente/
    );
    expect(() => validateBodegaSaleStock(invAfter, 'Enerhuevo', 19, 'huevo')).toThrow(
      /Inventario insuficiente/
    );

    // Cancelar restaura todo
    multiSale.status = 'cancelada';
    const invRestored = calculateBrandInventory(shipments, [multiSale], []);
    expect(invRestored.find((i) => i.brandKey === 'enerhuevo')!.boxesAvailable).toBe(20);
    expect(invRestored.find((i) => i.brandKey === 'san juan')!.boxesAvailable).toBe(10.5);
    expect(invRestored.find((i) => i.brandKey === 'azucar:azucar estandar')!.boxesAvailable).toBe(15);
  });
});

describe('Sincronización Android-Windows: tarifa especial, plazo de crédito y ticket oficial', () => {
  it('Persiste tarifa especial y plazo de crédito en SQLite para sincronizar con Android', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-sync-fields-'));
    const dbPath = path.join(tmpDir, 'sync-fields.db');

    try {
      const store1 = createLedgerStore(dbPath);
      const db1 = store1.getDb();
      db1.customers.push({
        id: 'cust-android-1',
        businessName: 'Abarrotes El Sol',
        contactName: 'Pedro',
        phone: '5511223344',
        address: 'Centro',
        notes: '',
        active: true,
        createdByUserId: 'usr-owner-01',
        mergedIntoCustomerId: null,
        createdAtUtc: '2026-11-25T10:00:00Z',
        specialPriceCentavosPerKg: 3550,
        creditTermDays: 14,
      });
      store1.persist();
      store1.close();

      const store2 = createLedgerStore(dbPath);
      const c = store2.getDb().customers.find((item) => item.id === 'cust-android-1');
      expect(c).toBeDefined();
      expect(c!.specialPriceCentavosPerKg).toBe(3550);
      expect(c!.creditTermDays).toBe(14);
      store2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Bloquea automáticamente cuentas legacy que tengan contraseñas demo conocidas', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-legacy-demo-'));
    const dbPath = path.join(tmpDir, 'legacy.db');
    const legacyOwnerPass = Buffer.from('R3JhbmphMjAyNiE=', 'base64').toString('utf8');
    const legacyVendorPass = Buffer.from('VmVuZGVkb3IyMDI2IQ==', 'base64').toString('utf8');

    try {
      expect(isForbiddenDemoPassword(legacyOwnerPass)).toBe(true);
      expect(isForbiddenDemoPassword(legacyVendorPass)).toBe(true);
      expect(isForbiddenDemoPassword('MiClavePropiaUnica#99')).toBe(false);

      const store1 = createLedgerStore(dbPath);
      const db1 = store1.getDb();
      db1.users.push({
        id: 'usr-legacy-owner',
        googleEmail: 'owner-legacy@ejemplo.mx',
        name: 'Dueño Heredado',
        role: 'dueno',
        status: 'activa',
        folioSeries: null,
        createdAtUtc: '2026-01-01T00:00:00Z',
        passwordHash: hashPassword(legacyOwnerPass),
      });
      db1.users.push({
        id: 'usr-legacy-vend',
        googleEmail: 'vendor-legacy@ejemplo.mx',
        name: 'Vendedor Heredado',
        role: 'vendedor',
        status: 'activa',
        folioSeries: 'A',
        createdAtUtc: '2026-01-01T00:00:00Z',
        passwordHash: hashPassword(legacyVendorPass),
      });
      db1.devices.push({
        id: 'dev-legacy-vend',
        userId: 'usr-legacy-vend',
        deviceName: 'Moto Legacy',
        active: true,
        lastSyncUtc: '2026-01-01T00:00:00Z',
        pendingSyncCount: 0,
      });
      store1.persist();
      store1.close();

      // Al recargar desde SQLite, el store debe detectar contraseñas conocidas, bloquear cuentas y desactivar dispositivos
      const store2 = createLedgerStore(dbPath);
      const db2 = store2.getDb();
      expect(db2.users).toHaveLength(2);
      expect(db2.users[0].status).toBe('bloqueada');
      expect(db2.users[1].status).toBe('bloqueada');
      expect(db2.devices[0].active).toBe(false);
      expect(isLegacyDemoPasswordHash(db2.users[0].passwordHash)).toBe(true);
      store2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Cifra con AES-256-GCM los campos personales en SQLite y los descifra al leerlos', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-enc-test-'));
    const dbPath = path.join(tmpDir, 'encrypted.db');

    try {
      const store1 = createLedgerStore(dbPath);
      const db1 = store1.getDb();
      db1.customers.push({
        id: 'cust-sensitive-1',
        businessName: 'Tienda La Esperanza',
        contactName: 'María García',
        phone: '55 1234 5678',
        address: 'Av. Hidalgo 123, Col. Centro',
        notes: 'Cliente preferente con crédito',
        active: true,
        createdByUserId: 'usr-owner-01',
        mergedIntoCustomerId: null,
        createdAtUtc: '2026-11-25T10:00:00Z',
      });
      store1.persist();
      store1.close();

      // Verificar directamente en SQLite raw que los campos están cifrados con prefijo enc:
      const rawDb = new Database(dbPath);
      const row = rawDb
        .prepare('SELECT contact_name, phone, address, notes FROM customers WHERE id = ?')
        .get('cust-sensitive-1') as any;
      expect(row.contact_name.startsWith('enc:')).toBe(true);
      expect(row.phone.startsWith('enc:')).toBe(true);
      expect(row.address.startsWith('enc:')).toBe(true);
      expect(row.notes.startsWith('enc:')).toBe(true);
      expect(row.phone.includes('55 1234 5678')).toBe(false);
      rawDb.close();

      // Al cargar a través de LedgerStore, se descifran limpiamente
      const store2 = createLedgerStore(dbPath);
      const cust = store2.getDb().customers.find((c) => c.id === 'cust-sensitive-1');
      expect(cust).toBeDefined();
      expect(cust!.contactName).toBe('María García');
      expect(cust!.phone).toBe('55 1234 5678');
      expect(cust!.address).toBe('Av. Hidalgo 123, Col. Centro');
      expect(cust!.notes).toBe('Cliente preferente con crédito');
      store2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Migra automáticamente registros SQLite existentes en texto plano hacia AES-256-GCM sin perder datos', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-inplace-mig-'));
    const dbPath = path.join(tmpDir, 'plaintext.db');

    try {
      const store1 = createLedgerStore(dbPath);
      store1.close();

      // Insertar filas sin prefijo enc: simulando base SQLite anterior al cifrado de PII
      const rawDb = new Database(dbPath);
      rawDb
        .prepare(
          `INSERT INTO customers (id, sort_order, business_name, contact_name, phone, address, notes, active, created_by_user_id, merged_into_customer_id, created_at_utc)
           VALUES ('cust-plain-1', 0, 'Cremería Central', 'Luis Pérez', '5599887766', 'Calle Norte 45', 'Nota confidencial', 1, 'usr-1', NULL, '2026-10-01T10:00:00Z')`
        )
        .run();
      rawDb
        .prepare(
          `INSERT INTO daily_losses (id, sort_order, vendor_id, vendor_name, workday_id, date_ymd, lost_grams, note, created_at_utc)
           VALUES ('loss-plain-1', 0, 'usr-2', 'Carlos', 'wd-1', '2026-10-01', 1500, 'Merma sin cifrar', '2026-10-01T12:00:00Z')`
        )
        .run();
      rawDb
        .prepare(
          `UPDATE app_settings SET business_phone = '5500112233', business_address = 'Bodega Antigua 8' WHERE id = 1`
        )
        .run();
      rawDb.close();

      // Al abrir con createLedgerStore(), debe leer los datos intactos y cifrarlos automáticamente en SQLite
      const store2 = createLedgerStore(dbPath);
      const db2 = store2.getDb();
      expect(db2.customers[0].phone).toBe('5599887766');
      expect(db2.customers[0].address).toBe('Calle Norte 45');
      expect(db2.dailyLosses[0].note).toBe('Merma sin cifrar');
      expect(db2.settings.businessPhone).toBe('5500112233');
      store2.close();

      const verifyRaw = new Database(dbPath);
      const custRaw = verifyRaw
        .prepare('SELECT phone, address, notes FROM customers WHERE id = ?')
        .get('cust-plain-1') as any;
      const lossRaw = verifyRaw
        .prepare('SELECT note FROM daily_losses WHERE id = ?')
        .get('loss-plain-1') as any;
      const setRaw = verifyRaw
        .prepare('SELECT business_phone, business_address FROM app_settings WHERE id = 1')
        .get() as any;

      expect(custRaw.phone.startsWith('enc:')).toBe(true);
      expect(custRaw.address.startsWith('enc:')).toBe(true);
      expect(custRaw.notes.startsWith('enc:')).toBe(true);
      expect(lossRaw.note.startsWith('enc:')).toBe(true);
      expect(setRaw.business_phone.startsWith('enc:')).toBe(true);
      expect(setRaw.business_address.startsWith('enc:')).toBe(true);
      verifyRaw.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Respaldos cifrados: crea, verifica integridad SHA-256/GCM, bloquea path traversal y restaura de forma atómica', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-backup-test-'));
    const dbPath = path.join(tmpDir, 'backup-src.db');

    try {
      const store1 = createLedgerStore(dbPath);
      store1.getDb().customers.push({
        id: 'cust-bkp-1',
        businessName: 'Distribuidora Original',
        contactName: 'Ana',
        phone: '5544332211',
        address: 'Mercado 10',
        notes: 'Saldo crítico',
        active: true,
        createdByUserId: 'usr-1',
        mergedIntoCustomerId: null,
        createdAtUtc: '2026-11-26T10:00:00Z',
      });
      store1.persist();

      const created = store1.createEncryptedBackup('testbkp');
      expect(created.fileName.endsWith('.dgbackup')).toBe(true);
      expect(created.envelope).not.toContain('Distribuidora Original');

      const verified = store1.verifyEncryptedBackupEnvelope(created.envelope);
      expect(verified.valid).toBe(true);
      expect(verified.counts.customers).toBe(1);

      // Bloquea manipulación del respaldo
      expect(() => store1.verifyEncryptedBackupEnvelope(`tampered:${created.envelope}`)).toThrow();
      // Bloquea path traversal en nombres de archivo de respaldo
      expect(() => store1.resolveSafeBackupFile('../../etc/passwd')).toThrow();
      expect(() => store1.resolveSafeBackupFile('malicious.txt')).toThrow();

      // Modificar estado en memoria/SQLite y luego restaurar desde el respaldo verificado
      store1.getDb().customers = [];
      store1.persist();
      expect(store1.getDb().customers).toHaveLength(0);

      const restored = store1.restoreFromEncryptedBackupEnvelope(created.envelope);
      expect(restored.restoredCounts.customers).toBe(1);
      expect(store1.getDb().customers).toHaveLength(1);
      expect(store1.getDb().customers[0].businessName).toBe('Distribuidora Original');

      // Limpiar archivos de respaldo de prueba creados en backups/
      const backupsDir = path.resolve(process.cwd(), 'backups');
      for (const f of [created.fileName, restored.safetyBackupFileName]) {
        const p = path.join(backupsDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      store1.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Validadores estrictos de entradas, fechas, IDs, series, red local y orígenes CORS/WS', () => {
    expect(isValidEmail('dueno@empresa.mx')).toBe(true);
    expect(isValidEmail('no-es-correo')).toBe(false);
    expect(isValidEntityId('cust-123_abc:1')).toBe(true);
    expect(isValidEntityId('../etc/passwd')).toBe(false);
    expect(isValidEntityId('id con espacios')).toBe(false);
    expect(isValidYmd('2026-11-26')).toBe(true);
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidIsoUtc('2026-11-26T12:00:00Z')).toBe(true);
    expect(isValidIsoUtc('fecha-invalida')).toBe(false);
    expect(isValidFolioSeries('A')).toBe(true);
    expect(isValidFolioSeries('BD')).toBe(true);
    expect(isValidFolioSeries('a1')).toBe(false);

    expect(isLocalHostOrIp('localhost:3000')).toBe(true);
    expect(isLocalHostOrIp('192.168.1.50:3000')).toBe(true);
    expect(isLocalHostOrIp('10.0.0.5:3000')).toBe(true);
    expect(isLocalHostOrIp('mi-servidor-publico.com')).toBe(false);

    expect(isAllowedOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://192.168.1.20:3000', '192.168.1.20:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil-attacker.example', 'mi-servidor.com')).toBe(false);
    expect(isAllowedOrigin('javascript:alert(1)', 'localhost:3000')).toBe(false);
  });
});



