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
  const [newSpecialPrice, setNewSpecialPrice] = useState('');
  const [newCreditDays, setNewCreditDays] = useState('');

  // Edit customer special price & credit term fields
  const [editingCustId, setEditingCustId] = useState<string | null>(null);
  const [editSpecialPrice, setEditSpecialPrice] = useState('');
  const [editCreditDays, setEditCreditDays] = useState('');

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
      await apiClient.createCustomer({
        businessName,
        contactName,
        phone,
        address,
        notes,
        specialPricePesosPerKg: newSpecialPrice.trim() ? Number(newSpecialPrice) : null,
        creditTermDays: newCreditDays.trim() ? Number(newCreditDays) : null,
      });
      setBusinessName('');
      setContactName('');
      setPhone('');
      setAddress('');
      setNotes('');
      setNewSpecialPrice('');
      setNewCreditDays('');
      setShowNew(false);
      await onRefresh();
      onNotify('Cliente agregado al directorio compartido y sincronizado con ruta.');
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  const handleSaveCustomerTerms = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await apiClient.updateCustomer(selectedCustomer.id, {
        specialPricePesosPerKg: editSpecialPrice.trim() ? Number(editSpecialPrice) : null,
        creditTermDays: editCreditDays.trim() ? Number(editCreditDays) : null,
      });
      setEditingCustId(null);
      await onRefresh();
      onNotify(`Tarifa y plazo actualizados para ${selectedCustomer.businessName}.`);
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
          <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
            Directorio de clientes y cuentas por cobrar
          </h2>
          <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            Los saldos se calculan en tiempo real desde entregas vigentes y pagos · Nunca se editan a mano
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7A6B8F] dark:text-[#9E8FB2] absolute left-2.5 top-2.5" />
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
          className="glass-panel rounded-lg p-4 border border-[#8A2BE2]/50 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
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
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
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
          className="glass-panel rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
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
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Contacto
            </label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Teléfono
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
              Dirección
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input-recessed w-full rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
                Tarifa esp. ($/kg)
              </label>
              <input
                type="number"
                min={0.5}
                step="0.01"
                placeholder="Global"
                value={newSpecialPrice}
                onChange={(e) => setNewSpecialPrice(e.target.value)}
                className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6B5B82] dark:text-[#D9CEEE] mb-1">
                Crédito (días)
              </label>
              <input
                type="number"
                min={0}
                max={3650}
                step={1}
                placeholder="7"
                value={newCreditDays}
                onChange={(e) => setNewCreditDays(e.target.value)}
                className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
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
              <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                <th className="py-2.5 px-4 font-semibold">Cliente</th>
                <th className="py-2.5 px-3 font-semibold">Teléfono</th>
                <th className="py-2.5 px-3 font-semibold text-right">Comprado</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pagado</th>
                <th className="py-2.5 px-4 font-semibold text-right">Saldo actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFD7EE]/80 dark:divide-[#341961]">
              {filtered.map((c) => {
                const ledger = calculateCustomerLedger(c.id, state.deliveries, state.payments);
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#8A2BE2]/15 dark:bg-[#8A2BE2]/25' : 'hover:bg-[#8A2BE2]/8'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#130824] dark:text-[#F4EFFF]">
                        {c.businessName}
                      </div>
                      <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                        {c.contactName || 'Sin contacto'} · {c.address || 'Sin dirección'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#4B3969] dark:text-[#D9CEEE]">
                      {c.phone || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#4B3969] dark:text-[#D9CEEE]">
                      {formatCurrencyFromCentavos(ledger.totalBoughtCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669] dark:text-[#10B981]">
                      {formatCurrencyFromCentavos(ledger.totalPaidCentavos)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        ledger.balanceCentavos > 0
                          ? 'text-[#E11D48] dark:text-[#F43F5E]'
                          : 'text-[#059669] dark:text-[#10B981]'
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
                  <h3 className="text-base font-bold text-[#130824] dark:text-[#F4EFFF]">
                    {selectedCustomer.businessName}
                  </h3>
                  <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
                    {selectedCustomer.notes || 'Cuenta corriente de cliente'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">Saldo total</div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums ${
                      selectedLedger.balanceCentavos > 0
                        ? 'text-[#E11D48] dark:text-[#F43F5E]'
                        : 'text-[#059669] dark:text-[#10B981]'
                    }`}
                  >
                    {formatCurrencyFromCentavos(selectedLedger.balanceCentavos)}
                  </div>
                </div>
              </div>

              {/* Special tariff & credit term (synced in real time with Android) */}
              <div className="pos-subpanel rounded-md p-3 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-[#D97706] dark:text-[#F59E0B]">
                      {selectedCustomer.specialPriceCentavosPerKg
                        ? `Tarifa especial: ${formatCurrencyFromCentavos(selectedCustomer.specialPriceCentavosPerKg, true)}/kg`
                        : 'Tarifa: Precio global del día'}
                    </span>
                    <span className="text-[#9E8FB2]">·</span>
                    <span className="font-mono text-[#4B3969] dark:text-[#D9CEEE]">
                      Plazo: {selectedCustomer.creditTermDays ?? 7} días
                    </span>
                  </div>
                  <TactileButton
                    variant="neutral"
                    size="sm"
                    onClick={() => {
                      if (editingCustId === selectedCustomer.id) {
                        setEditingCustId(null);
                      } else {
                        setEditingCustId(selectedCustomer.id);
                        setEditSpecialPrice(
                          selectedCustomer.specialPriceCentavosPerKg
                            ? (selectedCustomer.specialPriceCentavosPerKg / 100).toFixed(2)
                            : ''
                        );
                        setEditCreditDays(
                          selectedCustomer.creditTermDays !== null &&
                            selectedCustomer.creditTermDays !== undefined
                            ? String(selectedCustomer.creditTermDays)
                            : ''
                        );
                      }
                    }}
                  >
                    {editingCustId === selectedCustomer.id ? 'Cerrar' : 'Editar tarifa / plazo'}
                  </TactileButton>
                </div>

                {editingCustId === selectedCustomer.id && (
                  <form onSubmit={handleSaveCustomerTerms} className="grid grid-cols-3 gap-2 items-end pt-1">
                    <div>
                      <label className="block text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mb-1">
                        Tarifa especial ($/kg)
                      </label>
                      <input
                        type="number"
                        min={0.5}
                        step="0.01"
                        placeholder="Vacío = global"
                        value={editSpecialPrice}
                        onChange={(e) => setEditSpecialPrice(e.target.value)}
                        className="input-recessed w-full rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mb-1">
                        Plazo (días)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={3650}
                        step={1}
                        placeholder="7"
                        value={editCreditDays}
                        onChange={(e) => setEditCreditDays(e.target.value)}
                        className="input-recessed w-full rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <TactileButton type="submit" variant="primary" size="sm">
                      Guardar cambios
                    </TactileButton>
                  </form>
                )}
              </div>

              {/* Registrar abono posterior */}
              {selectedLedger.balanceCentavos > 0 && (
                <form
                  onSubmit={handleRecordAbono}
                  className="pos-subpanel rounded-md p-3 space-y-2.5"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                    <Wallet className="w-3.5 h-3.5 text-[#8A2BE2] dark:text-[#C084FC]" />
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
                <h4 className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                  Historial de entregas y abonos
                </h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto text-xs">
                  {selectedDeliveries.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between py-1.5 border-b border-[#DFD7EE]/80 dark:border-[#341961]"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#7C3AED] dark:text-[#C084FC]">
                          {d.folioFormatted}
                        </span>
                        <span className="mx-1.5 text-[#9E8FB2]">·</span>
                        <span className="text-[#4B3969] dark:text-[#D9CEEE]">
                          {formatMexicoCityDate(d.createdAtUtc)}
                        </span>
                      </div>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          d.status === 'cancelada'
                            ? 'line-through text-[#9E8FB2]'
                            : 'text-[#130824] dark:text-[#F4EFFF]'
                        }`}
                      >
                        {formatCurrencyFromCentavos(d.totalToChargeCentavos)}
                      </span>
                    </div>
                  ))}
                  {selectedPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-1.5 border-b border-[#DFD7EE]/80 dark:border-[#341961] text-[#059669] dark:text-[#10B981]"
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
            <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] text-center py-10">
              Seleccione un cliente para consultar su cuenta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
