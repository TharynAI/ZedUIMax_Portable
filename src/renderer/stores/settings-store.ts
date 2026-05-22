/**
 * settings-store.ts - Zustand store for application settings
 */

import { create } from 'zustand';
import type { PortableProviderConfig } from '../../shared/portable-config';

export interface AppSettings {
  // Display settings
  defaultDaysFilter: number;
  defaultTreeMode: 'type' | 'project' | 'date' | 'branches' | 'favorites';

  // Claude paths
  claudeBinaryPath: string;
  mcpConfigPath: string;

  // UI preferences
  confirmOnDelete: boolean;
  ungroupedCleanupBatchSize: number;
  hideEmptyTypeGroups: boolean;

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Global zoom level for UI scaling
   * Ctrl+scroll to adjust, persisted across sessions
   * 2025-12-08 Initial implementation
   */
  zoomLevel: number;
  // <END | Sphere -> Tharyn | CC

  /* START> 2026-01-02 | Tharyn | ZedUI Scrollbars
   * User-configurable scrollbar dimensions
   * Allows fine-tuning scrollbar size for different display scales
   */
  scrollbarWidth: number;
  scrollbarHeight: number;
  // <END Tharyn | ZedUI Scrollbars

  /* START> 2026-01-02 | Tharyn | ZedUI WindowBounds
   * Window position and size persistence
   * Saved by main process on move/resize, restored on app launch
   */
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // <END Tharyn | ZedUI WindowBounds

  // Sidebar width for Browse tab (tree panel)
  sidebarWidth?: number;

  // Codex launcher variant
  codexVariant?: 'codex' | 'codexSub';

  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Persist provider filter (All/Claude/Codex/Cursor) across restarts (OD-1)
      Why: Users want their last filter preserved between sessions
      Expected: Browse tab opens with the same filter chip selected as before app close
  */
  providerFilter?: 'all' | 'claude' | 'codex' | 'cursor';
  // <END Tharyn | CursorCLI

  portableConfig?: PortableProviderConfig;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultDaysFilter: 30,
  defaultTreeMode: 'type',
  claudeBinaryPath: '',
  mcpConfigPath: '',
  confirmOnDelete: true,
  ungroupedCleanupBatchSize: 10,
  hideEmptyTypeGroups: false,
  zoomLevel: 1.0,
  scrollbarWidth: 16,
  scrollbarHeight: 16,
  sidebarWidth: 420,
  codexVariant: 'codex', // default to current Codex2
  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Default provider filter to 'all'
      Why: Match prior in-memory default; no behavior change for first run
      Expected: First launch shows all providers; user choice persists thereafter
  */
  providerFilter: 'all',
  // <END Tharyn | CursorCLI
};

interface SettingsStore {
  settings: AppSettings;
  isLoaded: boolean;
  isDialogOpen: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Quick zoom level setter for Ctrl+scroll
   * Updates local state immediately, saves debounced
   * 2025-12-08 Initial implementation
   */
  setZoomLevel: (level: number) => void;
  // <END | Sphere -> Tharyn | CC
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  isDialogOpen: false,

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      set({
        settings: { ...DEFAULT_SETTINGS, ...settings },
        isLoaded: true
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },

  saveSettings: async (newSettings) => {
    try {
      const merged = { ...get().settings, ...newSettings };
      await window.electronAPI.saveSettings(merged);
      set({ settings: merged });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  resetSettings: async () => {
    try {
      await window.electronAPI.saveSettings(DEFAULT_SETTINGS);
      set({ settings: DEFAULT_SETTINGS });
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  },

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Quick zoom level setter for Ctrl+scroll
   * Clamps between 0.5 and 2.0, saves to persistent storage
   * 2025-12-08 Initial implementation
   */
  setZoomLevel: (level: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, level));
    const rounded = Math.round(clamped * 100) / 100; // Round to 2 decimal places
    set((state) => ({
      settings: { ...state.settings, zoomLevel: rounded }
    }));
    // Save to persistent storage
    window.electronAPI.saveSettings({ ...get().settings, zoomLevel: rounded });
  },
  // <END | Sphere -> Tharyn | CC
}));
