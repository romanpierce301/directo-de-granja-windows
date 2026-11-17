import { useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  FileText,
  PackageCheck,
  Plus,
  Scale,
  ShoppingCart,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  calculateBrandInventory,
  calculateDeliveryTotals,
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  getMexicoCityYmd,
  splitTotalGramsIntoBoxes,
  type VehicleType,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface BodegaViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
  onOpenTicket?: () => void;
}

interface ShipmentLineDraft {
  id: string;
  brandName: string;
  boxesCount: string;
  totalKg: string;
}

export function BodegaView({ state, onRefresh, onNotify, onOpenTicket }: BodegaViewProps) {
  const inventory = useMemo(
    () =>
      calculateBrandInventory(
        state.warehouseShipments,
        state.deliveries,
        state.deliveryBoxes
      ),
    [state.warehouseShipments, state.deliveries, state.deliveryBoxes]
  );

  const todayYmd = getMexicoCityYmd();
  const latestPrice =
    state.dailyPrices.find((p) => p.dateYmd === todayYmd) ?? state.dailyPrices[0];
  const defaultPricePesos = latestPrice
    ? (latestPrice.priceCentavosPerKg / 100).toFixed(2)
    : '';

  // --- Form 1: Tortón / Tráiler Intake ---
  const [vehicleType, setVehicleType] = useState<VehicleType>('torton');
  const [referenceCode, setReferenceCode] = useState('');
  const [originFarm, setOriginFarm] = useState('Granja origen');
  const [driverName, setDriverName] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [lines, setLines] = useState<ShipmentLineDraft[]>([
    { id: 'line-1', brandName: '', boxesCount: '', totalKg: '' },
  ]);
  const [savingShipment, setSavingShipment] = useState(false);

  // --- Form 2: Direct Bodega Sale ---
  const activeCustomers = useMemo(
    () => state.customers.filter((c) => !c.mergedIntoCustomerId && c.active),
    [state.customers]
  );
  const availableBrands = useMemo(
    () => inventory.filter((b) => b.boxesAvailable > 0),
    [inventory]
  );

  const [buyerMode, setBuyerMode] = useState<'nuevo' | 'existente'>('nuevo');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [saleBrand, setSaleBrand] = useState('');
  const [saleBoxesCount, setSaleBoxesCount] = useState('');
  const [weighMode, setWeighMode] = useState<'total' | 'cajas'>('total');
  const [saleTotalKg, setSaleTotalKg] = useState('');
  const [boxWeightsKg, setBoxWeightsKg] = useState<string[]>([]);
  const [pricePesos, setPricePesos] = useState(defaultPricePesos);
  const [isSpecialPrice, setIsSpecialPrice] = useState(false);
  const [paidPesos, setPaidPesos] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [savingSale, setSavingSale] = useState(false);
  const [lastCreatedFolio, setLastCreatedFolio] = useState<string | null>(null);

  const knownDrivers = useMemo(
    () =>
      Array.from(
        new Set(
          state.crewMembers
            .filter((m) => m.active && (m.roleTitle === 'chofer' || m.roleTitle === 'encargado'))
            .map((m) => m.name)
        )
      ),
    [state.crewMembers]
  );

  const totalAvailableBoxes = inventory.reduce(
    (acc, item) => acc + Math.max(0, item.boxesAvailable),
    0
  );
  const totalAvailableGrams = inventory.reduce((acc, item) => acc + item.gramsAvailable, 0);

  const bodegaSales = useMemo(
    () => state.deliveries.filter((d) => d.sourceType === 'bodega'),
    [state.deliveries]
  );

  const selectedBrandInfo = useMemo(
    () => availableBrands.find((b) => b.brandName === saleBrand) ?? availableBrands[0] ?? null,
    [availableBrands, saleBrand]
  );
  const activeSaleBrandName = selectedBrandInfo?.brandName ?? '';

  // Keep per-box weight inputs synced when weighMode === 'cajas'
  const parsedSaleBoxesCount = Number.parseInt(saleBoxesCount, 10);
  const syncBoxInputsCount = (countVal: string) => {
    setSaleBoxesCount(countVal);
    const n = Number.parseInt(countVal, 10);
    if (Number.isInteger(n) && n > 0 && n <= 200) {
      setBoxWeightsKg((prev) => {
        const next: string[] = [];
        for (let i = 0; i < n; i++) {
          next.push(prev[i] ?? '');
        }
        return next;
      });
    } else if (!countVal) {
      setBoxWeightsKg([]);
    }
  };

  // Live sale calculation preview using exact domain integer arithmetic
  const liveSalePreview = useMemo(() => {
    const count = Number.parseInt(saleBoxesCount, 10);
    const effPriceStr = pricePesos || defaultPricePesos;
    const priceCentavos = Math.round(Number(effPriceStr) * 100);
    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(priceCentavos) || priceCentavos <= 0) {
      return null;
    }
    try {
      let boxesGrams: number[];
      if (weighMode === 'cajas') {
        if (boxWeightsKg.length !== count) return null;
        boxesGrams = boxWeightsKg.map((w) => Math.round(Number(w) * 1000));
      } else {
        const tg = Math.round(Number(saleTotalKg) * 1000);
        if (!Number.isInteger(tg) || tg < count) return null;
        boxesGrams = splitTotalGramsIntoBoxes(tg, count);
      }
      return calculateDeliveryTotals(boxesGrams, priceCentavos);
    } catch {
      return null;
    }
  }, [saleBoxesCount, pricePesos, defaultPricePesos, weighMode, boxWeightsKg, saleTotalKg]);

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: `line-${Date.now()}-${prev.length}`, brandName: '', boxesCount: '', totalKg: '' },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const handleUpdateLine = (id: string, field: keyof ShipmentLineDraft, value: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleSubmitShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const prepared = lines.map((l) => ({
      brandName: l.brandName.trim(),
      boxesCount: Number.parseInt(l.boxesCount, 10),
      totalKg: Number(l.totalKg),
    }));

    if (
      prepared.some(
        (l) =>
          !l.brandName ||
          !Number.isInteger(l.boxesCount) ||
          l.boxesCount <= 0 ||
          !Number.isFinite(l.totalKg) ||
          l.totalKg <= 0
      )
    ) {
      onNotify('Complete marca, cajas enteras (> 0) y peso total en kg (> 0) en cada lote.');
      return;
    }

    setSavingShipment(true);
    try {
      await apiClient.createWarehouseShipment({
        vehicleType,
        referenceCode: referenceCode.trim(),
        originFarm: originFarm.trim() || 'Granja origen',
        driverName: driverName.trim(),
        notes: shipmentNotes.trim(),
        lines: prepared,
      });
      setReferenceCode('');
      setDriverName('');
      setShipmentNotes('');
      setLines([{ id: `line-${Date.now()}`, brandName: '', boxesCount: '', totalKg: '' }]);
      await onRefresh();
      onNotify(
        `Entrada de ${vehicleType === 'trailer' ? 'tráiler' : 'tortón'} registrada y sumada al inventario.`
      );
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setSavingShipment(false);
    }
  };

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSaleBrandName || !selectedBrandInfo) {
      onNotify('Primero registre la llegada de un tortón o tráiler con inventario disponible.');
      return;
    }
    const boxesCount = Number.parseInt(saleBoxesCount, 10);
    if (!Number.isInteger(boxesCount) || boxesCount <= 0) {
      onNotify('Ingrese una cantidad válida de cajas a vender.');
      return;
    }
    if (boxesCount > selectedBrandInfo.boxesAvailable) {
      onNotify(
        `Inventario insuficiente de ${selectedBrandInfo.brandName}: solo quedan ${selectedBrandInfo.boxesAvailable} cajas.`
      );
      return;
    }
    const effPrice = Number(pricePesos || defaultPricePesos);
    if (!Number.isFinite(effPrice) || effPrice <= 0) {
      onNotify('Capture el precio por kilo o publique el precio del día.');
      return;
    }

    let boxesGrams: number[] | undefined;
    let totalKgVal: number | undefined;
    if (weighMode === 'cajas') {
      boxesGrams = boxWeightsKg.map((w) => Math.round(Number(w) * 1000));
      if (boxesGrams.length !== boxesCount || boxesGrams.some((g) => !Number.isInteger(g) || g <= 0)) {
        onNotify(`Capture los ${boxesCount} pesos individuales en kg mayores a 0.`);
        return;
      }
    } else {
      totalKgVal = Number(saleTotalKg);
      if (!Number.isFinite(totalKgVal) || totalKgVal <= 0) {
        onNotify('Ingrese el peso total en báscula (kg) mayor a 0.');
        return;
      }
    }

    setSavingSale(true);
    try {
      const res = await apiClient.createBodegaSale({
        customerId: buyerMode === 'existente' ? selectedCustomerId : undefined,
        newCustomerName: buyerMode === 'nuevo' ? newCustomerName.trim() : undefined,
        newCustomerPhone: buyerMode === 'nuevo' ? newCustomerPhone.trim() : undefined,
        brandName: activeSaleBrandName,
        boxesCount,
        weighMode,
        totalKg: totalKgVal,
        boxesGrams,
        pricePesosPerKg: effPrice,
        isSpecialPrice,
        paidPesos: paidPesos.trim() ? Number(paidPesos) : 0,
        paymentMethod,
      });
      setLastCreatedFolio(res?.delivery?.folioFormatted ?? null);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setSaleBoxesCount('');
      setSaleTotalKg('');
      setBoxWeightsKg([]);
      setPaidPesos('');
      setIsSpecialPrice(false);
      await onRefresh();
      onNotify(
        `Venta ${res?.delivery?.folioFormatted ?? ''} registrada: -${boxesCount} cajas de ${activeSaleBrandName} descontadas del inventario.`
      );
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setSavingSale(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Bodega: Llegada de Tortón / Tráiler, Inventario y Venta Directa
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#8d90a2] mt-0.5">
            Controle por marca las cajas y kilos enviados desde granja y descuente automáticamente cada venta en bodega
          </p>
        </div>
      </div>

      {/* KPI Strip (Strict Blue / Green / Slate — zero amber or yellow) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8d90a2]">
            <span>Marcas en inventario</span>
            <Warehouse className="w-4 h-4 text-[#1d63ff]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {inventory.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#8d90a2] mt-0.5">
            {availableBrands.length} con existencia activa
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8d90a2]">
            <span>Cajas disponibles</span>
            <Boxes className="w-4 h-4 text-[#2E9B5B] dark:text-[#00f076]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#2E9B5B] dark:text-[#00f076]">
            {totalAvailableBoxes.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#8d90a2] mt-0.5">
            Stock neto listo para venta
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8d90a2]">
            <span>Peso disponible total</span>
            <Scale className="w-4 h-4 text-[#1E5FBF] dark:text-[#71ffe5]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatKgFromGrams(totalAvailableGrams)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#8d90a2] mt-0.5">
            Calculado en gramos exactos
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8d90a2]">
            <span>Viajes registrados</span>
            <Truck className="w-4 h-4 text-[#1d63ff]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {state.warehouseShipments.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#8d90a2] mt-0.5">
            {bodegaSales.length} venta(s) directa(s) en bodega
          </div>
        </div>
      </div>

      {/* Live Inventory by Egg Brand */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[#2E9B5B] dark:text-[#00f076]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Inventario actual en bodega por marca de huevo
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#8d90a2]">
            Si una entrega se cancela, sus cajas regresan automáticamente al inventario
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
                <th className="py-2.5 px-3 font-semibold">Marca de huevo</th>
                <th className="py-2.5 px-3 font-semibold text-right">Llegaron</th>
                <th className="py-2.5 px-3 font-semibold text-right">Vendidas</th>
                <th className="py-2.5 px-3 font-semibold text-right">Disponibles</th>
                <th className="py-2.5 px-3 font-semibold text-right">Peso disponible</th>
                <th className="py-2.5 px-3 font-semibold text-right">Prom. / caja</th>
                <th className="py-2.5 px-3 font-semibold text-right">Estado</th>
                <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-[#8d90a2]">
                    Aún no ha registrado llegadas de tortón o tráiler. Capture el primer viaje abajo para iniciar el inventario.
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const statusTone =
                    item.boxesAvailable <= 0
                      ? 'text-[#D64545] dark:text-[#ff334b]'
                      : item.boxesAvailable <= 10
                      ? 'text-[#1E5FBF] dark:text-[#71ffe5]'
                      : 'text-[#2E9B5B] dark:text-[#00f076]';
                  const statusText =
                    item.boxesAvailable <= 0
                      ? 'Agotado'
                      : item.boxesAvailable <= 10
                      ? 'Stock bajo'
                      : 'Disponible';
                  return (
                    <tr key={item.brandKey} className="hover:bg-[#1d63ff]/5">
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {item.brandName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-[#c3c5d8]">
                        {item.boxesArrived.toLocaleString('en-US')} cjs ({formatKgFromGrams(item.gramsArrived)})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-[#c3c5d8]">
                        {item.boxesSold.toLocaleString('en-US')} cjs ({formatKgFromGrams(item.gramsSold)})
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${statusTone}`}>
                        {item.boxesAvailable.toLocaleString('en-US')} cjs
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {formatKgFromGrams(item.gramsAvailable)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-[#8d90a2]">
                        {item.avgGramsPerBox > 0 ? formatKgFromGrams(item.avgGramsPerBox) : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${statusTone}`}>
                        {statusText}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <TactileButton
                          variant="info"
                          size="sm"
                          disabled={item.boxesAvailable <= 0}
                          onClick={() => setSaleBrand(item.brandName)}
                        >
                          Seleccionar
                        </TactileButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Split: Left = Torton/Trailer Arrival, Right = Direct Bodega Sale */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Form 1: Torton / Trailer Intake */}
        <form onSubmit={handleSubmitShipment} className="xl:col-span-6 glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#1d63ff]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Registrar llegada de Tortón o Tráiler
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <TactileButton
                variant={vehicleType === 'torton' ? 'primary' : 'neutral'}
                size="sm"
                onClick={() => setVehicleType('torton')}
              >
                Tortón
              </TactileButton>
              <TactileButton
                variant={vehicleType === 'trailer' ? 'primary' : 'neutral'}
                size="sm"
                onClick={() => setVehicleType('trailer')}
              >
                Tráiler
              </TactileButton>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Placas o remisión de viaje
              </label>
              <input
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="Ej. REM-104 / Placas ABC-123"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Granja de origen
              </label>
              <input
                value={originFarm}
                onChange={(e) => setOriginFarm(e.target.value)}
                placeholder="Granja origen"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Chofer que trajo la carga
              </label>
              <input
                list="bodega-drivers-list"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Nombre del chofer"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
              <datalist id="bodega-drivers-list">
                {knownDrivers.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Notas del viaje (opcional)
              </label>
              <input
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="Ej. Llegada matutina sin novedad"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Dynamic Brand Lots */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Marcas de huevo, cajas y peso total que llegaron
              </span>
              <TactileButton
                variant="neutral"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddLine}
              >
                Agregar marca
              </TactileButton>
            </div>

            <datalist id="known-egg-brands">
              {inventory.map((b) => (
                <option key={b.brandKey} value={b.brandName} />
              ))}
            </datalist>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const boxes = Number.parseInt(line.boxesCount, 10);
                const kg = Number(line.totalKg);
                const avg = boxes > 0 && kg > 0 ? kg / boxes : 0;
                return (
                  <div
                    key={line.id}
                    className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-[#0d121c] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8d90a2]">
                      <span className="font-mono font-bold">Lote #{index + 1}</span>
                      <div className="flex items-center gap-3">
                        {avg > 0 && (
                          <span className="font-mono text-[#1E5FBF] dark:text-[#71ffe5]">
                            Prom: {avg.toFixed(2)} kg/caja
                          </span>
                        )}
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-[#D64545] hover:opacity-80"
                            aria-label="Quitar lote"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-[#c3c5d8] mb-0.5">
                          Marca de huevo
                        </label>
                        <input
                          list="known-egg-brands"
                          value={line.brandName}
                          onChange={(e) => handleUpdateLine(line.id, 'brandName', e.target.value)}
                          placeholder="Ej. Enerhuevo"
                          required
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-[#c3c5d8] mb-0.5">
                          Cantidad de cajas
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.boxesCount}
                          onChange={(e) => handleUpdateLine(line.id, 'boxesCount', e.target.value)}
                          placeholder="Ej. 100"
                          required
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-[#c3c5d8] mb-0.5">
                          Peso total (kg)
                        </label>
                        <input
                          type="number"
                          min={0.1}
                          step="0.01"
                          value={line.totalKg}
                          onChange={(e) => handleUpdateLine(line.id, 'totalKg', e.target.value)}
                          placeholder="Ej. 2450.00"
                          required
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-1 flex justify-end">
            <TactileButton
              type="submit"
              variant="primary"
              disabled={savingShipment}
              icon={<Truck className="w-4 h-4" />}
            >
              {savingShipment ? 'Guardando carga...' : 'Registrar entrada a bodega'}
            </TactileButton>
          </div>
        </form>

        {/* Form 2: Direct Bodega Sale */}
        <form onSubmit={handleSubmitSale} className="xl:col-span-6 glass-panel rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#2E9B5B] dark:text-[#00f076]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Venta directa de huevo en bodega
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <TactileButton
                variant={buyerMode === 'nuevo' ? 'primary' : 'neutral'}
                size="sm"
                onClick={() => setBuyerMode('nuevo')}
              >
                Comprador directo
              </TactileButton>
              <TactileButton
                variant={buyerMode === 'existente' ? 'primary' : 'neutral'}
                size="sm"
                onClick={() => setBuyerMode('existente')}
              >
                Cliente registrado
              </TactileButton>
            </div>
          </div>

          {buyerMode === 'nuevo' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                  Nombre del comprador / negocio
                </label>
                <input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Ej. Sr. Pablo"
                  required
                  className="input-recessed w-full rounded px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                  Teléfono (opcional)
                </label>
                <input
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="10 dígitos"
                  className="input-recessed w-full rounded px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="text-xs">
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Seleccione cliente existente
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                required
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              >
                <option value="">-- Elegir cliente --</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Marca de huevo a descontar
              </label>
              <select
                value={activeSaleBrandName}
                onChange={(e) => setSaleBrand(e.target.value)}
                disabled={availableBrands.length === 0}
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              >
                {availableBrands.length === 0 ? (
                  <option value="">Sin inventario disponible</option>
                ) : (
                  availableBrands.map((b) => (
                    <option key={b.brandKey} value={b.brandName}>
                      {b.brandName} ({b.boxesAvailable} cajas · {formatKgFromGrams(b.gramsAvailable)})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Cajas vendidas
                {selectedBrandInfo ? ` (máx. ${selectedBrandInfo.boxesAvailable})` : ''}
              </label>
              <input
                type="number"
                min={1}
                max={selectedBrandInfo?.boxesAvailable ?? undefined}
                step={1}
                value={saleBoxesCount}
                onChange={(e) => syncBoxInputsCount(e.target.value)}
                placeholder="Ej. 40"
                required
                className="input-recessed w-full rounded px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          {/* Weigh mode: Total Scale vs Per-box */}
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 dark:text-[#c3c5d8]">
                Peso de la venta
              </span>
              <div className="flex items-center gap-1.5">
                <TactileButton
                  variant={weighMode === 'total' ? 'primary' : 'neutral'}
                  size="sm"
                  onClick={() => setWeighMode('total')}
                >
                  Peso total báscula (kg)
                </TactileButton>
                <TactileButton
                  variant={weighMode === 'cajas' ? 'primary' : 'neutral'}
                  size="sm"
                  onClick={() => setWeighMode('cajas')}
                >
                  Peso por caja
                </TactileButton>
              </div>
            </div>

            {weighMode === 'total' ? (
              <div>
                <input
                  type="number"
                  min={0.1}
                  step="0.01"
                  value={saleTotalKg}
                  onChange={(e) => setSaleTotalKg(e.target.value)}
                  placeholder="Peso total de todas las cajas vendidas en kg (ej. 980.00)"
                  required
                  className="input-recessed w-full rounded px-3 py-2 text-xs font-mono"
                />
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded bg-slate-100/60 dark:bg-[#0d121c] border border-slate-200 dark:border-white/10">
                {parsedSaleBoxesCount > 200 ? (
                  <p className="col-span-full text-[11px] text-[#D64545] dark:text-[#ffb4ab]">
                    Para más de 200 cajas use el modo "Peso total báscula (kg)".
                  </p>
                ) : boxWeightsKg.length === 0 ? (
                  <p className="col-span-full text-[11px] text-slate-500 dark:text-[#8d90a2]">
                    Indique arriba la cantidad de cajas para capturar sus pesos.
                  </p>
                ) : (
                  boxWeightsKg.map((val, idx) => (
                    <div key={idx}>
                      <label className="block text-[10px] font-mono text-slate-500 dark:text-[#8d90a2]">
                        Caja {idx + 1} (kg)
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        step="0.01"
                        value={val}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setBoxWeightsKg((prev) =>
                            prev.map((item, i) => (i === idx ? nextVal : item))
                          );
                        }}
                        placeholder="24.50"
                        required
                        className="input-recessed w-full rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Price + Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Precio por kilo ($ MXN)
              </label>
              <input
                type="number"
                min={0.5}
                step="0.01"
                value={pricePesos}
                onChange={(e) => setPricePesos(e.target.value)}
                placeholder={defaultPricePesos || 'Ej. 37.00'}
                required
                className="input-recessed w-full rounded px-3 py-2 text-xs font-mono"
              />
              <label className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8d90a2]">
                <input
                  type="checkbox"
                  checked={isSpecialPrice}
                  onChange={(e) => setIsSpecialPrice(e.target.checked)}
                />
                <span>Precio especial</span>
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Abono inicial ($ MXN)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={paidPesos}
                onChange={(e) => setPaidPesos(e.target.value)}
                placeholder="0 = crédito"
                className="input-recessed w-full rounded px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-[#c3c5d8] mb-1">
                Forma de pago
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value === 'transferencia' ? 'transferencia' : 'efectivo')
                }
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
          </div>

          {/* Exact Total Preview */}
          {liveSalePreview && (
            <div className="rounded-md border border-[#2E9B5B]/40 bg-[#2E9B5B]/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="text-slate-600 dark:text-[#c3c5d8]">
                  Peso total: <strong className="font-mono">{formatKgFromGrams(liveSalePreview.totalGrams)}</strong> ·
                  Exacto: <strong className="font-mono">{liveSalePreview.calculatedExactLabel}</strong>
                </div>
                {selectedBrandInfo && parsedSaleBoxesCount > 0 && (
                  <div className="text-[11px] text-[#1E5FBF] dark:text-[#71ffe5]">
                    Inventario tras la venta:{' '}
                    <strong>
                      {selectedBrandInfo.boxesAvailable - parsedSaleBoxesCount} cajas de {selectedBrandInfo.brandName}
                    </strong>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 dark:text-[#8d90a2]">Total a cobrar</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#2E9B5B] dark:text-[#00f076]">
                  {formatCurrencyFromCentavos(liveSalePreview.totalToChargeCentavos)}
                </div>
              </div>
            </div>
          )}

          {lastCreatedFolio && (
            <div className="rounded-md border border-[#1d63ff]/40 bg-[#1d63ff]/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#1E5FBF] dark:text-[#71ffe5] font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Venta registrada con folio {lastCreatedFolio}
              </span>
              {onOpenTicket && (
                <TactileButton
                  variant="info"
                  size="sm"
                  icon={<FileText className="w-3.5 h-3.5" />}
                  onClick={onOpenTicket}
                >
                  Ver e imprimir ticket 48mm
                </TactileButton>
              )}
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <TactileButton
              type="submit"
              variant="emerald"
              disabled={savingSale || availableBrands.length === 0}
              icon={<ShoppingCart className="w-4 h-4" />}
            >
              {savingSale ? 'Registrando venta...' : 'Confirmar venta y descontar inventario'}
            </TactileButton>
          </div>
        </form>
      </div>

      {/* Bottom History Split: Shipments Log & Direct Bodega Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Historial de tortones y tráileres recibidos
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
                  <th className="py-2 px-3">Unidad / Folio</th>
                  <th className="py-2 px-3">Origen / Chofer</th>
                  <th className="py-2 px-3">Detalle de marcas</th>
                  <th className="py-2 px-3 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
                {state.warehouseShipments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 dark:text-[#8d90a2]">
                      Sin entradas de granja registradas todavía.
                    </td>
                  </tr>
                ) : (
                  state.warehouseShipments.map((s) => (
                    <tr key={s.id} className="hover:bg-[#1d63ff]/5">
                      <td className="py-2 px-3">
                        <div className="font-bold uppercase text-[#1E5FBF] dark:text-[#71ffe5]">
                          {s.vehicleType === 'trailer' ? 'Tráiler' : 'Tortón'}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-[#c3c5d8]">
                          {s.referenceCode}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{s.originFarm}</div>
                        <div className="text-[11px] text-slate-500 dark:text-[#8d90a2]">
                          {s.driverName || 'Sin chofer capturado'}
                        </div>
                      </td>
                      <td className="py-2 px-3 space-y-0.5">
                        {s.lines.map((l) => (
                          <div key={l.id} className="font-mono text-[11px] text-slate-800 dark:text-[#e1e2ec]">
                            <strong>{l.brandName}</strong>: +{l.boxesCount} cjs ({formatKgFromGrams(l.totalGrams)})
                          </div>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500 dark:text-[#8d90a2] whitespace-nowrap">
                        {formatMexicoCityDate(s.arrivedAtUtc)}{' '}
                        {formatMexicoCityTime(s.arrivedAtUtc)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Últimas ventas directas en bodega
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-[#8d90a2]">
                  <th className="py-2 px-3">Folio</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Marca / Cajas</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
                {bodegaSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-[#8d90a2]">
                      Aún no se registran ventas directas en bodega.
                    </td>
                  </tr>
                ) : (
                  bodegaSales.map((d) => (
                    <tr key={d.id} className="hover:bg-[#1d63ff]/5">
                      <td className="py-2 px-3 font-mono font-bold text-[#1E5FBF] dark:text-[#b5c4ff]">
                        {d.folioFormatted}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{d.customerName}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-[#8d90a2]">
                          {formatMexicoCityDate(d.createdAtUtc)} {formatMexicoCityTime(d.createdAtUtc)}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px]">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {d.brandName ?? '—'}
                        </span>
                        <div className="text-slate-500 dark:text-[#8d90a2]">
                          {d.boxesCount ?? 0} cjs · {formatKgFromGrams(d.totalGrams)}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrencyFromCentavos(d.totalToChargeCentavos)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {d.status === 'vigente' ? (
                          <span className="text-[#2E9B5B] dark:text-[#00f076] font-semibold">
                            Vigente
                          </span>
                        ) : (
                          <span className="text-[#D64545] dark:text-[#ff334b] font-semibold">
                            Cancelada
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
