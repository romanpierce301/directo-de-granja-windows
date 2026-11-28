import { Printer, Copy } from 'lucide-react';
import {
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  type AppSettings,
  type Delivery,
  type DeliveryBox,
  type Payment,
} from '../../shared/domain.ts';
import { TactileButton } from './TactileButton.tsx';

interface Ticket48mmProps {
  delivery: Delivery;
  boxes: DeliveryBox[];
  payments: Payment[];
  customerTotalBalanceCentavos: number;
  settings: AppSettings;
  isCopy?: boolean;
  onPrint?: () => void;
  onReprint?: () => void;
}

export function Ticket48mm({
  delivery,
  boxes,
  payments,
  customerTotalBalanceCentavos,
  settings,
  isCopy = false,
  onPrint,
  onReprint,
}: Ticket48mmProps) {
  const sortedBoxes = [...boxes].sort((a, b) => a.position - b.position);
  const deliveryPaidCentavos = payments.reduce((acc, p) => acc + p.amountCentavos, 0);
  const deliveryBalanceCentavos = Math.max(0, delivery.totalToChargeCentavos - deliveryPaidCentavos);

  const methodSummary =
    payments.length === 0
      ? 'crédito'
      : Array.from(new Set(payments.map((p) => p.method))).join('/');

  const formattedDate = formatMexicoCityDate(delivery.createdAtUtc);
  const formattedTime = formatMexicoCityTime(delivery.createdAtUtc);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Exact 48mm thermal receipt visual matching ticket_48mm_plantilla_bbacea04.png */}
      <div
        id="ticket-48mm-printable"
        className="w-[248px] bg-white text-black px-2.5 py-3 shadow-lg border border-slate-300 select-text"
        style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
      >
        {/* Header: Mascot left + DIRECTO DE GRANJA right */}
        <div className="flex items-center justify-between gap-1.5">
          <img
            src="/assets/logo_directo_de_granja.png"
            alt="Directo de Granja"
            className="w-[116px] h-auto object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div
            className="flex-1 text-center leading-tight text-black"
            style={{ fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }}
          >
            <div className="text-[19px] font-extrabold tracking-tight">DIRECTO</div>
            <div className="text-[11px] font-extrabold -my-0.5">DE</div>
            <div className="text-[19px] font-extrabold tracking-tight">GRANJA</div>
          </div>
        </div>

        {/* Slogan */}
        <div className="mt-2 text-center text-[11px] font-bold leading-snug">
          <div>{settings.slogan.split(' a ')[0]}</div>
          <div>
            {settings.slogan.includes(' a ')
              ? `a ${settings.slogan.split(' a ')[1]}`
              : ''}
          </div>
        </div>

        {/* Business Phone & Address */}
        <div className="mt-2.5 text-center text-[10.5px] leading-snug">
          <div>Tel. {settings.businessPhone}</div>
          <div>{settings.businessAddress}</div>
        </div>

        {/* Status stamps (CANCELADA in red, COPIA in gray — never yellow) */}
        {delivery.status === 'cancelada' && (
          <div className="mt-2 border-2 border-[#D64545] text-[#D64545] text-center py-0.5 text-[11px] font-bold tracking-wider">
            CANCELADA
          </div>
        )}
        {isCopy && delivery.status !== 'cancelada' && (
          <div className="mt-2 border border-[#6B7785] text-[#6B7785] text-center py-0.5 text-[10px] font-bold tracking-wider">
            COPIA
          </div>
        )}

        <div className="my-2 border-t border-dashed border-black" />

        {/* Folio + Date & Time */}
        <div className="text-[11px] leading-tight">
          <div className="flex items-center justify-between">
            <span>Folio: {delivery.folioFormatted}</span>
            <span className="tabular-nums">{formattedDate}</span>
          </div>
          <div className="text-right tabular-nums">{formattedTime}</div>
        </div>

        {/* Customer */}
        <div className="mt-1.5 text-[11px] leading-snug">
          <div>Cliente:</div>
          <div className="break-words">{delivery.customerName}</div>
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Boxes / Products */}
        <div className="space-y-0.5 text-[11px] leading-tight tabular-nums">
          {Array.isArray(delivery.saleItems) &&
          delivery.saleItems.some((item) => item.productType === 'azucar') ? (
            (() => {
              let eggBoxIndex = 0;
              return delivery.saleItems.flatMap((item) => {
                if (item.productType === 'azucar') {
                  return [
                    <div key={item.id} className="flex items-center justify-between">
                      <span>Azúcar ({item.quantity} bto)</span>
                      <span>{formatKgFromGrams(item.totalGrams)}</span>
                    </div>,
                  ];
                }
                return (item.boxesGrams ?? []).map((wg, i) => {
                  eggBoxIndex += 1;
                  return (
                    <div key={`${item.id}-${i}`} className="flex items-center justify-between">
                      <span>Caja {eggBoxIndex}</span>
                      <span>{formatKgFromGrams(wg)}</span>
                    </div>
                  );
                });
              });
            })()
          ) : (
            sortedBoxes.map((box) => (
              <div key={box.id} className="flex items-center justify-between">
                <span>Caja {box.position}</span>
                <span>{formatKgFromGrams(box.weightGrams)}</span>
              </div>
            ))
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Totals */}
        <div className="space-y-0.5 text-[11px] leading-tight tabular-nums">
          <div className="flex items-center justify-between font-bold">
            <span>Kilos totales</span>
            <span>{formatKgFromGrams(delivery.totalGrams)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Precio por kilo</span>
            <span>{formatCurrencyFromCentavos(delivery.priceCentavosPerKg, true)}</span>
          </div>
          <div className="flex items-center justify-between font-bold text-[11.5px]">
            <span>TOTAL A COBRAR</span>
            <span>{formatCurrencyFromCentavos(delivery.totalToChargeCentavos)}</span>
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Payments & Balance */}
        <div className="space-y-0.5 text-[10.5px] leading-tight tabular-nums">
          <div className="flex items-center justify-between">
            <span>Pagado ({methodSummary})</span>
            <span>{formatCurrencyFromCentavos(deliveryPaidCentavos)}</span>
          </div>
          <div className="flex items-center justify-between font-bold">
            <span>Saldo de esta entrega</span>
            <span>{formatCurrencyFromCentavos(deliveryBalanceCentavos)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Saldo total del cliente</span>
            <span>{formatCurrencyFromCentavos(customerTotalBalanceCentavos)}</span>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-3 text-center text-[10.5px] leading-snug">
          <div>Comprobante de entrega,</div>
          <div>no es factura</div>
        </div>

        {/* Signature */}
        <div className="mt-3 mb-8 text-[10.5px]">Firma de recibido:</div>

        <div className="border-t border-black pt-2.5 pb-1 text-center text-[11px] font-bold">
          ¡Gracias por su compra!
        </div>
      </div>

      {/* Print Actions */}
      {(onPrint || onReprint) && (
        <div className="flex items-center gap-2 print:hidden">
          {onPrint && (
            <TactileButton
              variant="primary"
              size="sm"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={onPrint}
            >
              Imprimir 48mm
            </TactileButton>
          )}
          {onReprint && (
            <TactileButton
              variant="neutral"
              size="sm"
              icon={<Copy className="w-3.5 h-3.5" />}
              onClick={onReprint}
            >
              Reimprimir (COPIA)
            </TactileButton>
          )}
        </div>
      )}
    </div>
  );
}

