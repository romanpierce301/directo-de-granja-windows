import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';
import { TactileButton } from './TactileButton.tsx';

export type NavTab =
  | 'panel'
  | 'bodega'
  | 'vendedores'
  | 'precio'
  | 'entregas'
  | 'clientes'
  | 'mermas'
  | 'incidentes'
  | 'cierre'
  | 'excel'
  | 'sistema';

interface TourStep {
  tab: NavTab;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    tab: 'panel',
    title: 'Panel general en tiempo real',
    description:
      'Vea de un vistazo lo vendido, cobrado, saldo por cobrar y las últimas sincronizaciones de cada vendedor en la calle.',
  },
  {
    tab: 'bodega',
    title: 'Bodega: Tortón, Tráiler e Inventario',
    description:
      'Registre la llegada de huevo por marca, cajas y peso total desde la granja, y realice ventas directas en bodega con descuento automático del inventario.',
  },
  {
    tab: 'vendedores',
    title: 'Aprobación de vendedores y folios',
    description:
      'Apruebe cuentas nuevas, asigne su serie única de folios (A, B, C...) y autorice un único teléfono activo por vendedor.',
  },
  {
    tab: 'precio',
    title: 'Precio del día centralizado',
    description:
      'Publique el precio por kilo de hoy y todas las apps Android lo recibirán al instante para calcular cada entrega sin errores.',
  },
  {
    tab: 'entregas',
    title: 'Entregas, bitácora y ticket 48mm',
    description:
      'Inspeccione cajas, verifique transferencias bancarias e imprima el ticket térmico de 48mm idéntico a la plantilla del negocio.',
  },
  {
    tab: 'cierre',
    title: 'Cierre general sin cuentas a mano',
    description:
      'Compare efectivo cobrado menos incidentes contra el efectivo entregado físicamente para detectar diferencias al instante.',
  },
  {
    tab: 'excel',
    title: 'Importación y exportación segura en Excel',
    description:
      'Cargue clientes con vista previa de duplicados en azul y errores en rojo, y exporte respaldos protegidos contra fórmulas maliciosas.',
  },
];

interface GuidedTourProps {
  onSelectTab: (tab: NavTab) => void;
  onClose: () => void;
}

export function GuidedTour({ onSelectTab, onClose }: GuidedTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const current = TOUR_STEPS[stepIndex];

  const goTo = (idx: number) => {
    setStepIndex(idx);
    onSelectTab(TOUR_STEPS[idx].tab);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[390px] max-w-[calc(100vw-2rem)] glass-panel rounded-lg p-5 border border-[#1d63ff]/50 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono text-[#71ffe5]">
            Recorrido guiado · Paso {stepIndex + 1} de {TOUR_STEPS.length}
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
            {current.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-slate-500 dark:text-[#8d90a2]"
          aria-label="Cerrar recorrido"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-[#c3c5d8]">
        {current.description}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <TactileButton variant="neutral" size="sm" onClick={onClose}>
          Saltar
        </TactileButton>

        <div className="flex items-center gap-2">
          <TactileButton
            variant="neutral"
            size="sm"
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            disabled={stepIndex === 0}
            onClick={() => goTo(stepIndex - 1)}
          >
            Anterior
          </TactileButton>
          {stepIndex < TOUR_STEPS.length - 1 ? (
            <TactileButton
              variant="primary"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => goTo(stepIndex + 1)}
            >
              Siguiente
            </TactileButton>
          ) : (
            <TactileButton
              variant="emerald"
              size="sm"
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              onClick={onClose}
            >
              Finalizar
            </TactileButton>
          )}
        </div>
      </div>
    </div>
  );
}
