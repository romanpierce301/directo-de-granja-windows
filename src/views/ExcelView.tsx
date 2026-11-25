import { useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import {
  calculateBrandInventory,
  calculateCustomerLedger,
  escapeExcelFormulaInjection,
  formatCurrencyFromCentavos,
  formatKgFromGrams,
  formatMexicoCityDate,
  formatMexicoCityTime,
  normalizeCustomerName,
  normalizePhone,
  sanitizeImportedCell,
} from '../../shared/domain.ts';
import { apiClient, type DashboardState } from '../services/apiClient.ts';
import { TactileButton } from '../components/TactileButton.tsx';

interface ExcelViewProps {
  state: DashboardState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

interface PreviewRow {
  rowIndex: number;
  businessName: string;
  contactName: string;
  phone: string;
  address: string;
  notes: string;
  status: 'valida' | 'duplicado' | 'error';
  reason: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB security cap

export function ExcelView({ state, onRefresh, onNotify }: ExcelViewProps) {
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  const downloadCustomerTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Nombre del negocio': 'Abarrotes Ejemplo',
        Contacto: 'Encargado de tienda',
        Teléfono: '5511223344',
        Dirección: 'Calle Reforma 100',
        Notas: 'Entrega matutina',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'Plantilla_Clientes_DirectoDeGranja.xlsx');
    onNotify('Plantilla de clientes descargada.');
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      onNotify('Archivo rechazado: excede el límite de seguridad de 5 MB.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      // Read ONLY values (never execute formulas or macros)
      const wb = XLSX.read(buffer, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
        cellStyles: false,
      });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: '',
      });

      const existingKeys = new Set(
        state.customers
          .filter((c) => !c.mergedIntoCustomerId)
          .map((c) => `${normalizeCustomerName(c.businessName)}|${normalizePhone(c.phone)}`)
      );
      const batchKeys = new Set<string>();

      const parsed: PreviewRow[] = jsonRows.map((row, idx) => {
        const businessName = sanitizeImportedCell(
          row['Nombre del negocio'] ?? row['businessName'] ?? row['Nombre'] ?? ''
        );
        const contactName = sanitizeImportedCell(
          row['Contacto'] ?? row['contactName'] ?? ''
        );
        const rawPhone = sanitizeImportedCell(
          row['Teléfono'] ?? row['Telefono'] ?? row['phone'] ?? ''
        );
        const phone = normalizePhone(rawPhone);
        const address = sanitizeImportedCell(
          row['Dirección'] ?? row['Direccion'] ?? row['address'] ?? ''
        );
        const notes = sanitizeImportedCell(row['Notas'] ?? row['notes'] ?? '');

        if (!businessName) {
          return {
            rowIndex: idx + 2,
            businessName: '(Vacío)',
            contactName,
            phone: rawPhone,
            address,
            notes,
            status: 'error',
            reason: 'Nombre del negocio obligatorio',
          };
        }
        if (phone.length < 8 || phone.length > 15) {
          return {
            rowIndex: idx + 2,
            businessName,
            contactName,
            phone: rawPhone,
            address,
            notes,
            status: 'error',
            reason: 'Teléfono inválido o incompleto (mínimo 8 dígitos)',
          };
        }
        const key = `${normalizeCustomerName(businessName)}|${phone}`;
        if (existingKeys.has(key) || batchKeys.has(key)) {
          return {
            rowIndex: idx + 2,
            businessName,
            contactName,
            phone,
            address,
            notes,
            status: 'duplicado',
            reason: 'Cliente duplicado (nombre normalizado y teléfono coinciden)',
          };
        }
        batchKeys.add(key);
        return {
          rowIndex: idx + 2,
          businessName,
          contactName,
          phone,
          address,
          notes,
          status: 'valida',
          reason: 'Lista para importar',
        };
      });

      setFileName(file.name);
      setPreviewRows(parsed);
      onNotify(`Vista previa cargada: ${parsed.length} filas analizadas.`);
    } catch {
      onNotify('No se pudo leer el archivo Excel o CSV.');
    }
  };

  const handleConfirmImport = async () => {
    const validRows = previewRows.filter((r) => r.status === 'valida');
    if (validRows.length === 0) {
      onNotify('No hay filas válidas para importar.');
      return;
    }
    setImporting(true);
    try {
      const res = await apiClient.importExcelRows({
        fileName,
        importType: 'clientes',
        rows: previewRows.map((r) => ({
          businessName: r.businessName,
          contactName: r.contactName,
          phone: r.phone,
          address: r.address,
          notes: r.notes,
        })),
      });
      setPreviewRows([]);
      setFileName('');
      await onRefresh();
      onNotify(
        `Importación completada: ${res.importRecord.rowsCreated} clientes creados, ${res.importRecord.rowsRejected} omitidos.`
      );
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const exportSafeWorkbook = (
    kind: 'ventas' | 'clientes' | 'cierres' | 'mermas' | 'incidentes' | 'bodega' | 'respaldo'
  ) => {
    const wb = XLSX.utils.book_new();

    const buildSalesSheet = () =>
      XLSX.utils.json_to_sheet(
        state.deliveries.map((d) => ({
          Folio: escapeExcelFormulaInjection(d.folioFormatted),
          Origen: d.sourceType === 'bodega' ? 'Bodega' : 'Ruta',
          Marca: escapeExcelFormulaInjection(d.brandName ?? ''),
          Cajas: d.boxesCount ?? '',
          Fecha: formatMexicoCityDate(d.createdAtUtc),
          Hora: formatMexicoCityTime(d.createdAtUtc),
          Vendedor: escapeExcelFormulaInjection(d.vendorName),
          Cliente: escapeExcelFormulaInjection(d.customerName),
          Kilos: formatKgFromGrams(d.totalGrams),
          PrecioKg: formatCurrencyFromCentavos(d.priceCentavosPerKg, true),
          TotalACobrar: formatCurrencyFromCentavos(d.totalToChargeCentavos),
          Estado: d.status,
          MotivoCancelacion: escapeExcelFormulaInjection(d.cancellationReason ?? ''),
        }))
      );

    const buildCustomersSheet = () =>
      XLSX.utils.json_to_sheet(
        state.customers
          .filter((c) => !c.mergedIntoCustomerId)
          .map((c) => {
            const ledger = calculateCustomerLedger(c.id, state.deliveries, state.payments);
            return {
              'Nombre del negocio': escapeExcelFormulaInjection(c.businessName),
              Contacto: escapeExcelFormulaInjection(c.contactName),
              Teléfono: escapeExcelFormulaInjection(c.phone),
              Dirección: escapeExcelFormulaInjection(c.address),
              Notas: escapeExcelFormulaInjection(c.notes),
              Comprado: formatCurrencyFromCentavos(ledger.totalBoughtCentavos),
              Pagado: formatCurrencyFromCentavos(ledger.totalPaidCentavos),
              SaldoActual: formatCurrencyFromCentavos(ledger.balanceCentavos),
            };
          })
      );

    if (kind === 'ventas' || kind === 'respaldo') {
      XLSX.utils.book_append_sheet(wb, buildSalesSheet(), 'Ventas');
    }
    if (kind === 'clientes' || kind === 'respaldo') {
      XLSX.utils.book_append_sheet(wb, buildCustomersSheet(), 'Clientes');
    }
    if (kind === 'cierres' || kind === 'respaldo') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          state.cashClosings.map((c) => ({
            Fecha: c.dateYmd,
            Vendedor: escapeExcelFormulaInjection(c.vendorName),
            Vendido: formatCurrencyFromCentavos(c.soldCentavos),
            EfectivoCobrado: formatCurrencyFromCentavos(c.cashCollectedCentavos),
            Incidentes: formatCurrencyFromCentavos(c.incidentsCentavos),
            EfectivoAEntregar: formatCurrencyFromCentavos(c.expectedCashToDeliverCentavos),
            EfectivoRecibido: formatCurrencyFromCentavos(c.actualCashHandedInCentavos),
            Diferencia: formatCurrencyFromCentavos(c.unexplainedDifferenceCentavos),
          }))
        ),
        'Cierres'
      );
    }
    if (kind === 'mermas' || kind === 'respaldo') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          state.dailyLosses.map((l) => ({
            Fecha: l.dateYmd,
            Vendedor: escapeExcelFormulaInjection(l.vendorName),
            KilosPerdidos: formatKgFromGrams(l.lostGrams),
            Nota: escapeExcelFormulaInjection(l.note),
          }))
        ),
        'Mermas'
      );
    }
    if (kind === 'incidentes' || kind === 'respaldo') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          state.moneyIncidents.map((i) => ({
            Fecha: formatMexicoCityDate(i.occurredAtUtc),
            Vendedor: escapeExcelFormulaInjection(i.vendorName),
            Tipo: i.type,
            Monto: formatCurrencyFromCentavos(i.amountCentavos),
            Descripcion: escapeExcelFormulaInjection(i.description),
            Estado: i.status,
            NotaDueno: escapeExcelFormulaInjection(i.ownerNote ?? ''),
          }))
        ),
        'Incidentes'
      );
    }
    if (kind === 'bodega' || kind === 'respaldo') {
      const inv = calculateBrandInventory(
        state.warehouseShipments,
        state.deliveries,
        state.deliveryBoxes
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          inv.map((b) => ({
            Marca: escapeExcelFormulaInjection(b.brandName),
            CajasLlegaron: b.boxesArrived,
            KilosLlegaron: formatKgFromGrams(b.gramsArrived),
            CajasVendidas: b.boxesSold,
            KilosVendidos: formatKgFromGrams(b.gramsSold),
            CajasDisponibles: b.boxesAvailable,
            KilosDisponibles: formatKgFromGrams(b.gramsAvailable),
          }))
        ),
        'InventarioBodega'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          state.warehouseShipments.flatMap((s) =>
            s.lines.map((l) => ({
              Fecha: formatMexicoCityDate(s.arrivedAtUtc),
              Hora: formatMexicoCityTime(s.arrivedAtUtc),
              Unidad: s.vehicleType === 'trailer' ? 'Tráiler' : 'Tortón',
              Referencia: escapeExcelFormulaInjection(s.referenceCode),
              Granja: escapeExcelFormulaInjection(s.originFarm),
              Chofer: escapeExcelFormulaInjection(s.driverName),
              Marca: escapeExcelFormulaInjection(l.brandName),
              Cajas: l.boxesCount,
              PesoTotal: formatKgFromGrams(l.totalGrams),
            }))
          )
        ),
        'EntradasGranja'
      );
    }

    XLSX.writeFile(wb, `DirectoDeGranja_${kind}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(
      `Archivo Excel (${kind}) exportado con escape anti-inyección de fórmulas. Aviso: contiene datos de clientes.`
    );
  };

  const validCount = previewRows.filter((r) => r.status === 'valida').length;
  const dupCount = previewRows.filter((r) => r.status === 'duplicado').length;
  const errCount = previewRows.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#130824] dark:text-[#F4EFFF]">
          Importar y exportar Excel (.xlsx / .csv)
        </h2>
        <p className="text-xs text-[#6B5B82] dark:text-[#9E8FB2] mt-0.5">
          Lee solo valores (sin fórmulas ni macros) y escapa caracteres peligrosos (=, +, -, @) al exportar
        </p>
      </div>

      {/* Security Privacy Notice */}
      <div className="glass-panel rounded-lg p-3.5 border border-[#8A2BE2]/45 flex items-center gap-3 text-xs text-[#3B2A54] dark:text-[#D9CEEE]">
        <ShieldAlert className="w-4 h-4 text-[#7C3AED] dark:text-[#C084FC] shrink-0" />
        <span>
          <strong>Protección de datos:</strong> Los archivos exportados contienen nombres, teléfonos y saldos de clientes. Maneje estos archivos con acceso restringido.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Import Card */}
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF] flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#8A2BE2] dark:text-[#C084FC]" />
              <span>Importar clientes con vista previa</span>
            </h3>
            <TactileButton
              variant="neutral"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={downloadCustomerTemplate}
            >
              Descargar plantilla
            </TactileButton>
          </div>

          <label className="block cursor-pointer rounded-lg border-2 border-dashed border-[#D4C8EB] dark:border-[#341961] hover:border-[#8A2BE2] p-6 text-center transition-colors">
            <FileSpreadsheet className="w-8 h-8 text-[#8A2BE2] dark:text-[#C084FC] mx-auto mb-2" />
            <div className="text-xs font-semibold text-[#130824] dark:text-[#F4EFFF]">
              Seleccionar archivo .xlsx o .csv
            </div>
            <div className="text-[11px] text-[#6B5B82] dark:text-[#9E8FB2] mt-1">
              Validación automática: verdes (válidas), ámbar (duplicados) y rojas (errores)
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Export Card */}
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#130824] dark:text-[#F4EFFF] flex items-center gap-2">
            <Download className="w-4 h-4 text-[#059669] dark:text-[#10B981]" />
            <span>Exportar reportes y respaldo completo</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <TactileButton variant="neutral" size="sm" onClick={() => exportSafeWorkbook('ventas')}>
              Ventas
            </TactileButton>
            <TactileButton variant="neutral" size="sm" onClick={() => exportSafeWorkbook('clientes')}>
              Clientes y saldos
            </TactileButton>
            <TactileButton variant="neutral" size="sm" onClick={() => exportSafeWorkbook('cierres')}>
              Cierres del día
            </TactileButton>
            <TactileButton variant="neutral" size="sm" onClick={() => exportSafeWorkbook('mermas')}>
              Mermas
            </TactileButton>
            <TactileButton
              variant="neutral"
              size="sm"
              onClick={() => exportSafeWorkbook('incidentes')}
            >
              Incidentes
            </TactileButton>
            <TactileButton
              variant="neutral"
              size="sm"
              onClick={() => exportSafeWorkbook('bodega')}
            >
              Bodega e Inventario
            </TactileButton>
            <TactileButton
              variant="primary"
              size="sm"
              onClick={() => exportSafeWorkbook('respaldo')}
            >
              Respaldo total
            </TactileButton>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      {previewRows.length > 0 && (
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DFD7EE] dark:border-[#341961] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <strong className="text-[#130824] dark:text-[#F4EFFF]">{fileName}</strong>
              <span className="mx-2 text-[#9E8FB2]">·</span>
              <span className="text-[#059669] dark:text-[#10B981] font-semibold">
                {validCount} válidas
              </span>
              <span className="mx-2 text-[#9E8FB2]">·</span>
              <span className="text-[#D97706] dark:text-[#F59E0B] font-semibold">
                {dupCount} duplicados
              </span>
              <span className="mx-2 text-[#9E8FB2]">·</span>
              <span className="text-[#E11D48] dark:text-[#F43F5E] font-semibold">
                {errCount} errores
              </span>
            </div>

            <div className="flex gap-2">
              <TactileButton
                variant="neutral"
                size="sm"
                onClick={() => {
                  setPreviewRows([]);
                  setFileName('');
                }}
              >
                Descartar
              </TactileButton>
              <TactileButton
                variant="emerald"
                size="sm"
                disabled={validCount === 0 || importing}
                onClick={handleConfirmImport}
              >
                {importing ? 'Importando...' : `Importar ${validCount} filas válidas`}
              </TactileButton>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DFD7EE] dark:border-[#341961] text-[#6B5B82] dark:text-[#9E8FB2]">
                  <th className="py-2 px-3">Fila</th>
                  <th className="py-2 px-3">Negocio</th>
                  <th className="py-2 px-3">Teléfono</th>
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFD7EE]/80 dark:divide-[#341961]">
                {previewRows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={
                      row.status === 'valida'
                        ? 'bg-[#10B981]/10'
                        : row.status === 'duplicado'
                        ? 'bg-[#F59E0B]/10'
                        : 'bg-[#F43F5E]/12'
                    }
                  >
                    <td className="py-2 px-3 font-mono">{row.rowIndex}</td>
                    <td className="py-2 px-3 font-semibold">{row.businessName}</td>
                    <td className="py-2 px-3 font-mono">{row.phone}</td>
                    <td className="py-2 px-3 font-semibold">
                      {row.status === 'valida' ? (
                        <span className="inline-flex items-center gap-1 text-[#059669] dark:text-[#10B981]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Válida
                        </span>
                      ) : row.status === 'duplicado' ? (
                        <span className="inline-flex items-center gap-1 text-[#D97706] dark:text-[#F59E0B]">
                          <AlertCircle className="w-3.5 h-3.5" /> Duplicado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#E11D48] dark:text-[#F43F5E]">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import History */}
      {state.excelImports.length > 0 && (
        <div className="glass-panel rounded-lg p-4">
          <h3 className="text-xs font-bold text-[#130824] dark:text-[#F4EFFF] mb-2">
            Historial de importaciones Excel
          </h3>
          <div className="space-y-1.5 text-xs">
            {state.excelImports.map((imp) => (
              <div
                key={imp.id}
                className="flex flex-wrap items-center justify-between py-1 border-b border-[#DFD7EE]/80 dark:border-[#341961] last:border-0"
              >
                <div>
                  <span className="font-semibold text-[#130824] dark:text-[#F4EFFF]">
                    {imp.fileName}
                  </span>
                  <span className="mx-2 text-[#9E8FB2]">·</span>
                  <span className="text-[#6B5B82] dark:text-[#9E8FB2]">{imp.userName}</span>
                </div>
                <div className="font-mono tabular-nums text-[#3B2A54] dark:text-[#D9CEEE]">
                  Leídas {imp.rowsRead} · Creadas {imp.rowsCreated} · Rechazadas {imp.rowsRejected}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
