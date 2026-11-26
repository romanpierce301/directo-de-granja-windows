import { useEffect, useState, type FormEvent } from 'react';
import { Lock, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import { TactileButton } from './TactileButton.tsx';
import { apiClient } from '../services/apiClient.ts';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onBootstrap?: (payload: { name: string; email: string; password: string }) => Promise<void>;
}

export function LoginScreen({ onLogin, onBootstrap }: LoginScreenProps) {
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Form states - empty defaults, NO fixed passwords or hardcoded accounts
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient
      .getAuthStatus()
      .then((status) => {
        if (!mounted) return;
        if (!status.hasActiveOwner) {
          setIsBootstrap(true);
        }
      })
      .catch(() => {
        // Fallback to login mode if status check fails
      })
      .finally(() => {
        if (mounted) setCheckingStatus(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isBootstrap) {
      if (!name.trim()) {
        setError('El nombre del dueño es obligatorio.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Ingrese un correo electrónico válido.');
        return;
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }

      setLoading(true);
      try {
        if (onBootstrap) {
          await onBootstrap({ name: name.trim(), email: email.trim().toLowerCase(), password });
        } else {
          await apiClient.bootstrapOwner({ name: name.trim(), email: email.trim().toLowerCase(), password });
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    } else {
      if (!email.trim() || !password) {
        setError('Ingrese correo y contraseña.');
        return;
      }

      setLoading(true);
      try {
        await onLogin(email.trim().toLowerCase(), password);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#090312] text-[#F4EFFF] p-6 overflow-hidden">
      {/* Blurred background image behind login card */}
      <img
        src="/assets/aistudio/Gemini_Generated_Image_13e89c53.jpeg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-center blur-md scale-105"
        referrerPolicy="no-referrer"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(26, 11, 51, 0.55) 0%, rgba(9, 3, 18, 0.78) 100%)',
        }}
      />

      <div className="relative z-10 glass-panel w-full max-w-md rounded-lg p-7 shadow-2xl">
        <div>
          <h1 className="text-xl font-bold text-[#F4EFFF]">Directo de Granja</h1>
          <p className="text-xs text-[#C084FC] font-medium">«Te faltan huevos a nosotros nos sobran»</p>
          <p className="mt-1 text-xs text-[#9E8FB2]">
            {isBootstrap
              ? 'Primer Arranque · Registro Inicial del Dueño'
              : 'Aplicación de Windows · Acceso exclusivo para el dueño'}
          </p>
        </div>

        {checkingStatus ? (
          <div className="py-12 text-center text-xs text-[#9E8FB2]">
            Comprobando estado del sistema...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isBootstrap && (
              <div>
                <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
                  Nombre completo del dueño
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-recessed w-full rounded px-3 py-2 pr-9 text-sm"
                    placeholder="Ej. Don Juan Pérez"
                    autoFocus
                  />
                  <User className="w-4 h-4 text-[#9E8FB2] absolute right-3 top-2.5" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
                {isBootstrap ? 'Correo electrónico oficial del dueño' : 'Correo de cuenta (Rol Dueño)'}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-recessed w-full rounded px-3 py-2 text-sm"
                placeholder="correo@ejemplo.com"
                autoFocus={!isBootstrap}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
                {isBootstrap ? 'Contraseña maestra (mínimo 8 caracteres)' : 'Contraseña'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-recessed w-full rounded px-3 py-2 pr-9 text-sm"
                  placeholder="••••••••"
                />
                <Lock className="w-4 h-4 text-[#9E8FB2] absolute right-3 top-2.5" />
              </div>
            </div>

            {isBootstrap && (
              <div>
                <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
                  Confirmar contraseña maestra
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-recessed w-full rounded px-3 py-2 pr-9 text-sm"
                    placeholder="••••••••"
                  />
                  <Lock className="w-4 h-4 text-[#9E8FB2] absolute right-3 top-2.5" />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded border border-[#F43F5E]/60 bg-[#F43F5E]/15 px-3 py-2 text-xs text-[#F4EFFF]">
                {error}
              </div>
            )}

            <div className="pt-1 flex flex-col gap-2.5">
              <TactileButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={loading}
                icon={isBootstrap ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              >
                {loading
                  ? isBootstrap
                    ? 'Creando cuenta del dueño...'
                    : 'Validando credenciales...'
                  : isBootstrap
                    ? 'Crear cuenta del dueño e iniciar'
                    : 'Iniciar sesión en Windows'}
              </TactileButton>
            </div>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-[#341961] flex items-start gap-2.5 text-xs text-[#9E8FB2]">
          <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
          <p>
            Almacenamiento SQLite con cifrado AES-256-GCM y contraseñas hasheadas con bcrypt (costo 12).
            Sesión JWT con expiración de 8 horas. No se almacenan contraseñas legibles.
          </p>
        </div>
      </div>
    </div>
  );
}
