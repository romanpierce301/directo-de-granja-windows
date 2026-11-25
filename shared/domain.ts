/**
 * HuevoControl — Directo de Granja
 * Reglas de negocio puras, tipos de las 16 tablas del modelo de datos y aritmética entera exacta.
 * Pesos siempre en gramos enteros (INTEGER). Dinero siempre en centavos enteros (BIGINT).
 * Nunca se usa aritmética de punto flotante para dinero ni pesos.
 */

export type UserRole = 'dueno' | 'vendedor';
export type UserStatus = 'pendiente' | 'activa' | 'bloqueada';
export type PriceOrigin = 'dueno' | 'vendedor';
export type DeliveryStatus = 'vigente' | 'cancelada';
export type ReviewStatus = 'pendiente' | 'aprobada' | 'rechazada';
export type PaymentMethod = 'efectivo' | 'transferencia';
export type DeliveryPaymentTerm = 'CONTADO' | 'CREDITO';
export type PaymentStatus = 'verificado' | 'por_verificar';
export type IncidentType = 'perdida' | 'robo' | 'faltante' | 'otro';
export type IncidentStatus = 'reportado' | 'revisado';
export type DeliveryEventType =
  | 'creacion'
  | 'pago'
  | 'abono'
  | 'cancelacion'
  | 'remision'
  | 'sincronizacion';

export interface UserAccount {
  id: string;
  googleEmail: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  folioSeries: string | null;
  createdAtUtc: string;
  passwordHash?: string;
}

export interface AuthorizedDevice {
  id: string;
  userId: string;
  deviceName: string;
  active: boolean;
  lastSyncUtc: string | null;
  pendingSyncCount: number;
  folioBlocks?: Array<{ series: string; start: number; end: number; usedNumbers: number[] }>;
}

export interface CrewMember {
  id: string;
  userId: string;
  name: string;
  roleTitle: 'chofer' | 'chalan' | 'encargado';
  active: boolean;
}

export interface Workday {
  id: string;
  userId: string;
  dateYmd: string; // YYYY-MM-DD in America/Mexico_City
  driverName: string;
  helpersNames: string[];
}

export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  address: string;
  notes: string;
  specialPriceCentavosPerKg?: number | null;
  creditTermDays?: number | null;
  active: boolean;
  createdByUserId: string;
  mergedIntoCustomerId: string | null;
  createdAtUtc: string;
}

export interface DailyPrice {
  id: string;
  dateYmd: string;
  priceCentavosPerKg: number;
  publishedByUserId: string;
  publishedByName: string;
  origin: PriceOrigin;
  reviewedByOwner: boolean;
  createdAtUtc: string;
}

export interface DeliveryBox {
  id: string;
  deliveryId: string;
  position: number;
  weightGrams: number;
}

export type VehicleType = 'torton' | 'trailer';

export interface WarehouseShipmentLine {
  id: string;
  shipmentId: string;
  brandKey: string;
  brandName: string;
  boxesCount: number;
  totalGrams: number;
}

export interface WarehouseShipment {
  id: string;
  vehicleType: VehicleType;
  referenceCode: string;
  originFarm: string;
  driverName: string;
  arrivedAtUtc: string;
  registeredByUserId: string;
  registeredByName: string;
  notes: string;
  lines: WarehouseShipmentLine[];
}

export interface BrandInventorySummary {
  brandKey: string;
  brandName: string;
  boxesArrived: number;
  boxesSold: number;
  boxesAvailable: number;
  gramsArrived: number;
  gramsSold: number;
  gramsAvailable: number;
  avgGramsPerBox: number;
  lastArrivalUtc: string | null;
}

export interface Delivery {
  id: string;
  vendorId: string;
  vendorName: string;
  workdayId: string;
  driverName: string;
  helpersNames: string[];
  series: string;
  folioNumber: number;
  folioFormatted: string;
  customerId: string;
  customerName: string;
  createdAtUtc: string;
  priceCentavosPerKg: number;
  isSpecialPrice: boolean;
  totalGrams: number;
  calculatedTotalExactMilliCentavos: number;
  totalToChargeCentavos: number;
  /** Condición comercial registrada por Android; forma de pago va en Payment.method. */
  paymentTerm?: DeliveryPaymentTerm;
  items?: DeliveryItem[];
  sugar?: DeliverySugar;
  reviewStatus?: ReviewStatus;
  reviewNote?: string | null;
  status: DeliveryStatus;
  cancellationReason: string | null;
  syncedAtUtc: string | null;
  sourceType?: 'ruta' | 'bodega';
  brandKey?: string | null;
  brandName?: string | null;
  boxesCount?: number | null;
}

