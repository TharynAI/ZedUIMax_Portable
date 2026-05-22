import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getRuntimePaths } from './runtime-paths';
import type {
  PortableDiagnosticCheck,
  PortableDiagnosticsReport,
  PortableProviderKey,
  PortableProviderConfig,
  PortableSetupStatus,
  PortableWslDistroInfo,
  ProviderDefaultsDetection,
  ProviderPathStatus,
  ProviderTestResult,
} from '../shared/portable-config';

const execFileAsync = promisify(execFile);
const DETECTION_TIMEOUT_MS = 8000;

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStatus(value: unknown, fallback: ProviderPathStatus): ProviderPathStatus {
  return value === 'missing' || value === 'detected' || value === 'userConfigured' || value === 'disabled'
    ? value
    : fallback;
}

function userDocumentsPath(): string {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents');
  }
  return os.homedir();
}

function emptyStatus(enabled: boolean) {
  return enabled ? 'missing' as const : 'disabled' as const;
}

function quoteSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createDefaultPortableConfig(): PortableProviderConfig {
  const paths = getRuntimePaths();

  return {
    version: 1,
    appRoot: paths.appRoot,
    dataRoot: paths.dataDir,
    defaultWorkspaceWin: userDocumentsPath(),
    wsl: {
      enabled: false,
      distroName: '',
      userHomeWsl: '',
      userHomeUnc: '',
    },
    providers: {
      claude: {
        enabled: false,
        status: 'disabled',
        projectsDir: '',
        binaryPathWsl: '',
        mcpConfigPathWsl: '',
        launchMode: 'direct',
        newSessionScriptWsl: '',
        resumeScriptWsl: '',
      },
      codex: {
        enabled: false,
        status: 'disabled',
        sessionsDir: '',
        binaryPathWsl: '',
        newScriptWin: '',
        resumeScriptWin: '',
        subAgentNewScriptWin: '',
        subAgentResumeScriptWin: '',
      },
      cursor: {
        enabled: false,
        status: 'disabled',
        projectsDir: '',
        binaryPathWsl: '',
      },
      geminiCli: {
        enabled: false,
        status: 'disabled',
        newScriptWin: '',
        resumeScriptWin: '',
      },
      geminiApi: {
        enabled: false,
        status: 'disabled',
        keyEnvNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
      },
    },
  };
}

