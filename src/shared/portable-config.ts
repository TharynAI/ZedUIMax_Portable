export type PortableSetupState = 'ok' | 'warning' | 'error' | 'disabled' | 'unknown';
export type ProviderPathStatus = 'missing' | 'detected' | 'userConfigured' | 'disabled';

export interface PortableDiagnosticCheck {
  id: string;
  label: string;
  status: PortableSetupState;
  detail: string;
}

export type PortableProviderKey = 'claude' | 'codex' | 'cursor' | 'geminiCli' | 'geminiApi';

export interface PortableWslDistroInfo {
  name: string;
  state: string;
  version: string;
  isDefault: boolean;
}

export interface PortableWslConfig {
  enabled: boolean;
  distroName: string;
  userHomeWsl: string;
  userHomeUnc: string;
}

export interface PortableProviderBase {
  enabled: boolean;
  status: ProviderPathStatus;
  verifiedAt?: string;
}

export interface ClaudeProviderConfig extends PortableProviderBase {
  projectsDir: string;
  binaryPathWsl: string;
  mcpConfigPathWsl?: string;
  launchMode: 'direct' | 'script';
  newSessionScriptWsl?: string;
  resumeScriptWsl?: string;
}

export interface CodexProviderConfig extends PortableProviderBase {
  sessionsDir: string;
  binaryPathWsl?: string;
  newScriptWin?: string;
  resumeScriptWin?: string;
  subAgentNewScriptWin?: string;
  subAgentResumeScriptWin?: string;
}

export interface CursorProviderConfig extends PortableProviderBase {
  projectsDir: string;
  binaryPathWsl: string;
}

export interface GeminiCliProviderConfig extends PortableProviderBase {
  newScriptWin?: string;
  resumeScriptWin?: string;
}

export interface GeminiApiProviderConfig extends PortableProviderBase {
  keyEnvNames: string[];
}

export interface PortableProviderConfig {
  version: 1;
  appRoot: string;
  dataRoot: string;
  defaultWorkspaceWin: string;
  wsl: PortableWslConfig;
  providers: {
    claude: ClaudeProviderConfig;
    codex: CodexProviderConfig;
    cursor: CursorProviderConfig;
    geminiCli: GeminiCliProviderConfig;
    geminiApi: GeminiApiProviderConfig;
  };
}

export interface PortableSetupStatus {
  config: PortableProviderConfig;
  checks: PortableDiagnosticCheck[];
  incomplete: boolean;
  paths: {
    appRoot: string;
    dataRoot: string;
    settingsFile: string;
    dbPath: string;
    userDataDir: string;
    logsDir: string;
    proEngSessionsDir: string;
    proEngTemplatesDir: string;
  };
}

export interface ProviderTestResult {
  provider: PortableProviderKey;
  status: PortableSetupState;
  checks: PortableDiagnosticCheck[];
}

export interface ProviderDefaultsDetection {
  config: PortableProviderConfig;
  notes: string[];
}

export interface PortableDiagnosticsReport extends PortableSetupStatus {
  generatedAt: string;
  wslDistros: PortableWslDistroInfo[];
  providerTests: ProviderTestResult[];
  logFile: string;
}
