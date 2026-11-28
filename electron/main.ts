import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let stopBackend: (() => Promise<void>) | null = null;
let printerIpcRegistered = false;

function registerPrinterIpcHandlers(): void {
  if (printerIpcRegistered) return;
  printerIpcRegistered = true;

  ipcMain.handle('printers:list', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => {
      const extra = p as unknown as { status?: number; isDefault?: boolean };
      return {
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        status: typeof extra.status === 'number' ? extra.status : 0,
        isDefault: Boolean(extra.isDefault),
      };
    });
  });

  ipcMain.handle('printers:print', async (_event, payload?: { printerName?: string }) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, failureReason: 'La ventana principal no está activa.' };
    }
    const deviceName = typeof payload?.printerName === 'string' ? payload.printerName.trim() : '';
    return new Promise<{ ok: boolean; failureReason?: string }>((resolve) => {
      mainWindow!.webContents.print(
        {
          silent: Boolean(deviceName),
          printBackground: true,
          ...(deviceName ? { deviceName } : {}),
          margins: { marginType: 'none' },
        },
        (success, failureReason) => {
          resolve({
            ok: success,
            ...(failureReason ? { failureReason } : {}),
          });
        }
      );
    });
  });
}

function ensureLocalSecurityEnv(userDataDir: string): void {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const envFile = path.join(userDataDir, '.env');
  if (!fs.existsSync(envFile)) {
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const aesKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(
      envFile,
      `# Claves de seguridad locales (Directo de Granja Desktop)\nJWT_SECRET="${jwtSecret}"\nAES_ENCRYPTION_KEY="${aesKey}"\nSQLITE_DB_PATH="data/directodegranja.db"\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
  }
  dotenv.config({ path: envFile });
}

async function createDesktopWindow(): Promise<void> {
  const userDataDir = app.getPath('userData');
  ensureLocalSecurityEnv(userDataDir);

  process.env.NODE_ENV = 'production';
  process.env.ALLOW_INSECURE_HTTP = 'true';
  process.env.ELECTRON_DESKTOP = '1';
  process.env.SKIP_AUTO_START = '1';
  process.env.APP_USER_DATA_DIR = userDataDir;
  process.env.APP_DIST_DIR = path.join(app.getAppPath(), 'dist');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serverModule = require(path.join(__dirname, 'server.cjs')) as {
    startBackendServer: () => Promise<{ port: number; close: () => Promise<void> }>;
  };

  const server = await serverModule.startBackendServer();
  stopBackend = server.close;

  Menu.setApplicationMenu(null);
  registerPrinterIpcHandlers();

  const iconPath = path.join(app.getAppPath(), 'electron', 'icon.png');
  const preloadPath = path.join(__dirname, 'preload.cjs');
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'Directo de Granja — Te faltan huevos a nosotros nos sobran',
    backgroundColor: '#130824',
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...(fs.existsSync(preloadPath) ? { preload: preloadPath } : {}),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  await mainWindow.loadURL(`http://127.0.0.1:${server.port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createDesktopWindow().catch((err) => {
    dialog.showErrorBox(
      'Error al iniciar Directo de Granja',
      `No se pudo iniciar el servidor local seguro en el puerto 3000.\n\n${(err as Error).message}`
    );
    app.quit();
  });
});

app.on('window-all-closed', async () => {
  if (stopBackend) {
    try {
      await stopBackend();
    } catch {
      // Ignore shutdown cleanup error
    }
    stopBackend = null;
  }
  app.quit();
});
