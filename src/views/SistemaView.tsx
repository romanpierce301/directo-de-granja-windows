import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  BookOpen,
  Compass,
  ExternalLink,
  Monitor,
  Settings,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface SistemaViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onRepeatTour: () => void;
  onNotify: (msg: string) => void;
}

export function SistemaView({
  state,
  onRefresh,
  onRepeatTour,
  onNotify,
}: SistemaViewProps) {
  const [phone, setPhone] = useState(state.settings.businessPhone);
  const [address, setAddress] = useState(state.settings.businessAddress);
  const [reduceAnimations, setReduceAnimations] = useState(state.settings.reduceAnimations);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(state.settings.themeMode);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    apiClient.getHealth().then(setHealth).catch(() => {});
  }, [state.deliveries.length]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.updateSettings({
        businessPhone: phone,
        businessAddress: address,
        reduceAnimations,
        themeMode,
      });
      await onRefresh();
      onNotify('Ajustes del ticket 48mm y preferencias de Windows guardados.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Ajustes, monitoreo, Swagger API y compilación .EXE (.NET 8)
        </h2>
        <p className="text-xs text-slate-500 dark:text-[#9E8FB2] mt-0.5">
          Configuración del negocio para ticket 48mm, telemetría del servidor central y solución nativa .NET 8 lista para compilar en Windows
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Settings Form */}
        <form onSubmit={handleSaveSettings} className="glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#8A2BE2]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Datos del ticket 48mm y accesibilidad
            </h3>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-[#9E8FB2] mb-1">
              Teléfono mostrado en el ticket 48mm
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-[#9E8FB2] mb-1">
              Dirección mostrada en el ticket 48mm
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs text-slate-500 dark:text-[#9E8FB2] mb-1">
                Apariencia (Sin ámbar ni amarillo)
              </label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value as 'dark' | 'light')}
                className="input-recessed w-full rounded px-3 py-1.5 text-xs"
              >
                <option value="dark">Ejecutivo Oscuro (Obsidian)</option>
                <option value="light">Clásico Claro (Directo de Granja)</option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-slate-700 dark:text-[#F4EFFF]">
                <input
                  type="checkbox"
                  checked={reduceAnimations}
                  onChange={(e) => setReduceAnimations(e.target.checked)}
                  className="rounded border-slate-400"
                />
                <span>Reducir animaciones</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <TactileButton
              variant="info"
              size="sm"
              icon={<Compass className="w-3.5 h-3.5" />}
              onClick={onRepeatTour}
            >
              Repetir recorrido guiado
            </TactileButton>

            <TactileButton type="submit" variant="primary" size="sm">
              Guardar configuración
            </TactileButton>
          </div>
        </form>

        {/* Monitoring & Swagger */}
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#10B981] dark:text-[#10B981]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Monitoreo en tiempo real y Swagger OpenAPI
              </h3>
            </div>
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A2BE2] dark:text-[#C084FC] hover:underline"
            >
              <span>Abrir Swagger UI</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {health && (
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono tabular-nums">
              <div className="rounded bg-slate-100/80 dark:bg-[#130824] p-2.5">
                <div className="text-[11px] text-slate-500 dark:text-[#9E8FB2]">Estado</div>
                <div className="font-bold text-[#10B981] dark:text-[#10B981] uppercase">
                  {health.status}
                </div>
              </div>
              <div className="rounded bg-slate-100/80 dark:bg-[#130824] p-2.5">
                <div className="text-[11px] text-slate-500 dark:text-[#9E8FB2]">
                  Sesiones WebSocket
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {health.activeWsClients} conectadas
                </div>
              </div>
              <div className="rounded bg-slate-100/80 dark:bg-[#130824] p-2.5">
                <div className="text-[11px] text-slate-500 dark:text-[#9E8FB2]">
                  Entregas sincronizadas
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {health.metrics?.deliveriesCount ?? 0}
                </div>
              </div>
              <div className="rounded bg-slate-100/80 dark:bg-[#130824] p-2.5">
                <div className="text-[11px] text-slate-500 dark:text-[#9E8FB2]">
                  Alertas activas
                </div>
                <div className="font-bold text-[#8A2BE2] dark:text-[#C084FC]">
                  {health.metrics?.pendingAlertsCount ?? 0}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md bg-slate-100/80 dark:bg-[#130824] p-3 text-xs space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#8A2BE2]" />
              <span>Endpoints de sincronización para la app Android</span>
            </div>
            <div className="font-mono text-[11px] text-slate-600 dark:text-[#9E8FB2]">
              POST /api/sync/push · GET /api/sync/pull · WS /ws · OpenAPI /api/swagger.json
            </div>
          </div>
        </div>
      </div>

      {/* .NET 8 Windows .exe Build Instructions */}
      <div className="glass-panel rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#8A2BE2]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Solución nativa .NET 8 (WPF .exe + Microservicios + EF Core SQL Server + Redis)
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-mono text-[#10B981] dark:text-[#10B981]">
            <ShieldCheck className="w-3.5 h-3.5" /> Lista para compilar en /dotnet-solution
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-[#9E8FB2] leading-relaxed">
          En el directorio <code className="font-mono">/dotnet-solution</code> del repositorio se encuentra la solución modular completa en .NET 8: aplicación de escritorio WPF para Windows con plantilla de ticket 48mm y caché local, microservicios (Gateway YARP, AuthService JWT, SyncService SignalR, LedgerService EF Core SQL Server + Redis, MonitoringService), suite xUnit (&gt;80% cobertura) y pipeline CI/CD en GitHub Actions que genera el ejecutable único <code className="font-mono">.exe</code>.
        </p>

        <div className="rounded-md bg-[#0b0e15] text-[#F4EFFF] p-3.5 font-mono text-[11.5px] overflow-x-auto space-y-1 border border-white/10">
          <div className="text-[#C084FC] flex items-center gap-1.5 mb-1">
            <Terminal className="w-3.5 h-3.5" />
            <span>Comandos para generar el .EXE en Windows (o automático vía GitHub Actions):</span>
          </div>
          <div>cd dotnet-solution</div>
          <div>dotnet test --collect:"XPlat Code Coverage"</div>
          <div>
            dotnet publish src/Desktop/HuevoControl.WindowsApp/HuevoControl.WindowsApp.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./publish-win-x64
          </div>
        </div>
      </div>
    </div>
  );
}
