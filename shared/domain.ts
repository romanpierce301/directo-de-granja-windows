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
export type PaymentMethod = 'efectivo' | 'transferencia';
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
  active: boolean;
  createdByUserId: string;
  mergedIntoCustomerId: string | null;
  createdAtUtc: string;
  specialPriceCentavosPerKg?: number | null;
  creditTermDays?: number | null;
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
export type BodegaProductType = 'huevo' | 'azucar';
export type HalfBoxWeighType = 'directa' | 'partida' | 'pesada';

export const BOX_TARE_GRAMS = 2000;
export const HALF_BOX_TARE_GRAMS = 1000;
export const HALF_BOX_PESADA_TARE_GRAMS = 500;

export interface WarehouseShipmentLine {
  id: string;
  shipmentId: string;
  productType?: BodegaProductType;
  brandKey: string;
  brandName: string;
  boxesCount: number;
  totalGrams: number;
}

export interface WarehouseShipment {
  id: string;
  series: string;
  folioNumber: number;
  folioFormatted: string;
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
  productType: BodegaProductType;
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

export interface BodegaSaleItem {
  id: string;
  productType: BodegaProductType;
  brandKey: string;
  brandName: string;
  fullBoxes: number;
  halfBoxes: number;
  quantity: number;
  weighMode?: 'total' | 'cajas';
  tareGrams: number;
  totalGrams: number;
  unitPriceCentavos: number;
  isSpecialPrice: boolean;
  subtotalCentavos: number;
  calculatedExactLabel?: string;
  boxesGrams: number[];
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
  status: DeliveryStatus;
  cancellationReason: string | null;
  syncedAtUtc: string | null;
  sourceType?: 'ruta' | 'bodega';
  brandKey?: string | null;
  brandName?: string | null;
  boxesCount?: number | null;
  saleItems?: BodegaSaleItem[];
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
  receiptFolio?: string | null;
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

export interface WindowsPrinterConfig {
  mode: 'system' | 'electron' | 'usb_serial';
  printerName: string;
  paperWidthMm: 48;
  baudRate?: number;
  vendorId?: number;
  productId?: number;
}

export interface AppSettings {
  businessName: string;
  slogan: string;
  businessPhone: string;
  businessAddress: string;
  profilePictureUrl?: string;
  reduceAnimations: boolean;
  themeMode: 'dark' | 'light';
  nextFolioBySeries: Record<string, number>;
  printerConfig?: WindowsPrinterConfig;
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
 *   - Centavos de 1 a 49 (estrictamente menor a 50.000): baja al entero anterior.
 *   - Exactamente 50 centavos (50.000): se queda en .50.
 *   - Centavos de 51 a 99 (o cualquier fraccion > 50.000 como 62.5): sube al entero siguiente.
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
  const pesos = rawScaled / 100000n;
  const rem = rawScaled % 100000n;

