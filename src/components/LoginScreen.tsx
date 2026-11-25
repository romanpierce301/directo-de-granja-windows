import { useState, type FormEvent } from 'react';
import { Lock, LogIn, ShieldCheck } from 'lucide-react';
import { TactileButton } from './TactileButton.tsx';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('dueno@directodegranja.mx');
  const [password, setPassword] = useState('Granja2026!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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

      <div className="relative z-10 glass-panel w-full max-w-md rounded-lg p-7">
        <div>
          <h1 className="text-xl font-bold text-[#F4EFFF]">Directo de Granja</h1>
          <p className="text-xs text-[#C084FC] font-medium">«Te faltan huevos a nosotros nos sobran»</p>
          <p className="mt-1 text-xs text-[#9E8FB2]">Aplicación de Windows · Acceso exclusivo para el dueño</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
              Correo de cuenta (Rol Dueño)
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-recessed w-full rounded px-3 py-2 text-sm"
              placeholder="dueno@directodegranja.mx"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#F4EFFF] mb-1.5">
              Contraseña cifrada
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
              icon={<LogIn className="w-4 h-4" />}
            >
              {loading ? 'Validando sesión JWT...' : 'Iniciar sesión en Windows'}
            </TactileButton>
          </div>
        </form>

        <div className="mt-5 pt-4 border-t border-[#341961] flex items-start gap-2.5 text-xs text-[#9E8FB2]">
          <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
          <p>
            Sesión protegida con JWT HS256 (expira en 8 horas) y contraseñas cifradas con bcrypt. No se guardan contraseñas en el equipo.
          </p>
        </div>
      </div>
    </div>
  );
}
