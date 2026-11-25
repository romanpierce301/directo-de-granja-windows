import { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Package,
  Search,
  Users,
} from 'lucide-react';
import {
  calculateCustomerLedger,
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  type Delivery,
  type DeliveryBox,
  type Payment,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';
import { Ticket48mm } from '../components/Ticket48mm.tsx';

// Ejemplo visual oficial únicamente para vista previa de plantilla 48mm (no se guarda en base de datos)
const OFFICIAL_SAMPLE_DELIVERY: Delivery = {
  id: 'preview-official-ticket',
  vendorId: 'preview',
  vendorName: 'Ejemplo oficial',
  workdayId: 'preview',
  driverName: 'Chofer',
  helpersNames: [],
  series: 'A',
  folioNumber: 1,
  folioFormatted: 'A-0001',
  customerId: 'preview-cust',
  customerName: 'Abarrotes López',
  createdAtUtc: '2026-11-15T16:42:00.000Z', // 15/11/2026 10:42 America/Mexico_City
  priceCentavosPerKg: 3700,
  isSpecialPrice: false,
  totalGrams: 120600,
  calculatedTotalExactMilliCentavos: 446220000,
  totalToChargeCentavos: 446200,
  status: 'vigente',
  cancellationReason: null,
  syncedAtUtc: null,
};

const OFFICIAL_SAMPLE_BOXES: DeliveryBox[] = [
  { id: 'prev-b1', deliveryId: 'preview-official-ticket', position: 1, weightGrams: 25350 },
  { id: 'prev-b2', deliveryId: 'preview-official-ticket', position: 2, weightGrams: 24450 },
  { id: 'prev-b3', deliveryId: 'preview-official-ticket', position: 3, weightGrams: 25120 },
  { id: 'prev-b4', deliveryId: 'preview-official-ticket', position: 4, weightGrams: 22780 },
  { id: 'prev-b5', deliveryId: 'preview-official-ticket', position: 5, weightGrams: 22900 },
];

const OFFICIAL_SAMPLE_PAYMENTS: Payment[] = [
  {
    id: 'prev-pay-1',
    customerId: 'preview-cust',
    deliveryId: 'preview-official-ticket',
    vendorId: 'preview',
    amountCentavos: 80000,
    method: 'efectivo',
    status: 'verificado',
    createdAtUtc: '2026-11-15T16:42:00.000Z',
    note: 'Pago ejemplo plantilla oficial',
  },
];

interface EntregasViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function EntregasView({ state, onRefresh, onNotify }: EntregasViewProps) {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'vigente' | 'cancelada'>('all');
  const [selectedId, setSelectedId] = useState<string>(state.deliveries[0]?.id ?? '');
  const [showOfficialSample, setShowOfficialSample] = useState<boolean>(false);
  const [isCopyPreview, setIsCopyPreview] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelBox, setShowCancelBox] = useState(false);

  const vendors = state.users.filter((u) => u.role === 'vendedor');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.deliveries.filter((d) => {
      if (vendorFilter !== 'all' && d.vendorId !== vendorFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (
        q &&
        !d.folioFormatted.toLowerCase().includes(q) &&
        !d.customerName.toLowerCase().includes(q) &&
        !d.vendorName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.deliveries, search, vendorFilter, statusFilter]);

  const selectedDelivery =
    state.deliveries.find((d) => d.id === selectedId) ?? filtered[0] ?? null;

  const selectedBoxes = selectedDelivery
    ? state.deliveryBoxes.filter((b) => b.deliveryId === selectedDelivery.id)
    : [];
  const selectedPayments = selectedDelivery
    ? state.payments.filter((p) => p.deliveryId === selectedDelivery.id)
    : [];
  const selectedEvents = selectedDelivery
    ? state.deliveryEvents
        .filter((e) => e.deliveryId === selectedDelivery.id)
        .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc))
    : [];

  const customerLedger = selectedDelivery
    ? calculateCustomerLedger(selectedDelivery.customerId, state.deliveries, state.payments)
    : null;

  const handlePrint = () => {
    setIsCopyPreview(false);
    window.setTimeout(() => window.print(), 60);
  };

  const handleReprintCopy = async () => {
    if (!selectedDelivery) return;
    setIsCopyPreview(true);
    await apiClient.logReprint(selectedDelivery.id);
    await onRefresh();
    window.setTimeout(() => window.print(), 80);
  };

  const handleVerifyTransfer = async (paymentId: string) => {
    try {
      await apiClient.verifyTransfer(paymentId);
      await onRefresh();
      onNotify('Transferencia confirmada como Verificada.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handleCancelDelivery = async () => {
    if (!selectedDelivery) return;
    try {
      await apiClient.cancelDelivery(selectedDelivery.id, cancelReason);
      setCancelReason('');
      setShowCancelBox(false);
      await onRefresh();
      onNotify(`Folio ${selectedDelivery.folioFormatted} cancelado conservando su registro.`);
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
            Entregas, bitácora y ticket térmico 48mm
          </h2>
          <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            Registros inmutables: una entrega confirmada nunca se borra ni edita en silencio; la cancelación conserva el folio
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7A6B8F] dark:text-[#9E8FB2] absolute left-2.5 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar folio o cliente..."
              className="input-recessed rounded pl-8 pr-3 py-1.5 text-xs w-48"
            />
          </div>

          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="input-recessed rounded px-2.5 py-1.5 text-xs"
          >
            <option value="all">Todos los vendedores</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} (Serie {v.folioSeries})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {(['all', 'vigente', 'cancelada'] as const).map((st) => (
              <TactileButton
                key={st}
                variant={statusFilter === st ? 'primary' : 'neutral'}
                size="sm"
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all' ? 'Todas' : st === 'vigente' ? 'Vigentes' : 'Canceladas'}
              </TactileButton>
            ))}
          </div>
        </div>
      </div>

      {/* Split View: Deliveries Table + Integrated 48mm Thermal Ticket & Immutable Audit Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 glass-panel rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2.5 px-3 font-semibold">Folio</th>
                  <th className="py-2.5 px-3 font-semibold">Cliente</th>
                  <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Kilos</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFD7EE]/80 dark:divide-[#341961]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#6B5B82] dark:text-[#9E8FB2]">
                      No hay entregas que coincidan con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filtered.map((del) => {
                    const active = selectedDelivery?.id === del.id;
                    return (
                      <tr
                        key={del.id}
                        onClick={() => {
                          setSelectedId(del.id);
                          setShowOfficialSample(false);
                          setIsCopyPreview(false);
                          setShowCancelBox(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#8A2BE2]/15 dark:bg-[#8A2BE2]/25'
                            : 'hover:bg-[#8A2BE2]/8'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-[#7C3AED] dark:text-[#C084FC]">
                          {del.folioFormatted}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#130824] dark:text-[#F4EFFF]">
                            {del.customerName}
                          </div>
                          <div className="text-[11px] font-mono text-[#6B5B82] dark:text-[#9E8FB2]">
                            {formatMexicoCityDate(del.createdAtUtc)}{' '}
                            {formatMexicoCityTime(del.createdAtUtc)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[#4B3969] dark:text-[#D9CEEE]">
                          {del.vendorName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#3B2A54] dark:text-[#D9CEEE]">
                          {formatKgFromGrams(del.totalGrams)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#130824] dark:text-[#F4EFFF]">
                          {formatCurrencyFromCentavos(del.totalToChargeCentavos)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {del.status === 'vigente' ? (
                            <span className="text-[#059669] dark:text-[#10B981] font-semibold">
                              Vigente
                            </span>
                          ) : (
                            <span className="text-[#E11D48] dark:text-[#F43F5E] font-semibold">
                              Cancelada
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Detail metadata, payments & immutable audit trail for selected delivery */}
          {selectedDelivery && (
            <div className="border-t border-[#DFD7EE] dark:border-[#341961] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[#4B3969] dark:text-[#D9CEEE]">
                  <Users className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
                  <span>
                    Equipo: <strong>{selectedDelivery.vendorName}</strong> · Chofer:{' '}
                    <strong>{selectedDelivery.driverName}</strong> · Chalanes:{' '}
                    <strong>
                      {selectedDelivery.helpersNames.length > 0
                        ? selectedDelivery.helpersNames.join(', ')
                        : 'Ninguno'}
                    </strong>
                    {selectedDelivery.brandName && (
                      <>
                        {' · '}Marca: <strong>{selectedDelivery.brandName}</strong> ({selectedDelivery.boxesCount ?? selectedBoxes.length} cajas)
                      </>
                    )}
                  </span>
                </div>

                {selectedDelivery.status === 'vigente' && (
                  <TactileButton
                    variant="crimson"
                    size="sm"
                    icon={<Ban className="w-3.5 h-3.5" />}
                    onClick={() => setShowCancelBox((v) => !v)}
                  >
                    Cancelar con motivo
                  </TactileButton>
                )}
              </div>

              {Array.isArray(selectedDelivery.saleItems) && selectedDelivery.saleItems.length > 0 && (
                <div className="pos-subpanel rounded p-2.5 space-y-1 text-xs">
                  <div className="font-bold text-[#130824] dark:text-[#F4EFFF]">
                    Desglose de productos en esta venta de bodega
                  </div>
                  {selectedDelivery.saleItems.map((it) => (
                    <div
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#4B3969] dark:text-[#D9CEEE]"
                    >
                      <span>
                        <strong>{it.brandName}</strong> ({it.productType === 'azucar' ? 'Azúcar' : 'Huevo'}):{' '}
                        {it.quantity} {it.productType === 'azucar' ? 'bultos' : 'cjs'} ·{' '}
                        {formatKgFromGrams(it.totalGrams)}
                        {it.tareGrams > 0 ? ` (tara -${formatKgFromGrams(it.tareGrams)})` : ''}
                      </span>
                      <span>
                        {formatCurrencyFromCentavos(it.unitPriceCentavos, true)}
                        {it.productType === 'azucar' ? '/bulto' : '/kg'} ·{' '}
                        <strong className="text-[#130824] dark:text-[#F4EFFF]">
                          {formatCurrencyFromCentavos(it.subtotalCentavos)}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {showCancelBox && (
                <div className="rounded-md border border-[#F43F5E]/40 bg-[#F43F5E]/10 p-3 space-y-2">
                  <label className="block text-xs font-semibold text-[#E11D48] dark:text-[#FDA4AF]">
                    Motivo obligatorio de cancelación (se conservará el folio {selectedDelivery.folioFormatted}):
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Ej. Error de captura en peso de caja 3"
                      className="input-recessed flex-1 rounded px-3 py-1.5 text-xs"
                    />
                    <TactileButton variant="crimson" size="sm" onClick={handleCancelDelivery}>
                      Confirmar cancelación
                    </TactileButton>
                  </div>
                </div>
              )}

              {selectedDelivery.status === 'cancelada' && selectedDelivery.cancellationReason && (
                <div className="rounded border border-[#F43F5E]/40 bg-[#F43F5E]/10 px-3 py-2 text-xs text-[#E11D48] dark:text-[#FDA4AF]">
                  <strong>Motivo de cancelación:</strong> {selectedDelivery.cancellationReason}
                </div>
              )}

              {/* Payments attached to delivery with 3D verify button */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF] flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#059669] dark:text-[#10B981]" />
                  <span>Cobros registrados en esta entrega</span>
                </div>
                {selectedPayments.length === 0 ? (
                  <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
                    Entrega a crédito (sin cobro inicial).
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedPayments.map((p) => (
                      <div
                        key={p.id}
                        className="pos-subpanel flex flex-wrap items-center justify-between gap-2 rounded px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-[#130824] dark:text-[#F4EFFF]">
                            {formatCurrencyFromCentavos(p.amountCentavos)}
                          </span>
                          <span className="mx-1.5 text-[#9E8FB2]">·</span>
                          <span className="capitalize text-[#4B3969] dark:text-[#D9CEEE]">
                            {p.method}
                          </span>
                          <span className="mx-1.5 text-[#9E8FB2]">·</span>
                          <span className="text-[#6B5B82] dark:text-[#9E8FB2]">{p.note}</span>
                        </div>

                        {p.method === 'transferencia' ? (
                          <TactileButton
                            variant={p.status === 'verificado' ? 'emerald' : 'info'}
                            size="sm"
                            disabled={p.status === 'verificado'}
                            icon={
                              p.status === 'verificado' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                              )
                            }
                            onClick={() => handleVerifyTransfer(p.id)}
                          >
                            {p.status === 'verificado' ? 'Verificada' : 'Por verificar'}
                          </TactileButton>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#059669] dark:text-[#10B981] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Efectivo
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Immutable Delivery Events Log */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF] flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#8A2BE2] dark:text-[#C084FC]" />
                  <span>Historial interno de la entrega (Bitácora inmutable)</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {selectedEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 py-1 border-b border-[#DFD7EE]/80 dark:border-[#341961] last:border-0"
                    >
                      <div>
                        <span className="font-mono uppercase text-[10px] font-bold text-[#7C3AED] dark:text-[#C084FC] mr-2">
                          {ev.eventType}
                        </span>
                        <span className="text-[#4B3969] dark:text-[#D9CEEE]">{ev.detail}</span>
                      </div>
                      <span className="font-mono text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] whitespace-nowrap">
                        {formatMexicoCityDate(ev.occurredAtUtc)}{' '}
                        {formatMexicoCityTime(ev.occurredAtUtc)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: #130824 Ticket Frame surrounding untouched 48mm Thermal Ticket Template */}
        <div className="xl:col-span-5 rounded-lg p-5 bg-white dark:bg-[#130824] border-t border-white dark:border-t-[#4C2889] border-x border-b border-[#DFD7EE] dark:border-[#2A134D]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
              <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
                Plantilla oficial de ticket 48mm
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {selectedDelivery && (
                <TactileButton
                  variant={showOfficialSample ? 'primary' : 'neutral'}
                  size="sm"
                  onClick={() => {
                    setShowOfficialSample((v) => !v);
                    setIsCopyPreview(false);
                  }}
                >
                  {showOfficialSample ? 'Ver entrega real' : 'Ver ejemplo oficial'}
                </TactileButton>
              )}
              <span className="text-[11px] font-mono text-[#6B5B82] dark:text-[#9E8FB2]">
                Ancho térmico 48mm
              </span>
            </div>
          </div>

          {selectedDelivery && customerLedger && !showOfficialSample ? (
            <Ticket48mm
              delivery={selectedDelivery}
              boxes={selectedBoxes}
              payments={selectedPayments}
              customerTotalBalanceCentavos={customerLedger.balanceCentavos}
              settings={state.settings}
              isCopy={isCopyPreview}
              onPrint={handlePrint}
              onReprint={handleReprintCopy}
            />
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-[#8A2BE2]/40 bg-[#8A2BE2]/10 px-3 py-2 text-[11px] text-[#681AB8] dark:text-[#C084FC] text-center">
                Ejemplo visual oficial de plantilla 48mm (solo demostración visual; no afecta datos ni inventarios reales).
              </div>
              <Ticket48mm
                delivery={OFFICIAL_SAMPLE_DELIVERY}
                boxes={OFFICIAL_SAMPLE_BOXES}
                payments={OFFICIAL_SAMPLE_PAYMENTS}
                customerTotalBalanceCentavos={366200}
                settings={state.settings}
                isCopy={false}
                onPrint={handlePrint}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
