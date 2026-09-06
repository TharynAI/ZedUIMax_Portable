import type {
  CreateProEngSessionInput,
  ProEngDefaultsConfig,
  ProEngSessionRecord,
  ProEngSessionSummary,
  SavePromptTemplateInput,
  SendProEngMessageInput,
  UpdateProEngSessionInput,
} from '../../shared/proeng';
import type {
  PortableDiagnosticsReport,
  PortableProviderConfig,
  PortableProviderKey,
  PortableSetupStatus,
  PortableWslDistroInfo,
  ProviderDefaultsDetection,
  ProviderTestResult,
} from '../../shared/portable-config';

// Type declaration for Electron API exposed via preload
export interface ElectronAPI {
  // Session operations
  getSessions: (days?: number, limit?: number, providerFilter?: string[]) => Promise<any[]>;
  getSessionDetails: (sessionId: string) => Promise<any>;
  searchSessions: (query: string, limit?: number) => Promise<any[]>;
  getProjects: (providerFilter?: string[]) => Promise<any[]>;

  // Annotation operations
  getAnnotation: (sessionId: string) => Promise<any>;
  updateAnnotation: (sessionId: string, data: {
    userSummary?: string;
    notes?: string;
    type?: string;
  }) => Promise<any>;
  toggleFavorite: (sessionId: string) => Promise<boolean>;
  addTags: (sessionId: string, tags: string[]) => Promise<string[]>;
  removeTag: (sessionId: string, tag: string) => Promise<string[]>;
  getAllTags: () => Promise<any[]>;
  getAllTypes: () => Promise<{ name: string; count: number }[]>;
  createType: (name: string) => Promise<{ name: string; count: number }>;
  renameType: (oldName: string, newName: string) => Promise<number>;
  deleteType: (name: string) => Promise<boolean>;

  // Branch operations
  createBranch: (parentSessionId: string, branchName?: string) => Promise<any>;
  getBranches: (sessionId?: string) => Promise<any[]>;
  linkBranch: (branchId: number, childSessionId: string) => Promise<boolean>;

  // Launch operations
  continueSession: (sessionId: string, codexVariant?: 'codex' | 'codexSub') => Promise<void>;
  newSession: (directory: string, providerId?: string, codexVariant?: 'codex' | 'codexSub') => Promise<void>;
  /* START> Tharyn | CursorCLI
      2026-05-04
      What: branchSession.newSessionId is now nullable + add getResumeInfo + deleteSession in renderer types
      Why: Phase 3.2/3.3 + Phase 4 — Plan B branch flow may not have a UUID immediately; copy-cmd uses getResumeInfo
      Expected: Renderer compiles when calling electronAPI.getResumeInfo(...) and handles null newSessionId
  */
  branchSession: (sessionId: string, branchName?: string, codexVariant?: 'codex' | 'codexSub') => Promise<{ success: boolean; newSessionId: string | null; branchId: number; error?: string }>;
  getResumeInfo: (sessionId: string) => Promise<{
    sessionId: string;
    projectPath: string;
    cwd: string;
    resumeCommand: string;
    wslShellCommand: string;
    wtCommand: string;
  } | null>;
  deleteSession: (sessionId: string) => Promise<{ deleted: boolean; filePath: string; projectDisplay: string } | null>;
  searchMessages: (query: string, limit?: number, days?: number, providerFilter?: string[]) => Promise<any[]>;
  relocateSession: (sessionId: string, newCwd: string) => Promise<any>;
  checkDirectoryExists: (dirPath: string) => Promise<boolean>;
  selectDirectory: () => Promise<string | null>;
  toWindowsPath: (wslPath: string) => Promise<string>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<boolean>;
  getSetupStatus: () => Promise<PortableSetupStatus>;
  savePortableConfig: (config: PortableProviderConfig) => Promise<PortableSetupStatus>;
  detectWslDistros: () => Promise<PortableWslDistroInfo[]>;
  detectProviderDefaults: () => Promise<ProviderDefaultsDetection>;
  testProvider: (provider: PortableProviderKey) => Promise<ProviderTestResult>;
  runSetupDiagnostics: () => Promise<PortableDiagnosticsReport>;
  getDisplays: () => Promise<any>;
  setResolution: (deviceName: string, width: number, height: number) => Promise<any>;
  launchAssistant: (launcherId: string, mode: 'new' | 'resume', workspace?: string) => Promise<{ success: boolean; error?: string }>;
  // <END Tharyn | CursorCLI

  // Window controls
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;

  // Utility operations
  openExternal: (url: string) => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;
  showInFolder: (filePath: string) => Promise<void>;

  // ProEng operations
  getProEngDefaults: () => Promise<ProEngDefaultsConfig & {
    starterPromptPath: string;
    starterPrompt: string;
    templatesDirectory: string;
    sessionsDirectory: string;
  }>;
  listProEngSessions: () => Promise<ProEngSessionSummary[]>;
  getProEngSession: (sessionId: string) => Promise<{
    session: ProEngSessionSummary;
    record: ProEngSessionRecord;
    activePrompt: string;
  } | null>;
  createProEngSession: (input: CreateProEngSessionInput) => Promise<{
    session: ProEngSessionSummary;
    record: ProEngSessionRecord;
    activePrompt: string;
  }>;
  updateProEngSession: (sessionId: string, updates: UpdateProEngSessionInput) => Promise<{
    session: ProEngSessionSummary;
    record: ProEngSessionRecord;
    activePrompt: string;
  } | null>;
  sendProEngMessage: (sessionId: string, input: SendProEngMessageInput) => Promise<{
    session: ProEngSessionSummary;
    record: ProEngSessionRecord;
    activePrompt: string;
  } | null>;
  updateProEngPrompt: (sessionId: string, content: string) => Promise<{
    session: ProEngSessionSummary;
    record: ProEngSessionRecord;
    activePrompt: string;
  } | null>;
  saveProEngPromptTemplate: (input: SavePromptTemplateInput) => Promise<{ filePath: string } | null>;
  deleteProEngSessions: (sessionIds: string[]) => Promise<number>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
