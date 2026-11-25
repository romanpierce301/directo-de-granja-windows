import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import {
  formatCurrencyFromCentavos,
  formatMexicoCityDate,
  formatMexicoCityTime,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface IncidentesViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function IncidentesView({ state, onRefresh, onNotify }: IncidentesViewProps) {
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const handleReview = async (id: string) => {
    try {
      await apiClient.reviewIncident(id, notesById[id] ?? '');
      await onRefresh();
      onNotify('Incidente marcado como Revisado.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
          Incidentes de dinero (pérdida, robo o faltante)
        </h2>
        <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
          Registros inmutables: no se borran ni se editan; solo el dueño cambia el estado a Revisado y agrega una nota
        </p>
      </div>

      <div className="space-y-3">
        {state.moneyIncidents.length === 0 ? (
          <div className="glass-panel rounded-lg p-8 text-center text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            No hay incidentes de dinero reportados.
          </div>
        ) : (
          state.moneyIncidents.map((inc) => {
            const reviewed = inc.status === 'revisado';
            return (
              <div key={inc.id} className="glass-panel rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-[#E11D48] dark:text-[#F43F5E]" />
                      <span className="font-bold text-sm text-[#130824] dark:text-[#F4EFFF] capitalize">
                        {inc.type} · {inc.vendorName}
                      </span>
                      <span className="font-mono font-bold text-sm text-[#E11D48] dark:text-[#F43F5E]">
                        {formatCurrencyFromCentavos(inc.amountCentavos)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B3969] dark:text-[#D9CEEE]">
                      {inc.description}
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-[#6B5B82] dark:text-[#9E8FB2]">
                      {formatMexicoCityDate(inc.occurredAtUtc)}{' '}
                      {formatMexicoCityTime(inc.occurredAtUtc)} · Personas presentes:{' '}
                      {inc.peoplePresent.join(', ')}
                    </p>
                  </div>

                  {/* Color-changing 3D button: púrpura Reportado -> esmeralda Revisado */}
                  <TactileButton
                    variant={reviewed ? 'emerald' : 'primary'}
                    size="sm"
                    disabled={reviewed}
                    icon={
                      reviewed ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )
                    }
                    onClick={() => handleReview(inc.id)}
                  >
                    {reviewed ? 'Revisado' : 'Reportado · Marcar revisado'}
                  </TactileButton>
                </div>

                {reviewed ? (
                  <div className="rounded bg-[#10B981]/10 border border-[#10B981]/30 px-3 py-2 text-xs text-[#059669] dark:text-[#10B981]">
                    <strong>Nota del dueño:</strong> {inc.ownerNote}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={notesById[inc.id] ?? ''}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [inc.id]: e.target.value }))
                      }
                      placeholder="Agregar nota de revisión del dueño (opcional)..."
                      className="input-recessed flex-1 rounded px-3 py-1.5 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