/* START> Tharyn | PortableInstall
    2026-05-22
    What: Normalize versioned portable provider setup stored inside settings.json
    Why: Clean clones need a machine-local setup record without hardcoded development paths
    Expected: Missing provider config becomes an explicit disabled/missing setup state instead of old local defaults
*/
export function normalizePortableConfig(value: unknown): PortableProviderConfig {
  const defaults = createDefaultPortableConfig();
  const input = asObject(value);
  const providers = asObject(input.providers);
  const wsl = asObject(input.wsl);

  const claude = asObject(providers.claude);
  const codex = asObject(providers.codex);
  const cursor = asObject(providers.cursor);
  const geminiCli = asObject(providers.geminiCli);
  const geminiApi = asObject(providers.geminiApi);

  const claudeEnabled = asBoolean(claude.enabled, defaults.providers.claude.enabled);
  const codexEnabled = asBoolean(codex.enabled, defaults.providers.codex.enabled);
  const cursorEnabled = asBoolean(cursor.enabled, defaults.providers.cursor.enabled);
  const geminiCliEnabled = asBoolean(geminiCli.enabled, defaults.providers.geminiCli.enabled);
  const geminiApiEnabled = asBoolean(geminiApi.enabled, defaults.providers.geminiApi.enabled);

  return {
    version: 1,
    appRoot: defaults.appRoot,
    dataRoot: defaults.dataRoot,
    defaultWorkspaceWin: asString(input.defaultWorkspaceWin, defaults.defaultWorkspaceWin),
    wsl: {
      enabled: asBoolean(wsl.enabled, defaults.wsl.enabled),
      distroName: asString(wsl.distroName, defaults.wsl.distroName),
      userHomeWsl: asString(wsl.userHomeWsl, defaults.wsl.userHomeWsl),
      userHomeUnc: asString(wsl.userHomeUnc, defaults.wsl.userHomeUnc),
    },
    providers: {
      claude: {
        ...defaults.providers.claude,
        enabled: claudeEnabled,
        status: asStatus(claude.status, emptyStatus(claudeEnabled)),
        verifiedAt: asString(claude.verifiedAt) || undefined,
        projectsDir: asString(claude.projectsDir, defaults.providers.claude.projectsDir),
        binaryPathWsl: asString(claude.binaryPathWsl, defaults.providers.claude.binaryPathWsl),
        mcpConfigPathWsl: asString(claude.mcpConfigPathWsl, defaults.providers.claude.mcpConfigPathWsl),
        launchMode: claude.launchMode === 'script' ? 'script' : 'direct',
        newSessionScriptWsl: asString(claude.newSessionScriptWsl, defaults.providers.claude.newSessionScriptWsl),
        resumeScriptWsl: asString(claude.resumeScriptWsl, defaults.providers.claude.resumeScriptWsl),
      },
      codex: {
        ...defaults.providers.codex,
        enabled: codexEnabled,
        status: asStatus(codex.status, emptyStatus(codexEnabled)),
        verifiedAt: asString(codex.verifiedAt) || undefined,
        sessionsDir: asString(codex.sessionsDir, defaults.providers.codex.sessionsDir),
        binaryPathWsl: asString(codex.binaryPathWsl, defaults.providers.codex.binaryPathWsl),
        newScriptWin: asString(codex.newScriptWin, defaults.providers.codex.newScriptWin),
        resumeScriptWin: asString(codex.resumeScriptWin, defaults.providers.codex.resumeScriptWin),
        subAgentNewScriptWin: asString(codex.subAgentNewScriptWin, defaults.providers.codex.subAgentNewScriptWin),
        subAgentResumeScriptWin: asString(codex.subAgentResumeScriptWin, defaults.providers.codex.subAgentResumeScriptWin),
      },
      cursor: {
        ...defaults.providers.cursor,
        enabled: cursorEnabled,
        status: asStatus(cursor.status, emptyStatus(cursorEnabled)),
        verifiedAt: asString(cursor.verifiedAt) || undefined,
        projectsDir: asString(cursor.projectsDir, defaults.providers.cursor.projectsDir),
        binaryPathWsl: asString(cursor.binaryPathWsl, defaults.providers.cursor.binaryPathWsl),
      },
      geminiCli: {
        ...defaults.providers.geminiCli,
        enabled: geminiCliEnabled,
        status: asStatus(geminiCli.status, emptyStatus(geminiCliEnabled)),
        verifiedAt: asString(geminiCli.verifiedAt) || undefined,
        newScriptWin: asString(geminiCli.newScriptWin, defaults.providers.geminiCli.newScriptWin),
        resumeScriptWin: asString(geminiCli.resumeScriptWin, defaults.providers.geminiCli.resumeScriptWin),
      },
      geminiApi: {
        ...defaults.providers.geminiApi,
        enabled: geminiApiEnabled,
        status: asStatus(geminiApi.status, emptyStatus(geminiApiEnabled)),
        verifiedAt: asString(geminiApi.verifiedAt) || undefined,
        keyEnvNames: Array.isArray(geminiApi.keyEnvNames) && geminiApi.keyEnvNames.length > 0
          ? geminiApi.keyEnvNames.map(String)
          : defaults.providers.geminiApi.keyEnvNames,
      },
    },
  };
}
// <END Tharyn | PortableInstall

function decodeCommandOutput(stdout: string | Buffer): string {
  if (Buffer.isBuffer(stdout)) {
    const hasNulls = stdout.includes(0);
    return hasNulls ? stdout.toString('utf16le') : stdout.toString('utf8');
  }
  return stdout;
}

