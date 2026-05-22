/**
 * SettingsDialog.tsx - Application settings modal
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, Copy, FolderOpen, PlayCircle, RefreshCcw, RotateCcw, X } from 'lucide-react';
import { useSettingsStore, AppSettings } from '../stores/settings-store';
import type {
  PortableDiagnosticCheck,
  PortableProviderConfig,
  PortableProviderKey,
  PortableSetupStatus,
  PortableWslDistroInfo,
  ProviderTestResult,
} from '../../shared/portable-config';

const providerKeys: PortableProviderKey[] = ['claude', 'codex', 'cursor', 'geminiCli', 'geminiApi'];
const providerLabels: Record<PortableProviderKey, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  geminiCli: 'Gemini CLI',
  geminiApi: 'Gemini API',
};

function statusClass(status: PortableDiagnosticCheck['status']) {
  if (status === 'ok') return 'text-green-400';
  if (status === 'disabled') return 'text-text-secondary';
  if (status === 'error') return 'text-red-400';
  return 'text-yellow-400';
}

function cloneConfig(config: PortableProviderConfig): PortableProviderConfig {
  return JSON.parse(JSON.stringify(config)) as PortableProviderConfig;
}

function SettingsDialog() {
  const { settings, isDialogOpen, closeDialog, saveSettings, resetSettings } = useSettingsStore();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [setupStatus, setSetupStatus] = useState<PortableSetupStatus | null>(null);
  const [wslDistros, setWslDistros] = useState<PortableWslDistroInfo[]>([]);
  const [providerTests, setProviderTests] = useState<Partial<Record<PortableProviderKey, ProviderTestResult>>>({});
  const [setupMessage, setSetupMessage] = useState('');
  const [isSetupBusy, setIsSetupBusy] = useState(false);

  const portableConfig = localSettings.portableConfig || setupStatus?.config || null;
  const allProvidersDisabled = portableConfig
    ? providerKeys.every((provider) => !portableConfig.providers[provider].enabled)
    : true;

  const setupChecks = useMemo(() => setupStatus?.checks || [], [setupStatus]);

  useEffect(() => {
    if (!isDialogOpen) return;

    setLocalSettings(settings);
    setHasChanges(false);
    setSetupMessage('');
    setProviderTests({});
    setIsSetupBusy(true);

    window.electronAPI.getSetupStatus()
      .then((status) => {
        setSetupStatus(status);
        setLocalSettings((prev) => ({
          ...prev,
          portableConfig: prev.portableConfig || status.config,
        }));
      })
      .catch((error) => setSetupMessage(`Setup status failed: ${String(error)}`))
      .finally(() => setIsSetupBusy(false));
  }, [isDialogOpen, settings]);

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

  const updatePortableConfig = (updater: (config: PortableProviderConfig) => void) => {
    if (!portableConfig) return;
    const next = cloneConfig(portableConfig);
    updater(next);
    handleChange('portableConfig', next);
  };

  const refreshSetupStatus = async () => {
    const status = await window.electronAPI.getSetupStatus();
    setSetupStatus(status);
    setLocalSettings((prev) => ({ ...prev, portableConfig: status.config }));
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

  const detectWsl = async () => {
    setIsSetupBusy(true);
    try {
      const distros = await window.electronAPI.detectWslDistros();
      setWslDistros(distros);
      setSetupMessage(distros.length ? `Detected ${distros.length} WSL distro(s).` : 'No WSL distros detected.');
    } catch (error) {
      setSetupMessage(`WSL detection failed: ${String(error)}`);
    } finally {
      setIsSetupBusy(false);
    }
  };

  const detectProviderDefaults = async () => {
    setIsSetupBusy(true);
    try {
      const result = await window.electronAPI.detectProviderDefaults();
      await saveSettings({ portableConfig: result.config });
      setLocalSettings((prev) => ({ ...prev, portableConfig: result.config }));
      await refreshSetupStatus();
      setSetupMessage(result.notes.join(' | ') || 'Provider defaults refreshed.');
    } catch (error) {
      setSetupMessage(`Provider detection failed: ${String(error)}`);
    } finally {
      setIsSetupBusy(false);
    }
  };

  const testProvider = async (provider: PortableProviderKey) => {
    setIsSetupBusy(true);
    try {
      const result = await window.electronAPI.testProvider(provider);
      setProviderTests((prev) => ({ ...prev, [provider]: result }));
      setSetupMessage(`${providerLabels[provider]} status: ${result.status}`);
    } catch (error) {
      setSetupMessage(`${providerLabels[provider]} test failed: ${String(error)}`);
    } finally {
      setIsSetupBusy(false);
    }
  };

  const runDiagnostics = async () => {
    setIsSetupBusy(true);
    try {
      const report = await window.electronAPI.runSetupDiagnostics();
      setSetupStatus(report);
      const nextTests: Partial<Record<PortableProviderKey, ProviderTestResult>> = {};
      for (const test of report.providerTests) {
        nextTests[test.provider] = test;
      }
      setProviderTests(nextTests);
      setSetupMessage(`Diagnostics written: ${report.logFile}`);
    } catch (error) {
      setSetupMessage(`Diagnostics failed: ${String(error)}`);
    } finally {
      setIsSetupBusy(false);
    }
  };

  const pickWorkspace = async () => {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      updatePortableConfig((config) => {
        config.defaultWorkspaceWin = selected;
      });
    }
  };

  const backupSettings = async () => {
    await window.electronAPI.copyToClipboard(JSON.stringify(localSettings, null, 2));
    setSetupMessage('Settings JSON copied.');
  };

  const restoreSettings = () => {
    const raw = window.prompt('Paste settings JSON');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AppSettings;
      setLocalSettings(parsed);
      setHasChanges(true);
      setSetupMessage('Settings JSON loaded.');
    } catch (error) {
      setSetupMessage(`Restore failed: ${String(error)}`);
    }
  };

  const renderProviderFields = (provider: PortableProviderKey) => {
    if (!portableConfig) return null;
    const providerConfig = portableConfig.providers[provider];
    const test = providerTests[provider];

    const updateProvider = (field: string, value: string | boolean) => {
      updatePortableConfig((config) => {
        const target = config.providers[provider] as any;
        target[field] = value;
        if (field === 'enabled') {
          target.status = value ? 'missing' : 'disabled';
        }
      });
    };

    return (
      <div key={provider} className="border border-border rounded-cyber p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={providerConfig.enabled}
              onChange={(e) => updateProvider('enabled', e.target.checked)}
              className="w-4 h-4 rounded border-border accent-accent"
            />
            <span className="text-text-primary font-medium">{providerLabels[provider]}</span>
          </label>
          <button
            type="button"
            onClick={() => testProvider(provider)}
            className="btn btn-secondary text-xs"
            disabled={isSetupBusy}
          >
            <PlayCircle size={14} />
            Test
          </button>
        </div>

        {provider === 'claude' && (
          <div className="space-y-2">
            <PathInput label="Projects Dir" value={portableConfig.providers.claude.projectsDir} onChange={(value) => updateProvider('projectsDir', value)} />
            <PathInput label="Binary" value={portableConfig.providers.claude.binaryPathWsl} onChange={(value) => updateProvider('binaryPathWsl', value)} />
            <PathInput label="MCP Config" value={portableConfig.providers.claude.mcpConfigPathWsl || ''} onChange={(value) => updateProvider('mcpConfigPathWsl', value)} />
          </div>
        )}

        {provider === 'codex' && (
          <div className="space-y-2">
            <PathInput label="Sessions Dir" value={portableConfig.providers.codex.sessionsDir} onChange={(value) => updateProvider('sessionsDir', value)} />
            <PathInput label="New Script" value={portableConfig.providers.codex.newScriptWin || ''} onChange={(value) => updateProvider('newScriptWin', value)} />
            <PathInput label="Resume Script" value={portableConfig.providers.codex.resumeScriptWin || ''} onChange={(value) => updateProvider('resumeScriptWin', value)} />
          </div>
        )}

        {provider === 'cursor' && (
          <div className="space-y-2">
            <PathInput label="Projects Dir" value={portableConfig.providers.cursor.projectsDir} onChange={(value) => updateProvider('projectsDir', value)} />
            <PathInput label="Binary" value={portableConfig.providers.cursor.binaryPathWsl} onChange={(value) => updateProvider('binaryPathWsl', value)} />
          </div>
        )}

        {provider === 'geminiCli' && (
          <div className="space-y-2">
            <PathInput label="New Script" value={portableConfig.providers.geminiCli.newScriptWin || ''} onChange={(value) => updateProvider('newScriptWin', value)} />
            <PathInput label="Resume Script" value={portableConfig.providers.geminiCli.resumeScriptWin || ''} onChange={(value) => updateProvider('resumeScriptWin', value)} />
          </div>
        )}

        {provider === 'geminiApi' && (
          <PathInput
            label="Env Names"
            value={portableConfig.providers.geminiApi.keyEnvNames.join(', ')}
            onChange={(value) => updatePortableConfig((config) => {
              config.providers.geminiApi.keyEnvNames = value.split(',').map((item) => item.trim()).filter(Boolean);
            })}
          />
        )}

        {test && (
          <div className="space-y-1">
            {test.checks.map((check) => (
              <div key={check.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-text-secondary">{check.label}</span>
                <span className={`${statusClass(check.status)} text-right break-all`}>{check.status}: {check.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeDialog}
      />

      <div className="relative bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber w-full max-w-4xl mx-4 max-h-[86vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={closeDialog}
            className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {allProvidersDisabled && (
            <div className="border border-yellow-500/40 bg-yellow-500/10 rounded-cyber px-3 py-2 text-sm text-yellow-200">
              Provider setup is disabled. The app can run, but session scanning and launch actions need configured providers.
            </div>
          )}

          {setupMessage && (
            <div className="border border-accent-border bg-bg-tertiary/60 rounded-cyber px-3 py-2 text-sm text-text-secondary break-all">
              {setupMessage}
            </div>
          )}

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="section-header">Portable Setup</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={detectWsl} className="btn btn-secondary text-xs" disabled={isSetupBusy}>
                  <RefreshCcw size={14} />
                  WSL
                </button>
                <button type="button" onClick={detectProviderDefaults} className="btn btn-secondary text-xs" disabled={isSetupBusy}>
                  <RefreshCcw size={14} />
                  Detect
                </button>
                <button type="button" onClick={runDiagnostics} className="btn btn-secondary text-xs" disabled={isSetupBusy}>
                  <Activity size={14} />
                  Doctor
                </button>
              </div>
            </div>

            {portableConfig && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ReadonlyField label="App Root" value={setupStatus?.paths.appRoot || portableConfig.appRoot} />
                  <ReadonlyField label="Data Root" value={setupStatus?.paths.dataRoot || portableConfig.dataRoot} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                  <PathInput
                    label="Default Workspace"
                    value={portableConfig.defaultWorkspaceWin}
                    onChange={(value) => updatePortableConfig((config) => {
                      config.defaultWorkspaceWin = value;
                    })}
                  />
                  <button type="button" onClick={pickWorkspace} className="btn btn-secondary h-9">
                    <FolderOpen size={15} />
                    Pick
                  </button>
                </div>

                <div className="border border-border rounded-cyber p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={portableConfig.wsl.enabled}
                      onChange={(e) => updatePortableConfig((config) => {
                        config.wsl.enabled = e.target.checked;
                      })}
                      className="w-4 h-4 rounded border-border accent-accent"
                    />
                    <span className="text-text-primary font-medium">WSL</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <PathInput label="Distro" value={portableConfig.wsl.distroName} onChange={(value) => updatePortableConfig((config) => { config.wsl.distroName = value; })} />
                    <PathInput label="Home" value={portableConfig.wsl.userHomeWsl} onChange={(value) => updatePortableConfig((config) => { config.wsl.userHomeWsl = value; })} />
                    <PathInput label="UNC Home" value={portableConfig.wsl.userHomeUnc} onChange={(value) => updatePortableConfig((config) => { config.wsl.userHomeUnc = value; })} />
                  </div>
                  {wslDistros.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                      {wslDistros.map((distro) => (
                        <button
                          key={distro.name}
                          type="button"
                          onClick={() => updatePortableConfig((config) => { config.wsl.distroName = distro.name; })}
                          className="px-2 py-1 border border-border rounded-cyber hover:border-accent"
                        >
                          {distro.isDefault ? '* ' : ''}{distro.name} {distro.state}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {providerKeys.map(renderProviderFields)}
                </div>

                {setupChecks.length > 0 && (
                  <div className="space-y-1">
                    {setupChecks.map((check) => (
                      <div key={check.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="text-text-secondary">{check.label}</span>
                        <span className={`${statusClass(check.status)} text-right break-all`}>{check.status}: {check.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <h3 className="section-header mb-3">Display</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Scrollbar Width
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
                  Scrollbar Height
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
          </section>

          <section>
            <h3 className="section-header mb-3">Behavior</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <div className="flex flex-wrap gap-2">
            <button onClick={handleReset} className="btn btn-ghost text-text-secondary">
              <RotateCcw size={16} />
              Reset
            </button>
            <button onClick={backupSettings} className="btn btn-ghost text-text-secondary">
              <Copy size={16} />
              Backup
            </button>
            <button onClick={restoreSettings} className="btn btn-ghost text-text-secondary">
              <RefreshCcw size={16} />
              Restore
            </button>
          </div>

          <div className="flex gap-3">
            <button onClick={closeDialog} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary" disabled={!hasChanges}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PathInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full font-mono text-xs"
      />
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <div className="w-full min-h-[2.25rem] px-3 py-2 bg-bg-primary border border-border rounded-cyber font-mono text-xs text-text-secondary break-all">
        {value}
      </div>
    </div>
  );
}

export default SettingsDialog;