/** Una línea pesada de Android. Los pesos se expresan en gramos enteros y precio en centavos/kg. */
export interface DeliveryItem {
  id: string;
  brand: string;
  modality: 'CAJA_COMPLETA' | 'MEDIA_CAJA' | 'MEDIA_CAJA_PESADA' | string;
  boxesMilli: number;
  grossGrams: number;
  tareGrams: number;
  netGrams: number;
  priceCentavosPerKg: number;
  subtotalMilliCentavos: number;
}

export interface DeliverySugar {
  sacksMilli: number;
  weightPerSackGrams: number;
  pricePerSackCentavos: number;
  subtotalCentavos: number;
  subtotalMilliCentavos?: number;
}

export interface DailyLoss {
  id: string;
  vendorId: string;
  vendorName: string;
  workdayId: string;
  dateYmd: string;
  lostGrams: number;
  note: string;
  createdAtUtc: string;
  driverName?: string;
  helpersNames?: string[];
}

export interface Payment {
  id: string;
  customerId: string;
  deliveryId: string | null;
  vendorId: string;
  amountCentavos: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAtUtc: string;
  note: string;
  reviewStatus?: ReviewStatus;
}

export interface MoneyIncident {
  id: string;
  vendorId: string;
  vendorName: string;
  type: IncidentType;
  amountCentavos: number;
  occurredAtUtc: string;
  relatedDeliveryId: string | null;
  relatedCustomerId: string | null;
  description: string;
  peoplePresent: string[];
  status: IncidentStatus;
  ownerNote: string | null;
}

export interface DeliveryEvent {
  id: string;
  deliveryId: string;
  eventType: DeliveryEventType;
  detail: string;
  actorUserId: string;
  actorName: string;
  deviceId: string;
  occurredAtUtc: string;
  arrivedAtServerUtc: string | null;
}

export interface CashClosing {
  id: string;
  vendorId: string;
  vendorName: string;
  dateYmd: string;
  soldCentavos: number;
  cashCollectedCentavos: number;
  transferVerifiedCentavos: number;
  transferPendingCentavos: number;
  dailyLossGrams: number;
  incidentsCentavos: number;
  expectedCashToDeliverCentavos: number;
  actualCashHandedInCentavos: number;
  unexplainedDifferenceCentavos: number;
  closedAtUtc: string;
  closedByUserId: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  detail: string;
  actorUserId: string;
  actorName: string;
  occurredAtUtc: string;
}

export interface ExcelImportRecord {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  importType: 'clientes' | 'precios';
  importedAtUtc: string;
  rowsRead: number;
  rowsCreated: number;
  rowsRejected: number;
}

export interface AppSettings {
  businessName: string;
  slogan: string;
  businessPhone: string;
  businessAddress: string;
  reduceAnimations: boolean;
  themeMode: 'dark' | 'light';
  nextFolioBySeries: Record<string, number>;
}

export interface ProactiveAlert {
  id: string;
  severity: 'info' | 'critical'; // Sin ámbar ni amarillo: info=azul, critical=rojo
  category: 'sync' | 'transferencia' | 'incidente' | 'peso' | 'precio' | 'cierre' | 'sistema' | 'inventario';
  title: string;
  message: string;
  createdAtUtc: string;
  acknowledged: boolean;
}

export interface RoundingResult {
  totalGrams: number;
  calculatedExactLabel: string;
  calculatedExactMilliCentavos: number;
  totalToChargeCentavos: number;
}

/**
 * Regla de redondeo exacta de Directo de Granja (Casos C1-C6, R1-R5):
 * - Pesos en gramos enteros, nunca se redondean.
 * - Solo se redondea el total a cobrar una sola vez:
 *   - Primero redondea el importe bruto a centavos (como Android, HALF_UP).
 *   - Después aplica el redondeo comercial: <50 baja, =50 conserva .50, >50 sube.
 */
