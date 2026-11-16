import { useMemo, useState, type FormEvent } from 'react';
import { GitMerge, Plus, Search, Wallet } from 'lucide-react';
import {
  calculateCustomerLedger,
  formatCurrencyFromCentavos,
  formatMexicoCityDate,
  formatMexicoCityTime,
  normalizeCustomerName,
  normalizePhone,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface ClientesViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function ClientesView({ state, onRefresh, onNotify }: ClientesViewProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [showNew, setShowNew] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // New customer fields
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Abono posterior fields
  const [abonoPesos, setAbonoPesos] = useState('');
  const [abonoMethod, setAbonoMethod] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [abonoNote, setAbonoNote] = useState('Abono posterior en oficina');

  // Merge duplicate customers fields
  const [primaryId, setPrimaryId] = useState('');
  const [duplicateId, setDuplicateId] = useState('');

  const activeCustomers = useMemo(
    () => state.customers.filter((c) => !c.mergedIntoCustomerId),
    [state.customers]
  );

  // Detect possible duplicates automatically
  const duplicatePairs = useMemo(() => {
    const groups = new Map<string, typeof activeCustomers>();
    for (const c of activeCustomers) {
      const key = `${normalizeCustomerName(c.businessName)}|${normalizePhone(c.phone)}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  }, [activeCustomers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCustomers.filter(
      (c) =>
        !q ||
        c.businessName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.phone.includes(q)
    );
  }, [activeCustomers, search]);

  const selectedCustomer =
    activeCustomers.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const selectedLedger = selectedCustomer
    ? calculateCustomerLedger(selectedCustomer.id, state.deliveries, state.payments)
    : null;

  const selectedDeliveries = selectedCustomer
    ? state.deliveries.filter((d) => d.customerId === selectedCustomer.id)
    : [];
  const selectedPayments = selectedCustomer
    ? state.payments.filter((p) => p.customerId === selectedCustomer.id)
    : [];

  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createCustomer({ businessName, contactName, phone, address, notes });
      setBusinessName('');
      setContactName('');
      setPhone('');
      setAddress('');
      setNotes('');
      setShowNew(false);
      await onRefresh();
      onNotify('Cliente agregado al directorio compartido.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handleRecordAbono = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await apiClient.recordCustomerPayment(selectedCustomer.id, {
        amountPesos: Number(abonoPesos),
        method: abonoMethod,
        note: abonoNote,
      });
      setAbonoPesos('');
      await onRefresh();
      onNotify(`Abono registrado en la cuenta de ${selectedCustomer.businessName}.`);
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handleMerge = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.mergeCustomers(primaryId, duplicateId);
      setShowMerge(false);
      await onRefresh();
      onNotify('Clientes duplicados unidos. Las entregas y saldos se sumaron correctamente.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Directorio de clientes y cuentas por cobrar
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
            Los saldos se calculan en tiempo real desde entregas vigentes y pagos · Nunca se editan a mano
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente o teléfono..."
              className="input-recessed rounded pl-8 pr-3 py-1.5 text-xs w-48"
            />
          </div>

          <TactileButton
            variant="info"
            size="sm"
            icon={<GitMerge className="w-3.5 h-3.5" />}
            onClick={() => {
              if (duplicatePairs[0]) {
                setPrimaryId(duplicatePairs[0][0].id);
                setDuplicateId(duplicatePairs[0][1].id);
              }
              setShowMerge((v) => !v);
            }}
          >
            Unir duplicados ({duplicatePairs.length})
          </TactileButton>

          <TactileButton
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setShowNew((v) => !v)}
          >
            Nuevo cliente
          </TactileButton>
        </div>
      </div>

      {showMerge && (
        <form
          onSubmit={handleMerge}
          className="glass-panel rounded-lg p-4 border border-[#1d63ff]/40 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Cliente principal (se conserva)
            </label>
            <select
              required
              value={primaryId}
              onChange={(e) => setPrimaryId(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            >
              <option value="">Seleccione...</option>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Cliente duplicado (se fusiona aquí)
            </label>
            <select
              required
              value={duplicateId}
              onChange={(e) => setDuplicateId(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            >
              <option value="">Seleccione...</option>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <TactileButton
            type="submit"
            variant="primary"
            size="sm"
            icon={<GitMerge className="w-3.5 h-3.5" />}
          >
            Unir y sumar saldos
          </TactileButton>
        </form>
      )}

      {showNew && (
        <form
          onSubmit={handleCreateCustomer}
          className="glass-panel rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Nombre del negocio *
            </label>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Contacto
            </label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Teléfono
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-[#c3c5d8] mb-1">
              Dirección
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <TactileButton type="submit" variant="emerald" size="sm">
            Guardar cliente
          </TactileButton>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 glass-panel rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
                <th className="py-2.5 px-4 font-semibold">Cliente</th>
                <th className="py-2.5 px-3 font-semibold">Teléfono</th>
                <th className="py-2.5 px-3 font-semibold text-right">Comprado</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pagado</th>
                <th className="py-2.5 px-4 font-semibold text-right">Saldo actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
              {filtered.map((c) => {
                const ledger = calculateCustomerLedger(c.id, state.deliveries, state.payments);
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1d63ff]/15' : 'hover:bg-[#1d63ff]/5'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {c.businessName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#8d90a2]">
                        {c.contactName || 'Sin contacto'} · {c.address || 'Sin dirección'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-[#c3c5d8]">
                      {c.phone || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-[#c3c5d8]">
                      {formatCurrencyFromCentavos(ledger.totalBoughtCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#2E9B5B] dark:text-[#00f076]">
                      {formatCurrencyFromCentavos(ledger.totalPaidCentavos)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        ledger.balanceCentavos > 0
                          ? 'text-[#D64545] dark:text-[#ff334b]'
                          : 'text-[#2E9B5B] dark:text-[#00f076]'
                      }`}
                    >
                      {formatCurrencyFromCentavos(ledger.balanceCentavos)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Account Detail & Abono Posterior */}
        <div className="xl:col-span-5 glass-panel rounded-lg p-4 space-y-4">
          {selectedCustomer && selectedLedger ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedCustomer.businessName}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#8d90a2]">
                    {selectedCustomer.notes || 'Cuenta corriente de cliente'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 dark:text-[#8d90a2]">Saldo total</div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums ${
                      selectedLedger.balanceCentavos > 0
                        ? 'text-[#D64545] dark:text-[#ff334b]'
                        : 'text-[#2E9B5B] dark:text-[#00f076]'
                    }`}
                  >
                    {formatCurrencyFromCentavos(selectedLedger.balanceCentavos)}
                  </div>
                </div>
              </div>

              {/* Registrar abono posterior */}
              {selectedLedger.balanceCentavos > 0 && (
                <form
                  onSubmit={handleRecordAbono}
                  className="rounded-md bg-slate-100/80 dark:bg-[#0d121c] p-3 space-y-2.5 border border-slate-200 dark:border-white/10"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Wallet className="w-3.5 h-3.5 text-[#1d63ff]" />
                    <span>Registrar abono posterior</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={abonoPesos}
                      onChange={(e) => setAbonoPesos(e.target.value)}
                      placeholder="Monto ($ MXN)"
                      className="input-recessed rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                    <select
                      value={abonoMethod}
                      onChange={(e) =>
                        setAbonoMethod(e.target.value as 'efectivo' | 'transferencia')
                      }
                      className="input-recessed rounded px-2.5 py-1.5 text-xs"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                  <input
                    value={abonoNote}
                    onChange={(e) => setAbonoNote(e.target.value)}
                    placeholder="Nota del abono"
                    className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                  />
                  <TactileButton type="submit" variant="emerald" size="sm" className="w-full">
                    Aplicar abono a ventas más antiguas
                  </TactileButton>
                </form>
              )}

              {/* Account History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Historial de entregas y abonos
                </h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto text-xs">
                  {selectedDeliveries.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#1E5FBF] dark:text-[#b5c4ff]">
                          {d.folioFormatted}
                        </span>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-[#c3c5d8]">
                          {formatMexicoCityDate(d.createdAtUtc)}
                        </span>
                      </div>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          d.status === 'cancelada'
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatCurrencyFromCentavos(d.totalToChargeCentavos)}
                      </span>
                    </div>
                  ))}
                  {selectedPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5 text-[#2E9B5B] dark:text-[#00f076]"
                    >
                      <div>
                        <span className="font-semibold capitalize">Pago ({p.method})</span>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className="text-[11px] opacity-80">
                          {formatMexicoCityDate(p.createdAtUtc)}{' '}
                          {formatMexicoCityTime(p.createdAtUtc)}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold">
                        -{formatCurrencyFromCentavos(p.amountCentavos)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500 dark:text-[#8d90a2] text-center py-10">
              Seleccione un cliente para consultar su cuenta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
