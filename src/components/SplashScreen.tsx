import { useEffect, useState } from 'react';
import { TactileButton } from './TactileButton.tsx';

interface SplashScreenProps {
  onComplete: () => void;
  reduceAnimations?: boolean;
}

const STEPS = [
  'Abriendo caché local y verificando integridad...',
  'Conectando con el servidor central de sincronización...',
  'Sincronizando ventas de vendedores y alertas...',
];

export function SplashScreen({ onComplete, reduceAnimations = false }: SplashScreenProps) {
  const [progress, setProgress] = useState(15);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const duration = reduceAnimations ? 350 : 1400;
    const t1 = window.setTimeout(() => {
      setProgress(58);
      setStepIdx(1);
    }, duration * 0.35);
    const t2 = window.setTimeout(() => {
      setProgress(92);
      setStepIdx(2);
    }, duration * 0.72);
    const t3 = window.setTimeout(() => {
      setProgress(100);
      onComplete();
    }, duration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete, reduceAnimations]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090312] text-[#F4EFFF] p-6">
      <div className="glass-panel w-full max-w-md rounded-lg p-8 text-center">
        <div className="mx-auto w-72 aspect-[3/2] rounded-xl overflow-hidden bg-[#0b0e15] border border-white/15 flex items-center justify-center shadow-lg">
          <img
            src="/assets/aistudio/Gemini_Generated_Image_13e89c53.jpeg"
            alt="Directo de Granja"
            className="w-full h-full object-cover object-center"
            referrerPolicy="no-referrer"
          />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">
          DIRECTO DE GRANJA
        </h1>
        <p className="mt-1 text-sm text-[#C084FC] font-medium">
          «Te faltan huevos a nosotros nos sobran»
        </p>
        <p className="mt-1 text-xs text-[#9E8FB2]">
          Consola del Dueño para Windows
        </p>

        <div className="mt-6">
          <div className="h-2.5 w-full rounded bg-[#0b0e15] border border-[#341961] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8A2BE2] to-[#00e5c9] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-[#9E8FB2]">
            <span>{STEPS[stepIdx]}</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
        </div>

        <div className="mt-6">
          <TactileButton variant="neutral" size="sm" onClick={onComplete}>
            Entrar ahora
          </TactileButton>
        </div>
      </div>
    </div>
  );
}
