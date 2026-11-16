import { useState, type FormEvent } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  ShieldPlus,
  Smartphone,
  UserPlus,
} from 'lucide-react';
import { formatMexicoCityDate, formatMexicoCityTime } from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface VendedoresViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function VendedoresView({ state, onRefresh, onNotify }: VendedoresViewProps) {
  const [showNewUser, setShowNewUser] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'vendedor' | 'dueno'>('vendedor');
  const [busyId, setBusyId] = useState<string | null>(null);

  const vendors = state.users.filter((u) => u.role === 'vendedor');
  const owners = state.users.filter((u) => u.role === 'dueno');

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await apiClient.approveVendor(id);
      await onRefresh();
      onNotify('Vendedor aprobado con serie de folios asignada.');
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleBlock = async (id: string) => {
    setBusyId(id);
    try {
      await apiClient.blockVendor(id);
      await onRefresh();
      onNotify('Cuenta bloqueada. Las ventas y pagos históricos se conservan.');
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleAuthorizeDevice = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await apiClient.authorizeDevice(deviceId);
      await onRefresh();
      onNotify('Dispositivo autorizado como equipo único activo.');
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createUser({ name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setShowNewUser(false);
      await onRefresh();
      onNotify('Usuario creado con contraseña cifrada bcrypt.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Vendedores, folios y dispositivos
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
            Solo las cuentas aprobadas reciben clientes y precio del día · Un dispositivo activo por cuenta
          </p>
        </div>

        <TactileButton
          variant="primary"
          size="sm"
          icon={<UserPlus className="w-4 h-4" />}
          onClick={() => setShowNewUser((v) => !v)}
        >
          {showNewUser ? 'Cerrar formulario' : 'Nueva cuenta cifrada'}
        </TactileButton>
      </div>

      {showNewUser && (
        <form
          onSubmit={handleCreateUser}
          className="glass-panel rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Nombre completo
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Correo de Google / acceso
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
              placeholder="correo@directodegranja.mx"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Contraseña (mín. 8 car.)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Rol RBAC
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'vendedor' | 'dueno')}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            >
              <option value="vendedor">Vendedor (Android)</option>
              <option value="dueno">Dueño (Windows)</option>
            </select>
          </div>
          <TactileButton
            type="submit"
            variant="emerald"
            size="sm"
            icon={<ShieldPlus className="w-4 h-4" />}
          >
            Guardar cuenta
          </TactileButton>
        </form>
      )}

      {/* Vendor Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {vendors.map((v) => {
          const vendorDevices = state.devices.filter((d) => d.userId === v.id);
          const isApproved = v.status === 'activa';
          const isBlocked = v.status === 'bloqueada';

          return (
            <div key={v.id} className="glass-panel rounded-lg p-4 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {v.name}
                    </h3>
                    <span className="font-mono text-xs text-[#1E5FBF] dark:text-[#71ffe5] font-semibold">
                      {v.folioSeries ? `Serie ${v.folioSeries}` : 'Sin serie'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
                    {v.googleEmail}
                  </p>
                </div>

                {/* Color-changing 3D buttons (exact spec: Aprobar gris->verde Aprobado, Bloquear gris->rojo Bloqueado) */}
                <div className="flex items-center gap-2">
                  <TactileButton
                    variant={isApproved ? 'emerald' : 'neutral'}
                    size="sm"
                    disabled={busyId === v.id || isApproved}
                    icon={
                      isApproved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )
                    }
                    onClick={() => handleApprove(v.id)}
                  >
                    {isApproved ? 'Aprobado' : 'Aprobar'}
                  </TactileButton>

                  <TactileButton
                    variant={isBlocked ? 'crimson' : 'neutral'}
                    size="sm"
                    disabled={busyId === v.id || isBlocked}
                    icon={<Ban className="w-3.5 h-3.5" />}
                    onClick={() => handleBlock(v.id)}
                  >
                    {isBlocked ? 'Bloqueado' : 'Bloquear'}
                  </TactileButton>
                </div>
              </div>

              {/* Devices list */}
              <div className="border-t border-slate-200 dark:border-white/10 pt-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-[#c3c5d8]">
                  Equipos Android vinculados
                </div>
                {vendorDevices.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-[#8d90a2]">
                    Sin teléfono registrado aún.
                  </p>
                ) : (
                  vendorDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-100/70 dark:bg-[#0d121c] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Smartphone
                          className={`w-4 h-4 ${
                            dev.active
                              ? 'text-[#2E9B5B] dark:text-[#00f076]'
                              : 'text-slate-400'
                          }`}
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {dev.deviceName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-[#8d90a2]">
                            {dev.lastSyncUtc
                              ? `Última sync: ${formatMexicoCityDate(dev.lastSyncUtc)} ${formatMexicoCityTime(dev.lastSyncUtc)}`
                              : 'Sin sincronizar'}
                          </div>
                        </div>
                      </div>

                      <TactileButton
                        variant={dev.active ? 'emerald' : 'info'}
                        size="sm"
                        disabled={dev.active || busyId === dev.id}
                        onClick={() => handleAuthorizeDevice(dev.id)}
                      >
                        {dev.active ? 'Equipo activo' : 'Autorizar equipo'}
                      </TactileButton>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Owners Table */}
      <div className="glass-panel rounded-lg p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Cuentas de administrador (Dueño en Windows)
        </h3>
        <div className="space-y-1.5 text-xs">
          {owners.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between py-1.5 border-b border-slate-200/70 dark:border-white/5 last:border-0"
            >
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{o.name}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="text-slate-500 dark:text-[#8d90a2]">{o.googleEmail}</span>
              </div>
              <span className="font-mono text-[#2E9B5B] dark:text-[#00f076] font-medium">
                Rol Dueño · Activa
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Real Crew Members (Encargado, Choferes y Chalanes) */}
      <div className="glass-panel rounded-lg p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Personal de ruta registrado (Encargado, Choferes y Chalanes)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {state.crewMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded bg-slate-100/70 dark:bg-[#0d121c] px-3 py-2"
            >
              <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
              <span className="font-mono uppercase text-[11px] text-[#1E5FBF] dark:text-[#71ffe5] font-semibold">
                {member.roleTitle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
