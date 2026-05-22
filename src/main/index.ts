import { app, BrowserWindow, ipcMain, shell, clipboard, screen, Menu } from 'electron';
import path from 'path';
import { setupIpcHandlers, loadSettings, saveSettingsToFile } from './ipc-handlers';
import { initDb } from './metadata-db';
import { ensureRuntimeWritableDirs, initializeRuntimePaths } from './runtime-paths';

let mainWindow: BrowserWindow | null = null;
let isAppClosing = false;

const runtimePaths = initializeRuntimePaths({
  appPath: app.getAppPath(),
  cwd: process.cwd(),
  dirname: __dirname,
  execPath: process.execPath,
  isPackaged: app.isPackaged,
});
ensureRuntimeWritableDirs(runtimePaths);
app.setPath('userData', runtimePaths.userDataDir);

/* START> Tharyn | ZedUI WindowBounds
    2026-01-02
    What: Debounced window bounds saver
    Why: Save window position/size without excessive writes during drag/resize
    Expected: Bounds saved 500ms after last move/resize event
*/
let saveBoundsTimeout: NodeJS.Timeout | null = null;

function saveWindowBounds() {
  if (!mainWindow) return;

  // Clear any pending save
  if (saveBoundsTimeout) {
    clearTimeout(saveBoundsTimeout);
  }

  // Debounce: save 500ms after last event
  saveBoundsTimeout = setTimeout(() => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    saveSettingsToFile({ windowBounds: bounds });
  }, 500);
}

function getWindowBounds(): { x?: number; y?: number; width: number; height: number } {
  const settings = loadSettings();
  const defaultBounds = { width: 1400, height: 900 };

  if (!settings.windowBounds) {
    return defaultBounds;
  }

  const { x, y, width, height } = settings.windowBounds;

  // Validate that the saved position is still on a visible screen
  const displays = screen.getAllDisplays();
  const isOnScreen = displays.some(display => {
    const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
    // Check if at least part of the window is visible on this display
    return x < dx + dw && x + width > dx && y < dy + dh && y + height > dy;
  });

  if (isOnScreen) {
    // Keep a small inset so rounded corners stay visible and avoid edge cases where
    // saving a maximized window flattens the radius or misaligns mouse regions.
    const primary = screen.getPrimaryDisplay();
    const pad = 8;
    const maxW = primary.bounds.width - pad * 2;
    const maxH = primary.bounds.height - pad * 2;
    const clampedWidth = Math.min(width, maxW);
    const clampedHeight = Math.min(height, maxH);
    const clampedX = Math.max(primary.bounds.x + pad, Math.min(x, primary.bounds.x + primary.bounds.width - clampedWidth - pad));
    const clampedY = Math.max(primary.bounds.y + pad, Math.min(y, primary.bounds.y + primary.bounds.height - clampedHeight - pad));
    return { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
  }

  // Window would be off-screen, use default position but saved size
  return { width, height };
}
// <END Tharyn | ZedUI WindowBounds

/* START> Tharyn | ZedUI Cyberpunk
    2025-12-28
    What: Frameless window for custom titlebar
    Why: Enable cyberpunk aesthetic with custom window chrome
    Expected: Window renders without OS frame, custom titlebar handles controls
    2025-12-28
    What: Switch to titleBarOverlay for Windows snap support
    Why: frame:false breaks Aero Snap, Snap Layouts, Win+Arrow
    Expected: Full Windows snap features with themed native controls
*/
function createWindow() {
  /* START> Tharyn | ZedUI WindowBounds
      2026-01-02
      What: Load saved window bounds on creation
      Why: Restore window to previous position/size
      Expected: Window appears where user last placed it
  */
  const bounds = getWindowBounds();
  // <END Tharyn | ZedUI WindowBounds

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    title: 'ZedUI Session Launcher',
    backgroundColor: '#1c1c1c',
    frame: false,             // custom chrome (prevents OS frame overriding rounding)
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  /* START> Tharyn | ZedUI WindowBounds
      2026-01-02
      What: Save window bounds on move/resize
      Why: Persist position so window reopens in same place
      Expected: Bounds saved to settings.json after drag/resize
  */
  mainWindow.on('move', saveWindowBounds);
  mainWindow.on('resize', saveWindowBounds);
  // <END Tharyn | ZedUI WindowBounds
// <END Tharyn | ZedUI Cyberpunk

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // __dirname is dist/main/main/, renderer is at dist/renderer/
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // DevTools available via Ctrl+Shift+I or F12
  // mainWindow.webContents.openDevTools();

  /* START> Tharyn | ZedUI Spellcheck
      2026-01-27
      What: Add spellcheck context menu with suggestions
      Why: Chromium shows red squiggles but Electron doesn't auto-show suggestions
      Expected: Right-click on misspelled word shows correction options
  */
  mainWindow.webContents.on('context-menu', (event, params) => {
    // Only show native menu if there's a misspelled word with suggestions
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      const menuTemplate: Electron.MenuItemConstructorOptions[] = [];

      // Add spelling suggestions
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuTemplate.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        });
      }

      menuTemplate.push({ type: 'separator' });

      // Add to dictionary option
      menuTemplate.push({
        label: `Add "${params.misspelledWord}" to Dictionary`,
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });

      menuTemplate.push({ type: 'separator' });

      // Standard edit options
      if (params.editFlags.canCut) {
        menuTemplate.push({ label: 'Cut', role: 'cut' });
      }
      if (params.editFlags.canCopy) {
        menuTemplate.push({ label: 'Copy', role: 'copy' });
      }
      if (params.editFlags.canPaste) {
        menuTemplate.push({ label: 'Paste', role: 'paste' });
      }

      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup();
    }
    // If no misspelling, let the renderer's custom context menu handle it
  });
  // <END Tharyn | ZedUI Spellcheck

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function closeMainWindow() {
  if (!mainWindow) {
    app.quit();
    return;
  }

  if (isAppClosing) {
    return;
  }
  isAppClosing = true;

  if (saveBoundsTimeout) {
    clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = null;
  }

  const windowToClose = mainWindow;
  saveSettingsToFile({ windowBounds: windowToClose.getBounds() });
  mainWindow = null;
  windowToClose.destroy();

  setTimeout(() => {
    app.quit();
  }, 0);

  setTimeout(() => {
    app.exit(0);
  }, 1500);
}

app.whenReady().then(() => {
  // Initialize database
  initDb();

  // Setup IPC handlers
  setupIpcHandlers();

  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window controls for custom titlebar
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window:close', () => {
  closeMainWindow();
});

// Utility IPC handlers
ipcMain.handle('util:open', async (_, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('util:copy', async (_, text: string) => {
  clipboard.writeText(text);
});

ipcMain.handle('util:showInFolder', async (_, filePath: string) => {
  shell.showItemInFolder(filePath);
});