export function calculateDeliveryTotals(
  boxesGrams: number[],
  priceCentavosPerKg: number
): RoundingResult {
  if (boxesGrams.length === 0) {
    throw new Error('La entrega debe tener al menos una caja.');
  }
  for (const g of boxesGrams) {
    if (!Number.isInteger(g) || g <= 0) {
      throw new Error('Cada caja debe tener un peso entero en gramos mayor que 0.');
    }
  }
  if (!Number.isInteger(priceCentavosPerKg) || priceCentavosPerKg <= 0) {
    throw new Error('El precio por kilo en centavos debe ser mayor que 0.');
  }

  const totalGrams = boxesGrams.reduce((acc, g) => acc + g, 0);
  const rawScaled = BigInt(totalGrams) * BigInt(priceCentavosPerKg); // units: 1/1000 of a centavo (100_000 = $1 MXN)
  const exactCentavos = rawScaled / 1000n;
  const centavoRemainder = rawScaled % 1000n;
  const roundedCentavos =
    exactCentavos + (centavoRemainder >= 500n ? 1n : 0n);
  const pesos = roundedCentavos / 100n;
  const rem = roundedCentavos % 100n;

  let totalToChargeCentavos: number;
  if (rem < 50n) {
    totalToChargeCentavos = Number(pesos * 100n);
  } else if (rem === 50n) {
    totalToChargeCentavos = Number(pesos * 100n + 50n);
  } else {
    totalToChargeCentavos = Number((pesos + 1n) * 100n);
  }

  // Human-readable exact value (supports .125 / .625 without floats)
  const wholeCentavos = rawScaled / 1000n;
  const milliRem = rawScaled % 1000n;
  const exactPesos = wholeCentavos / 100n;
  const exactCents = Number(wholeCentavos % 100n)
    .toString()
    .padStart(2, '0');
  const calculatedExactLabel =
    milliRem === 0n
      ? `$${exactPesos.toLocaleString('es-MX')}.${exactCents}`
      : `$${exactPesos.toLocaleString('es-MX')}.${exactCents}${Number(milliRem / 100n)}`;

  return {
    totalGrams,
    calculatedExactLabel,
    calculatedExactMilliCentavos: Number(rawScaled),
    totalToChargeCentavos,
  };
}

/** Calcula una entrega con varios productos/precios y redondea una sola vez el total, igual que Android. */
export function calculateDeliveryItemsTotals(
  items: Array<Pick<DeliveryItem, 'grossGrams' | 'tareGrams' | 'netGrams' | 'priceCentavosPerKg'>>,
  additionalMilliCentavos = 0,
  additionalGrams = 0,
): RoundingResult {
  if (!items.length && additionalMilliCentavos <= 0) throw new Error('La entrega debe incluir al menos un producto pesado.');
  if (!Number.isSafeInteger(additionalMilliCentavos) || additionalMilliCentavos < 0 ||
      !Number.isSafeInteger(additionalGrams) || additionalGrams < 0) {
    throw new Error('Los importes adicionales no son válidos.');
  }
  let totalGrams = additionalGrams;
  let rawScaled = BigInt(additionalMilliCentavos);
  for (const item of items) {
    if (![item.grossGrams, item.tareGrams, item.netGrams].every(Number.isSafeInteger) ||
        item.grossGrams <= 0 || item.tareGrams < 0 || item.netGrams <= 0 ||
        item.netGrams > item.grossGrams) {
      throw new Error('El peso bruto, tara y neto de cada producto no son válidos.');
    }
    if (!Number.isSafeInteger(item.priceCentavosPerKg) || item.priceCentavosPerKg <= 0 || item.priceCentavosPerKg > 50_000) {
      throw new Error('Cada producto debe tener un precio por kilo válido.');
    }
    totalGrams += item.netGrams;
    rawScaled += BigInt(item.netGrams) * BigInt(item.priceCentavosPerKg);
  }
  const exactCentavos = rawScaled / 1000n;
  const roundedCentavos = exactCentavos + (rawScaled % 1000n >= 500n ? 1n : 0n);
  const pesos = roundedCentavos / 100n;
  const cents = roundedCentavos % 100n;
  const totalToChargeCentavos =
    cents < 50n ? pesos * 100n :
    cents === 50n ? pesos * 100n + 50n :
    (pesos + 1n) * 100n;
  const milliCentavos = rawScaled;
  const wholeCentavos = milliCentavos / 1000n;
  const milliRem = milliCentavos % 1000n;
  const labelPesos = wholeCentavos / 100n;
  const labelCents = String(wholeCentavos % 100n).padStart(2, '0');
  const calculatedExactLabel = milliRem === 0n
    ? `$${labelPesos.toLocaleString('es-MX')}.${labelCents}`
    : `$${labelPesos.toLocaleString('es-MX')}.${labelCents}${milliRem / 100n}`;
  return {
    totalGrams,
    calculatedExactLabel,
    calculatedExactMilliCentavos: Number(rawScaled),
    totalToChargeCentavos: Number(totalToChargeCentavos),
  };
}

