import { Scale } from 'lucide-react';
import {
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
} from '../../shared/domain.ts';
import type { DashboardState } from '../services/apiClient.ts';

interface MermasViewProps {
  state: DashboardState;
}

export function MermasView({ state }: MermasViewProps) {
  const totalDeliveredGrams = state.deliveries
    .filter((d) => d.status === 'vigente')
    .reduce((acc, d) => acc + d.totalGrams, 0);
  const totalLostGrams = state.dailyLosses.reduce((acc, l) => acc + l.lostGrams, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Mermas del día por vendedor
        </h2>
        <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
          Registro informativo sobre el total de la jornada · Solo lectura para el dueño · No altera lo cobrado a clientes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="glass-panel rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-[#8d90a2]">Total entregado vigente</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatKgFromGrams(totalDeliveredGrams)}
          </div>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-[#8d90a2]">Total merma registrada</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#1E5FBF] dark:text-[#71ffe5]">
            {formatKgFromGrams(totalLostGrams)}
          </div>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-[#8d90a2]">Efecto en cobro</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-[#2E9B5B] dark:text-[#00f076]">
            $0 (Solo informativo)
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#1d63ff]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Bitácora de mermas reportadas
          </h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
              <th className="py-2.5 px-4 font-semibold">Fecha y hora</th>
              <th className="py-2.5 px-3 font-semibold">Vendedor</th>
              <th className="py-2.5 px-3 font-semibold text-right">Kilos perdidos</th>
              <th className="py-2.5 px-4 font-semibold">Nota obligatoria</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
            {state.dailyLosses.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-[#8d90a2]">
                  No se han registrado mermas.
                </td>
              </tr>
            ) : (
              state.dailyLosses.map((loss) => (
                <tr key={loss.id} className="hover:bg-[#1d63ff]/5">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 dark:text-[#c3c5d8]">
                    {formatMexicoCityDate(loss.createdAtUtc)} {formatMexicoCityTime(loss.createdAtUtc)}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                    {loss.vendorName}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#1E5FBF] dark:text-[#71ffe5]">
                    {formatKgFromGrams(loss.lostGrams)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 dark:text-[#e1e2ec]">{loss.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
