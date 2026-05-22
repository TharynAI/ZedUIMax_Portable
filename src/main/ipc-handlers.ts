/**
 * ipc-handlers.ts - IPC handlers for main/renderer communication.
 */

import { ipcMain, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  getSessions,
  getSessionDetails,
  getAllProjects,
  getResumeInfo,
  formatSize,
  formatAge,
  formatDate,
  getShortId,
  deleteSession,
  searchMessages,
} from './session-store';
import {
  getAnnotation,
  setAnnotation,
  toggleFavorite,
  addTags,
  removeTag,
  getAllTags,
  getAllTypes,
  createType,
  renameType,
  deleteType,
  search,
  createBranch,
  linkBranch,
  getBranches,
} from './metadata-db';
import { continueSession, newSession, branchSession } from './launcher';
import { relocateSession, directoryExists } from './session-relocator';
import {
  buildPortableSetupStatus,
  detectProviderDefaults,
  detectWslDistros,
  normalizePortableConfig,
  runPortableDiagnostics,
  testProvider,
} from './portable-config';
import { getRuntimePaths } from './runtime-paths';
import {
  createProEngSession,
  deleteProEngSessions,
  getProEngDefaults,
  getProEngSession,
  listProEngSessions,
  saveProEngPromptTemplate,
  sendProEngMessage,
  updateProEngPrompt,
  updateProEngSession,
} from './proeng-store';
import { DEFAULT_DAYS, DEFAULT_LIMIT } from '../shared/constants';
import { toWslPath } from './provider-utils';
import type {
  CreateProEngSessionInput,
  SavePromptTemplateInput,
  SendProEngMessageInput,
  UpdateProEngSessionInput,
} from '../shared/proeng';
import type { PortableProviderConfig, PortableProviderKey } from '../shared/portable-config';

