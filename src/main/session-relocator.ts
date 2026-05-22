/**
 * session-relocator.ts - Relocate sessions to a new working directory
 *
 * START> 2025-12-08 | Sphere -> Tharyn | CC
 * Handles moving session JSONL files when working directory changes
 * Updates cwd field in all entries and moves file to correct project folder
 * 2025-12-08 Initial implementation
 * 2025-12-28 Tharyn: Add Windows-to-WSL path conversion for native Windows app
 * 2026-05-04 Tharyn | CursorCLI:
 *   What: Provider-prefix-aware dispatch (Codex review #3, #4)
 *   Why: Existing implementation searched ONLY Claude folders even when called with `codex:<uuid>` or `cursor:<uuid>`
 *   Expected: relocateSession strips provider prefix and routes:
 *     - claude → existing JSONL move + cwd rewrite
 *     - codex  → cwd_override metadata write (Codex sessions have cwd embedded but rewrite is unsafe today; OD-3 to be revisited)
 *     - cursor → cwd_override metadata write only (Cursor JSONL has no embedded cwd per Phase 0)
 */

import fs from 'fs';
import path from 'path';
import { setCwdOverride } from './metadata-db';
import { loadPortableConfigFromSettingsFile } from './portable-config';
import { parseProviderSessionId, toWslPath, wslToWindowsPath } from './provider-utils';
import type { ProviderId } from '../shared/constants';

export interface RelocationResult {
  success: boolean;
  oldCwd: string;
  newCwd: string;
  oldProjectFolder: string;
  newProjectFolder: string;
  entriesUpdated: number;
  error?: string;
}

/**
 * Convert a cwd path to Claude's project folder naming convention.
 * /mnt/e/ZedBang → -mnt-e-ZedBang
 */
export function cwdToProjectFolder(cwd: string): string {
  return cwd
    .replace(/\/_/g, '--')  // Escape leading underscores in path segments
    .replace(/_/g, '-')      // Replace remaining underscores
    .replace(/\//g, '-');    // Replace slashes (results in leading -)
}

function getConfiguredProviderRoot(providerId: ProviderId): string {
  const config = loadPortableConfigFromSettingsFile();
  switch (providerId) {
    case 'claude':
      return config.providers.claude.enabled ? config.providers.claude.projectsDir.trim() : '';
    case 'codex':
      return config.providers.codex.enabled ? config.providers.codex.sessionsDir.trim() : '';
    case 'cursor':
      return config.providers.cursor.enabled ? config.providers.cursor.projectsDir.trim() : '';
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      return '';
    }
  }
}

function getWritableProviderRoot(providerId: ProviderId): string | null {
  const root = getConfiguredProviderRoot(providerId);
  if (!root || !fs.existsSync(root)) {
    return null;
  }
  return root;
}

/**
 * Find the session file across all project folders.
 * Returns the full path to the JSONL file, or null if not found.
 */
export function findSessionFile(sessionId: string, projectsRoot = getConfiguredProviderRoot('claude')): string | null {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return null;
  }

  const projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  for (const projectDir of projectDirs) {
    const sessionFile = path.join(projectsRoot, projectDir.name, `${sessionId}.jsonl`);
    if (fs.existsSync(sessionFile)) {
      return sessionFile;
    }
  }

  return null;
}

/**
 * Check if a directory exists on the filesystem.
 * Handles both WSL paths (/mnt/e/...) and Windows paths (E:\...).
 * On native Windows, converts WSL paths to Windows paths for fs.existsSync.
 */
export function directoryExists(dirPath: string): boolean {
  try {
    // On native Windows, convert WSL paths to Windows paths for filesystem checks
    const checkPath = process.platform === 'win32' ? wslToWindowsPath(dirPath) : dirPath;
    return fs.existsSync(checkPath) && fs.statSync(checkPath).isDirectory();
  } catch {
    return false;
  }
}

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Provider-aware relocate dispatcher (entry point) — strips prefix and routes per provider
    Why: Codex review #3, #4 — single relocateSession() previously assumed Claude paths and broke for codex/cursor IDs
    Expected:
      - claude:<uuid>  → relocateClaudeSession (full file move + cwd rewrite)
      - codex:<uuid>   → metadata-only cwd_override write (Codex JSONL rewrite deferred — out of Phase 2b scope)
      - cursor:<uuid>  → metadata-only cwd_override write (Cursor JSONL has no embedded cwd per Phase 0)