  let totalToChargeCentavos: number;
  if (rem < 50000n) {
    totalToChargeCentavos = Number(pesos * 100n);
  } else if (rem === 50000n) {
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
  const validDeliveries = params.deliveries.filter((d) => d.status === 'vigente');
  const soldCentavos = validDeliveries.reduce((acc, d) => acc + d.totalToChargeCentavos, 0);

  // Exclude payments tied solely to cancelled deliveries
  const cancelledIds = new Set(
    params.deliveries.filter((d) => d.status === 'cancelada').map((d) => d.id)
  );
  const activePayments = params.payments.filter(
    (p) => !p.deliveryId || !cancelledIds.has(p.deliveryId)
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
    (d) => d.customerId === customerId && d.status === 'vigente'
  );
  const cancelledIds = new Set(
    deliveries
      .filter((d) => d.customerId === customerId && d.status === 'cancelada')
      .map((d) => d.id)
  );
  const customerPayments = payments.filter(
    (p) => p.customerId === customerId && (!p.deliveryId || !cancelledIds.has(p.deliveryId))
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

export interface CustomerPaymentBalanceInfo {
  previousBalanceCentavos: number;
  remainingBalanceCentavos: number;
  appliedToLabel: string;
}

/**
 * Calcula saldo previo, saldo restante y etiqueta aplicada para cada abono/pago de un cliente en orden cronológico.
 */
export function computeCustomerPaymentBalances(
  customerId: string,
  deliveries: Delivery[],
  payments: Payment[]
): Map<string, CustomerPaymentBalanceInfo> {
  const validDeliveries = deliveries.filter(
    (d) => d.customerId === customerId && d.status === 'vigente'
  );
  const deliveriesById = new Map(deliveries.map((d) => [d.id, d]));
  const cancelledIds = new Set(
    deliveries
      .filter((d) => d.customerId === customerId && d.status === 'cancelada')
      .map((d) => d.id)
  );
  const customerPayments = payments.filter(
    (p) => p.customerId === customerId && (!p.deliveryId || !cancelledIds.has(p.deliveryId))
  );

  type TimelineEvent =
    | { kind: 'delivery'; at: string; order: number; delivery: Delivery }
    | { kind: 'payment'; at: string; order: number; payment: Payment };

  const events: TimelineEvent[] = [
    ...validDeliveries.map((delivery, idx) => ({
      kind: 'delivery' as const,
      at: delivery.createdAtUtc,
      order: idx,
      delivery,
    })),
    ...customerPayments.map((payment, idx) => ({
      kind: 'payment' as const,
      at: payment.createdAtUtc,
      order: idx,
      payment,
    })),
  ].sort((a, b) => {
    const cmp = a.at.localeCompare(b.at);
    if (cmp !== 0) return cmp;
    if (a.kind !== b.kind) return a.kind === 'delivery' ? -1 : 1;
    return a.order - b.order;
  });

  const result = new Map<string, CustomerPaymentBalanceInfo>();
  let runningDebt = 0;

  for (const evt of events) {
    if (evt.kind === 'delivery') {
      runningDebt += evt.delivery.totalToChargeCentavos;
    } else {
      const p = evt.payment;
      const previousBalanceCentavos = runningDebt;
      runningDebt = Math.max(0, runningDebt - p.amountCentavos);
      const linkedDel = p.deliveryId ? deliveriesById.get(p.deliveryId) : undefined;
      result.set(p.id, {
        previousBalanceCentavos,
        remainingBalanceCentavos: runningDebt,
        appliedToLabel: linkedDel ? `Entrega ${linkedDel.folioFormatted}` : 'Saldo de cuenta',
      });
    }
  }

  return result;
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

export function normalizeProductKey(
  brand: string,
  productType: BodegaProductType = 'huevo'
): string {
  const base = normalizeBrandName(brand);
  if (!base) return '';
  return productType === 'azucar' ? `azucar:${base}` : base;
}

export function roundHalfUnits(val: number): number {
  return Math.round(val * 2) / 2;
}

export function isValidHalfUnitCount(val: number): boolean {
  return Number.isFinite(val) && val > 0 && Math.abs(val * 2 - Math.round(val * 2)) < 1e-6;
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
 * Divide un peso total en gramos enteros entre cajas completas (peso 2) y medias cajas (peso 1).
 */
export function splitTotalGramsIntoHalfAwareBoxes(
  totalGrams: number,
  fullBoxes: number,
  halfBoxes: number
): number[] {
  if (!Number.isInteger(fullBoxes) || fullBoxes < 0 || !Number.isInteger(halfBoxes) || halfBoxes < 0) {
    throw new Error('Las cajas completas y medias cajas deben ser enteros mayores o iguales a 0.');
  }
  if (fullBoxes + halfBoxes <= 0) {
    throw new Error('Debe indicar al menos una caja o media caja.');
  }
  if (halfBoxes === 0) {
    return splitTotalGramsIntoBoxes(totalGrams, fullBoxes);
  }
  if (!Number.isInteger(totalGrams) || totalGrams < fullBoxes + halfBoxes) {
    throw new Error('El peso total en gramos debe ser suficiente para cubrir cada caja y media caja.');
  }

  const totalParts = fullBoxes * 2 + halfBoxes;
  const baseUnit = Math.floor(totalGrams / totalParts);
  let rem = totalGrams % totalParts;
  const result: number[] = [];

  for (let i = 0; i < fullBoxes; i++) {
    const extra = Math.min(2, rem);
    rem -= extra;
    result.push(baseUnit * 2 + extra);
  }
  for (let i = 0; i < halfBoxes; i++) {
    const extra = Math.min(1, rem);
    rem -= extra;
    result.push(baseUnit + extra);
  }

  // Fallback if totalGrams < totalParts (small test values) so every entry > 0 and sum === totalGrams
  if (result.some((g) => g <= 0)) {
    return splitTotalGramsIntoBoxes(totalGrams, fullBoxes + halfBoxes);
  }

  return result;
}

/**
 * Descuenta tara de cartón en modo "peso por caja":
 * - 2,000 g (2.00 kg) por cada caja completa
 * - 1,000 g (1.00 kg) por cada media caja
 */
export function deductCartonTareFromPerBoxWeights(
  grossFullBoxesGrams: number[],
  grossHalfBoxesGrams: number[]
): { netBoxesGrams: number[]; tareGrams: number } {
  return deductCartonTareWithModalities(grossFullBoxesGrams, grossHalfBoxesGrams, 'directa');
}

/**
 * Descuenta tara de cartón en modo "peso por caja" con las 3 modalidades equivalentes a Android:
 * - Caja completa: -2,000 g (2.00 kg)
 * - Media caja 'directa': -1,000 g (1.00 kg)
 * - Media caja 'partida' (caja partida a la mitad): (bruto - 2,000 g) / 2, tara contabilizada 1,000 g
 * - Media caja 'pesada' (media caja pesada por separado): -500 g (0.50 kg)
 */
export function deductCartonTareWithModalities(
  grossFullBoxesGrams: number[],
  grossHalfBoxesGrams: number[],
  halfBoxType: HalfBoxWeighType = 'directa'
): { netBoxesGrams: number[]; tareGrams: number } {
  if (grossFullBoxesGrams.length + grossHalfBoxesGrams.length === 0) {
    throw new Error('Debe capturar al menos una caja o media caja.');
  }
  const netBoxesGrams: number[] = [];
  let tareGrams = 0;

  for (let i = 0; i < grossFullBoxesGrams.length; i++) {
    const gross = grossFullBoxesGrams[i];
    if (!Number.isInteger(gross) || gross <= BOX_TARE_GRAMS) {
      throw new Error(
        `La caja #${i + 1} debe pesar más de 2.00 kg en bruto para descontar los 2 kg de cartón.`
      );
    }
    netBoxesGrams.push(gross - BOX_TARE_GRAMS);
    tareGrams += BOX_TARE_GRAMS;
  }

  for (let i = 0; i < grossHalfBoxesGrams.length; i++) {
    const gross = grossHalfBoxesGrams[i];
    if (halfBoxType === 'partida') {
      if (!Number.isInteger(gross) || gross <= BOX_TARE_GRAMS) {
        throw new Error(
          `La media caja partida #${i + 1} debe pesar más de 2.00 kg en bruto ((bruto - 2 kg) ÷ 2).`
        );
      }
      const net = Math.round((gross - BOX_TARE_GRAMS) / 2);
      if (net <= 0) {
        throw new Error(`El peso neto calculado de la media caja partida #${i + 1} debe ser mayor a 0.`);
      }
      netBoxesGrams.push(net);
      tareGrams += HALF_BOX_TARE_GRAMS;
    } else if (halfBoxType === 'pesada') {
      if (!Number.isInteger(gross) || gross <= HALF_BOX_PESADA_TARE_GRAMS) {
        throw new Error(
          `La media caja pesada #${i + 1} debe pesar más de 0.50 kg en bruto para descontar 0.50 kg.`
        );
      }
      netBoxesGrams.push(gross - HALF_BOX_PESADA_TARE_GRAMS);
      tareGrams += HALF_BOX_PESADA_TARE_GRAMS;
    } else {
      if (!Number.isInteger(gross) || gross <= HALF_BOX_TARE_GRAMS) {
        throw new Error(
          `La media caja #${i + 1} debe pesar más de 1.00 kg en bruto para descontar 1 kg de cartón.`
        );
      }
      netBoxesGrams.push(gross - HALF_BOX_TARE_GRAMS);
      tareGrams += HALF_BOX_TARE_GRAMS;
    }
  }

  return { netBoxesGrams, tareGrams };
}

export function calculateSugarLineSubtotalCentavos(
  bultosCount: number,
  pricePerBultoCentavos: number
): number {
  if (!Number.isInteger(bultosCount) || bultosCount <= 0) {
    throw new Error('La cantidad de bultos de azúcar debe ser un entero mayor a 0.');
  }
  if (!Number.isInteger(pricePerBultoCentavos) || pricePerBultoCentavos <= 0) {
    throw new Error('El precio por bulto de azúcar debe ser mayor a $0.');
  }
  return bultosCount * pricePerBultoCentavos;
}

/**
 * Calcula el inventario exacto de bodega por marca de huevo y bultos de azúcar:
 * - Suma todas las cajas/bultos y gramos llegados en tortones/tráileres.
 * - Descuenta únicamente entregas vigentes asociadas a ese producto (si una venta se cancela, el stock regresa).
 */
export function calculateBrandInventory(
  shipments: WarehouseShipment[],
  deliveries: Delivery[],
  deliveryBoxes: DeliveryBox[]
): BrandInventorySummary[] {
  const map = new Map<string, BrandInventorySummary>();

  for (const s of shipments) {
    for (const line of s.lines) {
      const productType: BodegaProductType = line.productType === 'azucar' ? 'azucar' : 'huevo';
      const key = line.brandKey || normalizeProductKey(line.brandName, productType);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          productType,
          brandKey: key,
          brandName: line.brandName.trim(),
          boxesArrived: roundHalfUnits(line.boxesCount),
          boxesSold: 0,
          boxesAvailable: roundHalfUnits(line.boxesCount),
          gramsArrived: line.totalGrams,
          gramsSold: 0,
          gramsAvailable: line.totalGrams,
          avgGramsPerBox:
            line.boxesCount > 0 ? Math.round(line.totalGrams / line.boxesCount) : 0,
          lastArrivalUtc: s.arrivedAtUtc,
        });
      } else {
        existing.boxesArrived = roundHalfUnits(existing.boxesArrived + line.boxesCount);
        existing.gramsArrived += line.totalGrams;
        if (!existing.lastArrivalUtc || s.arrivedAtUtc > existing.lastArrivalUtc) {
          existing.lastArrivalUtc = s.arrivedAtUtc;
        }
      }
    }
  }

  for (const d of deliveries) {
    if (d.status !== 'vigente') continue;

    if (Array.isArray(d.saleItems) && d.saleItems.length > 0) {
      for (const item of d.saleItems) {
        const productType: BodegaProductType = item.productType === 'azucar' ? 'azucar' : 'huevo';
        const key = item.brandKey || normalizeProductKey(item.brandName, productType);
        if (!key) continue;
        const qty = roundHalfUnits(item.quantity);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            productType,
            brandKey: key,
            brandName: item.brandName || key,
            boxesArrived: 0,
            boxesSold: qty,
            boxesAvailable: -qty,
            gramsArrived: 0,
            gramsSold: item.totalGrams,
            gramsAvailable: 0,
            avgGramsPerBox: 0,
            lastArrivalUtc: null,
          });
        } else {
          existing.boxesSold = roundHalfUnits(existing.boxesSold + qty);
          existing.gramsSold += item.totalGrams;
        }
      }
      continue;
    }

