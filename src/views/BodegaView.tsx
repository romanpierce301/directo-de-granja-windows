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
  BOX_TARE_GRAMS,
  HALF_BOX_TARE_GRAMS,
  calculateBrandInventory,
  calculateDeliveryTotals,
  calculateSugarLineSubtotalCentavos,
  deductCartonTareFromPerBoxWeights,
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  getMexicoCityYmd,
  isValidHalfUnitCount,
  roundHalfUnits,
  splitTotalGramsIntoHalfAwareBoxes,
  type BodegaProductType,
  type VehicleType,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';
import { useEggOverlay } from '../components/EggOverlayProvider.tsx';

interface BodegaViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
  onOpenTicket?: () => void;
}

interface ShipmentLineDraft {
  id: string;
  productType: BodegaProductType;
  brandName: string;
  boxesCount: string;
  weightPerBultoKg: string;
  totalKg: string;
}

interface SaleItemDraft {
  id: string;
  productType: BodegaProductType;
  brandName: string;
  fullBoxes: string;
  halfBoxes: string;
  weighMode: 'total' | 'cajas';
  totalKg: string;
  fullBoxesGrossKg: string[];
  halfBoxesGrossKg: string[];
  pricePesosPerKg: string;
  isSpecialPrice: boolean;
  bultosCount: string;
  weightPerBultoKg: string;
  pricePerBultoPesos: string;
}

function createEmptyEggSaleItem(defaultBrandName: string, defaultPricePesos: string): SaleItemDraft {
  return {
    id: `sale-egg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productType: 'huevo',
    brandName: defaultBrandName,
    fullBoxes: '',
    halfBoxes: '0',
    weighMode: 'total',
    totalKg: '',
    fullBoxesGrossKg: [],
    halfBoxesGrossKg: [],
    pricePesosPerKg: defaultPricePesos,
    isSpecialPrice: false,
    bultosCount: '',
    weightPerBultoKg: '',
    pricePerBultoPesos: '',
  };
}

function createEmptySugarSaleItem(defaultSugarName: string, defaultWeightKg: string): SaleItemDraft {
  return {
    id: `sale-sugar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productType: 'azucar',
    brandName: defaultSugarName,
    fullBoxes: '',
    halfBoxes: '0',
    weighMode: 'total',
    totalKg: '',
    fullBoxesGrossKg: [],
    halfBoxesGrossKg: [],
    pricePesosPerKg: '',
    isSpecialPrice: false,
    bultosCount: '',
    weightPerBultoKg: defaultWeightKg,
    pricePerBultoPesos: '',
  };
}

function resizeStringArray(prev: string[], targetLength: number): string[] {
  if (targetLength <= 0) return [];
  const next: string[] = [];
  for (let i = 0; i < targetLength; i++) {
    next.push(prev[i] ?? '');
  }
  return next;
}