*/
export function relocateSession(sessionId: string, newCwd: string): RelocationResult {
  const started = Date.now();
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const providerRoot = getWritableProviderRoot(providerId);

  // Normalize newCwd to WSL form (relocateClaudeSession expects WSL paths in JSONL; cwd_override stores normalized form)
  const normalizedNewCwd = toWslPath(newCwd).replace(/\/+$/, '');

  let result: RelocationResult;

  if (!providerRoot) {
    result = {
      success: false,
      oldCwd: '',
      newCwd: normalizedNewCwd,
      oldProjectFolder: '',
      newProjectFolder: '',
      entriesUpdated: 0,
      error: `Provider root is not configured or does not exist: ${providerId}`,
    };
  } else {

    switch (providerId) {
      case 'claude':
        result = relocateClaudeSession(rawId, normalizedNewCwd, providerRoot);
        break;
      case 'codex':
      case 'cursor': {
        // Metadata-only path: write cwd_override on the annotation row (using the full provider-prefixed ID)
        if (!directoryExists(normalizedNewCwd)) {
          result = {
            success: false,
            oldCwd: '',
            newCwd: normalizedNewCwd,
            oldProjectFolder: '',
            newProjectFolder: '',
            entriesUpdated: 0,
            error: `Directory does not exist: ${normalizedNewCwd}`,
          };
        } else {
          try {
            setCwdOverride(sessionId, normalizedNewCwd);
            result = {
              success: true,
              oldCwd: '',
              newCwd: normalizedNewCwd,
              oldProjectFolder: '',
              newProjectFolder: '',
              entriesUpdated: 0, // metadata-only — no JSONL entries touched
            };
          } catch (err) {
            result = {
              success: false,
              oldCwd: '',
              newCwd: normalizedNewCwd,
              oldProjectFolder: '',
              newProjectFolder: '',
              entriesUpdated: 0,
              error: `Failed to write cwd_override: ${err}`,
            };
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = providerId;
        void _exhaustive;
        result = {
          success: false,
          oldCwd: '',
          newCwd: normalizedNewCwd,
          oldProjectFolder: '',
          newProjectFolder: '',
          entriesUpdated: 0,
          error: 'Unknown provider',
        };
      }
    }
  }

  try {
    console.log(JSON.stringify({
      provider: providerId,
      action: 'relocate',
      sessionId,
      result: result.success ? 'ok' : 'fail',
      newCwd: normalizedNewCwd,
      entriesUpdated: result.entriesUpdated,
      error: result.error,
      durationMs: Date.now() - started,
    }));
  } catch { /* ignore */ }

  return result;
}
// <END Tharyn | CursorCLI

/**
 * Relocate a Claude session to a new working directory.
 *
 * This function:
 * 1. Validates the new directory exists
 * 2. Reads the entire JSONL file
 * 3. Updates the cwd field in every entry
 * 4. Creates the new project folder if needed
 * 5. Writes the updated JSONL to the new location
 * 6. Deletes the old JSONL file
 */
function relocateClaudeSession(sessionId: string, newCwd: string, projectsRoot: string): RelocationResult {
  // newCwd is already normalized by caller

  // Find the current session file
  const currentFile = findSessionFile(sessionId, projectsRoot);
  if (!currentFile) {
    return {
      success: false,
      oldCwd: '',
      newCwd,
      oldProjectFolder: '',
      newProjectFolder: '',
      entriesUpdated: 0,
      error: `Session not found: ${sessionId}`,
    };
  }

  // Validate new directory exists
  if (!directoryExists(newCwd)) {
    return {
      success: false,
      oldCwd: '',
      newCwd,
      oldProjectFolder: path.basename(path.dirname(currentFile)),
      newProjectFolder: cwdToProjectFolder(newCwd),
      entriesUpdated: 0,
      error: `Directory does not exist: ${newCwd}`,
    };
  }

  const oldProjectFolder = path.basename(path.dirname(currentFile));
  const newProjectFolder = cwdToProjectFolder(newCwd);
  const newProjectDir = path.join(projectsRoot, newProjectFolder);
  const newFile = path.join(newProjectDir, `${sessionId}.jsonl`);

  // Check if target file already exists (shouldn't happen with UUIDs, but be safe)
  if (fs.existsSync(newFile) && currentFile !== newFile) {
    return {
      success: false,
      oldCwd: '',
      newCwd,
      oldProjectFolder,
      newProjectFolder,
      entriesUpdated: 0,
      error: `Session file already exists in target folder: ${newFile}`,
    };
  }

  try {
    // Read the current file
    const content = fs.readFileSync(currentFile, 'utf-8');
    const lines = content.split('\n');

    let oldCwd = '';
    let entriesUpdated = 0;
    const updatedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        updatedLines.push(line);
        continue;
      }

      try {
        const entry = JSON.parse(line);

        // Capture the old cwd from first entry that has it
        if (!oldCwd && entry.cwd) {
          oldCwd = entry.cwd;
        }

        // Update cwd if present
        if ('cwd' in entry) {
          entry.cwd = newCwd;
          entriesUpdated++;
        }

        updatedLines.push(JSON.stringify(entry));
      } catch {
        // Keep malformed lines as-is
        updatedLines.push(line);
      }
    }

    // If old and new are the same, nothing to do
    if (oldCwd === newCwd) {
      return {
        success: true,
        oldCwd,
        newCwd,
        oldProjectFolder,
        newProjectFolder,
        entriesUpdated: 0,
        error: 'Working directory unchanged',
      };
    }

    // Create new project folder if needed
    if (!fs.existsSync(newProjectDir)) {
      fs.mkdirSync(newProjectDir, { recursive: true });
      console.log(`Created project folder: ${newProjectDir}`);
    }

    // Write updated content to new location
    const updatedContent = updatedLines.join('\n');
    fs.writeFileSync(newFile, updatedContent, 'utf-8');
    console.log(`Wrote updated session to: ${newFile}`);

    // Delete old file if it's in a different location
    if (currentFile !== newFile) {
      fs.unlinkSync(currentFile);
      console.log(`Deleted old session file: ${currentFile}`);

      // Clean up old project folder if empty
      const oldProjectDir = path.dirname(currentFile);
      const remainingFiles = fs.readdirSync(oldProjectDir);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(oldProjectDir);
        console.log(`Removed empty project folder: ${oldProjectDir}`);
      }
    }

    return {
      success: true,
      oldCwd,
      newCwd,
      oldProjectFolder,
      newProjectFolder,
      entriesUpdated,
    };

  } catch (error) {
    return {
      success: false,
      oldCwd: '',
      newCwd,
      oldProjectFolder,
      newProjectFolder,
      entriesUpdated: 0,
      error: `Relocation failed: ${error}`,
    };
  }
}
// <END | Sphere -> Tharyn | CC