export function validatePaymentAmount(
  paymentCentavos: number,
  remainingCentavos: number
): void {
  if (!Number.isInteger(paymentCentavos) || paymentCentavos <= 0) {
    throw new Error('El monto del pago debe ser mayor a $0.');
  }
  if (paymentCentavos > remainingCentavos) {
    throw new Error(
      `El pago (${formatCurrencyFromCentavos(paymentCentavos)}) no puede ser mayor al saldo pendiente (${formatCurrencyFromCentavos(remainingCentavos)}).`
    );
  }
}

export function formatKgFromGrams(grams: number): string {
  const neg = grams < 0 ? '-' : '';
  const abs = Math.abs(Math.round(grams));
  const kg = Math.floor(abs / 1000);
  const rem = Math.floor((abs % 1000) / 10);
  return `${neg}${kg.toLocaleString('en-US')}.${rem.toString().padStart(2, '0')} kg`;
}

export function formatCurrencyFromCentavos(centavos: number, forceDecimals = false): string {
  const neg = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centavos));
  const pesos = Math.floor(abs / 100);
  const rem = abs % 100;
  if (rem === 0 && !forceDecimals) {
    return `${neg}$${pesos.toLocaleString('en-US')}`;
  }
  return `${neg}$${pesos.toLocaleString('en-US')}.${rem.toString().padStart(2, '0')}`;
}

export function formatFolio(series: string, num: number): string {
  return `${series}-${num.toString().padStart(4, '0')}`;
}

