import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopPrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
}

contextBridge.exposeInMainWorld('desktopPrinters', {
  isElectron: true,
  listPrinters: (): Promise<DesktopPrinterInfo[]> => ipcRenderer.invoke('printers:list'),
  printSilent: (printerName: string): Promise<{ ok: boolean; failureReason?: string }> =>
    ipcRenderer.invoke('printers:print', { printerName }),
});