export function parseWslDistroList(raw: string): PortableWslDistroInfo[] {
  return raw
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^NAME\s+STATE\s+VERSION$/i.test(line))
    .map((line) => {
      const isDefault = line.startsWith('*');
      const cleaned = line.replace(/^\*\s*/, '').trim();
      const parts = cleaned.split(/\s+/);
      return {
        name: parts[0] || '',
        state: parts[1] || '',
        version: parts[2] || '',
        isDefault,
      };
    })
    .filter((distro) => distro.name);
}

export async function detectWslDistros(): Promise<PortableWslDistroInfo[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const result = await execFileAsync('wsl.exe', ['-l', '-v'], {
    encoding: 'buffer',
    timeout: DETECTION_TIMEOUT_MS,
    windowsHide: true,
  });

  return parseWslDistroList(decodeCommandOutput(result.stdout as Buffer));
}

async function detectWslHome(distroName: string): Promise<string> {
  if (!distroName || process.platform !== 'win32') {
    return '';
  }

  const result = await execFileAsync('wsl.exe', ['-d', distroName, '-e', 'sh', '-lc', 'printf %s "$HOME"'], {
    encoding: 'buffer',
    timeout: DETECTION_TIMEOUT_MS,
    windowsHide: true,
  });

  return decodeCommandOutput(result.stdout as Buffer).trim();
}

