import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  calculateBrandInventory,
  calculateDeliveryTotals,
  formatCurrencyFromCentavos,
  formatFolio,
  formatKgFromGrams,
  getMexicoCityYmd,
  normalizeCustomerName,
  normalizePhone,
  type AppSettings,
  type AuditLogEntry,
  type AuthorizedDevice,
  type CashClosing,
  type CrewMember,
  type Customer,
  type DailyLoss,
  type DailyPrice,
  type Delivery,
  type DeliveryBox,
  type DeliveryEvent,
  type ExcelImportRecord,
  type MoneyIncident,
  type Payment,
  type ProactiveAlert,
  type UserAccount,
  type WarehouseShipment,
  type Workday,
} from '../shared/domain.ts';
import { hashPassword } from './security.ts';

export interface LedgerDatabase {
  users: UserAccount[];
  devices: AuthorizedDevice[];
  crewMembers: CrewMember[];
  workdays: Workday[];
  customers: Customer[];
  dailyPrices: DailyPrice[];
  deliveries: Delivery[];
  deliveryBoxes: DeliveryBox[];
  dailyLosses: DailyLoss[];
  payments: Payment[];
  moneyIncidents: MoneyIncident[];
  deliveryEvents: DeliveryEvent[];
  cashClosings: CashClosing[];
  auditLog: AuditLogEntry[];
  excelImports: ExcelImportRecord[];
  warehouseShipments: WarehouseShipment[];
  settings: AppSettings;
  acknowledgedAlertIds: string[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'huevocontrol-ledger.json');

function createSeedDatabase(): LedgerDatabase {
  const nowIso = new Date().toISOString();

  const ownerId = 'usr-owner-01';
  const vendorTonyId = 'usr-vend-tony';
  const vendorHunterId = 'usr-vend-hunter';
  const vendorVictorId = 'usr-vend-victor';
  const vendorIvanId = 'usr-vend-ivan';

  const ownerHash = hashPassword('Granja2026!');
  const vendorHash = hashPassword('Vendedor2026!');

  const users: UserAccount[] = [
    {
      id: ownerId,
      googleEmail: 'dueno@directodegranja.mx',
      name: 'Don Juan',
      role: 'dueno',
      status: 'activa',
      folioSeries: null,
      createdAtUtc: nowIso,
      passwordHash: ownerHash,
    },
    {
      id: vendorTonyId,
      googleEmail: 'tony@directodegranja.mx',
      name: 'Tony (Encargado)',
      role: 'vendedor',
      status: 'activa',
      folioSeries: 'A',
      createdAtUtc: nowIso,
      passwordHash: vendorHash,
    },
    {
      id: vendorHunterId,
      googleEmail: 'hunter@directodegranja.mx',
      name: 'Hunter',
      role: 'vendedor',
      status: 'activa',
      folioSeries: 'B',
      createdAtUtc: nowIso,
      passwordHash: vendorHash,
    },
    {
      id: vendorVictorId,
      googleEmail: 'victor@directodegranja.mx',
      name: 'Victor',
      role: 'vendedor',
      status: 'activa',
      folioSeries: 'C',
      createdAtUtc: nowIso,
      passwordHash: vendorHash,
    },
    {
      id: vendorIvanId,
      googleEmail: 'ivan@directodegranja.mx',
      name: 'Ivan',
      role: 'vendedor',
      status: 'activa',
      folioSeries: 'D',
      createdAtUtc: nowIso,
      passwordHash: vendorHash,
    },
  ];

  const crewMembers: CrewMember[] = [
    { id: 'crew-tony', userId: vendorTonyId, name: 'Tony', roleTitle: 'encargado', active: true },
    { id: 'crew-hunter', userId: vendorHunterId, name: 'Hunter', roleTitle: 'chofer', active: true },
    { id: 'crew-victor', userId: vendorVictorId, name: 'Victor', roleTitle: 'chofer', active: true },
    { id: 'crew-ivan', userId: vendorIvanId, name: 'Ivan', roleTitle: 'chofer', active: true },
    { id: 'crew-cristian', userId: vendorTonyId, name: 'Cristian', roleTitle: 'chalan', active: true },
    { id: 'crew-mateo', userId: vendorTonyId, name: 'Mateo', roleTitle: 'chalan', active: true },
    { id: 'crew-orlando', userId: vendorTonyId, name: 'Orlando', roleTitle: 'chalan', active: true },
    { id: 'crew-papas', userId: vendorHunterId, name: 'Papas', roleTitle: 'chalan', active: true },
    { id: 'crew-sapito', userId: vendorHunterId, name: 'Sapito', roleTitle: 'chalan', active: true },
    { id: 'crew-brody', userId: vendorHunterId, name: 'Brody', roleTitle: 'chalan', active: true },
  ];

  return {
    users,
    devices: [],
    crewMembers,
    workdays: [],
    customers: [],
    dailyPrices: [],
    deliveries: [],
    deliveryBoxes: [],
    dailyLosses: [],
    payments: [],
    moneyIncidents: [],
    deliveryEvents: [],
    cashClosings: [],
    auditLog: [],
    excelImports: [],
    warehouseShipments: [],
    settings: {
      businessName: 'DIRECTO DE GRANJA',
      slogan: 'Te faltan huevos a nosotros nos sobran',
      businessPhone: '000 000 0000',
      businessAddress: 'Dirección del negocio',
      reduceAnimations: false,
      themeMode: 'dark',
      nextFolioBySeries: { A: 1, B: 1, C: 1, D: 1, BD: 1 },
    },
    acknowledgedAlertIds: [],
  };
}

class LedgerStore {
  private db: LedgerDatabase;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.db = JSON.parse(raw) as LedgerDatabase;
        this.db.warehouseShipments ??= [];
        this.db.settings.nextFolioBySeries ??= { A: 1, B: 1, C: 1, D: 1, BD: 1 };
        this.db.settings.nextFolioBySeries.BD ??= 1;
      } catch {
        this.db = createSeedDatabase();
        this.persist();
      }
    } else {
      this.db = createSeedDatabase();
      this.persist();
    }
  }

  public persist(): void {
    const tmp = `${DATA_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  }

  public getState(): Omit<LedgerDatabase, 'users'> & {
    users: Omit<UserAccount, 'passwordHash'>[];
    alerts: ProactiveAlert[];
  } {
    return {
      ...this.db,
      users: this.db.users.map(({ passwordHash: _ph, ...safe }) => safe),
      alerts: this.computeProactiveAlerts(),
    };
  }

  public getRawUsers(): UserAccount[] {
    return this.db.users;
  }

  public getDb(): LedgerDatabase {
    return this.db;
  }

  public computeProactiveAlerts(): ProactiveAlert[] {
    const alerts: ProactiveAlert[] = [];
    const todayYmd = getMexicoCityYmd();
    const acked = new Set(this.db.acknowledgedAlertIds);

    const hasTodayPrice = this.db.dailyPrices.some((p) => p.dateYmd === todayYmd);
    if (!hasTodayPrice) {
      const id = `alert-missing-price-${todayYmd}`;
      alerts.push({
        id,
        severity: 'critical',
        category: 'precio',
        title: 'Precio del día pendiente',
        message: `Aún no se publica el precio por kilo para hoy (${todayYmd}). Los vendedores no podrán registrar entregas automáticas.`,
        createdAtUtc: new Date().toISOString(),
        acknowledged: acked.has(id),
      });
    }

    const unreviewedVendorPrices = this.db.dailyPrices.filter(
      (p) => p.origin === 'vendedor' && !p.reviewedByOwner
    );
    for (const p of unreviewedVendorPrices) {
      const id = `alert-vendor-price-${p.id}`;
      alerts.push({
        id,
        severity: 'info',
        category: 'precio',
        title: 'Precio capturado sin conexión por vendedor',
        message: `${p.publishedByName} capturó ${formatCurrencyFromCentavos(p.priceCentavosPerKg, true)}/kg para ${p.dateYmd}. Requiere revisión del dueño.`,
        createdAtUtc: p.createdAtUtc,
        acknowledged: acked.has(id),
      });
    }

    const pendingTransfers = this.db.payments.filter(
      (p) => p.method === 'transferencia' && p.status === 'por_verificar'
    );
    if (pendingTransfers.length > 0) {
      const sum = pendingTransfers.reduce((a, b) => a + b.amountCentavos, 0);
      const id = `alert-transfers-${pendingTransfers.map((t) => t.id).join('-')}`;
      alerts.push({
        id,
        severity: 'info',
        category: 'transferencia',
        title: `${pendingTransfers.length} transferencia(s) por verificar`,
        message: `Total pendiente de confirmar depósito bancario: ${formatCurrencyFromCentavos(sum)}.`,
        createdAtUtc: pendingTransfers[0].createdAtUtc,
        acknowledged: acked.has(id),
      });
    }

    const openIncidents = this.db.moneyIncidents.filter((i) => i.status === 'reportado');
    for (const inc of openIncidents) {
      const id = `alert-incident-${inc.id}`;
      alerts.push({
        id,
        severity: 'critical',
        category: 'incidente',
        title: `Incidente de dinero reportado (${inc.type.toUpperCase()})`,
        message: `${inc.vendorName} reportó ${formatCurrencyFromCentavos(inc.amountCentavos)}: ${inc.description}`,
        createdAtUtc: inc.occurredAtUtc,
        acknowledged: acked.has(id),
      });
    }

    const pendingVendors = this.db.users.filter((u) => u.status === 'pendiente');
    if (pendingVendors.length > 0) {
      const id = `alert-pending-vendors-${pendingVendors.map((v) => v.id).join('-')}`;
      alerts.push({
        id,
        severity: 'info',
        category: 'sistema',
        title: `${pendingVendors.length} vendedor(es) esperando aprobación`,
        message: `${pendingVendors.map((v) => v.name).join(', ')} solicita acceso y serie de folios.`,
        createdAtUtc: pendingVendors[0].createdAtUtc,
        acknowledged: acked.has(id),
      });
    }

    const laggingDevices = this.db.devices.filter((d) => {
      if (!d.active || !d.lastSyncUtc) return false;
      const mins = (Date.now() - new Date(d.lastSyncUtc).getTime()) / 60000;
      return mins > 90 || d.pendingSyncCount > 0;
    });
    for (const dev of laggingDevices) {
      const id = `alert-sync-${dev.id}-${dev.pendingSyncCount}`;
      alerts.push({
        id,
        severity: 'info',
        category: 'sync',
        title: `Sincronización pendiente en ${dev.deviceName}`,
        message: `Registros en cola móvil: ${dev.pendingSyncCount}. Última conexión registrada.`,
        createdAtUtc: dev.lastSyncUtc ?? new Date().toISOString(),
        acknowledged: acked.has(id),
      });
    }

    // Detect possible duplicate customers
    const activeCustomers = this.db.customers.filter((c) => !c.mergedIntoCustomerId);
    const seenNames = new Map<string, Customer>();
    for (const c of activeCustomers) {
      const key = `${normalizeCustomerName(c.businessName)}|${normalizePhone(c.phone)}`;
      if (seenNames.has(key)) {
        const id = `alert-dup-cust-${c.id}`;
        alerts.push({
          id,
          severity: 'info',
          category: 'sistema',
          title: 'Posible cliente duplicado sin conexión',
          message: `"${c.businessName}" coincide con otro registro. Puede unirlos desde Clientes sumando sus saldos.`,
          createdAtUtc: c.createdAtUtc,
          acknowledged: acked.has(id),
        });
      } else {
        seenNames.set(key, c);
      }
    }

    // Detect low or depleted brand inventory in bodega
    const inventory = calculateBrandInventory(
      this.db.warehouseShipments,
      this.db.deliveries,
      this.db.deliveryBoxes
    );
    for (const stock of inventory) {
      if (stock.boxesArrived > 0 && stock.boxesAvailable <= 10) {
        const id = `alert-stock-${stock.brandKey}-${stock.boxesAvailable}`;
        alerts.push({
          id,
          severity: stock.boxesAvailable <= 0 ? 'critical' : 'info',
          category: 'inventario',
          title:
            stock.boxesAvailable <= 0
              ? `Inventario agotado: ${stock.brandName}`
              : `Inventario bajo: ${stock.brandName} (${stock.boxesAvailable} cajas)`,
          message:
            stock.boxesAvailable <= 0
              ? `Se agotaron las cajas de ${stock.brandName} en bodega. Registre la llegada del próximo tortón o tráiler.`
              : `Quedan ${stock.boxesAvailable} cajas (${formatKgFromGrams(stock.gramsAvailable)}) de ${stock.brandName} en bodega.`,
          createdAtUtc: stock.lastArrivalUtc ?? new Date().toISOString(),
          acknowledged: acked.has(id),
        });
      }
    }

    return alerts;
  }

  public acknowledgeAlert(alertId: string): void {
    if (!this.db.acknowledgedAlertIds.includes(alertId)) {
      this.db.acknowledgedAlertIds.push(alertId);
      this.persist();
    }
  }

  public addAudit(
    entityType: string,
    entityId: string,
    action: string,
    detail: string,
    actorUserId: string,
    actorName: string
  ): void {
    this.db.auditLog.unshift({
      id: `aud-${crypto.randomUUID()}`,
      entityType,
      entityId,
      action,
      detail,
      actorUserId,
      actorName,
      occurredAtUtc: new Date().toISOString(),
    });
  }

  public nextSeriesLetter(): string {
    const used = new Set(
      this.db.users.map((u) => u.folioSeries).filter((s): s is string => Boolean(s))
    );
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of alphabet) {
      if (!used.has(ch)) return ch;
    }
    return `S${used.size + 1}`;
  }

  public reserveNextFolio(series: string): { folioNumber: number; folioFormatted: string } {
    const current = this.db.settings.nextFolioBySeries[series] ?? 1;
    this.db.settings.nextFolioBySeries[series] = current + 1;
    return {
      folioNumber: current,
      folioFormatted: formatFolio(series, current),
    };
  }
}

export const store = new LedgerStore();