export function formatMexicoCityDate(utcIso: string): string {
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatMexicoCityTime(utcIso: string): string {
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function getMexicoCityYmd(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '11';
  const d = parts.find((p) => p.type === 'day')?.value ?? '16';
  return `${y}-${m}-${d}`;
}

/**
 * Normaliza nombres de negocio para detección de duplicados (sin acentos, minúsculas, espacios colapsados).
 */
export function normalizeCustomerName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Seguridad Excel (Casos X2 y X3):
 * Neutraliza inyección de fórmulas (=, +, -, @, tab, CR) al exportar para Excel/CSV.
 */
export function escapeExcelFormulaInjection(value: string): string {
  if (!value) return '';
  const trimmed = value.replace(/\r/g, ' ');
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Limpia valores leídos desde archivos Excel/CSV externos (nunca ejecuta fórmulas).
 */
export function sanitizeImportedCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  return s;
}

export function calculateVendorClosing(params: {
  deliveries: Delivery[];
  payments: Payment[];
  losses: DailyLoss[];
  incidents: MoneyIncident[];
  actualCashHandedInCentavos: number;
}) {
  const validDeliveries = params.deliveries.filter((d) => d.status === 'vigente' && d.reviewStatus !== 'pendiente' && d.reviewStatus !== 'rechazada');
  const soldCentavos = validDeliveries.reduce((acc, d) => acc + d.totalToChargeCentavos, 0);

  // Exclude payments tied solely to cancelled deliveries
  const cancelledIds = new Set(
    params.deliveries.filter((d) => d.status === 'cancelada').map((d) => d.id)
  );
  const activePayments = params.payments.filter(
    (p) => p.reviewStatus !== 'pendiente' && p.reviewStatus !== 'rechazada' && (!p.deliveryId || !cancelledIds.has(p.deliveryId))
  );

  const cashCollectedCentavos = activePayments
    .filter((p) => p.method === 'efectivo')
    .reduce((acc, p) => acc + p.amountCentavos, 0);
  const transferVerifiedCentavos = activePayments
    .filter((p) => p.method === 'transferencia' && p.status === 'verificado')
    .reduce((acc, p) => acc + p.amountCentavos, 0);
  const transferPendingCentavos = activePayments
    .filter((p) => p.method === 'transferencia' && p.status === 'por_verificar')
    .reduce((acc, p) => acc + p.amountCentavos, 0);

  const dailyLossGrams = params.losses.reduce((acc, l) => acc + l.lostGrams, 0);
  const incidentsCentavos = params.incidents.reduce((acc, i) => acc + i.amountCentavos, 0);

  // Regla I2: Efectivo cobrado menos incidentes registrados da el efectivo a entregar
  const expectedCashToDeliverCentavos = cashCollectedCentavos - incidentsCentavos;
  const unexplainedDifferenceCentavos =
    expectedCashToDeliverCentavos - params.actualCashHandedInCentavos;

  const totalCollectedCentavos =
    cashCollectedCentavos + transferVerifiedCentavos + transferPendingCentavos;
  const totalReceivableCentavos = Math.max(0, soldCentavos - totalCollectedCentavos);

  return {
    soldCentavos,
    cashCollectedCentavos,
    transferVerifiedCentavos,
    transferPendingCentavos,
    totalCollectedCentavos,
    totalReceivableCentavos,
    dailyLossGrams,
    incidentsCentavos,
    expectedCashToDeliverCentavos,
    actualCashHandedInCentavos: params.actualCashHandedInCentavos,
    unexplainedDifferenceCentavos,
  };
}

/**
 * Calcula saldo real de un cliente desde entregas vigentes y pagos (nunca escrito a mano).
 */
export function calculateCustomerLedger(
  customerId: string,
  deliveries: Delivery[],
  payments: Payment[]
) {
  const validDeliveries = deliveries.filter(
    (d) => d.customerId === customerId && d.status === 'vigente' && d.reviewStatus !== 'pendiente' && d.reviewStatus !== 'rechazada'
  );
  const cancelledIds = new Set(
    deliveries
      .filter((d) => d.customerId === customerId && d.status === 'cancelada')
      .map((d) => d.id)
  );
  const customerPayments = payments.filter(
    (p) => p.customerId === customerId && p.reviewStatus !== 'pendiente' && p.reviewStatus !== 'rechazada' && (!p.deliveryId || !cancelledIds.has(p.deliveryId))
  );

  const totalBoughtCentavos = validDeliveries.reduce(
    (acc, d) => acc + d.totalToChargeCentavos,
    0
  );
  const totalPaidCentavos = customerPayments.reduce((acc, p) => acc + p.amountCentavos, 0);
  const balanceCentavos = Math.max(0, totalBoughtCentavos - totalPaidCentavos);

  return {
    totalBoughtCentavos,
    totalPaidCentavos,
    balanceCentavos,
    deliveriesCount: validDeliveries.length,
    paymentsCount: customerPayments.length,
  };
}

export function normalizeBrandName(brand: string): string {
  return brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Divide un peso total en gramos enteros entre N cajas exactamente sin pérdida ni redondeo flotante.
 */
export function splitTotalGramsIntoBoxes(totalGrams: number, boxesCount: number): number[] {
  if (!Number.isInteger(totalGrams) || totalGrams <= 0) {
    throw new Error('El peso total en gramos debe ser un entero mayor que 0.');
  }
  if (!Number.isInteger(boxesCount) || boxesCount <= 0) {
    throw new Error('La cantidad de cajas debe ser un entero mayor que 0.');
  }
  if (totalGrams < boxesCount) {
    throw new Error('El peso total en gramos debe ser al menos 1 gramo por caja.');
  }
  const base = Math.floor(totalGrams / boxesCount);
  const rem = totalGrams % boxesCount;
  const result: number[] = [];
  for (let i = 0; i < boxesCount; i++) {
    result.push(i < rem ? base + 1 : base);
  }
  return result;
}

/**
 * Calcula el inventario exacto de bodega por marca de huevo:
 * - Suma todas las cajas y gramos llegados en tortones/tráileres.
 * - Descuenta únicamente entregas vigentes asociadas a esa marca (si una venta se cancela, el stock regresa).
 */
export function calculateBrandInventory(
  shipments: WarehouseShipment[],
  deliveries: Delivery[],
  deliveryBoxes: DeliveryBox[]
): BrandInventorySummary[] {
  const map = new Map<string, BrandInventorySummary>();

  for (const s of shipments) {
    for (const line of s.lines) {
      const key = line.brandKey || normalizeBrandName(line.brandName);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          brandKey: key,
          brandName: line.brandName.trim(),
          boxesArrived: line.boxesCount,
          boxesSold: 0,
          boxesAvailable: line.boxesCount,
          gramsArrived: line.totalGrams,
          gramsSold: 0,
          gramsAvailable: line.totalGrams,
          avgGramsPerBox:
            line.boxesCount > 0 ? Math.round(line.totalGrams / line.boxesCount) : 0,
          lastArrivalUtc: s.arrivedAtUtc,
        });
      } else {
        existing.boxesArrived += line.boxesCount;
        existing.gramsArrived += line.totalGrams;
        if (!existing.lastArrivalUtc || s.arrivedAtUtc > existing.lastArrivalUtc) {
          existing.lastArrivalUtc = s.arrivedAtUtc;
        }
      }
    }
  }

  for (const d of deliveries) {
    if (d.status !== 'vigente' || d.reviewStatus === 'rechazada') continue;
    if (d.items?.length) {
      for (const item of d.items) {
        const key = normalizeBrandName(item.brand);
        if (!key) continue;
        const boxes = item.boxesMilli / 1000;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            brandKey: key,
            brandName: item.brand.trim() || key,
            boxesArrived: 0,
            boxesSold: boxes,
            boxesAvailable: -boxes,
            gramsArrived: 0,
            gramsSold: item.grossGrams,
            gramsAvailable: 0,
            avgGramsPerBox: 0,
            lastArrivalUtc: null,
          });
        } else {
          existing.boxesSold += boxes;
          existing.gramsSold += item.grossGrams;
        }
      }
      continue;
    }
    const key = d.brandKey || (d.brandName ? normalizeBrandName(d.brandName) : '');
    if (!key) continue;

    const delBoxesCount =
      typeof d.boxesCount === 'number' && d.boxesCount > 0
        ? d.boxesCount
        : deliveryBoxes.filter((b) => b.deliveryId === d.id).length;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        brandKey: key,
        brandName: d.brandName || key,
        boxesArrived: 0,
        boxesSold: delBoxesCount,
        boxesAvailable: -delBoxesCount,
        gramsArrived: 0,
        gramsSold: d.totalGrams,
        gramsAvailable: 0,
        avgGramsPerBox: 0,
        lastArrivalUtc: null,
      });
    } else {
      existing.boxesSold += delBoxesCount;
      existing.gramsSold += d.totalGrams;
    }
  }

  const list: BrandInventorySummary[] = [];
  for (const item of map.values()) {
    item.boxesAvailable = item.boxesArrived - item.boxesSold;
    item.gramsAvailable = Math.max(0, item.gramsArrived - item.gramsSold);
    item.avgGramsPerBox =
      item.boxesArrived > 0 ? Math.round(item.gramsArrived / item.boxesArrived) : 0;
    list.push(item);
  }

  return list.sort((a, b) => a.brandName.localeCompare(b.brandName, 'es'));
}

export function validateBodegaSaleStock(
  inventory: BrandInventorySummary[],
  brandNameOrKey: string,
  boxesRequested: number
): BrandInventorySummary {
  if (!Number.isInteger(boxesRequested) || boxesRequested <= 0) {
    throw new Error('La cantidad de cajas a vender debe ser un entero mayor a 0.');
  }
  const key = normalizeBrandName(brandNameOrKey);
  const stock = inventory.find((i) => i.brandKey === key);
  if (!stock || stock.boxesArrived <= 0) {
    throw new Error(`No hay inventario registrado en bodega para la marca "${brandNameOrKey}".`);
  }
  if (stock.boxesAvailable < boxesRequested) {
    throw new Error(
      `Inventario insuficiente de ${stock.brandName}: disponibles ${stock.boxesAvailable} cajas, solicitadas ${boxesRequested} cajas.`
    );
  }
  return stock;
}