interface AbonoTicket48mmProps {
  payment: Payment;
  customerName: string;
  previousBalanceCentavos: number;
  remainingBalanceCentavos: number;
  appliedToLabel: string;
  settings: AppSettings;
  isCopy?: boolean;
  onPrint?: () => void;
  onReprint?: () => void;
}

export function AbonoTicket48mm({
  payment,
  customerName,
  previousBalanceCentavos,
  remainingBalanceCentavos,
  appliedToLabel,
  settings,
  isCopy = false,
  onPrint,
  onReprint,
}: AbonoTicket48mmProps) {
  const formattedDate = formatMexicoCityDate(payment.createdAtUtc);
  const formattedTime = formatMexicoCityTime(payment.createdAtUtc);
  const displayFolio =
    payment.receiptFolio && payment.receiptFolio.trim()
      ? payment.receiptFolio.trim()
      : `AB-${payment.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
  const methodLabel = payment.method === 'transferencia' ? 'Transferencia' : 'Efectivo';
  const statusLabel = payment.status === 'por_verificar' ? 'Por verificar' : 'Verificado';

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        id="ticket-48mm-printable"
        className="w-[248px] bg-white text-black px-2.5 py-3 shadow-lg border border-slate-300 select-text"
        style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
      >
        {/* Header: Mascot left + DIRECTO DE GRANJA right (identical to Ticket48mm) */}
        <div className="flex items-center justify-between gap-1.5">
          <img
            src="/assets/logo_directo_de_granja.png"
            alt="Directo de Granja"
            className="w-[116px] h-auto object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div
            className="flex-1 text-center leading-tight text-black"
            style={{ fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }}
          >
            <div className="text-[19px] font-extrabold tracking-tight">DIRECTO</div>
            <div className="text-[11px] font-extrabold -my-0.5">DE</div>
            <div className="text-[19px] font-extrabold tracking-tight">GRANJA</div>
          </div>
        </div>

        {/* Slogan */}
        <div className="mt-2 text-center text-[11px] font-bold leading-snug">
          <div>{settings.slogan.split(' a ')[0]}</div>
          <div>
            {settings.slogan.includes(' a ')
              ? `a ${settings.slogan.split(' a ')[1]}`
              : ''}
          </div>
        </div>

        {/* Business Phone & Address */}
        <div className="mt-2.5 text-center text-[10.5px] leading-snug">
          <div>Tel. {settings.businessPhone}</div>
          <div>{settings.businessAddress}</div>
        </div>

        {isCopy && (
          <div className="mt-2 border border-[#6B7785] text-[#6B7785] text-center py-0.5 text-[10px] font-bold tracking-wider">
            COPIA
          </div>
        )}

        <div className="my-2 border-t border-dashed border-black" />

        <div className="text-center text-[11px] font-bold tracking-wide mb-1.5">
          COMPROBANTE DE ABONO
        </div>

        {/* Folio + Date & Time */}
        <div className="text-[11px] leading-tight">
          <div className="flex items-center justify-between">
            <span>Folio: {displayFolio}</span>
            <span className="tabular-nums">{formattedDate}</span>
          </div>
          <div className="text-right tabular-nums">{formattedTime}</div>
        </div>

        {/* Customer */}
        <div className="mt-1.5 text-[11px] leading-snug">
          <div>Cliente:</div>
          <div className="break-words">{customerName}</div>
        </div>
        <div className="mt-1 text-[10.5px] leading-snug flex items-center justify-between gap-2">
          <span>Aplica a:</span>
          <span className="text-right break-words">{appliedToLabel}</span>
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Payment Details */}
        <div className="space-y-0.5 text-[11px] leading-tight tabular-nums">
          <div className="flex items-center justify-between">
            <span>Saldo anterior</span>
            <span>{formatCurrencyFromCentavos(previousBalanceCentavos)}</span>
          </div>
          <div className="flex items-center justify-between font-bold text-[11.5px]">
            <span>ABONO RECIBIDO</span>
            <span>{formatCurrencyFromCentavos(payment.amountCentavos)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Forma de pago</span>
            <span>{methodLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Estado</span>
            <span>{statusLabel}</span>
          </div>
          {payment.note.trim() && (
            <div className="pt-1 text-[10px] leading-snug break-words">
              Nota: {payment.note.trim()}
            </div>
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Remaining Balance */}
        <div className="space-y-0.5 text-[11px] leading-tight tabular-nums">
          <div className="flex items-center justify-between font-bold text-[11.5px]">
            <span>SALDO RESTANTE</span>
            <span>{formatCurrencyFromCentavos(remainingBalanceCentavos)}</span>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-3 text-center text-[10.5px] leading-snug">
          <div>Comprobante de abono,</div>
          <div>no es factura</div>
        </div>

        {/* Signature */}
        <div className="mt-3 mb-8 text-[10.5px]">Firma de recibido:</div>

        <div className="border-t border-black pt-2.5 pb-1 text-center text-[11px] font-bold">
          ¡Gracias por su abono!
        </div>
      </div>

      {/* Print Actions */}
      {(onPrint || onReprint) && (
        <div className="flex items-center gap-2 print:hidden">
          {onPrint && (
            <TactileButton
              variant="primary"
              size="sm"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={onPrint}
            >
              Imprimir 48mm
            </TactileButton>
          )}
          {onReprint && (
            <TactileButton
              variant="neutral"
              size="sm"
              icon={<Copy className="w-3.5 h-3.5" />}
              onClick={onReprint}
            >
              Reimprimir (COPIA)
            </TactileButton>
          )}
        </div>
      )}
    </div>
  );
}
