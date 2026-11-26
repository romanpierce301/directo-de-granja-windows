import type { LedgerDatabase } from '../../server/store.ts';
import type { HalfBoxWeighType, ProactiveAlert, UserAccount } from '../../shared/domain.ts';

export interface DashboardState extends Omit<LedgerDatabase, 'users'> {
  users: Omit<UserAccount, 'passwordHash'>[];
  alerts: ProactiveAlert[];
}

export class ApiClient {
  private token: string | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  constructor() {
    // Only stores short-lived JWT in sessionStorage (never stores passwords)
    this.token = sessionStorage.getItem('hc_jwt');
  }

  public getToken(): string | null {
    return this.token;
  }

  public clearSession(): void {
    this.token = null;
    sessionStorage.removeItem('hc_jwt');
    this.disconnectWs();
  }

  public async getAuthStatus(): Promise<{ bootstrapped: boolean; hasActiveOwner: boolean; userCount: number }> {
    const res = await fetch('/api/auth/status');
    return res.json();
  }

  public async bootstrapOwner(payload: {
    name: string;
    email: string;
    password: string;
  }): Promise<Omit<UserAccount, 'passwordHash'>> {
    const res = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al registrar el dueño inicial.');
    }
    this.token = data.token;
    sessionStorage.setItem('hc_jwt', data.token);
    return data.user;
  }

  public async login(email: string, password: string): Promise<Omit<UserAccount, 'passwordHash'>> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al iniciar sesión.');
    }
    this.token = data.token;
    sessionStorage.setItem('hc_jwt', data.token);
    return data.user;
  }

  public async getMe(): Promise<Omit<UserAccount, 'passwordHash'>> {
    return this.request('/api/auth/me');
  }

  public async getDashboardState(): Promise<DashboardState> {
    return this.request('/api/dashboard/state');
  }

  public async approveVendor(vendorId: string, folioSeries?: string) {
    return this.request(`/api/vendors/${vendorId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ folioSeries }),
    });
  }

  public async blockVendor(vendorId: string) {
    return this.request(`/api/vendors/${vendorId}/block`, { method: 'POST' });
  }

  public async authorizeDevice(deviceId: string) {
    return this.request(`/api/devices/${deviceId}/authorize`, { method: 'POST' });
  }

  public async createUser(payload: {
    name: string;
    email: string;
    password: string;
    role: 'dueno' | 'vendedor';
  }) {
    return this.request('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async publishPrice(pricePesosPerKg: number, dateYmd?: string) {
    return this.request('/api/prices', {
      method: 'POST',
      body: JSON.stringify({ pricePesosPerKg, dateYmd }),
    });
  }

  public async reviewVendorPrice(priceId: string) {
    return this.request(`/api/prices/${priceId}/review`, { method: 'POST' });
  }

  public async cancelDelivery(deliveryId: string, reason: string) {
    return this.request(`/api/deliveries/${deliveryId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async logReprint(deliveryId: string) {
    return this.request(`/api/deliveries/${deliveryId}/reprint`, { method: 'POST' });
  }

  public async verifyTransfer(paymentId: string) {
    return this.request(`/api/payments/${paymentId}/verify`, { method: 'POST' });
  }

  public async createCustomer(payload: {
    businessName: string;
    contactName: string;
    phone: string;
    address: string;
    notes: string;
    specialPricePesosPerKg?: number | null;
    creditTermDays?: number | null;
  }) {
    return this.request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateCustomer(
    customerId: string,
    payload: {
      businessName?: string;
      contactName?: string;
      phone?: string;
      address?: string;
      notes?: string;
      specialPricePesosPerKg?: number | null;
      creditTermDays?: number | null;
    }
  ) {
    return this.request(`/api/customers/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async recordCustomerPayment(
    customerId: string,
    payload: { amountPesos: number; method: 'efectivo' | 'transferencia'; note: string }
  ) {
    return this.request(`/api/customers/${customerId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async mergeCustomers(primaryId: string, duplicateId: string) {
    return this.request('/api/customers/merge', {
      method: 'POST',
      body: JSON.stringify({ primaryId, duplicateId }),
    });
  }

  public async reviewIncident(incidentId: string, ownerNote: string) {
    return this.request(`/api/incidents/${incidentId}/review`, {
      method: 'POST',
      body: JSON.stringify({ ownerNote }),
    });
  }

  public async createClosing(payload: {
    vendorId: string;
    dateYmd: string;
    actualCashPesos: number;
  }) {
    return this.request('/api/closings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async importExcelRows(payload: {
    fileName: string;
    importType: 'clientes' | 'precios';
    rows: Record<string, unknown>[];
  }) {
    return this.request('/api/excel/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateSettings(payload: {
    businessPhone?: string;
    businessAddress?: string;
    profilePictureUrl?: string;
    reduceAnimations?: boolean;
    themeMode?: 'dark' | 'light';
  }) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async ackAlert(alertId: string) {
    return this.request(`/api/monitoring/alerts/${alertId}/ack`, { method: 'POST' });
  }

  public async createWarehouseShipment(payload: {
    vehicleType: 'torton' | 'trailer';
    referenceCode: string;
    originFarm: string;
    driverName: string;
    notes: string;
    lines: {
      productType: 'huevo' | 'azucar';
      brandName: string;
      boxesCount: number;
      weightPerBultoKg?: number;
      totalKg: number;
    }[];
  }) {
    return this.request('/api/bodega/shipments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async createBodegaSale(payload: {
    customerId?: string;
    newCustomerName?: string;
    newCustomerPhone?: string;
    items: (
      | {
          productType: 'huevo';
          brandName: string;
          fullBoxes: number;
          halfBoxes: number;
          weighMode: 'total' | 'cajas';
          halfBoxWeighType?: HalfBoxWeighType;
          totalKg?: number;
          fullBoxesGrossGrams?: number[];
          halfBoxesGrossGrams?: number[];
          pricePesosPerKg: number;
          isSpecialPrice: boolean;
        }
      | {
          productType: 'azucar';
          brandName: string;
          bultosCount: number;
          weightPerBultoKg: number;
          pricePerBultoPesos: number;
          isSpecialPrice?: boolean;
        }
    )[];
    paidPesos?: number;
    paymentMethod?: 'efectivo' | 'transferencia';
  }) {
    return this.request('/api/bodega/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async simulateAndroidSync(payload: {
    simulateFromVendorId: string;
    customerId: string;
    boxesGrams: number[];
    priceCentavosPerKg: number;
    paymentAmountCentavos?: number;
    paymentMethod?: 'efectivo' | 'transferencia';
  }) {
    const delId = `del-sync-${crypto.randomUUID()}`;
    const deliveries = [
      {
        id: delId,
        customerId: payload.customerId,
        boxesGrams: payload.boxesGrams,
        priceCentavosPerKg: payload.priceCentavosPerKg,
        createdAtUtc: new Date().toISOString(),
      },
    ];
    const payments =
      payload.paymentAmountCentavos && payload.paymentAmountCentavos > 0
        ? [
            {
              id: `pay-sync-${crypto.randomUUID()}`,
              customerId: payload.customerId,
              deliveryId: delId,
              amountCentavos: payload.paymentAmountCentavos,
              method: payload.paymentMethod ?? 'efectivo',
              note: 'Cobro sincronizado desde Android',
            },
          ]
        : [];
    return this.request('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'android-sync-live',
        simulateFromVendorId: payload.simulateFromVendorId,
        deliveries,
        payments,
      }),
    });
  }

  public async getHealth() {
    const res = await fetch('/api/health');
    return res.json();
  }

  public connectWs(onEvent: (event: { type: string; payload?: unknown; timestampUtc: string }) => void) {
    this.disconnectWs();
    if (!this.token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        onEvent(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (this.token) {
        this.reconnectTimer = window.setTimeout(() => {
          this.connectWs(onEvent);
        }, 3000);
      }
    };
  }

  public disconnectWs() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
      }
      throw new Error(data.error || `Error HTTP ${res.status}`);
    }
    return data as T;
  }
}

export const apiClient = new ApiClient();