    const key = d.brandKey || (d.brandName ? normalizeBrandName(d.brandName) : '');
    if (!key) continue;
    const productType: BodegaProductType = key.startsWith('azucar:') ? 'azucar' : 'huevo';

    const delBoxesCount =
      typeof d.boxesCount === 'number' && d.boxesCount > 0
        ? roundHalfUnits(d.boxesCount)
        : deliveryBoxes.filter((b) => b.deliveryId === d.id).length;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        productType,
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
      existing.boxesSold = roundHalfUnits(existing.boxesSold + delBoxesCount);
      existing.gramsSold += d.totalGrams;
    }
  }

  const list: BrandInventorySummary[] = [];
  for (const item of map.values()) {
    item.boxesAvailable = roundHalfUnits(item.boxesArrived - item.boxesSold);
    item.gramsAvailable = Math.max(0, item.gramsArrived - item.gramsSold);
    item.avgGramsPerBox =
      item.boxesArrived > 0 ? Math.round(item.gramsArrived / item.boxesArrived) : 0;
    list.push(item);
  }

  return list.sort((a, b) => {
    if (a.productType !== b.productType) {
      return a.productType === 'huevo' ? -1 : 1;
    }
    return a.brandName.localeCompare(b.brandName, 'es');
  });
}

export function validateBodegaSaleStock(
  inventory: BrandInventorySummary[],
  brandNameOrKey: string,
  boxesRequested: number,
  productType: BodegaProductType = 'huevo'
): BrandInventorySummary {
  const unitLabel = productType === 'azucar' ? 'bultos' : 'cajas';
  if (productType === 'azucar') {
    if (!Number.isInteger(boxesRequested) || boxesRequested <= 0) {
      throw new Error('La cantidad de bultos de azúcar a vender debe ser un entero mayor a 0.');
    }
  } else {
    if (!isValidHalfUnitCount(boxesRequested)) {
      throw new Error('La cantidad de cajas a vender debe ser mayor a 0 (en múltiplos de 0.5).');
    }
  }

  const normalizedKey = normalizeProductKey(brandNameOrKey, productType);
  const stock = inventory.find(
    (i) =>
      i.productType === productType &&
      (i.brandKey === brandNameOrKey || i.brandKey === normalizedKey)
  );
  if (!stock || stock.boxesArrived <= 0) {
    throw new Error(`No hay inventario registrado en bodega para "${brandNameOrKey}".`);
  }
  const reqRounded = roundHalfUnits(boxesRequested);
  if (stock.boxesAvailable + 1e-6 < reqRounded) {
    throw new Error(
      `Inventario insuficiente de ${stock.brandName}: disponibles ${stock.boxesAvailable} ${unitLabel}, solicitados ${reqRounded} ${unitLabel}.`
    );
  }
  return stock;
}
