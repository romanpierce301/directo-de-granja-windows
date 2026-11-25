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
  const formatExactKg = (grams: number) => `${(grams / 1000).toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
  const officialPayments = payments.filter((p) => p.reviewStatus !== 'pendiente' && p.reviewStatus !== 'rechazada');
  const pendingReviewCentavos = payments.filter((p) => p.reviewStatus === 'pendiente').reduce((acc, p) => acc + p.amountCentavos, 0);
  const deliveryPaidCentavos = officialPayments.reduce((acc, p) => acc + p.amountCentavos, 0);
  const deliveryBalanceCentavos = Math.max(0, delivery.totalToChargeCentavos - deliveryPaidCentavos);

  const methodSummary =
    officialPayments.length === 0
      ? (delivery.paymentTerm === 'CONTADO' ? 'contado pendiente' : 'crédito')
      : Array.from(new Set(officialPayments.map((p) => p.method))).join('/');

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
          <div className="mt-2 border-2 border-[#F43F5E] text-[#F43F5E] text-center py-0.5 text-[11px] font-bold tracking-wider">
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

        {/* Android delivery lines can contain several brands and prices. */}
        <div className="space-y-1 text-[10px] leading-tight tabular-nums">
          {delivery.items?.length ? delivery.items.map((item, index) => (
            <div key={item.id} className="border-b border-dotted border-black/40 pb-0.5">
              <div className="font-bold">{item.brand || `Producto ${index + 1}`} · {item.modality.replaceAll('_', ' ').toLowerCase()}</div>
              <div className="flex justify-between"><span>Neto {formatExactKg(item.netGrams)}</span><span>{formatCurrencyFromCentavos(item.priceCentavosPerKg, true)}/kg</span></div>
              <div className="flex justify-between"><span>{(item.boxesMilli / 1000).toLocaleString('es-MX')} cajas</span><span>{formatCurrencyFromCentavos(Math.round(item.subtotalMilliCentavos / 1000), true)}</span></div>
            </div>
          )) : sortedBoxes.map((box) => (
            <div key={box.id} className="flex items-center justify-between">
              <span>Caja {box.position}</span><span>{formatKgFromGrams(box.weightGrams)}</span>
            </div>
          ))}
          {delivery.sugar && (
            <div className="flex justify-between font-semibold"><span>Azúcar · {delivery.sugar.sacksMilli / 1000} sacos</span><span>{formatCurrencyFromCentavos(delivery.sugar.subtotalCentavos, true)}</span></div>
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
            <span>{delivery.items?.length ? 'Total de producto' : 'Precio por kilo'}</span>
            <span>{delivery.items?.length ? formatCurrencyFromCentavos(delivery.totalToChargeCentavos, true) : formatCurrencyFromCentavos(delivery.priceCentavosPerKg, true)}</span>
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
            <span>{delivery.paymentTerm === 'CREDITO' ? 'Crédito' : delivery.paymentTerm === 'CONTADO' ? 'Contado' : 'Pagado'} ({methodSummary})</span>
            <span>{formatCurrencyFromCentavos(deliveryPaidCentavos)}</span>
          </div>
          <div className="flex items-center justify-between font-bold">
            <span>Saldo de esta entrega</span>
            <span>{formatCurrencyFromCentavos(deliveryBalanceCentavos)}</span>
          </div>
          {pendingReviewCentavos > 0 && (
            <div className="flex items-center justify-between"><span>Cobro pendiente de revisión</span><span>{formatCurrencyFromCentavos(pendingReviewCentavos)}</span></div>
          )}
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
