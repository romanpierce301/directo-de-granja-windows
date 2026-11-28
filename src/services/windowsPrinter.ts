import {
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  type AppSettings,
  type Delivery,
  type DeliveryBox,
  type Payment,
  type WindowsPrinterConfig,
} from '../../shared/domain.ts';

export interface DesktopPrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
}

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortLike {
  readable?: unknown;
  writable?: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => SerialPortInfoLike;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort: () => Promise<SerialPortLike>;
    getPorts: () => Promise<SerialPortLike[]>;
  };
}

declare global {
  interface Window {
    desktopPrinters?: {
      isElectron: boolean;
      listPrinters: () => Promise<DesktopPrinterInfo[]>;
      printSilent: (printerName: string) => Promise<{ ok: boolean; failureReason?: string }>;
    };
  }
}

const LINE_WIDTH = 32;
let linkedSerialPort: SerialPortLike | null = null;

export const DEFAULT_PRINTER_CONFIG: WindowsPrinterConfig = {
  mode: 'system',
  printerName: '',
  paperWidthMm: 48,
  baudRate: 9600,
};

export function isElectronDesktop(): boolean {
  return Boolean(typeof window !== 'undefined' && window.desktopPrinters?.isElectron);
}

export function isWebSerialSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean((navigator as NavigatorWithSerial).serial);
}

export async function listWindowsSystemPrinters(): Promise<DesktopPrinterInfo[]> {
  if (typeof window === 'undefined' || !window.desktopPrinters?.listPrinters) {
    return [];
  }
  return window.desktopPrinters.listPrinters();
}

export async function getAuthorizedSerialPortsCount(): Promise<number> {
  if (!isWebSerialSupported()) return 0;
  try {
    const ports = await (navigator as NavigatorWithSerial).serial!.getPorts();
    return ports.length;
  } catch {
    return 0;
  }
}

export async function requestAndLinkSerialPrinter(
  baudRate = 9600
): Promise<{
  printerName: string;
  vendorId?: number;
  productId?: number;
  baudRate: number;
}> {
  if (!isWebSerialSupported()) {
    throw new Error(
      'Este navegador no soporta Web Serial USB/COM. Usa la app de escritorio Windows (.exe) o Chrome/Edge actualizado.'
    );
  }
  const port = await (navigator as NavigatorWithSerial).serial!.requestPort();
  linkedSerialPort = port;
  const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
  const vidHex =
    typeof info.usbVendorId === 'number'
      ? info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')
      : undefined;
  const pidHex =
    typeof info.usbProductId === 'number'
      ? info.usbProductId.toString(16).toUpperCase().padStart(4, '0')
      : undefined;
  const printerName =
    vidHex && pidHex ? `Puerto Térmico USB/COM (${vidHex}:${pidHex})` : 'Puerto Térmico Serial COM';
  return {
    printerName,
    vendorId: info.usbVendorId,
    productId: info.usbProductId,
    baudRate,
  };
}

async function resolveSerialPort(config?: WindowsPrinterConfig): Promise<SerialPortLike> {
  if (linkedSerialPort) return linkedSerialPort;
  if (!isWebSerialSupported()) {
    throw new Error('Puerto USB/COM directo no disponible en este entorno.');
  }
  const ports = await (navigator as NavigatorWithSerial).serial!.getPorts();
  if (ports.length === 0) {
    throw new Error(
      'No hay puerto USB/COM vinculado. Abre Sistema -> Impresora Térmica 48 mm y pulsa "Vincular puerto USB / COM".'
    );
  }
  if (typeof config?.vendorId === 'number' && typeof config?.productId === 'number') {
    const matched = ports.find((p) => {
      const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
      return info.usbVendorId === config.vendorId && info.usbProductId === config.productId;
    });
    if (matched) {
      linkedSerialPort = matched;
      return matched;
    }
  }
  linkedSerialPort = ports[0];
  return ports[0];
}

