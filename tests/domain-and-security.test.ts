import { describe, expect, it } from 'vitest';
import {
  calculateBrandInventory,
  calculateCustomerLedger,
  calculateDeliveryTotals,
  calculateVendorClosing,
  escapeExcelFormulaInjection,
  normalizeCustomerName,
  splitTotalGramsIntoBoxes,
  validateBodegaSaleStock,
  validatePaymentAmount,
  type DailyLoss,
  type Delivery,
  type MoneyIncident,
  type Payment,
  type WarehouseShipment,
} from '../shared/domain.ts';
import {
  decryptSensitive,
  encryptSensitive,
  hashPassword,
  sanitizePlainText,
  signJwt,
  verifyJwt,
  verifyPassword,
} from '../server/security.ts';

// Deterministic test-only secrets; production startup requires externally configured keys.
process.env.JWT_SECRET ??= 'test-only-jwt-secret-with-at-least-32-characters';
process.env.AES_ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

    const tampered = cipher.slice(0, -2) + 'ff';
    expect(() => decryptSensitive(tampered)).toThrow();
  });

  it('JWT HS256 y hashing bcrypt validan roles y contraseñas correctamente', () => {
    const hash = hashPassword('Granja2026!');
    expect(verifyPassword('Granja2026!', hash)).toBe(true);
    expect(verifyPassword('WrongPass', hash)).toBe(false);

    const token = signJwt({
      sub: 'usr-1',
      email: 'dueno@directodegranja.mx',
      name: 'Dueño',
      role: 'dueno',
      folioSeries: null,
    });
    const decoded = verifyJwt(token);
    expect(decoded.role).toBe('dueno');
    expect(decoded.sub).toBe('usr-1');
  });

  it('Sanitiza intentos de XSS HTML en entradas de texto', () => {
    expect(sanitizePlainText('<script>alert(1)</script>Abarrotes')).toBe(
      'scriptalert(1)/scriptAbarrotes'
    );
  });
});

describe('Bodega: Tortón/Tráiler, Inventario por Marca y Descuento por Venta Directa', () => {
  it('Agrega tortón y tráiler por marca normalizada, descuenta 40 cajas a Sr. Pablo, rechaza sobreventa y restaura al cancelar', () => {
    const shipments: WarehouseShipment[] = [
      {
        id: 'shp-1',
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