export function BodegaView({ state, onRefresh, onNotify, onOpenTicket }: BodegaViewProps) {
  const { runWithOverlay } = useEggOverlay();
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
    {
      id: 'line-1',
      productType: 'huevo',
      brandName: '',
      boxesCount: '',
      weightPerBultoKg: '',
      totalKg: '',
    },
  ]);
  const [savingShipment, setSavingShipment] = useState(false);

  // --- Form 2: Direct Multi-Item Bodega Sale ---
  const activeCustomers = useMemo(
    () => state.customers.filter((c) => !c.mergedIntoCustomerId && c.active),
    [state.customers]
  );
  const availableEggs = useMemo(
    () => inventory.filter((b) => b.productType === 'huevo' && b.boxesAvailable > 0),
    [inventory]
  );
  const availableSugar = useMemo(
    () => inventory.filter((b) => b.productType === 'azucar' && b.boxesAvailable > 0),
    [inventory]
  );

  const [buyerMode, setBuyerMode] = useState<'nuevo' | 'existente'>('nuevo');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItemDraft[]>(() => [
    createEmptyEggSaleItem('', defaultPricePesos),
  ]);
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

  const knownEggBrands = useMemo(
    () => inventory.filter((b) => b.productType === 'huevo'),
    [inventory]
  );
  const knownSugarProducts = useMemo(
    () => inventory.filter((b) => b.productType === 'azucar'),
    [inventory]
  );

  const totalAvailableEggBoxes = roundHalfUnits(
    availableEggs.reduce((acc, item) => acc + Math.max(0, item.boxesAvailable), 0)
  );
  const totalAvailableSugarBultos = availableSugar.reduce(
    (acc, item) => acc + Math.max(0, item.boxesAvailable),
    0
  );
  const totalAvailableGrams = inventory.reduce((acc, item) => acc + item.gramsAvailable, 0);

  const bodegaSales = useMemo(
    () => state.deliveries.filter((d) => d.sourceType === 'bodega'),
    [state.deliveries]
  );

  // Live calculation preview per item + combined grand total
  const itemPreviews = useMemo(() => {
    return saleItems.map((item) => {
      if (item.productType === 'azucar') {
        const selectedSugar =
          availableSugar.find((s) => s.brandName === item.brandName) ?? availableSugar[0] ?? null;
        const bultos = Number.parseInt(item.bultosCount, 10);
        const weightKg = Number(item.weightPerBultoKg);
        const pricePesos = Number(item.pricePerBultoPesos);
        const weightGramsPerBulto = Math.round(weightKg * 1000);
        const priceCentavos = Math.round(pricePesos * 100);
        if (
          !selectedSugar ||
          !Number.isInteger(bultos) ||
          bultos <= 0 ||
          !Number.isFinite(weightKg) ||
          weightGramsPerBulto <= 0 ||
          !Number.isFinite(pricePesos) ||
          priceCentavos <= 0
        ) {
          return {
            valid: false as const,
            resolvedBrandName: selectedSugar?.brandName ?? '',
            stock: selectedSugar,
            quantity: Number.isInteger(bultos) && bultos > 0 ? bultos : 0,
            tareGrams: 0,
            totalGrams: 0,
            subtotalCentavos: 0,
          };
        }
        const totalGrams = bultos * weightGramsPerBulto;
        const subtotalCentavos = calculateSugarLineSubtotalCentavos(bultos, priceCentavos);
        return {
          valid: true as const,
          resolvedBrandName: selectedSugar.brandName,
          stock: selectedSugar,
          quantity: bultos,
          tareGrams: 0,
          totalGrams,
          subtotalCentavos,
        };
      }

      const selectedEgg =
        availableEggs.find((b) => b.brandName === item.brandName) ?? availableEggs[0] ?? null;
      const fullBoxes = item.fullBoxes.trim() === '' ? 0 : Number.parseInt(item.fullBoxes, 10);
      const halfBoxes = item.halfBoxes.trim() === '' ? 0 : Number.parseInt(item.halfBoxes, 10);
      const effPriceStr = item.pricePesosPerKg || defaultPricePesos;
      const priceCentavos = Math.round(Number(effPriceStr) * 100);
      const qty =
        Number.isInteger(fullBoxes) &&
        fullBoxes >= 0 &&
        Number.isInteger(halfBoxes) &&
        halfBoxes >= 0
          ? roundHalfUnits(fullBoxes + halfBoxes * 0.5)
          : 0;

      if (
        !selectedEgg ||
        !Number.isInteger(fullBoxes) ||
        fullBoxes < 0 ||
        !Number.isInteger(halfBoxes) ||
        halfBoxes < 0 ||
        fullBoxes + halfBoxes <= 0 ||
        !Number.isInteger(priceCentavos) ||
        priceCentavos <= 0
      ) {
        return {
          valid: false as const,
          resolvedBrandName: selectedEgg?.brandName ?? '',
          stock: selectedEgg,
          quantity: qty,
          tareGrams: 0,
          totalGrams: 0,
          subtotalCentavos: 0,
        };
      }

      try {
        let netBoxesGrams: number[];
        let tareGrams = 0;
        if (item.weighMode === 'cajas') {
          if (
            item.fullBoxesGrossKg.length !== fullBoxes ||
            item.halfBoxesGrossKg.length !== halfBoxes
          ) {
            return {
              valid: false as const,
              resolvedBrandName: selectedEgg.brandName,
              stock: selectedEgg,
              quantity: qty,
              tareGrams: 0,
              totalGrams: 0,
              subtotalCentavos: 0,
            };
          }
          const grossFull = item.fullBoxesGrossKg.map((w) => Math.round(Number(w) * 1000));
          const grossHalf = item.halfBoxesGrossKg.map((w) => Math.round(Number(w) * 1000));
          const tareRes = deductCartonTareFromPerBoxWeights(grossFull, grossHalf);
          netBoxesGrams = tareRes.netBoxesGrams;
          tareGrams = tareRes.tareGrams;
        } else {
          const tg = Math.round(Number(item.totalKg) * 1000);
          if (!Number.isInteger(tg) || tg <= 0) {
            return {
              valid: false as const,
              resolvedBrandName: selectedEgg.brandName,
              stock: selectedEgg,
              quantity: qty,
              tareGrams: 0,
              totalGrams: 0,
              subtotalCentavos: 0,
            };
          }
          netBoxesGrams = splitTotalGramsIntoHalfAwareBoxes(tg, fullBoxes, halfBoxes);
        }
        const calc = calculateDeliveryTotals(netBoxesGrams, priceCentavos);
        return {
          valid: true as const,
          resolvedBrandName: selectedEgg.brandName,
          stock: selectedEgg,
          quantity: qty,
          tareGrams,
          totalGrams: calc.totalGrams,
          subtotalCentavos: calc.totalToChargeCentavos,
          calculatedExactLabel: calc.calculatedExactLabel,
        };
      } catch {
        return {
          valid: false as const,
          resolvedBrandName: selectedEgg.brandName,
          stock: selectedEgg,
          quantity: qty,
          tareGrams: 0,
          totalGrams: 0,
          subtotalCentavos: 0,
        };
      }
    });
  }, [saleItems, availableEggs, availableSugar, defaultPricePesos]);

  const liveGrandTotal = useMemo(() => {
    if (itemPreviews.length === 0 || itemPreviews.some((p) => !p.valid)) return null;
    const totalGrams = itemPreviews.reduce((acc, p) => acc + p.totalGrams, 0);
    const totalTareGrams = itemPreviews.reduce((acc, p) => acc + p.tareGrams, 0);
    const totalToChargeCentavos = itemPreviews.reduce((acc, p) => acc + p.subtotalCentavos, 0);
    return { totalGrams, totalTareGrams, totalToChargeCentavos };
  }, [itemPreviews]);

  // --- Handlers: Form 1 (Shipments) ---
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        productType: 'huevo',
        brandName: '',
        boxesCount: '',
        weightPerBultoKg: '',
        totalKg: '',
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const handleUpdateLine = (id: string, patch: Partial<ShipmentLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleSubmitShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const prepared = lines.map((l) => {
      const boxesCount = roundHalfUnits(Number(l.boxesCount));
      const weightPerBultoKg = Number(l.weightPerBultoKg);
      const totalKg =
        l.productType === 'azucar' && Number.isFinite(weightPerBultoKg) && weightPerBultoKg > 0
          ? boxesCount * weightPerBultoKg
          : Number(l.totalKg);
      return {
        productType: l.productType,
        brandName: l.brandName.trim(),
        boxesCount,
        weightPerBultoKg: l.productType === 'azucar' ? weightPerBultoKg : undefined,
        totalKg,
      };
    });

    for (const l of prepared) {
      const validQty =
        l.productType === 'azucar'
          ? Number.isInteger(l.boxesCount) && l.boxesCount > 0
          : isValidHalfUnitCount(l.boxesCount);
      if (!l.brandName || !validQty || !Number.isFinite(l.totalKg) || l.totalKg <= 0) {
        onNotify(
          l.productType === 'azucar'
            ? 'Complete producto de azúcar, bultos enteros (> 0) y peso por bulto (> 0).'
            : 'Complete marca de huevo, cajas (> 0, permite medias cajas 0.5) y peso total en kg (> 0).'
        );
        return;
      }
    }

    setSavingShipment(true);
    try {
      const ok = await runWithOverlay(async () => {
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
        setLines([
          {
            id: `line-${Date.now()}`,
            productType: 'huevo',
            brandName: '',
            boxesCount: '',
            weightPerBultoKg: '',
            totalKg: '',
          },
        ]);
        await onRefresh();
        return true;
      }, { loading: 'Registrando entrada de camión (Folio E)...', success: 'Se han sumado mis huevitos también', error: 'Se están atorando mis huevos' });

      if (ok) {
        onNotify(
          `Entrada de ${vehicleType === 'trailer' ? 'tráiler' : 'tortón'} registrada con folio E e inventario actualizado.`
        );
      }
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setSavingShipment(false);
    }
  };

  // --- Handlers: Form 2 (Multi-Item Bodega Sale) ---
  const handleAddEggSaleItem = () => {
    setSaleItems((prev) => [
      ...prev,
      createEmptyEggSaleItem(availableEggs[0]?.brandName ?? '', defaultPricePesos),
    ]);
  };

  const handleAddSugarSaleItem = () => {
    const firstSugar = availableSugar[0];
    const avgKg =
      firstSugar && firstSugar.avgGramsPerBox > 0
        ? (firstSugar.avgGramsPerBox / 1000).toFixed(2)
        : '';
    setSaleItems((prev) => [
      ...prev,
      createEmptySugarSaleItem(firstSugar?.brandName ?? '', avgKg),
    ]);
  };

  const handleRemoveSaleItem = (id: string) => {
    setSaleItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  };

  const handleUpdateSaleItem = (id: string, patch: Partial<SaleItemDraft>) => {
    setSaleItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (availableEggs.length === 0 && availableSugar.length === 0) {
      onNotify('Primero registre la llegada de mercancía con inventario disponible.');
      return;
    }

    const payloadItems: Parameters<typeof apiClient.createBodegaSale>[0]['items'] = [];
    const requestedTotals = new Map<string, { label: string; unit: string; req: number; avail: number }>();

    for (let i = 0; i < saleItems.length; i++) {
      const item = saleItems[i];
      if (item.productType === 'azucar') {
        const selectedSugar =
          availableSugar.find((s) => s.brandName === item.brandName) ?? availableSugar[0];
        if (!selectedSugar) {
          onNotify(`Azúcar #${i + 1}: no hay bultos de azúcar disponibles en inventario.`);
          return;
        }
        const bultosCount = Number.parseInt(item.bultosCount, 10);
        const weightPerBultoKg = Number(item.weightPerBultoKg);
        const pricePerBultoPesos = Number(item.pricePerBultoPesos);
        if (!Number.isInteger(bultosCount) || bultosCount <= 0) {
          onNotify(`Azúcar #${i + 1}: ingrese una cantidad válida de bultos (> 0).`);
          return;
        }
        if (!Number.isFinite(weightPerBultoKg) || weightPerBultoKg <= 0) {
          onNotify(`Azúcar #${i + 1}: ingrese el peso por bulto en kg (> 0).`);
          return;
        }
        if (!Number.isFinite(pricePerBultoPesos) || pricePerBultoPesos <= 0) {
          onNotify(`Azúcar #${i + 1}: ingrese el precio por bulto (> $0).`);
          return;
        }

        const prev = requestedTotals.get(selectedSugar.brandKey);
        const sumReq = (prev?.req ?? 0) + bultosCount;
        requestedTotals.set(selectedSugar.brandKey, {
          label: selectedSugar.brandName,
          unit: 'bultos',
          req: sumReq,
          avail: selectedSugar.boxesAvailable,
        });

        payloadItems.push({
          productType: 'azucar',
          brandName: selectedSugar.brandName,
          bultosCount,
          weightPerBultoKg,
          pricePerBultoPesos,
        });
      } else {
        const selectedEgg =
          availableEggs.find((b) => b.brandName === item.brandName) ?? availableEggs[0];
        if (!selectedEgg) {
          onNotify(`Huevo #${i + 1}: no hay marcas de huevo disponibles en inventario.`);
          return;
        }
        const fullBoxes = item.fullBoxes.trim() === '' ? 0 : Number.parseInt(item.fullBoxes, 10);
        const halfBoxes = item.halfBoxes.trim() === '' ? 0 : Number.parseInt(item.halfBoxes, 10);
        if (
          !Number.isInteger(fullBoxes) ||
          fullBoxes < 0 ||
          !Number.isInteger(halfBoxes) ||
          halfBoxes < 0 ||
          fullBoxes + halfBoxes <= 0
        ) {
          onNotify(`Huevo #${i + 1}: capture al menos 1 caja completa o 1 media caja.`);
          return;
        }
        const qty = roundHalfUnits(fullBoxes + halfBoxes * 0.5);
        const prev = requestedTotals.get(selectedEgg.brandKey);
        const sumReq = roundHalfUnits((prev?.req ?? 0) + qty);
        requestedTotals.set(selectedEgg.brandKey, {
          label: selectedEgg.brandName,
          unit: 'cajas',
          req: sumReq,
          avail: selectedEgg.boxesAvailable,
        });

        const effPrice = Number(item.pricePesosPerKg || defaultPricePesos);
        if (!Number.isFinite(effPrice) || effPrice <= 0) {
          onNotify(`Huevo #${i + 1}: capture el precio por kilo para ${selectedEgg.brandName}.`);
          return;
        }

        if (item.weighMode === 'cajas') {
          const fullGrossGrams = item.fullBoxesGrossKg.map((w) => Math.round(Number(w) * 1000));
          const halfGrossGrams = item.halfBoxesGrossKg.map((w) => Math.round(Number(w) * 1000));
          if (fullGrossGrams.length !== fullBoxes || halfGrossGrams.length !== halfBoxes) {
            onNotify(
              `Huevo #${i + 1}: capture todos los pesos de caja completa y media caja.`
            );
            return;
          }
          try {
            deductCartonTareFromPerBoxWeights(fullGrossGrams, halfGrossGrams);
          } catch (err) {
            onNotify(`Huevo #${i + 1}: ${(err as Error).message}`);
            return;
          }
          payloadItems.push({
            productType: 'huevo',
            brandName: selectedEgg.brandName,
            fullBoxes,
            halfBoxes,
            weighMode: 'cajas',
            fullBoxesGrossGrams: fullGrossGrams,
            halfBoxesGrossGrams: halfGrossGrams,
            pricePesosPerKg: effPrice,
            isSpecialPrice: item.isSpecialPrice,
          });
        } else {
          const totalKgVal = Number(item.totalKg);
          if (!Number.isFinite(totalKgVal) || totalKgVal <= 0) {
            onNotify(`Huevo #${i + 1}: ingrese el peso total en báscula (kg) mayor a 0.`);
            return;
          }
          payloadItems.push({
            productType: 'huevo',
            brandName: selectedEgg.brandName,
            fullBoxes,
            halfBoxes,
            weighMode: 'total',
            totalKg: totalKgVal,
            pricePesosPerKg: effPrice,
            isSpecialPrice: item.isSpecialPrice,
          });
        }
      }
    }

    for (const check of requestedTotals.values()) {
      if (check.req > check.avail + 1e-6) {
        onNotify(
          `Inventario insuficiente de ${check.label}: solo quedan ${check.avail} ${check.unit} y solicitó ${check.req}.`
        );
        return;
      }
    }

    setSavingSale(true);
    try {
      const saleRes = await runWithOverlay(async () => {
        const res = await apiClient.createBodegaSale({
          customerId: buyerMode === 'existente' ? selectedCustomerId : undefined,
          newCustomerName: buyerMode === 'nuevo' ? newCustomerName.trim() : undefined,
          newCustomerPhone: buyerMode === 'nuevo' ? newCustomerPhone.trim() : undefined,
          items: payloadItems,
          paidPesos: paidPesos.trim() ? Number(paidPesos) : 0,
          paymentMethod,
        });
        setLastCreatedFolio(res?.delivery?.folioFormatted ?? null);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setSaleItems([createEmptyEggSaleItem('', defaultPricePesos)]);
        setPaidPesos('');
        await onRefresh();
        return res;
      }, { loading: 'Guardando venta y descuento en bodega...', success: 'Se han sumado mis huevitos también', error: 'Se están atorando mis huevos' });

      if (saleRes) {
        onNotify(
          `Venta ${saleRes?.delivery?.folioFormatted ?? ''} registrada e inventario descontado atómicamente.`
        );
      }
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
          <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
            Bodega: Llegada de Tortón / Tráiler, Inventario y Venta Directa
          </h2>
          <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            Controle por marca las cajas o medias cajas de huevo y bultos de azúcar, descontando automáticamente cada venta del inventario
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Productos en inventario</span>
            <Warehouse className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#130824] dark:text-[#F4EFFF]">
            {inventory.length}
          </div>
          <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            {availableEggs.length} huevo · {availableSugar.length} azúcar con stock
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Existencias disponibles</span>
            <Boxes className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#059669] dark:text-[#10B981]">
            {totalAvailableEggBoxes.toLocaleString('en-US')} cjs
          </div>
          <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            {totalAvailableSugarBultos.toLocaleString('en-US')} bultos de azúcar disponibles
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Peso disponible total</span>
            <Scale className="w-4 h-4 text-[#7C3AED] dark:text-[#C084FC]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#130824] dark:text-[#F4EFFF]">
            {formatKgFromGrams(totalAvailableGrams)}
          </div>
          <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            Calculado en gramos exactos
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#6B5B82] dark:text-[#9E8FB2]">
            <span>Viajes registrados</span>
            <Truck className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#130824] dark:text-[#F4EFFF]">
            {state.warehouseShipments.length}
          </div>
          <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
            {bodegaSales.length} venta(s) directa(s) en bodega
          </div>
        </div>
      </div>

      {/* Live Inventory Table (Egg Brands + Sugar Sacks — without unrequested quick-access buttons) */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Inventario actual en bodega (Huevo y Bultos de Azúcar)
            </h3>
          </div>
          <span className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
            Si una entrega se cancela, sus cajas o bultos regresan automáticamente al inventario
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                <th className="py-2.5 px-3 font-semibold">Tipo</th>
                <th className="py-2.5 px-3 font-semibold">Marca / Producto</th>
                <th className="py-2.5 px-3 font-semibold text-right">Llegaron</th>
                <th className="py-2.5 px-3 font-semibold text-right">Vendidas</th>
                <th className="py-2.5 px-3 font-semibold text-right">Disponibles</th>
                <th className="py-2.5 px-3 font-semibold text-right">Peso disponible</th>
                <th className="py-2.5 px-3 font-semibold text-right">Prom. / unidad</th>
                <th className="py-2.5 px-3 font-semibold text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE4F5] dark:divide-[#341961]/70">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#6B5B82] dark:text-[#9E8FB2]">
                    Aún no ha registrado llegadas de mercancía. Capture el primer viaje abajo para iniciar el inventario.
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const unitShort = item.productType === 'azucar' ? 'bultos' : 'cjs';
                  const statusTone =
                    item.boxesAvailable <= 0
                      ? 'text-[#E11D48] dark:text-[#F43F5E]'
                      : item.boxesAvailable <= 10
                      ? 'text-[#D97706] dark:text-[#F59E0B]'
                      : 'text-[#059669] dark:text-[#10B981]';
                  const statusText =
                    item.boxesAvailable <= 0
                      ? 'Agotado'
                      : item.boxesAvailable <= 10
                      ? 'Stock bajo'
                      : 'Disponible';
                  return (
                    <tr key={item.brandKey} className="hover:bg-[#8A2BE2]/10 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-[#7C3AED] dark:text-[#C084FC]">
                        {item.productType === 'azucar' ? 'Azúcar' : 'Huevo'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#130824] dark:text-[#F4EFFF]">
                        {item.brandName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#4C3F63] dark:text-[#9E8FB2]">
                        {item.boxesArrived.toLocaleString('en-US')} {unitShort} ({formatKgFromGrams(item.gramsArrived)})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#4C3F63] dark:text-[#9E8FB2]">
                        {item.boxesSold.toLocaleString('en-US')} {unitShort} ({formatKgFromGrams(item.gramsSold)})
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${statusTone}`}>
                        {item.boxesAvailable.toLocaleString('en-US')} {unitShort}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#130824] dark:text-[#F4EFFF]">
                        {formatKgFromGrams(item.gramsAvailable)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#6B5B82] dark:text-[#9E8FB2]">
                        {item.avgGramsPerBox > 0 ? formatKgFromGrams(item.avgGramsPerBox) : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${statusTone}`}>
                        {statusText}
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
        <form onSubmit={handleSubmitShipment} className="xl:col-span-5 glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
              <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
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
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                Placas o remisión de viaje
              </label>
              <input
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="Remisión o placas"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                Granja / proveedor de origen
              </label>
              <input
                value={originFarm}
                onChange={(e) => setOriginFarm(e.target.value)}
                placeholder="Granja origen"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
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
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                Notas del viaje (opcional)
              </label>
              <input
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="Observaciones"
                className="input-recessed w-full rounded px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Dynamic Lots (Egg or Sugar Sacks) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                Lotes recibidos (huevo o bultos de azúcar)
              </span>
              <TactileButton
                variant="neutral"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddLine}
              >
                Agregar lote
              </TactileButton>
            </div>

            <datalist id="known-egg-brands">
              {knownEggBrands.map((b) => (
                <option key={b.brandKey} value={b.brandName} />
              ))}
            </datalist>
            <datalist id="known-sugar-products">
              {knownSugarProducts.map((b) => (
                <option key={b.brandKey} value={b.brandName} />
              ))}
            </datalist>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const qty = Number(line.boxesCount);
                const perBulto = Number(line.weightPerBultoKg);
                const sugarTotalKg =
                  line.productType === 'azucar' && qty > 0 && perBulto > 0 ? qty * perBulto : 0;
                const eggTotalKg = line.productType === 'huevo' ? Number(line.totalKg) : 0;
                const avg = line.productType === 'huevo' && qty > 0 && eggTotalKg > 0 ? eggTotalKg / qty : 0;

                return (
                  <div key={line.id} className="pos-subpanel rounded-md p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">Lote #{index + 1}</span>
                        <select
                          value={line.productType}
                          onChange={(e) =>
                            handleUpdateLine(line.id, {
                              productType: e.target.value === 'azucar' ? 'azucar' : 'huevo',
                              brandName: '',
                              boxesCount: '',
                              weightPerBultoKg: '',
                              totalKg: '',
                            })
                          }
                          className="input-recessed rounded px-2 py-0.5 text-[11px]"
                        >
                          <option value="huevo">Huevo (cajas / medias)</option>
                          <option value="azucar">Azúcar (bultos)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-3">
                        {avg > 0 && (
                          <span className="font-mono text-[#7C3AED] dark:text-[#C084FC]">
                            Prom: {avg.toFixed(2)} kg/caja
                          </span>
                        )}
                        {sugarTotalKg > 0 && (
                          <span className="font-mono text-[#7C3AED] dark:text-[#C084FC]">
                            Total: {sugarTotalKg.toFixed(2)} kg
                          </span>
                        )}
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-[#F43F5E] hover:opacity-80"
                            aria-label="Quitar lote"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {line.productType === 'huevo' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Marca de huevo
                          </label>
                          <input
                            list="known-egg-brands"
                            value={line.brandName}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { brandName: e.target.value })
                            }
                            placeholder="Marca de huevo"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Cajas (acepta 0.5)
                          </label>
                          <input
                            type="number"
                            min={0.5}
                            step="0.5"
                            value={line.boxesCount}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { boxesCount: e.target.value })
                            }
                            placeholder="Cantidad"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Peso total (kg)
                          </label>
                          <input
                            type="number"
                            min={0.1}
                            step="0.01"
                            value={line.totalKg}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { totalKg: e.target.value })
                            }
                            placeholder="Total kg"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Tipo / marca de azúcar
                          </label>
                          <input
                            list="known-sugar-products"
                            value={line.brandName}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { brandName: e.target.value })
                            }
                            placeholder="Producto de azúcar"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Cantidad de bultos
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={line.boxesCount}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { boxesCount: e.target.value })
                            }
                            placeholder="Bultos"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#4C3F63] dark:text-[#9E8FB2] mb-0.5">
                            Peso por bulto (kg)
                          </label>
                          <input
                            type="number"
                            min={0.1}
                            step="0.01"
                            value={line.weightPerBultoKg}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { weightPerBultoKg: e.target.value })
                            }
                            placeholder="Kg por bulto"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
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

        {/* Form 2: Direct Multi-Item Bodega Sale */}
        <form onSubmit={handleSubmitSale} className="xl:col-span-7 glass-panel rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
              <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
                Venta directa de huevo y azúcar en bodega
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
                <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                  Nombre del comprador / negocio
                </label>
                <input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Nombre del comprador"
                  required
                  className="input-recessed w-full rounded px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
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
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
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

          {/* Multi-Brand Egg + Sugar Items List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF]">
                Productos y marcas dentro del mismo ticket ({saleItems.length})
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <TactileButton
                  variant="neutral"
                  size="sm"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleAddEggSaleItem}
                >
                  Agregar otra marca de huevo
                </TactileButton>
                <TactileButton
                  variant="info"
                  size="sm"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleAddSugarSaleItem}
                >
                  Agregar bulto de azúcar
                </TactileButton>
              </div>
            </div>

            <div className="space-y-3">
              {saleItems.map((item, idx) => {
                const preview = itemPreviews[idx];

                if (item.productType === 'azucar') {
                  const selectedSugar =
                    availableSugar.find((s) => s.brandName === item.brandName) ??
                    availableSugar[0] ??
                    null;
                  const activeSugarName = selectedSugar?.brandName ?? '';

                  return (
                    <div key={item.id} className="pos-subpanel rounded-md p-3.5 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#7C3AED] dark:text-[#C084FC]">
                          Concepto #{idx + 1} · Bultos de azúcar
                        </span>
                        {saleItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSaleItem(item.id)}
                            className="text-[#F43F5E] hover:opacity-80"
                            aria-label="Quitar concepto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                            Azúcar en inventario
                          </label>
                          <select
                            value={activeSugarName}
                            onChange={(e) => {
                              const nextName = e.target.value;
                              const found = availableSugar.find((s) => s.brandName === nextName);
                              const nextWeight =
                                found && found.avgGramsPerBox > 0
                                  ? (found.avgGramsPerBox / 1000).toFixed(2)
                                  : item.weightPerBultoKg;
                              handleUpdateSaleItem(item.id, {
                                brandName: nextName,
                                weightPerBultoKg: nextWeight,
                              });
                            }}
                            disabled={availableSugar.length === 0}
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                          >
                            {availableSugar.length === 0 ? (
                              <option value="">Sin bultos de azúcar disponibles</option>
                            ) : (
                              availableSugar.map((s) => (
                                <option key={s.brandKey} value={s.brandName}>
                                  {s.brandName} ({s.boxesAvailable} bultos)
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                            Cantidad de bultos
                            {selectedSugar ? ` (máx. ${selectedSugar.boxesAvailable})` : ''}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={selectedSugar?.boxesAvailable ?? undefined}
                            step={1}
                            value={item.bultosCount}
                            onChange={(e) =>
                              handleUpdateSaleItem(item.id, { bultosCount: e.target.value })
                            }
                            placeholder="Bultos"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                            Peso por bulto (kg)
                          </label>
                          <input
                            type="number"
                            min={0.1}
                            step="0.01"
                            value={item.weightPerBultoKg}
                            onChange={(e) =>
                              handleUpdateSaleItem(item.id, { weightPerBultoKg: e.target.value })
                            }
                            placeholder="Kg por bulto"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                            Precio por bulto ($ MXN)
                          </label>
                          <input
                            type="number"
                            min={1}
                            step="0.01"
                            value={item.pricePerBultoPesos}
                            onChange={(e) =>
                              handleUpdateSaleItem(item.id, { pricePerBultoPesos: e.target.value })
                            }
                            placeholder="$ por bulto"
                            required
                            className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {preview?.valid && (
                        <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 border-t border-[#DFD7EE] dark:border-[#341961]">
                          <span className="text-[#4C3F63] dark:text-[#9E8FB2] font-mono">
                            {preview.quantity} bulto(s) · Peso total: {formatKgFromGrams(preview.totalGrams)}
                          </span>
                          <span className="font-mono font-bold text-[#059669] dark:text-[#10B981]">
                            Subtotal: {formatCurrencyFromCentavos(preview.subtotalCentavos)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                // Huevo line
                const selectedEgg =
                  availableEggs.find((b) => b.brandName === item.brandName) ??
                  availableEggs[0] ??
                  null;
                const activeEggName = selectedEgg?.brandName ?? '';
                const parsedFull =
                  item.fullBoxes.trim() === '' ? 0 : Number.parseInt(item.fullBoxes, 10);
                const parsedHalf =
                  item.halfBoxes.trim() === '' ? 0 : Number.parseInt(item.halfBoxes, 10);
                const safeFull = Number.isInteger(parsedFull) && parsedFull > 0 ? parsedFull : 0;
                const safeHalf = Number.isInteger(parsedHalf) && parsedHalf > 0 ? parsedHalf : 0;

                return (
                  <div key={item.id} className="pos-subpanel rounded-md p-3.5 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#7C3AED] dark:text-[#C084FC]">
                        Concepto #{idx + 1} · Huevo por marca
                      </span>
                      {saleItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSaleItem(item.id)}
                          className="text-[#F43F5E] hover:opacity-80"
                          aria-label="Quitar concepto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                          Marca de huevo
                        </label>
                        <select
                          value={activeEggName}
                          onChange={(e) =>
                            handleUpdateSaleItem(item.id, { brandName: e.target.value })
                          }
                          disabled={availableEggs.length === 0}
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs"
                        >
                          {availableEggs.length === 0 ? (
                            <option value="">Sin huevo disponible</option>
                          ) : (
                            availableEggs.map((b) => (
                              <option key={b.brandKey} value={b.brandName}>
                                {b.brandName} ({b.boxesAvailable} cjs)
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                          Cajas completas
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.fullBoxes}
                          onChange={(e) => {
                            const val = e.target.value;
                            const n = val.trim() === '' ? 0 : Number.parseInt(val, 10);
                            const nextArr =
                              Number.isInteger(n) && n > 0 && n <= 200
                                ? resizeStringArray(item.fullBoxesGrossKg, n)
                                : [];
                            handleUpdateSaleItem(item.id, {
                              fullBoxes: val,
                              fullBoxesGrossKg: nextArr,
                            });
                          }}
                          placeholder="0"
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                          Medias cajas (0.5 c/u)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.halfBoxes}
                          onChange={(e) => {
                            const val = e.target.value;
                            const n = val.trim() === '' ? 0 : Number.parseInt(val, 10);
                            const nextArr =
                              Number.isInteger(n) && n > 0 && n <= 200
                                ? resizeStringArray(item.halfBoxesGrossKg, n)
                                : [];
                            handleUpdateSaleItem(item.id, {
                              halfBoxes: val,
                              halfBoxesGrossKg: nextArr,
                            });
                          }}
                          placeholder="0"
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
                          Precio por kilo ($ MXN)
                        </label>
                        <input
                          type="number"
                          min={0.5}
                          step="0.01"
                          value={item.pricePesosPerKg}
                          onChange={(e) =>
                            handleUpdateSaleItem(item.id, { pricePesosPerKg: e.target.value })
                          }
                          placeholder={defaultPricePesos || '$ / kg'}
                          required
                          className="input-recessed w-full rounded px-2.5 py-1.5 text-xs font-mono"
                        />
                        <label className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[#D97706] dark:text-[#F59E0B] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.isSpecialPrice}
                            onChange={(e) =>
                              handleUpdateSaleItem(item.id, { isSpecialPrice: e.target.checked })
                            }
                          />
                          <span>Precio especial</span>
                        </label>
                      </div>
                    </div>

                    {/* Weigh mode per egg line */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#4C3F63] dark:text-[#9E8FB2]">
                          Modo de peso ({roundHalfUnits(safeFull + safeHalf * 0.5)} cajas)
                          {selectedEgg ? ` · Disponibles: ${selectedEgg.boxesAvailable} cjs` : ''}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <TactileButton
                            variant={item.weighMode === 'total' ? 'primary' : 'neutral'}
                            size="sm"
                            onClick={() => handleUpdateSaleItem(item.id, { weighMode: 'total' })}
                          >
                            Peso total báscula (kg)
                          </TactileButton>
                          <TactileButton
                            variant={item.weighMode === 'cajas' ? 'primary' : 'neutral'}
                            size="sm"
                            onClick={() =>
                              handleUpdateSaleItem(item.id, {
                                weighMode: 'cajas',
                                fullBoxesGrossKg: resizeStringArray(
                                  item.fullBoxesGrossKg,
                                  safeFull
                                ),
                                halfBoxesGrossKg: resizeStringArray(
                                  item.halfBoxesGrossKg,
                                  safeHalf
                                ),
                              })
                            }
                          >
                            Peso por caja (-2 kg cartón)
                          </TactileButton>
                        </div>
                      </div>

                      {item.weighMode === 'total' ? (
                        <input
                          type="number"
                          min={0.1}
                          step="0.01"
                          value={item.totalKg}
                          onChange={(e) =>
                            handleUpdateSaleItem(item.id, { totalKg: e.target.value })
                          }
                          placeholder="Peso neto total en báscula (kg)"
                          required
                          className="input-recessed w-full rounded px-3 py-1.5 text-xs font-mono"
                        />
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded border border-[#8A2BE2]/40 bg-[#8A2BE2]/10 px-2.5 py-1.5 text-[11px] text-[#681AB8] dark:text-[#C084FC]">
                            Capture el peso bruto en báscula: se descuentan automáticamente{' '}
                            <strong>2.00 kg</strong> de cartón por cada caja completa y{' '}
                            <strong>1.00 kg</strong> por cada media caja.
                          </div>

                          {safeFull + safeHalf > 200 ? (
                            <p className="text-[11px] text-[#E11D48] dark:text-[#F43F5E]">
                              Para más de 200 unidades use el modo &quot;Peso total báscula (kg)&quot;.
                            </p>
                          ) : safeFull + safeHalf === 0 ? (
                            <p className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                              Indique arriba cuántas cajas completas o medias cajas venderá.
                            </p>
                          ) : (
                            <div className="max-h-44 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2 p-1">
                              {item.fullBoxesGrossKg.map((val, boxIdx) => {
                                const grossGrams = Math.round(Number(val) * 1000);
                                const netGrams =
                                  Number.isFinite(Number(val)) && grossGrams > BOX_TARE_GRAMS
                                    ? grossGrams - BOX_TARE_GRAMS
                                    : null;
                                return (
                                  <div key={`full-${boxIdx}`}>
                                    <label className="block text-[10px] font-mono text-[#6B5B82] dark:text-[#9E8FB2]">
                                      Caja {boxIdx + 1} bruto (kg)
                                    </label>
                                    <input
                                      type="number"
                                      min={2.01}
                                      step="0.01"
                                      value={val}
                                      onChange={(e) => {
                                        const nextVal = e.target.value;
                                        handleUpdateSaleItem(item.id, {
                                          fullBoxesGrossKg: item.fullBoxesGrossKg.map((w, i) =>
                                            i === boxIdx ? nextVal : w
                                          ),
                                        });
                                      }}
                                      placeholder="Bruto kg"
                                      required
                                      className="input-recessed w-full rounded px-2 py-1 text-xs font-mono"
                                    />
                                    {netGrams !== null && (
                                      <div className="text-[10px] font-mono text-[#059669] dark:text-[#10B981]">
                                        Neto: {formatKgFromGrams(netGrams)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {item.halfBoxesGrossKg.map((val, halfIdx) => {
                                const grossGrams = Math.round(Number(val) * 1000);
                                const netGrams =
                                  Number.isFinite(Number(val)) && grossGrams > HALF_BOX_TARE_GRAMS
                                    ? grossGrams - HALF_BOX_TARE_GRAMS
                                    : null;
                                return (
                                  <div key={`half-${halfIdx}`}>
                                    <label className="block text-[10px] font-mono text-[#D97706] dark:text-[#F59E0B]">
                                      Media {halfIdx + 1} bruto (kg)
                                    </label>
                                    <input
                                      type="number"
                                      min={1.01}
                                      step="0.01"
                                      value={val}
                                      onChange={(e) => {
                                        const nextVal = e.target.value;
                                        handleUpdateSaleItem(item.id, {
                                          halfBoxesGrossKg: item.halfBoxesGrossKg.map((w, i) =>
                                            i === halfIdx ? nextVal : w
                                          ),
                                        });
                                      }}
                                      placeholder="Bruto kg"
                                      required
                                      className="input-recessed w-full rounded px-2 py-1 text-xs font-mono"
                                    />
                                    {netGrams !== null && (
                                      <div className="text-[10px] font-mono text-[#059669] dark:text-[#10B981]">
                                        Neto: {formatKgFromGrams(netGrams)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {preview?.valid && (
                      <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 border-t border-[#DFD7EE] dark:border-[#341961]">
                        <span className="text-[#4C3F63] dark:text-[#9E8FB2] font-mono">
                          Neto: {formatKgFromGrams(preview.totalGrams)}
                          {preview.tareGrams > 0
                            ? ` (tara cartón descontada: -${formatKgFromGrams(preview.tareGrams)})`
                            : ''}
                        </span>
                        <span className="font-mono font-bold text-[#059669] dark:text-[#10B981]">
                          Subtotal: {formatCurrencyFromCentavos(preview.subtotalCentavos)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
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
              <label className="block font-semibold text-[#4C3F63] dark:text-[#F4EFFF] mb-1">
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

          {/* Combined Ticket Grand Total Preview */}
          {liveGrandTotal && (
            <div className="rounded-md border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="text-[#4C3F63] dark:text-[#F4EFFF]">
                  Peso neto total:{' '}
                  <strong className="font-mono">{formatKgFromGrams(liveGrandTotal.totalGrams)}</strong> ·
                  Conceptos en ticket: <strong className="font-mono">{saleItems.length}</strong>
                </div>
                {liveGrandTotal.totalTareGrams > 0 && (
                  <div className="text-[11px] text-[#7C3AED] dark:text-[#C084FC] font-mono">
                    Descuento total de cartón aplicado: -{formatKgFromGrams(liveGrandTotal.totalTareGrams)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">Total a cobrar</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#059669] dark:text-[#10B981]">
                  {formatCurrencyFromCentavos(liveGrandTotal.totalToChargeCentavos)}
                </div>
              </div>
            </div>
          )}

          {lastCreatedFolio && (
            <div className="rounded-md border border-[#8A2BE2]/50 bg-[#8A2BE2]/15 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#7C3AED] dark:text-[#C084FC] font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
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
              variant="primary"
              disabled={savingSale || (availableEggs.length === 0 && availableSugar.length === 0)}
              icon={<ShoppingCart className="w-4 h-4" />}
            >
              {savingSale ? 'Registrando venta...' : 'Confirmar venta y cobrar'}
            </TactileButton>
          </div>
        </form>
      </div>

      {/* Bottom History Split: Shipments Log & Direct Bodega Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961]">
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Historial de tortones y tráileres recibidos
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2 px-3">Unidad / Folio</th>
                  <th className="py-2 px-3">Origen / Chofer</th>
                  <th className="py-2 px-3">Detalle de lotes</th>
                  <th className="py-2 px-3 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE4F5] dark:divide-[#341961]/70">
                {state.warehouseShipments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#6B5B82] dark:text-[#9E8FB2]">
                      Sin entradas de granja registradas todavía.
                    </td>
                  </tr>
                ) : (
                  state.warehouseShipments.map((s) => (
                    <tr key={s.id} className="hover:bg-[#8A2BE2]/10">
                      <td className="py-2 px-3">
                        <div className="font-bold uppercase text-[#7C3AED] dark:text-[#C084FC]">
                          {s.vehicleType === 'trailer' ? 'Tráiler' : 'Tortón'}
                        </div>
                        <div className="font-mono text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                          {s.folioFormatted ? `${s.folioFormatted} · ` : ''}{s.referenceCode}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[#130824] dark:text-[#F4EFFF]">{s.originFarm}</div>
                        <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                          {s.driverName || 'Sin chofer capturado'}
                        </div>
                      </td>
                      <td className="py-2 px-3 space-y-0.5">
                        {s.lines.map((l) => (
                          <div key={l.id} className="font-mono text-[11px] text-[#130824] dark:text-[#F4EFFF]">
                            <strong>{l.brandName}</strong>: +{l.boxesCount}{' '}
                            {l.productType === 'azucar' ? 'bultos' : 'cjs'} ({formatKgFromGrams(l.totalGrams)})
                          </div>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] whitespace-nowrap">
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
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961]">
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF]">
              Últimas ventas directas en bodega
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2 px-3">Folio</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Productos / Pesos</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE4F5] dark:divide-[#341961]/70">
                {bodegaSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#6B5B82] dark:text-[#9E8FB2]">
                      Aún no se registran ventas directas en bodega.
                    </td>
                  </tr>
                ) : (
                  bodegaSales.map((d) => (
                    <tr key={d.id} className="hover:bg-[#8A2BE2]/10">
                      <td className="py-2 px-3 font-mono font-bold text-[#7C3AED] dark:text-[#C084FC]">
                        {d.folioFormatted}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[#130824] dark:text-[#F4EFFF]">{d.customerName}</div>
                        <div className="font-mono text-[11px] text-[#6B5B82] dark:text-[#9E8FB2]">
                          {formatMexicoCityDate(d.createdAtUtc)} {formatMexicoCityTime(d.createdAtUtc)}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px]">
                        {Array.isArray(d.saleItems) && d.saleItems.length > 0 ? (
                          <div className="space-y-0.5">
                            {d.saleItems.map((it) => (
                              <div key={it.id} className="text-[#130824] dark:text-[#F4EFFF]">
                                <strong>{it.brandName}</strong>: {it.quantity}{' '}
                                {it.productType === 'azucar' ? 'bultos' : 'cjs'} ·{' '}
                                {formatKgFromGrams(it.totalGrams)} ·{' '}
                                {formatCurrencyFromCentavos(it.unitPriceCentavos, true)}
                                {it.productType === 'azucar' ? '/bulto' : '/kg'}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-[#130824] dark:text-[#F4EFFF]">
                              {d.brandName ?? '—'}
                            </span>
                            <div className="text-[#6B5B82] dark:text-[#9E8FB2]">
                              {d.boxesCount ?? 0} cjs · {formatKgFromGrams(d.totalGrams)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#130824] dark:text-[#F4EFFF]">
                        {formatCurrencyFromCentavos(d.totalToChargeCentavos)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {d.status === 'vigente' ? (
                          <span className="text-[#059669] dark:text-[#10B981] font-semibold">
                            Vigente
                          </span>
                        ) : (
                          <span className="text-[#E11D48] dark:text-[#F43F5E] font-semibold">
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
