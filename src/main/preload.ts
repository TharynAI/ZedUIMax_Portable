import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateProEngSessionInput,
  ProEngDefaultsConfig,
  ProEngSessionRecord,
  ProEngSessionSummary,
  SavePromptTemplateInput,
  SendProEngMessageInput,
  UpdateProEngSessionInput,
} from '../shared/proeng';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Session operations
  getSessions: (days?: number, limit?: number, providerFilter?: string[]) =>
    ipcRenderer.invoke('sessions:get', days, limit, providerFilter),
  getSessionDetails: (sessionId: string) =>
    ipcRenderer.invoke('sessions:details', sessionId),
  searchSessions: (query: string, limit?: number) =>
    ipcRenderer.invoke('sessions:search', query, limit),
  getProjects: (providerFilter?: string[]) =>
    ipcRenderer.invoke('sessions:projects', providerFilter),
  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke('sessions:delete', sessionId),

  // Annotation operations
  getAnnotation: (sessionId: string) =>
    ipcRenderer.invoke('annotation:get', sessionId),
  updateAnnotation: (sessionId: string, data: {
    userSummary?: string;
    notes?: string;
    type?: string;
  }) => ipcRenderer.invoke('annotation:update', sessionId, data),
  toggleFavorite: (sessionId: string) =>
    ipcRenderer.invoke('annotation:favorite', sessionId),
  addTags: (sessionId: string, tags: string[]) =>
    ipcRenderer.invoke('annotation:tags:add', sessionId, tags),
  removeTag: (sessionId: string, tag: string) =>
    ipcRenderer.invoke('annotation:tags:remove', sessionId, tag),
  getAllTags: () =>
    ipcRenderer.invoke('annotation:tags:all'),
  getAllTypes: () =>
    ipcRenderer.invoke('annotation:types:all'),
  createType: (name: string) =>
    ipcRenderer.invoke('type:create', name),
  renameType: (oldName: string, newName: string) =>
    ipcRenderer.invoke('type:rename', oldName, newName),
  deleteType: (name: string) =>
    ipcRenderer.invoke('type:delete', name),

  // Branch operations
  createBranch: (parentSessionId: string, branchName?: string) =>
    ipcRenderer.invoke('branch:create', parentSessionId, branchName),
  getBranches: (sessionId?: string) =>
    ipcRenderer.invoke('branch:get', sessionId),
  linkBranch: (branchId: number, childSessionId: string) =>
    ipcRenderer.invoke('branch:link', branchId, childSessionId),

  // Launch operations
  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Expose getResumeInfo on electronAPI (returns dual-shape ResumeInfo)
      Why: Phase 3 task 3.2 — renderer copy-cmd uses this instead of provider-specific local synth
      Expected: getResumeInfo(sessionId) → {sessionId, projectPath, cwd, resumeCommand, wslShellCommand, wtCommand} | null
  */
  getResumeInfo: (sessionId: string) =>
    ipcRenderer.invoke('sessions:getResumeInfo', sessionId),
  // <END Tharyn | CursorCLI
  continueSession: (sessionId: string, codexVariant?: 'codex' | 'codexSub') =>
    ipcRenderer.invoke('launch:continue', sessionId, codexVariant),
  newSession: (directory: string, providerId?: string, codexVariant?: 'codex' | 'codexSub') =>
    ipcRenderer.invoke('launch:new', directory, providerId, codexVariant),
  /* START> 2025-12-05 | Sphere -> Tharyn | CC
  * Branch session API - creates new session file with copied content
  * 2025-12-05 Initial implementation
  */
  branchSession: (sessionId: string, branchName?: string, codexVariant?: 'codex' | 'codexSub') =>
    ipcRenderer.invoke('launch:branch', sessionId, branchName, codexVariant),
  // <END | Sphere -> Tharyn | CC

  // Window controls for custom titlebar
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Utility operations
  openExternal: (url: string) =>
    ipcRenderer.invoke('util:open', url),
  copyToClipboard: (text: string) =>
    ipcRenderer.invoke('util:copy', text),
  showInFolder: (filePath: string) =>
    ipcRenderer.invoke('util:showInFolder', filePath),

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Settings API for renderer
  * 2025-12-02 Initial implementation
  */
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke('settings:save', settings),
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Session Message Search API
  * Search across message content in JSONL files
  * 2025-12-02 Initial implementation
  */
  searchMessages: (query: string, limit?: number, days?: number, providerFilter?: string[]) =>
    ipcRenderer.invoke('sessions:searchMessages', query, limit, days, providerFilter),
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
  * Session relocation API for working directory override
  * Allows moving sessions when folder is renamed
  * 2025-12-08 Initial implementation
  */
  relocateSession: (sessionId: string, newCwd: string) =>
    ipcRenderer.invoke('sessions:relocate', sessionId, newCwd),
  checkDirectoryExists: (dirPath: string) =>
    ipcRenderer.invoke('sessions:checkDirectory', dirPath),
  selectDirectory: () =>
    ipcRenderer.invoke('dialog:selectDirectory'),
  /* START> 2025-12-20 | Sphere -> Tharyn | CC
   * Path conversion for display - WSL to Windows format
   */
  toWindowsPath: (wslPath: string) =>
    ipcRenderer.invoke('path:toWindows', wslPath),
  // <END | Sphere -> Tharyn | CC

  /* START> Tharyn | ZedUI DisplayMenu
      2025-12-30
      What: Display menu preload APIs
      Why: Expose display enumeration and resolution change to renderer
      Expected: UI can get displays and change resolutions via IPC
  */
  getDisplays: () =>
    ipcRenderer.invoke('display:getDisplays'),
  setResolution: (deviceName: string, width: number, height: number) =>
    ipcRenderer.invoke('display:setResolution', deviceName, width, height),
  // <END Tharyn | ZedUI DisplayMenu

  /* START> Tharyn | ZedUI LauncherMenu
      2026-01-11
      What: Launch assistant API
      Why: Allow UI to launch Claude, Codex, Gemini sessions
      Expected: launchAssistant triggers appropriate launcher script
  */
  launchAssistant: (launcherId: string, mode: 'new' | 'resume', workspace?: string) =>
    ipcRenderer.invoke('assistant:launch', launcherId, mode, workspace),
  // <END Tharyn | ZedUI LauncherMenu

  // ProEng operations
  getProEngDefaults: () =>
    ipcRenderer.invoke('proeng:defaults'),
  listProEngSessions: () =>
    ipcRenderer.invoke('proeng:list'),
  getProEngSession: (sessionId: string) =>
    ipcRenderer.invoke('proeng:get', sessionId),
  createProEngSession: (input: CreateProEngSessionInput) =>
    ipcRenderer.invoke('proeng:create', input),
  updateProEngSession: (sessionId: string, updates: UpdateProEngSessionInput) =>
    ipcRenderer.invoke('proeng:update', sessionId, updates),
  sendProEngMessage: (sessionId: string, input: SendProEngMessageInput) =>
    ipcRenderer.invoke('proeng:send', sessionId, input),
  updateProEngPrompt: (sessionId: string, content: string) =>
    ipcRenderer.invoke('proeng:prompt:update', sessionId, content),
  saveProEngPromptTemplate: (input: SavePromptTemplateInput) =>
    ipcRenderer.invoke('proeng:prompt:saveTemplate', input),
  deleteProEngSessions: (sessionIds: string[]) =>
    ipcRenderer.invoke('proeng:delete', sessionIds),
});

