/**
 * SettingsDialog.tsx - Application settings modal
 */

import { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useSettingsStore, AppSettings } from '../stores/settings-store';

function SettingsDialog() {
  const { settings, isDialogOpen, closeDialog, saveSettings, resetSettings } = useSettingsStore();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state when dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      setLocalSettings(settings);
      setHasChanges(false);
    }
  }, [isDialogOpen, settings]);

  // Handle escape key
  useEffect(() => {
    if (!isDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialog();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closeDialog]);

  if (!isDialogOpen) return null;

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveSettings(localSettings);
    closeDialog();
  };

  const handleReset = async () => {
    await resetSettings();
    setLocalSettings(settings);
    setHasChanges(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeDialog}
      />

      {/* Dialog - Cyberpunk styling */}
      <div className="relative bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={closeDialog}
            className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* Display Settings */}
          <section>
            <h3 className="section-header mb-3">Display</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Default Days Filter
                </label>
                <select
                  value={localSettings.defaultDaysFilter}
                  onChange={(e) => handleChange('defaultDaysFilter', Number(e.target.value))}
                  className="w-full"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={365}>Last year</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Default Tree Mode
                </label>
                <select
                  value={localSettings.defaultTreeMode}
                  onChange={(e) => handleChange('defaultTreeMode', e.target.value as AppSettings['defaultTreeMode'])}
                  className="w-full"
                >
                  <option value="type">By Type</option>
                  <option value="project">By Project</option>
                  <option value="date">By Date</option>
                  <option value="branches">By Branches</option>
                  <option value="favorites">Favorites Only</option>
                </select>
              </div>

              {/* START> 2026-01-02 | Tharyn | ZedUI Scrollbars */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Scrollbar Width (px)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={32}
                    value={localSettings.scrollbarWidth}
                    onChange={(e) => handleChange('scrollbarWidth', Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Scrollbar Height (px)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={32}
                    value={localSettings.scrollbarHeight}
                    onChange={(e) => handleChange('scrollbarHeight', Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              {/* <END Tharyn | ZedUI Scrollbars */}
            </div>
          </section>

          {/* Claude Paths */}
          <section>
            <h3 className="section-header mb-3">Claude Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Claude Binary Path
                </label>
                <input
                  type="text"
                  value={localSettings.claudeBinaryPath}
                  onChange={(e) => handleChange('claudeBinaryPath', e.target.value)}
                  className="w-full font-mono text-sm"
                  placeholder="/path/to/claude"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  MCP Config Path
                </label>
                <input
                  type="text"
                  value={localSettings.mcpConfigPath}
                  onChange={(e) => handleChange('mcpConfigPath', e.target.value)}
                  className="w-full font-mono text-sm"
                  placeholder="/path/to/mcp-config.json"
                />
              </div>
            </div>
          </section>

          {/* Behavior */}
          <section>
            <h3 className="section-header mb-3">Behavior</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.confirmOnDelete}
                  onChange={(e) => handleChange('confirmOnDelete', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-accent"
                />
                <span className="text-text-primary">Confirm before deleting sessions</span>
              </label>
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Ungrouped Cleanup Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={localSettings.ungroupedCleanupBatchSize}
                  onChange={(e) => handleChange('ungroupedCleanupBatchSize', Math.max(1, Number(e.target.value) || 1))}
                  className="w-full"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button
            onClick={handleReset}
            className="btn btn-ghost text-text-secondary"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </button>

          <div className="flex gap-3">
            <button
              onClick={closeDialog}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btn-primary"
              disabled={!hasChanges}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
