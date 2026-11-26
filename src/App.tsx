import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  DollarSign,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Settings,
  Users,
  UserCheck,
  Warehouse,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { UserAccount } from '../shared/domain.ts';
import { apiClient, type DashboardState } from './services/apiClient.ts';
import { SplashScreen } from './components/SplashScreen.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { GuidedTour, type NavTab } from './components/GuidedTour.tsx';
import { EggOverlayProvider } from './components/EggOverlayProvider.tsx';
import { PanelGeneralView } from './views/PanelGeneralView.tsx';
import { BodegaView } from './views/BodegaView.tsx';
import { VendedoresView } from './views/VendedoresView.tsx';
import { PrecioDiaView } from './views/PrecioDiaView.tsx';
import { EntregasView } from './views/EntregasView.tsx';
import { ClientesView } from './views/ClientesView.tsx';
import { MermasView } from './views/MermasView.tsx';
import { IncidentesView } from './views/IncidentesView.tsx';
import { CierreGeneralView } from './views/CierreGeneralView.tsx';
import { ExcelView } from './views/ExcelView.tsx';
import { SistemaView } from './views/SistemaView.tsx';

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'panel', label: 'Panel general', icon: LayoutDashboard },
  { id: 'bodega', label: 'Bodega y Tortón', icon: Warehouse },
  { id: 'vendedores', label: 'Vendedores', icon: UserCheck },
  { id: 'precio', label: 'Precio del día', icon: DollarSign },
  { id: 'entregas', label: 'Entregas y Ticket', icon: FileText },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'mermas', label: 'Mermas', icon: Scale },
  { id: 'incidentes', label: 'Incidentes', icon: AlertCircle },
  { id: 'cierre', label: 'Cierre general', icon: Calculator },
  { id: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { id: 'sistema', label: 'Ajustes y .EXE', icon: Settings },
];

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<Omit<UserAccount, 'passwordHash'> | null>(null);
  const [state, setState] = useState<DashboardState | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('panel');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const refreshState = useCallback(async () => {
    if (!apiClient.getToken()) return;
    try {
      const next = await apiClient.getDashboardState();
      setState(next);
    } catch {
      setUser(null);
      setState(null);
    }
  }, []);

  // Apply themeMode & reduceAnimations to <html>
  useEffect(() => {
    const mode = state?.settings.themeMode ?? 'dark';
    const html = document.documentElement;
    if (mode === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    if (state?.settings.reduceAnimations) {
      html.classList.add('reduce-motion');
    } else {
      html.classList.remove('reduce-motion');
    }
  }, [state?.settings.themeMode, state?.settings.reduceAnimations]);

  // Bootstrap session if token already exists in sessionStorage
  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) return;
    apiClient
      .getMe()
      .then((res: any) => {
        setUser(res.user);
        return refreshState();
      })
      .catch(() => {
        apiClient.clearSession();
      });
  }, [refreshState]);

  // Real-time WebSocket subscription
  useEffect(() => {
    if (!user) {
      setWsConnected(false);
      return;
    }
    setWsConnected(true);
    apiClient.connectWs((evt) => {
      setWsConnected(true);
      if (evt.type !== 'telemetry:connected') {
        refreshState();
      }
    });
    return () => apiClient.disconnectWs();
  }, [user, refreshState]);

  const handleLogin = async (email: string, password: string) => {
    const loggedUser = await apiClient.login(email, password);
    setUser(loggedUser);
    await refreshState();
    const seenTour = localStorage.getItem('hc_tour_seen');
    if (!seenTour) {
      setShowTour(true);
      localStorage.setItem('hc_tour_seen', '1');
    }
  };

  const handleBootstrap = async (payload: { name: string; email: string; password: string }) => {
    const loggedUser = await apiClient.bootstrapOwner(payload);
    setUser(loggedUser);
    await refreshState();
    const seenTour = localStorage.getItem('hc_tour_seen');
    if (!seenTour) {
      setShowTour(true);
      localStorage.setItem('hc_tour_seen', '1');
    }
  };

  const handleLogout = () => {
    apiClient.clearSession();
    setUser(null);
    setState(null);
  };

  if (showSplash) {
    return (
      <SplashScreen
        reduceAnimations={state?.settings.reduceAnimations ?? false}
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  if (!user || !state) {
    return <LoginScreen onLogin={handleLogin} onBootstrap={handleBootstrap} />;
  }

  const unackedAlertsCount = state.alerts.filter((a) => !a.acknowledged).length;

  return (
    <EggOverlayProvider>
      <div className="min-h-screen flex pos-canvas text-[#130824] dark:text-[#F4EFFF]">
        {/* Deep Velvet POS Sidebar Rail (#130824) */}
        <aside
          className={`${
            sidebarOpen ? 'w-60' : 'w-16'
          } shrink-0 bg-[#1F0E3B] dark:bg-[#130824] border-r border-[#341961] text-[#F4EFFF] flex flex-col transition-all duration-150 print:hidden`}
        >
          <div className="min-h-14 py-2 px-3 flex items-center justify-between border-b border-[#341961]">
            {sidebarOpen && (
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_13e89c53.jpeg"
                  alt="Directo de Granja"
                  className="w-12 h-8 rounded overflow-hidden border border-[#4C2889] object-cover object-center shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold tracking-tight text-[#F4EFFF] truncate">
                    DIRECTO DE GRANJA
                  </div>
                  <div className="text-[10px] text-[#C084FC] leading-tight">
                    Te faltan huevos a nosotros nos sobran
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded hover:bg-[#1F0E3B] text-[#9E8FB2] hover:text-[#F4EFFF]"
              aria-label="Alternar menú lateral"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#8A2BE2] text-[#F4EFFF] border-t border-[#B975F7] shadow-sm'
                      : 'text-[#9E8FB2] hover:text-[#F4EFFF] hover:bg-[#1F0E3B]'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-[#341961]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-[#9E8FB2] hover:text-[#F4EFFF] hover:bg-[#1F0E3B]"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Cerrar sesión</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Windows Command Header (#130824) */}
          <header className="h-14 px-5 border-b border-[#DFD7EE] dark:border-[#341961] bg-white dark:bg-[#130824] flex items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-3 min-w-0">
              {state.settings.profilePictureUrl && (
                <img
                  src={state.settings.profilePictureUrl}
                  alt="Perfil"
                  className="w-8 h-8 rounded-full object-cover border border-[#4C2889] shrink-0"
                />
              )}
              <span className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF] truncate">
                {NAV_ITEMS.find((i) => i.id === activeTab)?.label}
              </span>
              <span className="text-[#9E8FB2]/50">·</span>
              <span className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] truncate">
                {user.name} (Dueño)
              </span>
            </div>

          <div className="flex items-center gap-4 shrink-0 text-xs">
            {unackedAlertsCount > 0 && (
              <button
                onClick={() => setActiveTab('panel')}
                className="inline-flex items-center gap-1.5 font-semibold text-[#E11D48] dark:text-[#F43F5E] hover:underline"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{unackedAlertsCount} alertas</span>
              </button>
            )}

            <div className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              {wsConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#059669] dark:text-[#10B981]" />
                  <span className="text-[#059669] dark:text-[#10B981]">Sync en vivo</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#E11D48] dark:text-[#F43F5E]" />
                  <span className="text-[#E11D48] dark:text-[#F43F5E]">Sin enlace</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Active View Canvas */}
        <main className="flex-1 p-5 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto">
            {activeTab === 'panel' && (
              <PanelGeneralView
                state={state}
                wsConnected={wsConnected}
                onNavigate={setActiveTab}
                onRefresh={refreshState}
                onNotify={notify}
              />
            )}
            {activeTab === 'bodega' && (
              <BodegaView
                state={state}
                onRefresh={refreshState}
                onNotify={notify}
                onOpenTicket={() => setActiveTab('entregas')}
              />
            )}
            {activeTab === 'vendedores' && (
              <VendedoresView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'precio' && (
              <PrecioDiaView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'entregas' && (
              <EntregasView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'clientes' && (
              <ClientesView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'mermas' && <MermasView state={state} />}
            {activeTab === 'incidentes' && (
              <IncidentesView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'cierre' && (
              <CierreGeneralView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'excel' && (
              <ExcelView state={state} onRefresh={refreshState} onNotify={notify} />
            )}
            {activeTab === 'sistema' && (
              <SistemaView
                state={state}
                onRefresh={refreshState}
                onRepeatTour={() => setShowTour(true)}
                onNotify={notify}
              />
            )}
          </div>
        </main>
      </div>

      {/* Non-intrusive Toast Feedback */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 glass-panel rounded-md px-4 py-2.5 text-xs font-medium text-[#130824] dark:text-[#F4EFFF] flex items-center gap-3 border border-[#8A2BE2]/60 print:hidden">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-[#9E8FB2] hover:text-[#F4EFFF]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Guided Tour */}
      {showTour && (
        <GuidedTour onSelectTab={setActiveTab} onClose={() => setShowTour(false)} />
      )}
    </div>
    </EggOverlayProvider>
  );
}