async function sendEscPosViaSerial(bytes: Uint8Array, config?: WindowsPrinterConfig): Promise<void> {
  const port = await resolveSerialPort(config);
  const baudRate = config?.baudRate && config.baudRate >= 1200 ? config.baudRate : 9600;
  let openedHere = false;
  if (!port.writable) {
    await port.open({ baudRate });
    openedHere = true;
  }
  try {
    if (!port.writable) {
      throw new Error('El puerto serial seleccionado no permite escritura.');
    }
    const writer = port.writable.getWriter();
    try {
      const chunkSize = 256;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        await writer.write(bytes.slice(i, i + chunkSize));
      }
    } finally {
      writer.releaseLock();
    }
  } finally {
    if (openedHere) {
      try {
        await port.close();
      } catch {
        // ignore serial close errors
      }
    }
  }
}

function normalizeAscii(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function encodeAscii(str: string): Uint8Array {
  const clean = normalizeAscii(str);
  const out = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    out[i] = clean.charCodeAt(i) & 0x7f;
  }
  return out;
}

function wrapAsciiLines(text: string, maxCols = LINE_WIDTH): string[] {
  const clean = normalizeAscii(text).trim();
  if (!clean) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of clean.split(/\s+/)) {
    if (!current) {
      current = word.slice(0, maxCols);
    } else if (current.length + 1 + word.length <= maxCols) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, maxCols);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pairLine(left: string, right: string): string {
  const l = normalizeAscii(left);
  const r = normalizeAscii(right);
  const spaces = Math.max(1, LINE_WIDTH - l.length - r.length);
  return `${l}${' '.repeat(spaces)}${r}\n`;
}

class EscPosBuilder {
  private parts: Uint8Array[] = [];

  raw(...bytes: number[]): this {
    this.parts.push(new Uint8Array(bytes));
    return this;
  }

  line(text = ''): this {
    this.parts.push(encodeAscii(`${text}\n`));
    return this;
  }

  rawText(text: string): this {
    this.parts.push(encodeAscii(text));
    return this;
  }

  init(): this {
    return this.raw(0x1b, 0x40);
  }

  alignLeft(): this {
    return this.raw(0x1b, 0x61, 0x00);
  }

  alignCenter(): this {
    return this.raw(0x1b, 0x61, 0x01);
  }

  alignRight(): this {
    return this.raw(0x1b, 0x61, 0x02);
  }

  bold(on: boolean): this {
    return this.raw(0x1b, 0x45, on ? 0x01 : 0x00);
  }

  feed(lines = 3): this {
    const arr = new Array<number>(lines).fill(0x0a);
    return this.raw(...arr);
  }

  cut(): this {
    return this.raw(0x1d, 0x56, 0x41, 0x00);
  }

  toBytes(): Uint8Array {
    const total = this.parts.reduce((acc, p) => acc + p.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const p of this.parts) {
      merged.set(p, offset);
      offset += p.length;
    }
    return merged;
  }
}

function appendHeader(b: EscPosBuilder, settings: AppSettings): void {
  b.alignCenter().bold(true);
  for (const ln of wrapAsciiLines(settings.businessName || 'DIRECTO DE GRANJA')) {
    b.line(ln);
  }
  b.bold(false);
  if (settings.slogan?.trim()) {
    const idx = settings.slogan.indexOf(' a ');
    b.bold(true);
    if (idx !== -1) {
      for (const ln of wrapAsciiLines(settings.slogan.slice(0, idx))) b.line(ln);
      for (const ln of wrapAsciiLines(settings.slogan.slice(idx + 1))) b.line(ln);
    } else {
      for (const ln of wrapAsciiLines(settings.slogan)) b.line(ln);
    }
    b.bold(false);
  }
  if (settings.businessPhone?.trim()) {
    b.line(`Tel. ${settings.businessPhone.trim()}`);
  }
  if (settings.businessAddress?.trim()) {
    for (const ln of wrapAsciiLines(settings.businessAddress)) b.line(ln);
  }
}

export function buildEscPosTestTicketBytes(settings: AppSettings): Uint8Array {
  const b = new EscPosBuilder();
  const dashed = '-'.repeat(LINE_WIDTH);
  b.init();
  appendHeader(b, settings);
  b.alignCenter()
    .line(dashed)
    .bold(true)
    .line('PRUEBA DE IMPRESION 48MM')
    .bold(false)
    .line('CONEXION VERIFICADA')
    .line(dashed)
    .feed(3)
    .cut();
  return b.toBytes();
}

