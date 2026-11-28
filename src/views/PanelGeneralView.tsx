import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  TrendingUp,
} from 'lucide-react';
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
import type { NavTab } from '../components/GuidedTour.tsx';

interface PanelGeneralViewProps {
  state: DashboardState;
  wsConnected: boolean;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function PanelGeneralView({
  state,
  wsConnected,
  onNavigate,
  onRefresh,
  onNotify,
}: PanelGeneralViewProps) {
  const todayYmd = getMexicoCityYmd();
  const todayPrice = state.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? state.dailyPrices[0];

  const globalTotals = calculateVendorClosing({
    deliveries: state.deliveries,
    payments: state.payments,
    losses: state.dailyLosses,
    incidents: state.moneyIncidents,
    actualCashHandedInCentavos: 0,
  });

  const activeVendors = state.users.filter((u) => u.role === 'vendedor');
  const activeAlerts = state.alerts.filter((a) => !a.acknowledged);

  const handleAckAlert = async (id: string) => {
    await apiClient.ackAlert(id);
    await onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* Executive Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
            Panel general de operación
          </h2>
          <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            Resumen consolidado en tiempo real · Zona horaria Ciudad de México ·{' '}
            {wsConnected ? 'WebSocket conectado' : 'Reconectando enlace en vivo'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <TactileButton
            variant="primary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => onRefresh()}
          >
            Actualizar
          </TactileButton>
        </div>
      </div>

      {/* 4-column KPI Cluster */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Vendido (entregas vigentes)</span>
            <TrendingUp className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#130824] dark:text-[#F4EFFF]">
            {formatCurrencyFromCentavos(globalTotals.soldCentavos)}
          </div>
          <p className="mt-1 text-xs text-[#6B5B82] dark:text-[#9E8FB2] font-mono tabular-nums">
            {state.deliveries.filter((d) => d.status === 'vigente').length} entregas activas ·{' '}
            {formatKgFromGrams(
              state.deliveries
                .filter((d) => d.status === 'vigente')
                .reduce((a, b) => a + b.totalGrams, 0)
            )}
          </p>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Cobrado (efectivo y transferencias)</span>
            <CheckCircle2 className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#059669] dark:text-[#10B981]">
            {formatCurrencyFromCentavos(globalTotals.totalCollectedCentavos)}
          </div>
          <p className="mt-1 text-xs text-[#6B5B82] dark:text-[#9E8FB2] font-mono tabular-nums">
            Efectivo {formatCurrencyFromCentavos(globalTotals.cashCollectedCentavos)} ·{' '}
            <span className="text-[#D97706] dark:text-[#F59E0B]">
              Por verificar {formatCurrencyFromCentavos(globalTotals.transferPendingCentavos)}
            </span>
          </p>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Por cobrar (saldo en calle)</span>
            <Clock className="w-4 h-4 text-[#E11D48] dark:text-[#F43F5E]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#E11D48] dark:text-[#F43F5E]">
            {formatCurrencyFromCentavos(globalTotals.totalReceivableCentavos)}
          </div>
          <p className="mt-1 text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            Incluye crédito y pagos parciales
          </p>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Precio del día</span>
            <Send className="w-4 h-4 text-[#7C3AED] dark:text-[#C084FC]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#7C3AED] dark:text-[#F4EFFF]">
            {todayPrice
              ? `${formatCurrencyFromCentavos(todayPrice.priceCentavosPerKg, true)}/kg`
              : 'Sin definir'}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>{todayPrice?.dateYmd ?? todayYmd}</span>
            <button
              onClick={() => onNavigate('precio')}
              className="text-[#7C3AED] dark:text-[#C084FC] hover:underline font-medium"
            >
              Cambiar precio
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-column Split: Vendors Live Table + Proactive Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Per-Vendor Live Breakdown */}
        <div className="xl:col-span-2 glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Ventas y sincronización por vendedor
            </h3>
            <button
              onClick={() => onNavigate('vendedores')}
              className="text-xs font-medium text-[#7C3AED] dark:text-[#C084FC] hover:underline"
            >
              Gestionar cuentas
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2.5 px-4 font-semibold">Vendedor</th>
                  <th className="py-2.5 px-3 font-semibold">Serie / Estado</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Vendido</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Cobrado</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Por cobrar</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Última sincronización</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE4F5] dark:divide-[#341961]/70">
                {activeVendors.map((v) => {
                  const vDels = state.deliveries.filter((d) => d.vendorId === v.id);
                  const vPays = state.payments.filter((p) => p.vendorId === v.id);
                  const vLosses = state.dailyLosses.filter((l) => l.vendorId === v.id);
                  const vInc = state.moneyIncidents.filter((i) => i.vendorId === v.id);
                  const totals = calculateVendorClosing({
                    deliveries: vDels,
                    payments: vPays,
                    losses: vLosses,
                    incidents: vInc,
                    actualCashHandedInCentavos: 0,
                  });
                  const dev = state.devices.find((d) => d.userId === v.id && d.active);
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-[#8A2BE2]/10 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#130824] dark:text-[#F4EFFF]">
                          {v.name}
                        </div>
                        <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                          {dev ? dev.deviceName : 'Sin dispositivo activo'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-[#7C3AED] dark:text-[#C084FC]">
                            {v.folioSeries ? `Serie ${v.folioSeries}` : 'Sin serie'}
                          </span>
                          <span aria-hidden="true" className="text-[#9E8FB2]">·</span>
                          <span
                            className={
                              v.status === 'activa'
                                ? 'text-[#059669] dark:text-[#10B981] font-medium'
                                : v.status === 'bloqueada'
                                ? 'text-[#E11D48] dark:text-[#F43F5E] font-medium'
                                : 'text-[#D97706] dark:text-[#F59E0B] font-medium'
                            }
                          >
                            {v.status === 'activa'
                              ? 'Activa'
                              : v.status === 'bloqueada'
                              ? 'Bloqueada'
                              : 'Pendiente'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#130824] dark:text-[#F4EFFF]">
                        {formatCurrencyFromCentavos(totals.soldCentavos)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#059669] dark:text-[#10B981]">
                        {formatCurrencyFromCentavos(totals.totalCollectedCentavos)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#E11D48] dark:text-[#F43F5E]">
                        {formatCurrencyFromCentavos(totals.totalReceivableCentavos)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#6B5B82] dark:text-[#9E8FB2]">
                        {dev?.lastSyncUtc ? (
                          <div>
                            <div>
                              {formatMexicoCityDate(dev.lastSyncUtc)}{' '}
                              {formatMexicoCityTime(dev.lastSyncUtc)}
                            </div>
                            {dev.pendingSyncCount > 0 && (
                              <div className="text-[11px] text-[#D97706] dark:text-[#F59E0B]">
                                {dev.pendingSyncCount} en cola móvil
                              </div>
                            )}
                          </div>
                        ) : (
                          'Nunca'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Proactive Real-Time Alerts Panel */}
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
              <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
                Alertas proactivas ({activeAlerts.length})
              </h3>
            </div>
          </div>

          <div className="p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
            {activeAlerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
                <CheckCircle2 className="w-6 h-6 text-[#059669] dark:text-[#10B981] mx-auto mb-2" />
                Operación nominal. No hay alertas pendientes.
              </div>
            ) : (
              activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-md p-3 border text-xs ${
                    alert.severity === 'critical'
                      ? 'bg-[#F43F5E]/12 border-[#F43F5E]/40 text-[#130824] dark:text-[#F4EFFF]'
                      : 'bg-[#F59E0B]/10 border-[#F59E0B]/35 text-[#130824] dark:text-[#F4EFFF]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {alert.severity === 'critical' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-[#E11D48] dark:text-[#F43F5E] shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-[#D97706] dark:text-[#F59E0B] shrink-0" />
                      )}
                      <span>{alert.title}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11.5px] text-[#4C3F63] dark:text-[#9E8FB2] leading-relaxed">
                    {alert.message}
                  </p>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleAckAlert(alert.id)}
                      className="text-[11px] font-semibold underline text-[#7C3AED] dark:text-[#C084FC] hover:opacity-100"
                    >
                      Entendido
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