// Type declaration for the exposed API
export type ElectronAPI = {
  getSessions: (days?: number, limit?: number, providerFilter?: string[]) => Promise<any[]>;
  getSessionDetails: (sessionId: string) => Promise<any>;
  searchSessions: (query: string, limit?: number) => Promise<any[]>;
  getProjects: (providerFilter?: string[]) => Promise<any[]>;
  deleteSession: (sessionId: string) => Promise<{ deleted: boolean; filePath: string; projectDisplay: string } | null>;
  getAnnotation: (sessionId: string) => Promise<any>;
  updateAnnotation: (sessionId: string, data: any) => Promise<any>;
  toggleFavorite: (sessionId: string) => Promise<boolean>;
  addTags: (sessionId: string, tags: string[]) => Promise<string[]>;
  removeTag: (sessionId: string, tag: string) => Promise<string[]>;
  getAllTags: () => Promise<any[]>;
  getAllTypes: () => Promise<{ name: string; count: number }[]>;
  createType: (name: string) => Promise<{ name: string; count: number }>;
  renameType: (oldName: string, newName: string) => Promise<number>;
  deleteType: (name: string) => Promise<boolean>;
  createBranch: (parentSessionId: string, branchName?: string) => Promise<any>;
  getBranches: (sessionId?: string) => Promise<any[]>;
  linkBranch: (branchId: number, childSessionId: string) => Promise<boolean>;
  continueSession: (sessionId: string, codexVariant?: 'codex' | 'codexSub') => Promise<void>;
  newSession: (directory: string, providerId?: string, codexVariant?: 'codex' | 'codexSub') => Promise<void>;
  /* START> Tharyn | CursorCLI
      2026-05-04
      What: branchSession.newSessionId can be null (Plan B / pending branch); add getResumeInfo type
      Why: Codex review flagged BranchResult.newSessionId nullable; Phase 3.2/3.3 dual-shape ResumeInfo
      Expected: Renderer can handle pending branches without crash; copy-cmd consumes dual-shape
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
  // <END Tharyn | CursorCLI
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;
  showInFolder: (filePath: string) => Promise<void>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<boolean>;
  searchMessages: (query: string, limit?: number, days?: number, providerFilter?: string[]) => Promise<any[]>;
  /* START> 2025-12-08 | Sphere -> Tharyn | CC */
  relocateSession: (sessionId: string, newCwd: string) => Promise<{
    success: boolean;
    oldCwd: string;
    newCwd: string;
    oldProjectFolder: string;
    newProjectFolder: string;
    entriesUpdated: number;
    error?: string;
  }>;
  checkDirectoryExists: (dirPath: string) => Promise<boolean>;
  selectDirectory: () => Promise<string | null>;
  /* START> 2025-12-20 | Sphere -> Tharyn | CC */
  toWindowsPath: (wslPath: string) => Promise<string>;
  // <END | Sphere -> Tharyn | CC
  /* START> Tharyn | ZedUI DisplayMenu
      2025-12-30
      What: Display menu TypeScript types
      Why: Type-safe display operations
      Expected: IntelliSense and type checking for display APIs
  */
  getDisplays: () => Promise<{
    success: boolean;
    displays: Array<{
      deviceName: string;
      displayNumber: number;
      currentWidth: number;
      currentHeight: number;
      isPrimary: boolean;
    }>;
    error?: string;
  }>;
  setResolution: (deviceName: string, width: number, height: number) => Promise<{
    success: boolean;
    message: string;
    details?: any;
  }>;
  // <END Tharyn | ZedUI DisplayMenu

  /* START> Tharyn | ZedUI LauncherMenu
      2026-01-11
      What: Launch assistant type declaration
  */
  launchAssistant: (launcherId: string, mode: 'new' | 'resume', workspace?: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  // <END Tharyn | ZedUI LauncherMenu

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
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