export function buildEscPosDeliveryTicketBytes(params: {
  delivery: Delivery;
  boxes: DeliveryBox[];
  payments: Payment[];
  customerTotalBalanceCentavos: number;
  settings: AppSettings;
  isCopy?: boolean;
}): Uint8Array {
  const { delivery, boxes, payments, customerTotalBalanceCentavos, settings, isCopy = false } =
    params;
  const b = new EscPosBuilder();
  const dashed = '-'.repeat(LINE_WIDTH);
  const sortedBoxes = [...boxes].sort((a, z) => a.position - z.position);
  const deliveryPaidCentavos = payments.reduce((acc, p) => acc + p.amountCentavos, 0);
  const deliveryBalanceCentavos = Math.max(0, delivery.totalToChargeCentavos - deliveryPaidCentavos);
  const methodSummary =
    payments.length === 0
      ? 'credito'
      : Array.from(new Set(payments.map((p) => p.method))).join('/');
  const formattedDate = formatMexicoCityDate(delivery.createdAtUtc);
  const formattedTime = formatMexicoCityTime(delivery.createdAtUtc);

  b.init();
  appendHeader(b, settings);

  if (delivery.status === 'cancelada') {
    b.alignCenter().bold(true).line('[ CANCELADA ]').bold(false);
  } else if (isCopy) {
    b.alignCenter().bold(true).line('[ COPIA ]').bold(false);
  }

  b.alignLeft().line(dashed);
  b.rawText(pairLine(`Folio: ${delivery.folioFormatted}`, formattedDate));
  b.alignRight().line(formattedTime);
  b.alignLeft().line('Cliente:');
  for (const ln of wrapAsciiLines(delivery.customerName)) b.line(ln);
  b.line(dashed);

  if (
    Array.isArray(delivery.saleItems) &&
    delivery.saleItems.some((item) => item.productType === 'azucar')
  ) {
    let eggBoxIndex = 0;
    for (const item of delivery.saleItems) {
      if (item.productType === 'azucar') {
        b.rawText(pairLine(`Azucar (${item.quantity} bto)`, formatKgFromGrams(item.totalGrams)));
      } else {
        for (const wg of item.boxesGrams ?? []) {
          eggBoxIndex += 1;
          b.rawText(pairLine(`Caja ${eggBoxIndex}`, formatKgFromGrams(wg)));
        }
      }
    }
  } else {
    for (const box of sortedBoxes) {
      b.rawText(pairLine(`Caja ${box.position}`, formatKgFromGrams(box.weightGrams)));
    }
  }

  b.line(dashed);
  b.bold(true)
    .rawText(pairLine('Kilos totales', formatKgFromGrams(delivery.totalGrams)))
    .bold(false)
    .rawText(pairLine('Precio por kilo', formatCurrencyFromCentavos(delivery.priceCentavosPerKg, true)))
    .bold(true)
    .rawText(pairLine('TOTAL A COBRAR', formatCurrencyFromCentavos(delivery.totalToChargeCentavos)))
    .bold(false);

  b.line(dashed);
  b.rawText(pairLine(`Pagado (${methodSummary})`, formatCurrencyFromCentavos(deliveryPaidCentavos)))
    .bold(true)
    .rawText(pairLine('Saldo de esta entrega', formatCurrencyFromCentavos(deliveryBalanceCentavos)))
    .bold(false)
    .rawText(pairLine('Saldo total del cliente', formatCurrencyFromCentavos(customerTotalBalanceCentavos)));

  b.alignCenter().line('').line('Comprobante de entrega,').line('no es factura');
  b.alignLeft().line('').line('Firma de recibido:').raw(0x0a, 0x0a);
  b.line('='.repeat(LINE_WIDTH))
    .alignCenter()
    .bold(true)
    .line('!Gracias por su compra!')
    .bold(false)
    .feed(3)
    .cut();

  return b.toBytes();
}

