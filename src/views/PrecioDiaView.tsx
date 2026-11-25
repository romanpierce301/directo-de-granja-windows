import { useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, DollarSign, Send } from 'lucide-react';
import {
  formatCurrencyFromCentavos,
  formatMexicoCityDate,
  formatMexicoCityTime,
  getMexicoCityYmd,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface PrecioDiaViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function PrecioDiaView({ state, onRefresh, onNotify }: PrecioDiaViewProps) {
  const todayYmd = getMexicoCityYmd();
  const currentToday = state.dailyPrices.find((p) => p.dateYmd === todayYmd);
  const [priceInput, setPriceInput] = useState(
    currentToday ? (currentToday.priceCentavosPerKg / 100).toFixed(2) : ''
  );
  const [dateYmd, setDateYmd] = useState(todayYmd);
  const [saving, setSaving] = useState(false);

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    const numeric = Number(priceInput);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onNotify('Ingrese un precio por kilo válido mayor que $0.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.publishPrice(numeric, dateYmd);
      await onRefresh();
      onNotify(`Precio $${numeric.toFixed(2)}/kg publicado y enviado a todas las apps Android.`);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (id: string) => {
    await apiClient.reviewVendorPrice(id);
    await onRefresh();
    onNotify('Precio manual capturado por vendedor marcado como revisado.');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
          Precio del día por kilo
        </h2>
        <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
          Cada entrega guarda una copia de su precio; cambiar el precio de hoy nunca altera ventas pasadas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <form onSubmit={handlePublish} className="glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Publicar precio vigente
            </h3>
          </div>

          <div>
            <label className="block text-xs text-[#4C3F63] dark:text-[#9E8FB2] mb-1">
              Fecha operativa (Ciudad de México)
            </label>
            <input
              type="date"
              value={dateYmd}
              onChange={(e) => setDateYmd(e.target.value)}
              className="input-recessed w-full rounded px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-[#4C3F63] dark:text-[#9E8FB2] mb-1">
              Precio por kilo ($ MXN)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00"
                className="input-recessed w-full rounded px-3 py-2 pr-16 text-lg font-mono font-bold tabular-nums"
              />
              <span className="absolute right-3 top-2.5 text-xs font-mono text-[#6B5B82] dark:text-[#9E8FB2]">
                MXN / kg
              </span>
            </div>
          </div>

          <TactileButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
            icon={<Send className="w-4 h-4" />}
          >
            {saving ? 'Transmitiendo...' : 'Publicar precio a vendedores'}
          </TactileButton>
        </form>

        <div className="lg:col-span-2 glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961]">
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Historial de precios publicados
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2.5 px-4 font-semibold">Fecha</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Precio / kg</th>
                  <th className="py-2.5 px-3 font-semibold">Origen</th>
                  <th className="py-2.5 px-3 font-semibold">Publicado por</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE4F5] dark:divide-[#341961]/70">
                {state.dailyPrices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#6B5B82] dark:text-[#9E8FB2]">
                      Aún no se ha publicado ningún precio del día.
                    </td>
                  </tr>
                ) : (
                  state.dailyPrices.map((p) => (
                  <tr key={p.id} className="hover:bg-[#8A2BE2]/10">
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-[#130824] dark:text-[#F4EFFF]">
                      {p.dateYmd}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#7C3AED] dark:text-[#C084FC]">
                      {formatCurrencyFromCentavos(p.priceCentavosPerKg, true)}
                    </td>
                    <td className="py-2.5 px-3 text-[#4C3F63] dark:text-[#9E8FB2]">
                      {p.origin === 'dueno' ? 'Dueño (Windows)' : 'Vendedor (Sin internet)'}
                    </td>
                    <td className="py-2.5 px-3 text-[#4C3F63] dark:text-[#9E8FB2]">
                      {p.publishedByName} · {formatMexicoCityDate(p.createdAtUtc)}{' '}
                      {formatMexicoCityTime(p.createdAtUtc)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {p.reviewedByOwner ? (
                        <span className="inline-flex items-center gap-1 text-[#059669] dark:text-[#10B981] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Revisado
                        </span>
                      ) : (
                        <TactileButton
                          variant="info"
                          size="sm"
                          icon={<Clock className="w-3.5 h-3.5 text-[#F59E0B]" />}
                          onClick={() => handleReview(p.id)}
                        >
                          Revisar precio
                        </TactileButton>
                      )}
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
