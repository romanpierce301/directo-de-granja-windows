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
  User,
} from 'lucide-react';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';
import { useEggOverlay } from '../components/EggOverlayProvider.tsx';

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
  const { runWithOverlay } = useEggOverlay();
  const [phone, setPhone] = useState(state.settings.businessPhone);
  const [address, setAddress] = useState(state.settings.businessAddress);
  const [profilePictureUrl, setProfilePictureUrl] = useState(state.settings.profilePictureUrl ?? '');
  const [reduceAnimations, setReduceAnimations] = useState(state.settings.reduceAnimations);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(state.settings.themeMode);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    apiClient.getHealth().then(setHealth).catch(() => {});
  }, [state.deliveries.length]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const saved = await runWithOverlay(async () => {
        await apiClient.updateSettings({
          businessPhone: phone,
          businessAddress: address,
          profilePictureUrl,
          reduceAnimations,
          themeMode,
        });
        await onRefresh();
        return true;
      }, { loading: 'Guardando configuración...', success: 'Se han sumado mis huevitos también', error: 'Se están atorando mis huevos' });
      if (saved) {
        onNotify('Ajustes del ticket 48mm, imagen de perfil y preferencias guardados.');
      }
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
          Ajustes, monitoreo, Swagger API y compilación .EXE (.NET 8)
        </h2>
        <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
          Configuración del negocio para ticket 48mm, telemetría del servidor central y solución nativa .NET 8 lista para compilar en Windows
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Settings Form */}
        <form onSubmit={handleSaveSettings} className="glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Datos del ticket 48mm y accesibilidad
            </h3>
          </div>

          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Teléfono mostrado en el ticket 48mm
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Dirección mostrada en el ticket 48mm
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Imagen de perfil del Dueño (Galería / equipo)
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F4F1FA] dark:bg-[#130824] border border-[#DFD7EE] dark:border-[#4C2889] shrink-0 flex items-center justify-center">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Perfil Dueño"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-6 h-6 text-[#9E8FB2]" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const inputEl = e.target;
                    const file = inputEl.files?.[0];
                    if (!file) return;
                    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
                    if (!allowedTypes.has(file.type)) {
                      onNotify('Solo se permiten imágenes PNG, JPG o WEBP de su galería.');
                      inputEl.value = '';
                      return;
                    }
                    if (file.size > 1.2 * 1024 * 1024) {
                      onNotify('La imagen pesa más de 1.2 MB. Seleccione una imagen más ligera.');
                      inputEl.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setProfilePictureUrl(reader.result);
                      }
                      inputEl.value = '';
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#8A2BE2] file:text-[#F4EFFF] hover:file:brightness-110 cursor-pointer"
                />
                {profilePictureUrl && (
                  <TactileButton
                    type="button"
                    variant="neutral"
                    size="sm"
                    onClick={() => setProfilePictureUrl('')}
                  >
                    Quitar foto
                  </TactileButton>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
                Apariencia de consola POS
              </label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value as 'dark' | 'light')}
                className="input-recessed w-full rounded px-3 py-1.5 text-xs"
              >
                <option value="dark">Deep Velvet Purple (POS Oscuro)</option>
                <option value="light">Clásico Claro (Directo de Granja)</option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-[#3B2A54] dark:text-[#F4EFFF]">
                <input
                  type="checkbox"
                  checked={reduceAnimations}
                  onChange={(e) => setReduceAnimations(e.target.checked)}
                  className="rounded border-[#341961]"
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
              <Activity className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
              <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
                Monitoreo en tiempo real y Swagger OpenAPI
              </h3>
            </div>
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#7C3AED] dark:text-[#C084FC] hover:underline"
            >
              <span>Abrir Swagger UI</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {health && (
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono tabular-nums">
              <div className="pos-subpanel rounded p-2.5">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">Estado</div>
                <div className="font-bold text-[#059669] dark:text-[#10B981] uppercase">
                  {health.status}
                </div>
              </div>
              <div className="pos-subpanel rounded p-2.5">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                  Sesiones WebSocket
                </div>
                <div className="font-bold text-[#130824] dark:text-[#F4EFFF]">
                  {health.activeWsClients} conectadas
                </div>
              </div>
              <div className="pos-subpanel rounded p-2.5">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                  Entregas sincronizadas
                </div>
                <div className="font-bold text-[#130824] dark:text-[#F4EFFF]">
                  {health.metrics?.deliveriesCount ?? 0}
                </div>
              </div>
              <div className="pos-subpanel rounded p-2.5">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                  Alertas activas
                </div>
                <div
                  className={`font-bold ${
                    (health.metrics?.pendingAlertsCount ?? 0) > 0
                      ? 'text-[#D97706] dark:text-[#F59E0B]'
                      : 'text-[#7C3AED] dark:text-[#C084FC]'
                  }`}
                >
                  {health.metrics?.pendingAlertsCount ?? 0}
                </div>
              </div>
              <div className="pos-subpanel rounded p-2.5 col-span-2">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                  Almacenamiento principal
                </div>
                <div className="font-bold text-[#059669] dark:text-[#10B981]">
                  SQLite ({health.storage?.dbFileName ?? 'directodegranja.db'}
                  {health.storage?.walMode ? ' · WAL activo' : ''})
                </div>
              </div>
            </div>
          )}

          <div className="pos-subpanel rounded-md p-3 text-xs space-y-1.5">
            <div className="font-bold text-[#130824] dark:text-[#F4EFFF] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#8A2BE2] dark:text-[#C084FC]" />
              <span>Endpoints de sincronización para la app Android</span>
            </div>
            <div className="font-mono text-[11px] text-[#4B3969] dark:text-[#D9CEEE]">
              POST /api/sync/push · GET /api/sync/pull · WS /ws · OpenAPI /api/swagger.json
            </div>
          </div>
        </div>
      </div>

      {/* .NET 8 Windows .exe Build Instructions */}
      <div className="glass-panel rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Solución nativa .NET 8 (WPF .exe + Microservicios + EF Core SQLite + Redis)
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-mono text-[#059669] dark:text-[#10B981]">
            <ShieldCheck className="w-3.5 h-3.5" /> Lista para compilar en /dotnet-solution
          </span>
        </div>

        <p className="text-xs text-[#4B3969] dark:text-[#D9CEEE] leading-relaxed">
          En el directorio <code className="font-mono">/dotnet-solution</code> del repositorio se encuentra la solución modular completa en .NET 8: aplicación de escritorio WPF para Windows con plantilla de ticket 48mm y almacenamiento principal en SQLite, microservicios (Gateway YARP, AuthService JWT, SyncService SignalR, LedgerService EF Core SQLite + Redis, MonitoringService), suite xUnit (&gt;80% cobertura) y pipeline CI/CD en GitHub Actions que genera el ejecutable único <code className="font-mono">.exe</code>.
        </p>

        <div className="rounded-md bg-[#130824] text-[#F4EFFF] p-3.5 font-mono text-[11.5px] overflow-x-auto space-y-1 border border-[#341961]">
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