export function buildEscPosAbonoTicketBytes(params: {
  payment: Payment;
  customerName: string;
  previousBalanceCentavos: number;
  remainingBalanceCentavos: number;
  appliedToLabel: string;
  settings: AppSettings;
  isCopy?: boolean;
}): Uint8Array {
  const {
    payment,
    customerName,
    previousBalanceCentavos,
    remainingBalanceCentavos,
    appliedToLabel,
    settings,
    isCopy = false,
  } = params;

  const b = new EscPosBuilder();
  const dashed = '-'.repeat(LINE_WIDTH);
  const formattedDate = formatMexicoCityDate(payment.createdAtUtc);
  const formattedTime = formatMexicoCityTime(payment.createdAtUtc);
  const displayFolio =
    payment.receiptFolio && payment.receiptFolio.trim()
      ? payment.receiptFolio.trim()
      : `AB-${payment.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
  const methodLabel = payment.method === 'transferencia' ? 'Transferencia' : 'Efectivo';
  const statusLabel = payment.status === 'por_verificar' ? 'Por verificar' : 'Verificado';

  b.init();
  appendHeader(b, settings);

  if (isCopy) {
    b.alignCenter().bold(true).line('[ COPIA ]').bold(false);
  }

  b.alignLeft().line(dashed);
  b.alignCenter().bold(true).line('COMPROBANTE DE ABONO').bold(false).alignLeft();
  b.rawText(pairLine(`Folio: ${displayFolio}`, formattedDate));
  b.alignRight().line(formattedTime);
  b.alignLeft().line('Cliente:');
  for (const ln of wrapAsciiLines(customerName)) b.line(ln);
  b.rawText(pairLine('Aplica a:', appliedToLabel));
  b.line(dashed);

  b.rawText(pairLine('Saldo anterior', formatCurrencyFromCentavos(previousBalanceCentavos)))
    .bold(true)
    .rawText(pairLine('ABONO RECIBIDO', formatCurrencyFromCentavos(payment.amountCentavos)))
    .bold(false)
    .rawText(pairLine('Forma de pago', methodLabel))
    .rawText(pairLine('Estado', statusLabel));
  if (payment.note.trim()) {
    for (const ln of wrapAsciiLines(`Nota: ${payment.note.trim()}`)) b.line(ln);
  }

  b.line(dashed);
  b.bold(true)
    .rawText(pairLine('SALDO RESTANTE', formatCurrencyFromCentavos(remainingBalanceCentavos)))
    .bold(false);

  b.alignCenter().line('').line('Comprobante de abono,').line('no es factura');
  b.alignLeft().line('').line('Firma de recibido:').raw(0x0a, 0x0a);
  b.line('='.repeat(LINE_WIDTH))
    .alignCenter()
    .bold(true)
    .line('!Gracias por su abono!')
    .bold(false)
    .feed(3)
    .cut();

  return b.toBytes();
}

export async function printTicket48mm(
  printerConfig: WindowsPrinterConfig | undefined,
  escPosBytes: Uint8Array
): Promise<string> {
  const cfg = printerConfig ?? DEFAULT_PRINTER_CONFIG;

  if (cfg.mode === 'usb_serial') {
    await sendEscPosViaSerial(escPosBytes, cfg);
    return `Ticket 48 mm enviado directo a ${cfg.printerName || 'impresora USB/COM'}.`;
  }

  if (cfg.mode === 'electron' && typeof window !== 'undefined' && window.desktopPrinters?.isElectron) {
    const res = await window.desktopPrinters.printSilent(cfg.printerName || '');
    if (!res.ok) {
      throw new Error(
        res.failureReason ||
          `Windows no pudo imprimir en "${cfg.printerName || 'impresora predeterminada'}".`
      );
    }
    return cfg.printerName
      ? `Ticket 48 mm impreso en "${cfg.printerName}".`
      : 'Ticket 48 mm impreso en la impresora predeterminada de Windows.';
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      window.print();
      resolve();
    }, 60);
  });
  return 'Ticket 48 mm enviado al diálogo de impresión de Windows.';
}
