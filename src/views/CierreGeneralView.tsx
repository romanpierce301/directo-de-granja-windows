import { useState, type FormEvent } from 'react';
import { Calculator, CheckCircle2 } from 'lucide-react';
import {
  calculateVendorClosing,
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  getMexicoCityYmd,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface CierreGeneralViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function CierreGeneralView({
  state,
  onRefresh,
  onNotify,
}: CierreGeneralViewProps) {
  const vendors = state.users.filter((u) => u.role === 'vendedor' && u.status !== 'pendiente');
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id ?? '');
  const [actualCashInput, setActualCashInput] = useState('');
  const [saving, setSaving] = useState(false);

  const todayYmd = getMexicoCityYmd();
  const activeVendor = vendors.find((v) => v.id === selectedVendorId) ?? vendors[0];

  const preview = activeVendor
    ? calculateVendorClosing({
        deliveries: state.deliveries.filter((d) => d.vendorId === activeVendor.id),
        payments: state.payments.filter((p) => p.vendorId === activeVendor.id),
        losses: state.dailyLosses.filter((l) => l.vendorId === activeVendor.id),
        incidents: state.moneyIncidents.filter((i) => i.vendorId === activeVendor.id),
        actualCashHandedInCentavos: Math.round((Number(actualCashInput) || 0) * 100),
      })
    : null;

  const handleCloseDay = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeVendor) return;
    setSaving(true);
    try {
      await apiClient.createClosing({
        vendorId: activeVendor.id,
        dateYmd: todayYmd,
        actualCashPesos: Number(actualCashInput) || 0,
      });
      setActualCashInput('');
      await onRefresh();
      onNotify(`Cierre de caja registrado para ${activeVendor.name}.`);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Cierre general y arqueo por vendedor
        </h2>
        <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
          Efectivo cobrado menos incidentes registrados da el efectivo a entregar · Cualquier faltante queda como diferencia sin explicar
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <form
          onSubmit={handleCloseDay}
          className="lg:col-span-5 glass-panel rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#1d63ff]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Calcular y registrar cierre
            </h3>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Vendedor
            </label>
            <select
              value={activeVendor?.id ?? ''}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="input-recessed w-full rounded px-3 py-2 text-xs"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (Serie {v.folioSeries})
                </option>
              ))}
            </select>
          </div>

          {preview && (
            <div className="rounded-md bg-slate-100/80 dark:bg-[#0d121c] p-3.5 space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Vendido (entregas vigentes)</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatCurrencyFromCentavos(preview.soldCentavos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Cobrado efectivo</span>
                <span className="text-[#2E9B5B] dark:text-[#00f076]">
                  {formatCurrencyFromCentavos(preview.cashCollectedCentavos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Transferencias verificadas</span>
                <span>{formatCurrencyFromCentavos(preview.transferVerifiedCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Transferencias por verificar</span>
                <span className="text-[#1E5FBF] dark:text-[#b5c4ff]">
                  {formatCurrencyFromCentavos(preview.transferPendingCentavos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Por cobrar (saldo)</span>
                <span className="text-[#D64545] dark:text-[#ff334b]">
                  {formatCurrencyFromCentavos(preview.totalReceivableCentavos)}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-white/10 pt-2 flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">Merma del día (informativa)</span>
                <span>{formatKgFromGrams(preview.dailyLossGrams)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-[#c3c5d8]">(-) Incidentes de dinero</span>
                <span className="text-[#D64545] dark:text-[#ff334b]">
                  -{formatCurrencyFromCentavos(preview.incidentsCentavos)}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-white/10 pt-2 flex justify-between text-sm font-bold">
                <span className="text-slate-900 dark:text-white">Efectivo a entregar</span>
                <span className="text-[#1E5FBF] dark:text-[#71ffe5]">
                  {formatCurrencyFromCentavos(preview.expectedCashToDeliverCentavos)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Efectivo físico recibido del vendedor ($ MXN)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={actualCashInput}
              onChange={(e) => setActualCashInput(e.target.value)}
              placeholder="Ej. 800.00"
              className="input-recessed w-full rounded px-3 py-2 text-sm font-mono font-bold tabular-nums"
            />
          </div>

          {preview && actualCashInput !== '' && (
            <div
              className={`rounded px-3 py-2 text-xs font-mono flex justify-between font-bold ${
                preview.unexplainedDifferenceCentavos === 0
                  ? 'bg-[#2E9B5B]/15 text-[#2E9B5B] dark:text-[#00f076]'
                  : 'bg-[#D64545]/15 text-[#D64545] dark:text-[#ffb4ab]'
              }`}
            >
              <span>Diferencia sin explicar:</span>
              <span>{formatCurrencyFromCentavos(preview.unexplainedDifferenceCentavos)}</span>
            </div>
          )}

          <TactileButton
            type="submit"
            variant="emerald"
            size="lg"
            className="w-full"
            disabled={saving}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            {saving ? 'Guardando cierre...' : 'Cerrar caja de vendedor'}
          </TactileButton>
        </form>

        <div className="lg:col-span-7 glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Cierres registrados
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
                  <th className="py-2.5 px-4 font-semibold">Vendedor / Fecha</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Vendido</th>
                  <th className="py-2.5 px-3 font-semibold text-right">A entregar</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Entregado</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
                {state.cashClosings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500 dark:text-[#8d90a2]">
                      Aún no se han guardado cierres de caja hoy.
                    </td>
                  </tr>
                ) : (
                  state.cashClosings.map((c) => (
                    <tr key={c.id} className="hover:bg-[#1d63ff]/5">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {c.vendorName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-[#8d90a2]">
                          {c.dateYmd} · {formatMexicoCityDate(c.closedAtUtc)}{' '}
                          {formatMexicoCityTime(c.closedAtUtc)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatCurrencyFromCentavos(c.soldCentavos)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                        {formatCurrencyFromCentavos(c.expectedCashToDeliverCentavos)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatCurrencyFromCentavos(c.actualCashHandedInCentavos)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                          c.unexplainedDifferenceCentavos === 0
                            ? 'text-[#2E9B5B] dark:text-[#00f076]'
                            : 'text-[#D64545] dark:text-[#ff334b]'
                        }`}
                      >
                        {formatCurrencyFromCentavos(c.unexplainedDifferenceCentavos)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