function wslHomeToUnc(distroName: string, userHomeWsl: string): string {
  const home = userHomeWsl.replace(/^\/+/, '').replace(/\//g, '\\');
  return distroName && home ? `\\\\wsl.localhost\\${distroName}\\${home}` : '';
}

function appendWslHome(baseWsl: string, ...parts: string[]): string {
  return [baseWsl.replace(/\/+$/, ''), ...parts].filter(Boolean).join('/');
}

function appendUncHome(baseUnc: string, ...parts: string[]): string {
  return [baseUnc.replace(/\\+$/, ''), ...parts].filter(Boolean).join('\\');
}

export async function detectProviderDefaults(currentValue: unknown): Promise<ProviderDefaultsDetection> {
  const current = normalizePortableConfig(currentValue);
  const notes: string[] = [];
  let distroName = current.wsl.distroName;
  let userHomeWsl = current.wsl.userHomeWsl;

  if (!distroName) {
    try {
      const distros = await detectWslDistros();
      distroName = distros.find((distro) => distro.isDefault)?.name || distros[0]?.name || '';
      if (distroName) {
        notes.push(`Detected WSL distro: ${distroName}`);
      }
    } catch (error) {
      notes.push(`WSL distro detection failed: ${String(error)}`);
    }
  }

  if (distroName && !userHomeWsl) {
    try {
      userHomeWsl = await detectWslHome(distroName);
      if (userHomeWsl) {
        notes.push(`Detected WSL home: ${userHomeWsl}`);
      }
    } catch (error) {
      notes.push(`WSL home detection failed for ${distroName}: ${String(error)}`);
    }
  }

  const userHomeUnc = current.wsl.userHomeUnc || wslHomeToUnc(distroName, userHomeWsl);

  const config = normalizePortableConfig({
    ...current,
    wsl: {
      ...current.wsl,
      enabled: Boolean(distroName && userHomeWsl),
      distroName,
      userHomeWsl,
      userHomeUnc,
    },
    providers: {
      ...current.providers,
      claude: {
        ...current.providers.claude,
        projectsDir: current.providers.claude.projectsDir || appendUncHome(userHomeUnc, '.claude', 'projects'),
        status: current.providers.claude.enabled ? current.providers.claude.status : 'disabled',
      },
      codex: {
        ...current.providers.codex,
        sessionsDir: current.providers.codex.sessionsDir || appendUncHome(userHomeUnc, '.codex', 'sessions'),
        status: current.providers.codex.enabled ? current.providers.codex.status : 'disabled',
      },
      cursor: {
        ...current.providers.cursor,
        projectsDir: current.providers.cursor.projectsDir || appendUncHome(userHomeUnc, '.cursor', 'projects'),
        binaryPathWsl: current.providers.cursor.binaryPathWsl || appendWslHome(userHomeWsl, '.local', 'bin', 'cursor-agent'),
        status: current.providers.cursor.enabled ? current.providers.cursor.status : 'disabled',
      },
    },
  });

  return { config, notes };
}

function checkPath(id: string, label: string, targetPath: string): PortableDiagnosticCheck {
  return {
    id,
    label,
    status: fs.existsSync(targetPath) ? 'ok' : 'warning',
    detail: targetPath,
  };
}

function providerChecks(config: PortableProviderConfig): PortableDiagnosticCheck[] {
  return [
    {
      id: 'provider.claude',
      label: 'Claude provider',
      status: config.providers.claude.enabled ? 'warning' : 'disabled',
      detail: config.providers.claude.enabled ? 'Enabled but not verified yet.' : 'Disabled until configured.',
    },
    {
      id: 'provider.codex',
      label: 'Codex provider',
      status: config.providers.codex.enabled ? 'warning' : 'disabled',
      detail: config.providers.codex.enabled ? 'Enabled but not verified yet.' : 'Disabled until configured.',
    },
    {
      id: 'provider.cursor',
      label: 'Cursor provider',
      status: config.providers.cursor.enabled ? 'warning' : 'disabled',
      detail: config.providers.cursor.enabled ? 'Enabled but not verified yet.' : 'Disabled until configured.',
    },
    {
      id: 'provider.geminiCli',
      label: 'Gemini CLI provider',
      status: config.providers.geminiCli.enabled ? 'warning' : 'disabled',
      detail: config.providers.geminiCli.enabled ? 'Enabled but not verified yet.' : 'Disabled until configured.',
    },
    {
      id: 'provider.geminiApi',
      label: 'Gemini API provider',
      status: config.providers.geminiApi.enabled ? 'warning' : 'disabled',
      detail: config.providers.geminiApi.enabled ? 'Enabled but not verified yet.' : 'Disabled until configured.',
    },
  ];
}

function fileCheck(id: string, label: string, targetPath: string, enabled: boolean): PortableDiagnosticCheck {
  if (!enabled) {
    return { id, label, status: 'disabled', detail: 'Provider disabled.' };
  }
  if (!targetPath) {
    return { id, label, status: 'warning', detail: 'Path is not configured.' };
  }
  return {
    id,
    label,
    status: fs.existsSync(targetPath) ? 'ok' : 'warning',
    detail: targetPath,
  };
}

async function wslExecutableCheck(id: string, label: string, distroName: string, binaryPathWsl: string, enabled: boolean): Promise<PortableDiagnosticCheck> {
  if (!enabled) {
    return { id, label, status: 'disabled', detail: 'Provider disabled.' };
  }
  if (!distroName) {
    return { id, label, status: 'warning', detail: 'No WSL distro selected.' };
  }
  if (!binaryPathWsl) {
    return { id, label, status: 'warning', detail: 'Binary path is not configured.' };
  }

  try {
    await execFileAsync('wsl.exe', ['-d', distroName, '-e', 'sh', '-lc', `test -x ${quoteSingle(binaryPathWsl)}`], {
      timeout: DETECTION_TIMEOUT_MS,
      windowsHide: true,
    });
    return { id, label, status: 'ok', detail: binaryPathWsl };
  } catch {
    return { id, label, status: 'warning', detail: `${binaryPathWsl} is not executable in ${distroName}.` };
  }
}

function aggregateStatus(checks: PortableDiagnosticCheck[]) {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  if (checks.every((check) => check.status === 'disabled')) return 'disabled';
  return 'ok';
}

export async function testProvider(configValue: unknown, provider: PortableProviderKey): Promise<ProviderTestResult> {
  const config = normalizePortableConfig(configValue);
  let checks: PortableDiagnosticCheck[] = [];

  switch (provider) {
    case 'claude':
      checks = [
        fileCheck('claude.projectsDir', 'Claude projects directory', config.providers.claude.projectsDir, config.providers.claude.enabled),
        await wslExecutableCheck('claude.binary', 'Claude binary', config.wsl.distroName, config.providers.claude.binaryPathWsl, config.providers.claude.enabled),
      ];
      break;
    case 'codex':
      checks = [
        fileCheck('codex.sessionsDir', 'Codex sessions directory', config.providers.codex.sessionsDir, config.providers.codex.enabled),
        fileCheck('codex.newScript', 'Codex new-session script', config.providers.codex.newScriptWin || '', config.providers.codex.enabled),
        fileCheck('codex.resumeScript', 'Codex resume script', config.providers.codex.resumeScriptWin || '', config.providers.codex.enabled),
      ];
      break;
    case 'cursor':
      checks = [
        fileCheck('cursor.projectsDir', 'Cursor projects directory', config.providers.cursor.projectsDir, config.providers.cursor.enabled),
        await wslExecutableCheck('cursor.binary', 'Cursor binary', config.wsl.distroName, config.providers.cursor.binaryPathWsl, config.providers.cursor.enabled),
      ];
      break;
    case 'geminiCli':
      checks = [
        fileCheck('geminiCli.newScript', 'Gemini new-session script', config.providers.geminiCli.newScriptWin || '', config.providers.geminiCli.enabled),
        fileCheck('geminiCli.resumeScript', 'Gemini resume script', config.providers.geminiCli.resumeScriptWin || '', config.providers.geminiCli.enabled),
      ];
      break;
    case 'geminiApi':
      checks = config.providers.geminiApi.enabled
        ? config.providers.geminiApi.keyEnvNames.map((name) => ({
          id: `geminiApi.env.${name}`,
          label: `${name} environment variable`,
          status: process.env[name] ? 'ok' as const : 'warning' as const,
          detail: process.env[name] ? 'Visible to the app process.' : 'Not visible to the app process yet.',
        }))
        : [{ id: 'geminiApi.disabled', label: 'Gemini API provider', status: 'disabled', detail: 'Provider disabled.' }];
      break;
  }

  return {
    provider,
    status: aggregateStatus(checks),
    checks,
  };
}

export function buildPortableSetupStatus(settings: Record<string, any>): PortableSetupStatus {
  const paths = getRuntimePaths();
  const config = normalizePortableConfig(settings.portableConfig);
  const checks: PortableDiagnosticCheck[] = [
    checkPath('path.appRoot', 'Application root', paths.appRoot),
    checkPath('path.dataRoot', 'Portable data root', paths.dataDir),
    checkPath('path.userData', 'Electron userData root', paths.userDataDir),
    checkPath('path.proEngSessions', 'ProEng sessions root', paths.proEngSessionsDir),
    ...providerChecks(config),
  ];

  return {
    config,
    checks,
    incomplete: checks.some((check) => check.status === 'warning' || check.status === 'error'),
    paths: {
      appRoot: paths.appRoot,
      dataRoot: paths.dataDir,
      settingsFile: paths.settingsFile,
      dbPath: paths.dbPath,
      userDataDir: paths.userDataDir,
      logsDir: paths.logsDir,
      proEngSessionsDir: paths.proEngSessionsDir,
      proEngTemplatesDir: paths.proEngTemplatesDir,
    },
  };
}

function writeDiagnosticsLog(report: PortableDiagnosticsReport): void {
  const paths = getRuntimePaths();
  if (!fs.existsSync(paths.logsDir)) {
    fs.mkdirSync(paths.logsDir, { recursive: true });
  }
  fs.writeFileSync(report.logFile, JSON.stringify(report, null, 2), 'utf-8');
}

export async function runPortableDiagnostics(settings: Record<string, any>): Promise<PortableDiagnosticsReport> {
  const status = buildPortableSetupStatus(settings);
  let wslDistros: PortableWslDistroInfo[] = [];
  try {
    wslDistros = await detectWslDistros();
  } catch {
    wslDistros = [];
  }

  const providers: PortableProviderKey[] = ['claude', 'codex', 'cursor', 'geminiCli', 'geminiApi'];
  const providerTests = await Promise.all(
    providers.map((provider) => testProvider(status.config, provider))
  );

  const report: PortableDiagnosticsReport = {
    ...status,
    generatedAt: new Date().toISOString(),
    wslDistros,
    providerTests,
    logFile: path.join(getRuntimePaths().logsDir, 'setup.log'),
  };

  writeDiagnosticsLog(report);
  return report;
}
