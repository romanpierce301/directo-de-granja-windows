import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  BookOpen,
  Compass,
  ExternalLink,
  Monitor,
  Printer,
  RefreshCw,
  Settings,
  ShieldCheck,
  Terminal,
  Usb,
  User,
} from 'lucide-react';
import type { WindowsPrinterConfig } from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import {
  buildEscPosTestTicketBytes,
  DEFAULT_PRINTER_CONFIG,
  getAuthorizedSerialPortsCount,
  isElectronDesktop,
  isWebSerialSupported,
  listWindowsSystemPrinters,
  printTicket48mm,
  requestAndLinkSerialPrinter,
  type DesktopPrinterInfo,
} from '../services/windowsPrinter.ts';
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

  const initialPrinter = state.settings.printerConfig ?? DEFAULT_PRINTER_CONFIG;
  const [printerMode, setPrinterMode] = useState<WindowsPrinterConfig['mode']>(initialPrinter.mode);
  const [printerName, setPrinterName] = useState(initialPrinter.printerName);
  const [baudRate, setBaudRate] = useState<number>(initialPrinter.baudRate ?? 9600);
  const [vendorId, setVendorId] = useState<number | undefined>(initialPrinter.vendorId);
  const [productId, setProductId] = useState<number | undefined>(initialPrinter.productId);
  const [detectedPrinters, setDetectedPrinters] = useState<DesktopPrinterInfo[]>([]);
  const [detectingPrinters, setDetectingPrinters] = useState(false);
  const [serialPortsCount, setSerialPortsCount] = useState(0);
  const [printingTest, setPrintingTest] = useState(false);

  const runningInElectron = isElectronDesktop();
  const serialSupported = isWebSerialSupported();

  useEffect(() => {
    apiClient.getHealth().then(setHealth).catch(() => {});
  }, [state.deliveries.length]);

  useEffect(() => {
    const cfg = state.settings.printerConfig;
    if (!cfg) return;
    setPrinterMode(cfg.mode);
    setPrinterName(cfg.printerName);
    setBaudRate(cfg.baudRate ?? 9600);
    setVendorId(cfg.vendorId);
    setProductId(cfg.productId);
  }, [state.settings.printerConfig]);

  useEffect(() => {
    if (runningInElectron) {
      listWindowsSystemPrinters().then(setDetectedPrinters).catch(() => {});
    }
    if (serialSupported) {
      getAuthorizedSerialPortsCount().then(setSerialPortsCount).catch(() => {});
    }
  }, [runningInElectron, serialSupported]);

  const buildCurrentPrinterConfig = (): WindowsPrinterConfig => ({
    mode: printerMode,
    printerName: printerName.trim(),
    paperWidthMm: 48,
    baudRate,
    ...(vendorId !== undefined ? { vendorId } : {}),
    ...(productId !== undefined ? { productId } : {}),
  });

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
          printerConfig: buildCurrentPrinterConfig(),
        });
        await onRefresh();
        return true;
      }, { loading: 'Guardando configuración...', success: 'Se han sumado mis huevitos también', error: 'Se están atorando mis huevos' });
      if (saved) {
        onNotify('Ajustes del ticket 48mm, impresora, imagen de perfil y preferencias guardados.');
      }
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handleDetectWindowsPrinters = async () => {
    setDetectingPrinters(true);
    try {
      if (!runningInElectron) {
        onNotify(
          'La detección directa de colas de Windows funciona en la app de escritorio (.exe). En navegador puedes usar USB/COM o el diálogo del sistema.'
        );
        return;
      }
      const list = await listWindowsSystemPrinters();
      setDetectedPrinters(list);
      if (list.length === 0) {
        onNotify('Windows no reportó impresoras instaladas. Instala el driver o vincula por USB/COM.');
      } else {
        onNotify(`${list.length} impresora(s) detectadas en Windows. Selecciona la térmica y guarda.`);
      }
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setDetectingPrinters(false);
    }
  };

  const handleLinkSerialPrinter = async () => {
    try {
      const linked = await requestAndLinkSerialPrinter(baudRate);
      setPrinterMode('usb_serial');
      setPrinterName(linked.printerName);
      setVendorId(linked.vendorId);
      setProductId(linked.productId);
      const count = await getAuthorizedSerialPortsCount();
      setSerialPortsCount(count);
      const nextCfg: WindowsPrinterConfig = {
        mode: 'usb_serial',
        printerName: linked.printerName,
        paperWidthMm: 48,
        baudRate: linked.baudRate,
        ...(linked.vendorId !== undefined ? { vendorId: linked.vendorId } : {}),
        ...(linked.productId !== undefined ? { productId: linked.productId } : {}),
      };
      await apiClient.updateSettings({ printerConfig: nextCfg });
      await onRefresh();
      onNotify(`Impresora USB/COM vinculada y guardada: ${linked.printerName}`);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!msg.toLowerCase().includes('no port selected') && !msg.toLowerCase().includes('cancel')) {
        onNotify(msg || 'No se pudo vincular el puerto USB/COM.');
      }
    }
  };

  const handleSavePrinterOnly = async () => {
    try {
      await apiClient.updateSettings({ printerConfig: buildCurrentPrinterConfig() });
      await onRefresh();
      onNotify('Configuración de impresora térmica 48 mm guardada en SQLite.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handlePrintTest48mm = async () => {
    setPrintingTest(true);
    try {
      await new Promise((r) => window.setTimeout(r, 80));
      const cfg = buildCurrentPrinterConfig();
      const previewSettings = {
        ...state.settings,
        businessPhone: phone.trim() || state.settings.businessPhone,
        businessAddress: address.trim() || state.settings.businessAddress,
      };
      const escPos = buildEscPosTestTicketBytes(previewSettings);
      const msg = await printTicket48mm(cfg, escPos);
      onNotify(msg);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setPrintingTest(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
          Ajustes, impresora térmica 48 mm, monitoreo y Swagger API
        </h2>
        <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
          Configuración del negocio para ticket 48mm, vinculación de impresora térmica en Windows, estado del servidor y empaquetado Desktop (.EXE)
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
              {Array.isArray(health.lanUrls) && health.lanUrls.length > 0 && (
                <div className="pos-subpanel rounded p-2.5 col-span-2">
                  <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                    Dirección Wi-Fi local para conectar la app Android
                  </div>
                  <div className="font-bold text-[#7C3AED] dark:text-[#C084FC] break-all">
                    {health.lanUrls.join('  ·  ')}
                  </div>
                </div>
              )}
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

      {/* Windows 48mm Thermal Printer Linking & Test Panel */}
      <div className="glass-panel rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Impresora Térmica 48 mm (Windows USB / Bluetooth / Driver instalado)
            </h3>
          </div>
          <span className="text-xs font-mono text-[#059669] dark:text-[#10B981]">
            {printerName ? `Activa: ${printerName}` : 'Modo sistema (diálogo Windows)'}
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <div className="xl:col-span-8 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setPrinterMode('electron')}
                className={`pos-subpanel rounded p-3 text-left transition-colors ${
                  printerMode === 'electron' ? 'ring-2 ring-[#8A2BE2]' : ''
                }`}
              >
                <div className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                  Impresora Windows (Driver)
                </div>
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
                  Impresión directa silenciosa desde la app .exe hacia cola instalada en Windows
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrinterMode('usb_serial')}
                className={`pos-subpanel rounded p-3 text-left transition-colors ${
                  printerMode === 'usb_serial' ? 'ring-2 ring-[#8A2BE2]' : ''
                }`}
              >
                <div className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                  USB / Puerto COM (ESC/POS)
                </div>
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
                  Envío ESC/POS 48 mm directo sin driver a puerto serie USB o Bluetooth COM
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrinterMode('system')}
                className={`pos-subpanel rounded p-3 text-left transition-colors ${
                  printerMode === 'system' ? 'ring-2 ring-[#8A2BE2]' : ''
                }`}
              >
                <div className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                  Diálogo estándar 48 mm
                </div>
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
                  Abre el selector de impresora de Windows al imprimir cada ticket
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
                  Nombre exacto de impresora vinculada en Windows o puerto USB/COM
                </label>
                <input
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Detecta o escribe el nombre de tu impresora térmica"
                  className="input-recessed w-full rounded px-3 py-1.5 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
                  Velocidad USB/COM (baud)
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="input-recessed w-full rounded px-3 py-1.5 text-xs font-mono"
                >
                  <option value={9600}>9600 bps (estándar)</option>
                  <option value={19200}>19200 bps</option>
                  <option value={38400}>38400 bps</option>
                  <option value={57600}>57600 bps</option>
                  <option value={115200}>115200 bps</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TactileButton
                type="button"
                variant="info"
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                disabled={detectingPrinters}
                onClick={handleDetectWindowsPrinters}
              >
                {detectingPrinters ? 'Detectando...' : 'Detectar impresoras de Windows'}
              </TactileButton>

              <TactileButton
                type="button"
                variant="info"
                size="sm"
                icon={<Usb className="w-3.5 h-3.5" />}
                disabled={!serialSupported}
                onClick={handleLinkSerialPrinter}
              >
                Vincular impresora USB / COM ({serialPortsCount})
              </TactileButton>

              <TactileButton
                type="button"
                variant="emerald"
                size="sm"
                icon={<Printer className="w-3.5 h-3.5" />}
                disabled={printingTest}
                onClick={handlePrintTest48mm}
              >
                {printingTest ? 'Imprimiendo...' : 'Imprimir prueba 48 mm'}
              </TactileButton>

              <TactileButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSavePrinterOnly}
              >
                Guardar impresora
              </TactileButton>
            </div>

            {detectedPrinters.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-semibold text-[#130824] dark:text-[#F4EFFF]">
                  Impresoras instaladas detectadas en este equipo Windows:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {detectedPrinters.map((p) => {
                    const isSelected = printerMode === 'electron' && printerName === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setPrinterMode('electron');
                          setPrinterName(p.name);
                        }}
                        className={`pos-subpanel rounded px-3 py-2 text-left text-xs flex items-center justify-between gap-2 ${
                          isSelected ? 'ring-2 ring-[#10B981]' : 'hover:border-[#8A2BE2]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#130824] dark:text-[#F4EFFF] truncate">
                            {p.displayName}
                          </div>
                          <div className="text-[10px] font-mono text-[#6B5B82] dark:text-[#9E8FB2] truncate">
                            {p.name}
                            {p.isDefault ? ' · Predeterminada' : ''}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            isSelected ? 'text-[#059669] dark:text-[#10B981]' : 'text-[#7C3AED] dark:text-[#C084FC]'
                          }`}
                        >
                          {isSelected ? 'Vinculada' : 'Seleccionar'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Real 48mm test ticket preview used for both verification and Windows driver printing */}
          <div className="xl:col-span-4 flex flex-col items-center">
            <div
              id="ticket-48mm-printable"
              className="w-[248px] bg-white text-black px-2.5 py-3 shadow-lg border border-slate-300 select-text"
              style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
            >
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
              <div className="mt-2 text-center text-[11px] font-bold leading-snug">
                {state.settings.slogan}
              </div>
              <div className="mt-2 text-center text-[10.5px] leading-snug">
                <div>Tel. {phone.trim() || state.settings.businessPhone}</div>
                <div>{address.trim() || state.settings.businessAddress}</div>
              </div>
              <div className="my-2 border-t border-dashed border-black" />
              <div className="text-center text-[11px] font-bold">PRUEBA DE IMPRESION 48MM</div>
              <div className="text-center text-[10.5px]">CONEXION VERIFICADA</div>
              <div className="my-2 border-t border-dashed border-black" />
            </div>
          </div>
        </div>
      </div>

      {/* Full Windows Desktop .exe Build Instructions */}
      <div className="glass-panel rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Aplicación completa de escritorio Windows (.EXE con todas las pantallas y SQLite)
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-mono text-[#059669] dark:text-[#10B981]">
            <ShieldCheck className="w-3.5 h-3.5" /> Empaquetado completo listo
          </span>
        </div>

        <p className="text-xs text-[#4B3969] dark:text-[#D9CEEE] leading-relaxed">
          El ejecutable de Windows (<code className="font-mono">DirectoDeGranja-Windows-Portable.exe</code> y el instalador) incluye exactamente esta consola completa con sus 11 módulos, tema Deep Velvet Purple, ticket térmico 48mm, SQLite cifrado, respaldos y servidor WebSocket integrado para los teléfonos Android en la misma red Wi-Fi.
        </p>

        <div className="rounded-md bg-[#130824] text-[#F4EFFF] p-3.5 font-mono text-[11.5px] overflow-x-auto space-y-1 border border-[#341961]">
          <div className="text-[#C084FC] flex items-center gap-1.5 mb-1">
            <Terminal className="w-3.5 h-3.5" />
            <span>Comandos para generar el .EXE completo en Windows (o automático vía GitHub Actions):</span>
          </div>
          <div>npm ci</div>
          <div>npm run package:win</div>
        </div>
      </div>
    </div>
  );
}
