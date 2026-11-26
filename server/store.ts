import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  calculateBrandInventory,
  formatCurrencyFromCentavos,
  formatFolio,
  formatKgFromGrams,
  getMexicoCityYmd,
  normalizeCustomerName,
  normalizePhone,
  type AppSettings,
  type AuditLogEntry,
  type AuthorizedDevice,
  type BodegaSaleItem,
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
  type WarehouseShipmentLine,
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
const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');
const DEFAULT_SQLITE_FILE = path.join(DATA_DIR, 'directodegranja.db');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'huevocontrol-ledger.json');

function resolveDefaultDbPath(): string {
  const envPath = process.env.SQLITE_DB_PATH?.trim();
  if (!envPath) return DEFAULT_SQLITE_FILE;
  if (envPath === ':memory:') return ':memory:';
  const resolved = path.resolve(process.cwd(), envPath);
  if (!resolved.startsWith(process.cwd() + path.sep)) {
    return DEFAULT_SQLITE_FILE;
  }
  return resolved;
}

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
      profilePictureUrl: '',
      reduceAnimations: false,
      themeMode: 'dark',
      nextFolioBySeries: { A: 1, B: 1, C: 1, D: 1, BD: 1, E: 1 },
    },
    acknowledgedAlertIds: [],
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class LedgerStore {
  private sqlite: Database.Database;
  private dbPath: string;
  private db: LedgerDatabase;

  constructor(dbPath = resolveDefaultDbPath()) {
    this.dbPath = dbPath;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    if (dbPath !== ':memory:') {
      const parentDir = path.dirname(dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');

    this.initSchema();

    const userCountRow = this.sqlite
      .prepare('SELECT COUNT(*) AS cnt FROM users')
      .get() as { cnt: number };

    if (userCountRow.cnt === 0) {
      if (dbPath === DEFAULT_SQLITE_FILE && fs.existsSync(LEGACY_JSON_FILE)) {
        try {
          const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf8');
          const parsed = JSON.parse(raw) as LedgerDatabase;
          parsed.warehouseShipments ??= [];
          parsed.settings.nextFolioBySeries ??= { A: 1, B: 1, C: 1, D: 1, BD: 1, E: 1 };
          parsed.settings.nextFolioBySeries.BD ??= 1;
          parsed.settings.nextFolioBySeries.E ??= 1;
          this.db = parsed;
          this.persist();
          fs.renameSync(LEGACY_JSON_FILE, `${LEGACY_JSON_FILE}.migrated`);
        } catch {
          this.db = createSeedDatabase();
          this.persist();
        }
      } else {
        this.db = createSeedDatabase();
        this.persist();
      }
    } else {
      this.db = this.loadFromSqlite();
    }
  }

  private initSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        google_email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        folio_series TEXT,
        created_at_utc TEXT NOT NULL,
        password_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        active INTEGER NOT NULL,
        last_sync_utc TEXT,
        pending_sync_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

      CREATE TABLE IF NOT EXISTS crew_members (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role_title TEXT NOT NULL,
        active INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workdays (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        date_ymd TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        helpers_names_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        business_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        notes TEXT NOT NULL,
        active INTEGER NOT NULL,
        created_by_user_id TEXT NOT NULL,
        merged_into_customer_id TEXT,
        created_at_utc TEXT NOT NULL,
        special_price_centavos_per_kg INTEGER,
        credit_term_days INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_customers_business_name ON customers(business_name);

      CREATE TABLE IF NOT EXISTS daily_prices (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        date_ymd TEXT NOT NULL,
        price_centavos_per_kg INTEGER NOT NULL,
        published_by_user_id TEXT NOT NULL,
        published_by_name TEXT NOT NULL,
        origin TEXT NOT NULL,
        reviewed_by_owner INTEGER NOT NULL,
        created_at_utc TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_daily_prices_date_ymd ON daily_prices(date_ymd);

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        vendor_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        workday_id TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        helpers_names_json TEXT NOT NULL,
        series TEXT NOT NULL,
        folio_number INTEGER NOT NULL,
        folio_formatted TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        price_centavos_per_kg INTEGER NOT NULL,
        is_special_price INTEGER NOT NULL,
        total_grams INTEGER NOT NULL,
        calculated_total_exact_milli_centavos INTEGER NOT NULL,
        total_to_charge_centavos INTEGER NOT NULL,
        status TEXT NOT NULL,
        cancellation_reason TEXT,
        synced_at_utc TEXT,
        source_type TEXT,
        brand_key TEXT,
        brand_name TEXT,
        boxes_count REAL,
        sale_items_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_deliveries_customer_id ON deliveries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_vendor_id ON deliveries(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_brand_key ON deliveries(brand_key);

      CREATE TABLE IF NOT EXISTS delivery_boxes (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        delivery_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        weight_grams INTEGER NOT NULL,
        FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_boxes_delivery_id ON delivery_boxes(delivery_id);

      CREATE TABLE IF NOT EXISTS daily_losses (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        vendor_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        workday_id TEXT NOT NULL,
        date_ymd TEXT NOT NULL,
        lost_grams INTEGER NOT NULL,
        note TEXT NOT NULL,
        created_at_utc TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        customer_id TEXT NOT NULL,
        delivery_id TEXT,
        vendor_id TEXT NOT NULL,
        amount_centavos INTEGER NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        note TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_payments_delivery_id ON payments(delivery_id);

      CREATE TABLE IF NOT EXISTS money_incidents (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        vendor_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_centavos INTEGER NOT NULL,
        occurred_at_utc TEXT NOT NULL,
        related_delivery_id TEXT,
        related_customer_id TEXT,
        description TEXT NOT NULL,
        people_present_json TEXT NOT NULL,
        status TEXT NOT NULL,
        owner_note TEXT
      );

      CREATE TABLE IF NOT EXISTS delivery_events (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        delivery_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        detail TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        device_id TEXT NOT NULL,
        occurred_at_utc TEXT NOT NULL,
        arrived_at_server_utc TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_id ON delivery_events(delivery_id);

      CREATE TABLE IF NOT EXISTS cash_closings (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        vendor_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        date_ymd TEXT NOT NULL,
        sold_centavos INTEGER NOT NULL,
        cash_collected_centavos INTEGER NOT NULL,
        transfer_verified_centavos INTEGER NOT NULL,
        transfer_pending_centavos INTEGER NOT NULL,
        daily_loss_grams INTEGER NOT NULL,
        incidents_centavos INTEGER NOT NULL,
        expected_cash_to_deliver_centavos INTEGER NOT NULL,
        actual_cash_handed_in_centavos INTEGER NOT NULL,
        unexplained_difference_centavos INTEGER NOT NULL,
        closed_at_utc TEXT NOT NULL,
        closed_by_user_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        occurred_at_utc TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS excel_imports (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        import_type TEXT NOT NULL,
        imported_at_utc TEXT NOT NULL,
        rows_read INTEGER NOT NULL,
        rows_created INTEGER NOT NULL,
        rows_rejected INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS warehouse_shipments (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        series TEXT NOT NULL,
        folio_number INTEGER NOT NULL,
        folio_formatted TEXT NOT NULL UNIQUE,
        vehicle_type TEXT NOT NULL,
        reference_code TEXT NOT NULL,
        origin_farm TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        arrived_at_utc TEXT NOT NULL,
        registered_by_user_id TEXT NOT NULL,
        registered_by_name TEXT NOT NULL,
        notes TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS warehouse_shipment_lines (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        shipment_id TEXT NOT NULL,
        product_type TEXT NOT NULL DEFAULT 'huevo',
        brand_key TEXT NOT NULL,
        brand_name TEXT NOT NULL,
        boxes_count REAL NOT NULL,
        total_grams INTEGER NOT NULL,
        FOREIGN KEY (shipment_id) REFERENCES warehouse_shipments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_shipment_lines_brand_key ON warehouse_shipment_lines(brand_key);

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        business_name TEXT NOT NULL,
        slogan TEXT NOT NULL,
        business_phone TEXT NOT NULL,
        business_address TEXT NOT NULL,
        profile_picture_url TEXT NOT NULL,
        reduce_animations INTEGER NOT NULL,
        theme_mode TEXT NOT NULL,
        next_folio_by_series_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS acknowledged_alerts (
        alert_id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL
      );
    `);

    this.ensureColumnExists('deliveries', 'sale_items_json', 'TEXT');
    this.ensureColumnExists(
      'warehouse_shipment_lines',
      'product_type',
      "TEXT NOT NULL DEFAULT 'huevo'"
    );
    this.ensureColumnExists('customers', 'special_price_centavos_per_kg', 'INTEGER');
    this.ensureColumnExists('customers', 'credit_term_days', 'INTEGER');
  }

  private ensureColumnExists(table: string, column: string, definition: string): void {
    const allowedTables = new Set(['deliveries', 'warehouse_shipment_lines', 'customers']);
    if (!allowedTables.has(table)) return;
    const cols = this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private loadFromSqlite(): LedgerDatabase {
    const users = (this.sqlite.prepare('SELECT * FROM users ORDER BY sort_order ASC').all() as any[]).map(
      (r) => ({
        id: r.id,
        googleEmail: r.google_email,
        name: r.name,
        role: r.role,
        status: r.status,
        folioSeries: r.folio_series ?? null,
        createdAtUtc: r.created_at_utc,
        passwordHash: r.password_hash ?? undefined,
      })
    ) as UserAccount[];

    const devices = (this.sqlite.prepare('SELECT * FROM devices ORDER BY sort_order ASC').all() as any[]).map(
      (r) => ({
        id: r.id,
        userId: r.user_id,
        deviceName: r.device_name,
        active: Boolean(r.active),
        lastSyncUtc: r.last_sync_utc ?? null,
        pendingSyncCount: r.pending_sync_count,
      })
    ) as AuthorizedDevice[];

    const crewMembers = (
      this.sqlite.prepare('SELECT * FROM crew_members ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      roleTitle: r.role_title,
      active: Boolean(r.active),
    })) as CrewMember[];

    const workdays = (this.sqlite.prepare('SELECT * FROM workdays ORDER BY sort_order ASC').all() as any[]).map(
      (r) => ({
        id: r.id,
        userId: r.user_id,
        dateYmd: r.date_ymd,
        driverName: r.driver_name,
        helpersNames: safeJsonParse<string[]>(r.helpers_names_json, []),
      })
    ) as Workday[];

    const customers = (this.sqlite.prepare('SELECT * FROM customers ORDER BY sort_order ASC').all() as any[]).map(
      (r) => ({
        id: r.id,
        businessName: r.business_name,
        contactName: r.contact_name,
        phone: r.phone,
        address: r.address,
        notes: r.notes,
        active: Boolean(r.active),
        createdByUserId: r.created_by_user_id,
        mergedIntoCustomerId: r.merged_into_customer_id ?? null,
        createdAtUtc: r.created_at_utc,
        specialPriceCentavosPerKg: r.special_price_centavos_per_kg ?? null,
        creditTermDays: r.credit_term_days ?? null,
      })
    ) as Customer[];

    const dailyPrices = (
      this.sqlite.prepare('SELECT * FROM daily_prices ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      dateYmd: r.date_ymd,
      priceCentavosPerKg: r.price_centavos_per_kg,
      publishedByUserId: r.published_by_user_id,
      publishedByName: r.published_by_name,
      origin: r.origin,
      reviewedByOwner: Boolean(r.reviewed_by_owner),
      createdAtUtc: r.created_at_utc,
    })) as DailyPrice[];

    const deliveries = (
      this.sqlite.prepare('SELECT * FROM deliveries ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      workdayId: r.workday_id,
      driverName: r.driver_name,
      helpersNames: safeJsonParse<string[]>(r.helpers_names_json, []),
      series: r.series,
      folioNumber: r.folio_number,
      folioFormatted: r.folio_formatted,
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAtUtc: r.created_at_utc,
      priceCentavosPerKg: r.price_centavos_per_kg,
      isSpecialPrice: Boolean(r.is_special_price),
      totalGrams: r.total_grams,
      calculatedTotalExactMilliCentavos: r.calculated_total_exact_milli_centavos,
      totalToChargeCentavos: r.total_to_charge_centavos,
      status: r.status,
      cancellationReason: r.cancellation_reason ?? null,
      syncedAtUtc: r.synced_at_utc ?? null,
      ...(r.source_type ? { sourceType: r.source_type } : {}),
      ...(r.brand_key !== null ? { brandKey: r.brand_key } : {}),
      ...(r.brand_name !== null ? { brandName: r.brand_name } : {}),
      ...(r.boxes_count !== null ? { boxesCount: r.boxes_count } : {}),
      ...(r.sale_items_json
        ? { saleItems: safeJsonParse<BodegaSaleItem[]>(r.sale_items_json, []) }
        : {}),
    })) as Delivery[];

    const deliveryBoxes = (
      this.sqlite.prepare('SELECT * FROM delivery_boxes ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      deliveryId: r.delivery_id,
      position: r.position,
      weightGrams: r.weight_grams,
    })) as DeliveryBox[];

    const dailyLosses = (
      this.sqlite.prepare('SELECT * FROM daily_losses ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      workdayId: r.workday_id,
      dateYmd: r.date_ymd,
      lostGrams: r.lost_grams,
      note: r.note,
      createdAtUtc: r.created_at_utc,
    })) as DailyLoss[];

    const payments = (this.sqlite.prepare('SELECT * FROM payments ORDER BY sort_order ASC').all() as any[]).map(
      (r) => ({
        id: r.id,
        customerId: r.customer_id,
        deliveryId: r.delivery_id ?? null,
        vendorId: r.vendor_id,
        amountCentavos: r.amount_centavos,
        method: r.method,
        status: r.status,
        createdAtUtc: r.created_at_utc,
        note: r.note,
      })
    ) as Payment[];

    const moneyIncidents = (
      this.sqlite.prepare('SELECT * FROM money_incidents ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      type: r.type,
      amountCentavos: r.amount_centavos,
      occurredAtUtc: r.occurred_at_utc,
      relatedDeliveryId: r.related_delivery_id ?? null,
      relatedCustomerId: r.related_customer_id ?? null,
      description: r.description,
      peoplePresent: safeJsonParse<string[]>(r.people_present_json, []),
      status: r.status,
      ownerNote: r.owner_note ?? null,
    })) as MoneyIncident[];

    const deliveryEvents = (
      this.sqlite.prepare('SELECT * FROM delivery_events ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      deliveryId: r.delivery_id,
      eventType: r.event_type,
      detail: r.detail,
      actorUserId: r.actor_user_id,
      actorName: r.actor_name,
      deviceId: r.device_id,
      occurredAtUtc: r.occurred_at_utc,
      arrivedAtServerUtc: r.arrived_at_server_utc ?? null,
    })) as DeliveryEvent[];

    const cashClosings = (
      this.sqlite.prepare('SELECT * FROM cash_closings ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      dateYmd: r.date_ymd,
      soldCentavos: r.sold_centavos,
      cashCollectedCentavos: r.cash_collected_centavos,
      transferVerifiedCentavos: r.transfer_verified_centavos,
      transferPendingCentavos: r.transfer_pending_centavos,
      dailyLossGrams: r.daily_loss_grams,
      incidentsCentavos: r.incidents_centavos,
      expectedCashToDeliverCentavos: r.expected_cash_to_deliver_centavos,
      actualCashHandedInCentavos: r.actual_cash_handed_in_centavos,
      unexplainedDifferenceCentavos: r.unexplained_difference_centavos,
      closedAtUtc: r.closed_at_utc,
      closedByUserId: r.closed_by_user_id,
    })) as CashClosing[];

    const auditLog = (
      this.sqlite.prepare('SELECT * FROM audit_log ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      detail: r.detail,
      actorUserId: r.actor_user_id,
      actorName: r.actor_name,
      occurredAtUtc: r.occurred_at_utc,
    })) as AuditLogEntry[];

    const excelImports = (
      this.sqlite.prepare('SELECT * FROM excel_imports ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      fileName: r.file_name,
      importType: r.import_type,
      importedAtUtc: r.imported_at_utc,
      rowsRead: r.rows_read,
      rowsCreated: r.rows_created,
      rowsRejected: r.rows_rejected,
    })) as ExcelImportRecord[];

    const allShipmentLines = (
      this.sqlite
        .prepare('SELECT * FROM warehouse_shipment_lines ORDER BY sort_order ASC')
        .all() as any[]
    ).map((r) => ({
      id: r.id,
      shipmentId: r.shipment_id,
      productType: r.product_type === 'azucar' ? 'azucar' : 'huevo',
      brandKey: r.brand_key,
      brandName: r.brand_name,
      boxesCount: r.boxes_count,
      totalGrams: r.total_grams,
    })) as WarehouseShipmentLine[];

    const linesByShipment = new Map<string, WarehouseShipmentLine[]>();
    for (const line of allShipmentLines) {
      const list = linesByShipment.get(line.shipmentId) ?? [];
      list.push(line);
      linesByShipment.set(line.shipmentId, list);
    }

    const warehouseShipments = (
      this.sqlite.prepare('SELECT * FROM warehouse_shipments ORDER BY sort_order ASC').all() as any[]
    ).map((r) => ({
      id: r.id,
      series: r.series,
      folioNumber: r.folio_number,
      folioFormatted: r.folio_formatted,
      vehicleType: r.vehicle_type,
      referenceCode: r.reference_code,
      originFarm: r.origin_farm,
      driverName: r.driver_name,
      arrivedAtUtc: r.arrived_at_utc,
      registeredByUserId: r.registered_by_user_id,
      registeredByName: r.registered_by_name,
      notes: r.notes,
      lines: linesByShipment.get(r.id) ?? [],
    })) as WarehouseShipment[];

    const settingsRow = this.sqlite
      .prepare('SELECT * FROM app_settings WHERE id = 1')
      .get() as any;

    const settings: AppSettings = settingsRow
      ? {
          businessName: settingsRow.business_name,
          slogan: settingsRow.slogan,
          businessPhone: settingsRow.business_phone,
          businessAddress: settingsRow.business_address,
          profilePictureUrl: settingsRow.profile_picture_url ?? '',
          reduceAnimations: Boolean(settingsRow.reduce_animations),
          themeMode: settingsRow.theme_mode === 'light' ? 'light' : 'dark',
          nextFolioBySeries: safeJsonParse<Record<string, number>>(
            settingsRow.next_folio_by_series_json,
            { A: 1, B: 1, C: 1, D: 1, BD: 1, E: 1 }
          ),
        }
      : createSeedDatabase().settings;

    settings.nextFolioBySeries.BD ??= 1;
    settings.nextFolioBySeries.E ??= 1;

    const acknowledgedAlertIds = (
      this.sqlite
        .prepare('SELECT alert_id FROM acknowledged_alerts ORDER BY sort_order ASC')
        .all() as { alert_id: string }[]
    ).map((r) => r.alert_id);

    return {
      users,
      devices,
      crewMembers,
      workdays,
      customers,
      dailyPrices,
      deliveries,
      deliveryBoxes,
      dailyLosses,
      payments,
      moneyIncidents,
      deliveryEvents,
      cashClosings,
      auditLog,
      excelImports,
      warehouseShipments,
      settings,
      acknowledgedAlertIds,
    };
  }

  public persist(): void {
    const data = this.db;
    const runAtomic = this.sqlite.transaction(() => {
      // Delete children before parent tables
      this.sqlite.prepare('DELETE FROM delivery_boxes').run();
      this.sqlite.prepare('DELETE FROM warehouse_shipment_lines').run();
      this.sqlite.prepare('DELETE FROM deliveries').run();
      this.sqlite.prepare('DELETE FROM warehouse_shipments').run();
      this.sqlite.prepare('DELETE FROM users').run();
      this.sqlite.prepare('DELETE FROM devices').run();
      this.sqlite.prepare('DELETE FROM crew_members').run();
      this.sqlite.prepare('DELETE FROM workdays').run();
      this.sqlite.prepare('DELETE FROM customers').run();
      this.sqlite.prepare('DELETE FROM daily_prices').run();
      this.sqlite.prepare('DELETE FROM daily_losses').run();
      this.sqlite.prepare('DELETE FROM payments').run();
      this.sqlite.prepare('DELETE FROM money_incidents').run();
      this.sqlite.prepare('DELETE FROM delivery_events').run();
      this.sqlite.prepare('DELETE FROM cash_closings').run();
      this.sqlite.prepare('DELETE FROM audit_log').run();
      this.sqlite.prepare('DELETE FROM excel_imports').run();
      this.sqlite.prepare('DELETE FROM acknowledged_alerts').run();

      const insUser = this.sqlite.prepare(`
        INSERT INTO users (id, sort_order, google_email, name, role, status, folio_series, created_at_utc, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.users.forEach((u, i) =>
        insUser.run(
          u.id,
          i,
          u.googleEmail,
          u.name,
          u.role,
          u.status,
          u.folioSeries ?? null,
          u.createdAtUtc,
          u.passwordHash ?? null
        )
      );

      const insDevice = this.sqlite.prepare(`
        INSERT INTO devices (id, sort_order, user_id, device_name, active, last_sync_utc, pending_sync_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      data.devices.forEach((d, i) =>
        insDevice.run(d.id, i, d.userId, d.deviceName, d.active ? 1 : 0, d.lastSyncUtc ?? null, d.pendingSyncCount)
      );

      const insCrew = this.sqlite.prepare(`
        INSERT INTO crew_members (id, sort_order, user_id, name, role_title, active)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      data.crewMembers.forEach((c, i) =>
        insCrew.run(c.id, i, c.userId, c.name, c.roleTitle, c.active ? 1 : 0)
      );

      const insWorkday = this.sqlite.prepare(`
        INSERT INTO workdays (id, sort_order, user_id, date_ymd, driver_name, helpers_names_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      data.workdays.forEach((w, i) =>
        insWorkday.run(w.id, i, w.userId, w.dateYmd, w.driverName, JSON.stringify(w.helpersNames ?? []))
      );

      const insCust = this.sqlite.prepare(`
        INSERT INTO customers (id, sort_order, business_name, contact_name, phone, address, notes, active, created_by_user_id, merged_into_customer_id, created_at_utc, special_price_centavos_per_kg, credit_term_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.customers.forEach((c, i) =>
        insCust.run(
          c.id,
          i,
          c.businessName,
          c.contactName,
          c.phone,
          c.address,
          c.notes,
          c.active ? 1 : 0,
          c.createdByUserId,
          c.mergedIntoCustomerId ?? null,
          c.createdAtUtc,
          c.specialPriceCentavosPerKg ?? null,
          c.creditTermDays ?? null
        )
      );

      const insPrice = this.sqlite.prepare(`
        INSERT INTO daily_prices (id, sort_order, date_ymd, price_centavos_per_kg, published_by_user_id, published_by_name, origin, reviewed_by_owner, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.dailyPrices.forEach((p, i) =>
        insPrice.run(
          p.id,
          i,
          p.dateYmd,
          p.priceCentavosPerKg,
          p.publishedByUserId,
          p.publishedByName,
          p.origin,
          p.reviewedByOwner ? 1 : 0,
          p.createdAtUtc
        )
      );

      const insDelivery = this.sqlite.prepare(`
        INSERT INTO deliveries (
          id, sort_order, vendor_id, vendor_name, workday_id, driver_name, helpers_names_json,
          series, folio_number, folio_formatted, customer_id, customer_name, created_at_utc,
          price_centavos_per_kg, is_special_price, total_grams, calculated_total_exact_milli_centavos,
          total_to_charge_centavos, status, cancellation_reason, synced_at_utc,
          source_type, brand_key, brand_name, boxes_count, sale_items_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.deliveries.forEach((d, i) =>
        insDelivery.run(
          d.id,
          i,
          d.vendorId,
          d.vendorName,
          d.workdayId,
          d.driverName,
          JSON.stringify(d.helpersNames ?? []),
          d.series,
          d.folioNumber,
          d.folioFormatted,
          d.customerId,
          d.customerName,
          d.createdAtUtc,
          d.priceCentavosPerKg,
          d.isSpecialPrice ? 1 : 0,
          d.totalGrams,
          d.calculatedTotalExactMilliCentavos,
          d.totalToChargeCentavos,
          d.status,
          d.cancellationReason ?? null,
          d.syncedAtUtc ?? null,
          d.sourceType ?? null,
          d.brandKey ?? null,
          d.brandName ?? null,
          d.boxesCount ?? null,
          Array.isArray(d.saleItems) && d.saleItems.length > 0 ? JSON.stringify(d.saleItems) : null
        )
      );

      const insBox = this.sqlite.prepare(`
        INSERT INTO delivery_boxes (id, sort_order, delivery_id, position, weight_grams)
        VALUES (?, ?, ?, ?, ?)
      `);
      data.deliveryBoxes.forEach((b, i) =>
        insBox.run(b.id, i, b.deliveryId, b.position, b.weightGrams)
      );

      const insLoss = this.sqlite.prepare(`
        INSERT INTO daily_losses (id, sort_order, vendor_id, vendor_name, workday_id, date_ymd, lost_grams, note, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.dailyLosses.forEach((l, i) =>
        insLoss.run(l.id, i, l.vendorId, l.vendorName, l.workdayId, l.dateYmd, l.lostGrams, l.note, l.createdAtUtc)
      );

      const insPay = this.sqlite.prepare(`
        INSERT INTO payments (id, sort_order, customer_id, delivery_id, vendor_id, amount_centavos, method, status, created_at_utc, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.payments.forEach((p, i) =>
        insPay.run(
          p.id,
          i,
          p.customerId,
          p.deliveryId ?? null,
          p.vendorId,
          p.amountCentavos,
          p.method,
          p.status,
          p.createdAtUtc,
          p.note
        )
      );

      const insInc = this.sqlite.prepare(`
        INSERT INTO money_incidents (id, sort_order, vendor_id, vendor_name, type, amount_centavos, occurred_at_utc, related_delivery_id, related_customer_id, description, people_present_json, status, owner_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.moneyIncidents.forEach((inc, i) =>
        insInc.run(
          inc.id,
          i,
          inc.vendorId,
          inc.vendorName,
          inc.type,
          inc.amountCentavos,
          inc.occurredAtUtc,
          inc.relatedDeliveryId ?? null,
          inc.relatedCustomerId ?? null,
          inc.description,
          JSON.stringify(inc.peoplePresent ?? []),
          inc.status,
          inc.ownerNote ?? null
        )
      );

      const insEvt = this.sqlite.prepare(`
        INSERT INTO delivery_events (id, sort_order, delivery_id, event_type, detail, actor_user_id, actor_name, device_id, occurred_at_utc, arrived_at_server_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.deliveryEvents.forEach((e, i) =>
        insEvt.run(
          e.id,
          i,
          e.deliveryId,
          e.eventType,
          e.detail,
          e.actorUserId,
          e.actorName,
          e.deviceId,
          e.occurredAtUtc,
          e.arrivedAtServerUtc ?? null
        )
      );

      const insClosing = this.sqlite.prepare(`
        INSERT INTO cash_closings (
          id, sort_order, vendor_id, vendor_name, date_ymd, sold_centavos, cash_collected_centavos,
          transfer_verified_centavos, transfer_pending_centavos, daily_loss_grams, incidents_centavos,
          expected_cash_to_deliver_centavos, actual_cash_handed_in_centavos, unexplained_difference_centavos,
          closed_at_utc, closed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.cashClosings.forEach((c, i) =>
        insClosing.run(
          c.id,
          i,
          c.vendorId,
          c.vendorName,
          c.dateYmd,
          c.soldCentavos,
          c.cashCollectedCentavos,
          c.transferVerifiedCentavos,
          c.transferPendingCentavos,
          c.dailyLossGrams,
          c.incidentsCentavos,
          c.expectedCashToDeliverCentavos,
          c.actualCashHandedInCentavos,
          c.unexplainedDifferenceCentavos,
          c.closedAtUtc,
          c.closedByUserId
        )
      );

      const insAudit = this.sqlite.prepare(`
        INSERT INTO audit_log (id, sort_order, entity_type, entity_id, action, detail, actor_user_id, actor_name, occurred_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.auditLog.forEach((a, i) =>
        insAudit.run(a.id, i, a.entityType, a.entityId, a.action, a.detail, a.actorUserId, a.actorName, a.occurredAtUtc)
      );

      const insImport = this.sqlite.prepare(`
        INSERT INTO excel_imports (id, sort_order, user_id, user_name, file_name, import_type, imported_at_utc, rows_read, rows_created, rows_rejected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.excelImports.forEach((imp, i) =>
        insImport.run(
          imp.id,
          i,
          imp.userId,
          imp.userName,
          imp.fileName,
          imp.importType,
          imp.importedAtUtc,
          imp.rowsRead,
          imp.rowsCreated,
          imp.rowsRejected
        )
      );

      const insShipment = this.sqlite.prepare(`
        INSERT INTO warehouse_shipments (id, sort_order, series, folio_number, folio_formatted, vehicle_type, reference_code, origin_farm, driver_name, arrived_at_utc, registered_by_user_id, registered_by_name, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insLine = this.sqlite.prepare(`
        INSERT INTO warehouse_shipment_lines (id, sort_order, shipment_id, product_type, brand_key, brand_name, boxes_count, total_grams)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let lineOrder = 0;
      data.warehouseShipments.forEach((s, i) => {
        insShipment.run(
          s.id,
          i,
          s.series,
          s.folioNumber,
          s.folioFormatted,
          s.vehicleType,
          s.referenceCode,
          s.originFarm,
          s.driverName,
          s.arrivedAtUtc,
          s.registeredByUserId,
          s.registeredByName,
          s.notes
        );
        (s.lines ?? []).forEach((l) => {
          insLine.run(
            l.id,
            lineOrder++,
            s.id,
            l.productType === 'azucar' ? 'azucar' : 'huevo',
            l.brandKey,
            l.brandName,
            l.boxesCount,
            l.totalGrams
          );
        });
      });

      this.sqlite
        .prepare(`
          INSERT INTO app_settings (id, business_name, slogan, business_phone, business_address, profile_picture_url, reduce_animations, theme_mode, next_folio_by_series_json)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            business_name = excluded.business_name,
            slogan = excluded.slogan,
            business_phone = excluded.business_phone,
            business_address = excluded.business_address,
            profile_picture_url = excluded.profile_picture_url,
            reduce_animations = excluded.reduce_animations,
            theme_mode = excluded.theme_mode,
            next_folio_by_series_json = excluded.next_folio_by_series_json
        `)
        .run(
          data.settings.businessName,
          data.settings.slogan,
          data.settings.businessPhone,
          data.settings.businessAddress,
          data.settings.profilePictureUrl ?? '',
          data.settings.reduceAnimations ? 1 : 0,
          data.settings.themeMode,
          JSON.stringify(data.settings.nextFolioBySeries ?? {})
        );

      const insAck = this.sqlite.prepare(`
        INSERT INTO acknowledged_alerts (alert_id, sort_order)
        VALUES (?, ?)
      `);
      data.acknowledgedAlertIds.forEach((aid, i) => insAck.run(aid, i));
    });

    runAtomic();
  }

  public reloadFromSqlite(): void {
    this.db = this.loadFromSqlite();
  }

  public pingSqlite(): boolean {
    const row = this.sqlite.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  }

  public getStorageInfo(): { engine: 'sqlite'; walMode: boolean; dbFileName: string } {
    const modeRow = this.sqlite.pragma('journal_mode', { simple: true }) as string;
    return {
      engine: 'sqlite',
      walMode: String(modeRow).toLowerCase() === 'wal',
      dbFileName: this.dbPath === ':memory:' ? ':memory:' : path.basename(this.dbPath),
    };
  }

  public close(): void {
    this.sqlite.close();
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

    const inventory = calculateBrandInventory(
      this.db.warehouseShipments,
      this.db.deliveries,
      this.db.deliveryBoxes
    );
    for (const stock of inventory) {
      if (stock.boxesArrived > 0 && stock.boxesAvailable <= 10) {
        const unitLabel = stock.productType === 'azucar' ? 'bultos' : 'cajas';
        const id = `alert-stock-${stock.brandKey}-${stock.boxesAvailable}`;
        alerts.push({
          id,
          severity: stock.boxesAvailable <= 0 ? 'critical' : 'info',
          category: 'inventario',
          title:
            stock.boxesAvailable <= 0
              ? `Inventario agotado: ${stock.brandName}`
              : `Inventario bajo: ${stock.brandName} (${stock.boxesAvailable} ${unitLabel})`,
          message:
            stock.boxesAvailable <= 0
              ? `Se agotaron las existencias (${unitLabel}) de ${stock.brandName} en bodega. Registre la llegada del próximo tortón o tráiler.`
              : `Quedan ${stock.boxesAvailable} ${unitLabel} (${formatKgFromGrams(stock.gramsAvailable)}) de ${stock.brandName} en bodega.`,
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

export function createLedgerStore(dbPath?: string): LedgerStore {
  return new LedgerStore(dbPath);
}

export const store = createLedgerStore();