function toWindowsPath(p: string): string {
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) {
    const drive = m[1].toUpperCase();
    const rest = m[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return p;
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Settings persistence using JSON file
* Store app settings in data/settings.json alongside SQLite database
* 2025-12-02 Initial implementation
*/
const DEFAULT_ASSISTANT_WORKSPACE_WIN = 'E:\\ZedBang\\Projects';
const DEFAULT_ASSISTANT_WORKSPACE_WSL = '/mnt/e/ZedBang/Projects';

function getSettingsFile(): string {
  return getRuntimePaths().settingsFile;
}

/* START> Tharyn | ZedUI WindowBounds
    2026-01-02
    What: Add window bounds to settings interface
    Why: Persist window position and size across app restarts
    Expected: Window reopens at same position/size as when closed
*/
interface AppSettings {
  defaultDaysFilter: number;
  defaultTreeMode: 'type' | 'project' | 'date' | 'branches' | 'favorites';
  claudeBinaryPath: string;
  mcpConfigPath: string;
  confirmOnDelete: boolean;
  ungroupedCleanupBatchSize?: number;
  hideEmptyTypeGroups?: boolean;
  // Window position/size persistence
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  portableConfig?: PortableProviderConfig;
}
// <END Tharyn | ZedUI WindowBounds

export function loadSettings(): Partial<AppSettings> {
  try {
    const settingsFile = getSettingsFile();
    if (fs.existsSync(settingsFile)) {
      const content = fs.readFileSync(settingsFile, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        portableConfig: normalizePortableConfig(parsed.portableConfig),
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return { portableConfig: normalizePortableConfig(undefined) };
}

export function saveSettingsToFile(settings: Partial<AppSettings>): void {
  try {
    const settingsFile = getSettingsFile();
    const dir = path.dirname(settingsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Merge with existing settings to preserve other values
    const existing = loadSettings();
    const merged = {
      ...existing,
      ...settings,
      portableConfig: normalizePortableConfig(settings.portableConfig || existing.portableConfig),
    };
    fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}
// <END | Sphere -> Tharyn | CC

/**
 * Enhance session with annotation and display properties.
 */
function enhanceSession(session: any) {
  const annotation = getAnnotation(session.sessionId);

  return {
    ...session,
    annotation: annotation || undefined,
    displaySummary: annotation?.userSummary || session.autoSummary || session.firstMessage || '(No summary)',
    shortId: getShortId(session.sessionId),
    sizeDisplay: formatSize(session.fileSize),
    ageDisplay: formatAge(session.timestamp),
    dateDisplay: formatDate(session.timestamp),
  };
}

/**
 * Setup all IPC handlers.
 */
export function setupIpcHandlers(): void {
  // Session operations
  ipcMain.handle('sessions:get', async (_, days?: number, limit?: number, providerFilter?: string[]) => {
    const sessions = getSessions(providerFilter as any, days || DEFAULT_DAYS, limit || DEFAULT_LIMIT);
    return sessions.map(enhanceSession);
  });

  ipcMain.handle('sessions:details', async (_, sessionId: string) => {
    const details = getSessionDetails(sessionId);
    if (!details) return null;
    return enhanceSession(details);
  });

  ipcMain.handle('sessions:search', async (_, query: string, limit?: number) => {
    const results = search(query, limit || 20);

    // Enhance results with full session info
    return results.map(r => {
      const details = getSessionDetails(r.sessionId);
      if (details) {
        return enhanceSession(details);
      }
      return {
        sessionId: r.sessionId,
        displaySummary: r.userSummary || r.autoSummary || r.firstMessage,
        shortId: getShortId(r.sessionId),
        rank: r.rank,
      };
    }).filter(Boolean);
  });

  ipcMain.handle('sessions:projects', async (_event, providerFilter?: string[]) => {
    return getAllProjects(providerFilter as any);
  });

  // Annotation operations
  ipcMain.handle('annotation:get', async (_, sessionId: string) => {
    return getAnnotation(sessionId);
  });

  ipcMain.handle('annotation:update', async (_, sessionId: string, data: {
    userSummary?: string;
    notes?: string;
    type?: string;
  }) => {
    return setAnnotation(sessionId, data);
  });

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Structured logging for favorite/tag IPC paths (Gemini Missing item)
      Why: Cursor sessions need observable lifecycle so issues can be diagnosed without re-running the UI
      Expected: console.log emits one JSON line per action with provider/sessionId/result/durationMs
  */
  ipcMain.handle('annotation:favorite', async (_, sessionId: string) => {
    const started = Date.now();
    const provider = sessionId.split(':')[0] || 'unknown';
    const result = toggleFavorite(sessionId);
    try {
      console.log(JSON.stringify({ provider, action: 'favorite', sessionId, result: 'ok', isFavorite: result, durationMs: Date.now() - started }));
    } catch { /* ignore */ }
    return result;
  });

  ipcMain.handle('annotation:tags:add', async (_, sessionId: string, tags: string[]) => {
    const started = Date.now();
    const provider = sessionId.split(':')[0] || 'unknown';
    const result = addTags(sessionId, tags);
    try {
      console.log(JSON.stringify({ provider, action: 'tagsAdd', sessionId, result: 'ok', count: result.length, durationMs: Date.now() - started }));
    } catch { /* ignore */ }
    return result;
  });

  ipcMain.handle('annotation:tags:remove', async (_, sessionId: string, tag: string) => {
    const started = Date.now();
    const provider = sessionId.split(':')[0] || 'unknown';
    const result = removeTag(sessionId, tag);
    try {
      console.log(JSON.stringify({ provider, action: 'tagsRemove', sessionId, tag, result: 'ok', remaining: result.length, durationMs: Date.now() - started }));
    } catch { /* ignore */ }
    return result;
  });
  // <END Tharyn | CursorCLI

  ipcMain.handle('annotation:tags:all', async () => {
    return getAllTags();
  });

  ipcMain.handle('annotation:types:all', async () => {
    return getAllTypes();
  });

  ipcMain.handle('type:create', async (_, name: string) => {
    return createType(name);
  });

  ipcMain.handle('type:rename', async (_, oldName: string, newName: string) => {
    return renameType(oldName, newName);
  });

  ipcMain.handle('type:delete', async (_, name: string) => {
    return deleteType(name);
  });

  // Branch operations
  ipcMain.handle('branch:create', async (_, parentSessionId: string, branchName?: string) => {
    return createBranch(parentSessionId, branchName);
  });

  ipcMain.handle('branch:get', async (_, sessionId?: string) => {
    return getBranches(sessionId);
  });

  ipcMain.handle('branch:link', async (_, branchId: number, childSessionId: string) => {
    return linkBranch(branchId, childSessionId);
  });

  // Launch operations
  ipcMain.handle('launch:continue', async (_, sessionId: string, codexVariant?: 'codex' | 'codexSub') => {
    await continueSession(sessionId, { codexVariant });
  });

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Expose sessions:getResumeInfo IPC channel returning dual-shape ResumeInfo
      Why: Phase 3 task 3.2 — renderer Copy Resume Cmd should call getResumeInfo() instead of synthesizing the command locally with provider-specific drift (ContextMenu/SessionPreview)
      Expected: window.electronAPI.getResumeInfo(sessionId) returns {sessionId, projectPath, cwd, resumeCommand, wslShellCommand, wtCommand} or null
  */
  ipcMain.handle('sessions:getResumeInfo', async (_, sessionId: string) => {
    return getResumeInfo(sessionId);
  });
  // <END Tharyn | CursorCLI

  ipcMain.handle('launch:new', async (_, directory: string, providerId?: string, codexVariant?: 'codex' | 'codexSub') => {
    await newSession(directory, (providerId as any) || 'claude', { codexVariant });
  });

  /* START> 2025-12-05 | Sphere -> Tharyn | CC
  * Branch session: Copy file with new UUID and launch
  * Creates a true branch with separate session file
  * 2025-12-05 Initial implementation
  */
  ipcMain.handle('launch:branch', async (_, sessionId: string, branchName?: string, codexVariant?: 'codex' | 'codexSub') => {
    return branchSession(sessionId, branchName, { codexVariant });
  });
  // <END | Sphere -> Tharyn | CC

  // Delete operations
  ipcMain.handle('sessions:delete', async (_, sessionId: string) => {
    return deleteSession(sessionId);
  });

  ipcMain.handle('proeng:defaults', async () => {
    return getProEngDefaults();
  });

  ipcMain.handle('proeng:list', async () => {
    return listProEngSessions();
  });

  ipcMain.handle('proeng:get', async (_, sessionId: string) => {
    return getProEngSession(sessionId);
  });

  ipcMain.handle('proeng:create', async (_, input: CreateProEngSessionInput) => {
    return createProEngSession(input);
  });

  ipcMain.handle('proeng:update', async (_, sessionId: string, updates: UpdateProEngSessionInput) => {
    return updateProEngSession(sessionId, updates);
  });

  ipcMain.handle('proeng:send', async (_, sessionId: string, input: SendProEngMessageInput) => {
    return sendProEngMessage(sessionId, input);
  });

  ipcMain.handle('proeng:prompt:update', async (_, sessionId: string, content: string) => {
    return updateProEngPrompt(sessionId, content);
  });

  ipcMain.handle('proeng:prompt:saveTemplate', async (_, input: SavePromptTemplateInput) => {
    if (!input.filePath) {
      const session = getProEngSession(input.sessionId);
      const defaultPath = session
        ? path.join(app.getPath('documents'), `${session.session.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'proeng-template'}.md`)
        : path.join(app.getPath('documents'), 'proeng-template.md');

      const result = await dialog.showSaveDialog({
        title: 'Save Prompt Template',
        defaultPath,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      return saveProEngPromptTemplate({ ...input, filePath: result.filePath });
    }

    return saveProEngPromptTemplate(input);
  });

  ipcMain.handle('proeng:delete', async (_, sessionIds: string[]) => {
    return deleteProEngSessions(sessionIds);
  });

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Settings IPC handlers
  * 2025-12-02 Initial implementation
  */
  ipcMain.handle('settings:get', async () => {
    return loadSettings();
  });

  ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
    saveSettingsToFile(settings);
    return true;
  });
  // <END | Sphere -> Tharyn | CC

  /* START> Tharyn | PortableInstall
      2026-05-22
      What: Setup status/config IPC foundation
      Why: Portable setup UI needs main-process-owned normalized paths and provider state
      Expected: Renderer can read setup status and save a versioned portableConfig without touching launch code yet
  */
  ipcMain.handle('setup:getStatus', async () => {
    return buildPortableSetupStatus(loadSettings() as Record<string, any>);
  });

  ipcMain.handle('setup:saveConfig', async (_, config: PortableProviderConfig) => {
    saveSettingsToFile({ portableConfig: normalizePortableConfig(config) });
    return buildPortableSetupStatus(loadSettings() as Record<string, any>);
  });

  ipcMain.handle('setup:detectWslDistros', async () => {
    return detectWslDistros();
  });

  ipcMain.handle('setup:detectProviderDefaults', async () => {
    const detection = await detectProviderDefaults((loadSettings() as Record<string, any>).portableConfig);
    saveSettingsToFile({ portableConfig: detection.config });
    return detection;
  });

  ipcMain.handle('setup:testProvider', async (_, provider: PortableProviderKey) => {
    return testProvider((loadSettings() as Record<string, any>).portableConfig, provider);
  });

  ipcMain.handle('setup:runDiagnostics', async () => {
    return runPortableDiagnostics(loadSettings() as Record<string, any>);
  });
  // <END Tharyn | PortableInstall

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Session Message Search IPC handler
  * Searches across message content in JSONL files
  * 2025-12-02 Initial implementation
  */
  ipcMain.handle('sessions:searchMessages', async (_, query: string, limit?: number, days?: number, providerFilter?: string[]) => {
    return searchMessages(query, limit || 50, days || 30, providerFilter as any);
  });
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
  * Session relocation handlers for working directory override
  * Allows moving sessions to new working directory when folder renamed
  * 2025-12-08 Initial implementation
  */
  ipcMain.handle('sessions:relocate', async (_, sessionId: string, newCwd: string) => {
    return relocateSession(sessionId, newCwd);
  });

  ipcMain.handle('sessions:checkDirectory', async (_, dirPath: string) => {
    return directoryExists(dirPath);
  });

  /* START> Tharyn | ZedUI Windows
      2025-12-28
      What: Pure JS path conversion instead of wslpath
      Why: wslpath not available when running as native Windows app
      Expected: /mnt/e/path -> E:\path conversion without WSL dependency
      2025-12-28
      What: Added toWslPath for Windows-to-WSL conversion
      Why: Folder selector returns Windows paths on native Windows app
      Expected: E:\path -> /mnt/e/path for session file compatibility
  */
  // Convert WSL path to Windows path for display
  ipcMain.handle('path:toWindows', async (_, wslPath: string) => {
    try {
      if (!wslPath) return wslPath;

      // Handle /mnt/<drive>/<path> format
      const mntMatch = wslPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
      if (mntMatch) {
        const drive = mntMatch[1].toUpperCase();
        const restPath = mntMatch[2].replace(/\//g, '\\');
        return `${drive}:\\${restPath}`;
      }

      // Handle \\wsl.localhost\... UNC paths (already Windows format)
      if (wslPath.startsWith('\\\\wsl')) {
        return wslPath;
      }

      return wslPath; // Return original if not recognized
    } catch {
      return wslPath; // Return original on error
    }
  });

  // Convert Windows path to WSL path for storage
  ipcMain.handle('path:toWsl', async (_, winPath: string) => {
    return toWslPath(winPath);
  });
  // <END Tharyn | ZedUI Windows

  /* START> 2025-12-20 | Sphere -> Tharyn | CC
   * Windows folder picker with path conversion
   * Uses Electron's native dialog starting at /mnt to show Windows drives
   * Returns WSL path format for Claude compatibility
   * 2025-12-20 Initial implementation - PowerShell approach
   * 2025-12-20 Fixed to use Electron dialog.showOpenDialog instead
   * 2025-12-20 Set defaultPath to /mnt to show Windows drives
   * 2025-12-28 Tharyn: Convert Windows paths to WSL format for native Windows app
   */
  ipcMain.handle('dialog:selectDirectory', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Working Directory',
        defaultPath: '/mnt', // Start at Windows drives mount point
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null; // User cancelled
      }

      const selectedPath = result.filePaths[0];

      // On native Windows, dialog returns Windows paths (E:\path)
      // Convert to WSL format for session file compatibility
      const wslPath = toWslPath(selectedPath);
      console.log(`Selected folder: ${selectedPath} -> WSL: ${wslPath}`);
      return wslPath;
    } catch (error) {
      console.error('Folder picker error:', error);
      return null;
    }
  });
  // <END | Sphere -> Tharyn | CC

  /* START> Tharyn | ZedUI DisplayMenu
      2025-12-30
      What: Display enumeration and resolution change IPC handlers
      Why: Enable display resolution dropdown menu functionality
      Expected: Get display list with device names, change resolution by device
  */
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Get list of displays with current resolutions
  ipcMain.handle('display:getDisplays', async () => {
    try {
      // Use app root so scripts are found in dev (source) and prod (packaged)
      const scriptPath = toWindowsPath(path.join(getRuntimePaths().appRoot, 'scripts', 'getDisplays.ps1'));
      const { stdout, stderr } = await execAsync(
        `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`
      );

      if (stderr) {
        console.error('Display enumeration stderr:', stderr);
      }

      const displays = JSON.parse(stdout.trim());
      return { success: true, displays };
    } catch (error: any) {
      console.error('Failed to enumerate displays:', error);
      return {
        success: false,
        error: error.message,
        displays: []
      };
    }
  });

  // Change display resolution
  ipcMain.handle('display:setResolution', async (_, deviceName: string, width: number, height: number) => {
    try {
      const scriptPath = toWindowsPath(path.join(getRuntimePaths().appRoot, 'scripts', 'setResolution.ps1'));
      const { stdout, stderr } = await execAsync(
        `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" -DeviceName "${deviceName}" -Width ${width} -Height ${height}`
      );

      if (stderr) {
        console.error('Resolution change stderr:', stderr);
      }

      const result = JSON.parse(stdout.trim());
      return result;
    } catch (error: any) {
      console.error('Failed to change resolution:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  // <END Tharyn | ZedUI DisplayMenu

  /* START> Tharyn | ZedUI LauncherMenu
      2026-01-11
      What: IPC handler to launch different AI assistants
      Why: Support launching Claude, Codex, and Gemini from menu
      Expected: Each assistant launches in Windows Terminal
  */
  ipcMain.handle('assistant:launch', async (_, launcherId: string, mode: 'new' | 'resume', workspace?: string) => {
    try {
      const workspaceWin = workspace || DEFAULT_ASSISTANT_WORKSPACE_WIN;
      const workspaceWsl = toWslPath(workspaceWin) || DEFAULT_ASSISTANT_WORKSPACE_WSL;

      /* START> Tharyn | CursorCLI
          2026-05-04
          What: Cursor route in assistant:launch — delegates to newSession() (mode=new) using passed workspace
          Why: Phase 3 task 3.6 — Cursor needs a workspace; resume from Rocket menu uses `cursor-agent resume` (latest) since LauncherMenu has no session context
          Expected: Cursor → New launches `wt wsl --cd <ws> -- cursor-agent --workspace <ws>`; Cursor → Resume launches latest via `cursor-agent resume`
      */
      if (launcherId === 'cursor') {
        if (mode === 'new') {
          await newSession(workspaceWin, 'cursor');
          return { success: true };
        }
        // resume → latest (no specific session ID from Rocket menu)
        const cmd = `powershell.exe -Command "wt wsl --cd '${workspaceWsl}' -- /root/.local/bin/cursor-agent --workspace '${workspaceWsl}' resume"`;
        await execAsync(cmd);
        return { success: true };
      }
      // <END Tharyn | CursorCLI

      // Define launcher scripts for each assistant
      const launchers: Record<string, { new: string; resume: string }> = {
        claude2: {
          new: `wt wsl -- /mnt/e/ZedBang/CLI/Cust/Claude2/_Launcher/launch-sessions.sh '${workspaceWsl}'`,
          resume: `wt wsl -- /mnt/e/ZedBang/CLI/Cust/Claude2/_Launcher/launch-with-validation-resume.sh '${workspaceWsl}'`,
        },
        codex2: {
          new: `powershell.exe -ExecutionPolicy Bypass -File "E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex.ps1" -PathFromExplorer "${workspaceWin}"`,
          resume: `powershell.exe -ExecutionPolicy Bypass -File "E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex_resume.ps1" -PathFromExplorer "${workspaceWin}"`,
        },
        gemini3: {
          new: `powershell.exe -ExecutionPolicy Bypass -File "E:\\ZedBang\\CLI\\Cust\\Gemini3\\_Launcher\\gemini3-launcher.ps1" -PathFromExplorer "${workspaceWin}"`,
          resume: `powershell.exe -ExecutionPolicy Bypass -File "E:\\ZedBang\\CLI\\Cust\\Gemini3\\_Launcher\\gemini3-launcher-resume.ps1" -PathFromExplorer "${workspaceWin}"`,
        },
      };

      const launcher = launchers[launcherId];
      if (!launcher) {
        return { success: false, error: `Unknown launcher: ${launcherId}` };
      }

      const command = launcher[mode];
      await execAsync(command);

      return { success: true };
    } catch (error: any) {
      console.error(`Failed to launch ${launcherId} (${mode}):`, error);
      return { success: false, error: error.message };
    }
  });
  // <END Tharyn | ZedUI LauncherMenu
}
