/**
 * launcher.ts - Session launch functionality.
 *
 * Launches Claude sessions in external Windows Terminal via PowerShell.
 * Uses shell scripts in _Launcher/ for reliable execution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getSessionDetails } from './session-store';
import { createBranch, linkBranch, setAnnotation, getAnnotation } from './metadata-db';
import { ProviderId, CURSOR_BINARY } from '../shared/constants';
import {
  LAUNCHER_PATHS,
  buildProviderSessionId,
  parseProviderSessionId,
  toWslPath,
  wslToWindowsPath,
} from './provider-utils';

const execAsync = promisify(exec);

/* START> Tharyn | ZedUI EPIPEfix
    2026-01-11
    What: Safe logging to prevent EPIPE crashes
    Why: console.log can throw EPIPE when stdout pipe is closed
    Expected: Logging fails silently instead of crashing the app
*/
function safeLog(...args: any[]): void {
  try {
    console.log(...args);
  } catch (e) {
    // Ignore EPIPE and other logging errors
  }
}

function safeError(...args: any[]): void {
  try {
    console.error(...args);
  } catch (e) {
    // Ignore EPIPE and other logging errors
  }
}
// <END Tharyn | ZedUI EPIPEfix

// Claude paths (for getResumeCommand display)
const CLAUDE_BINARY = '/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/.bin/claude';
const MCP_CONFIG = '/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json';

// Environment variables for Claude
const LAUNCH_ENV = {
  CLAUDE_ALLOW_ROOT_BYPASS: '1',
  CLAUDE_DISABLE_UPDATES: '1',
};

/**
 * Build environment export prefix (for display purposes).
 */
function buildEnvPrefix(): string {
  return Object.entries(LAUNCH_ENV)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

/**
 * Continue (resume) an existing session.
 *
 * Launches Windows Terminal with WSL and runs the resume-session.sh script.
 */
export async function continueSession(sessionId: string, opts?: { codexVariant?: 'codex' | 'codexSub' }): Promise<void> {
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const details = getSessionDetails(sessionId);

  if (!details) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const cwd = details.cwd || details.projectDisplay;
  const codexVariant = opts?.codexVariant || 'codex';

  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Exhaustive provider switch + Cursor case (was: if codex / else falls through to Claude)
      Why: Codex review error #5 — non-Codex providers were misrouted to Claude; rawId was passed but the cursor: prefix never reached cursor-agent because the wrong launcher script ran
      Expected: Cursor sessions launch `wt wsl --cd "<wslCwd>" -- /root/.local/bin/cursor-agent --workspace "<wslCwd>" --resume <rawUuid>`; Claude/Codex unchanged
  */
  switch (providerId) {
    case 'codex': {
      const winCwd = wslToWindowsPath(cwd);
      const script = codexVariant === 'codexSub' ? LAUNCHER_PATHS.codexSubResumeScript : LAUNCHER_PATHS.codexResumeScript;
      const psCommand = `cmd.exe /c "wt powershell -ExecutionPolicy Bypass -File ${script} -PathFromExplorer \\"${winCwd}\\" ${rawId}"`;
      safeLog('Launching Codex session:', psCommand);
      try {
        await execAsync(psCommand);
      } catch (error) {
        safeError('Failed to launch Codex session:', error);
        throw error;
      }
      return;
    }
    case 'cursor': {
      /* START> Tharyn | CursorCLI
          2026-05-04
          What: Actionable error if cursor-agent binary missing (Phase 3 task 3.7)
          Why: Codex review #7 — silent failure if WSL binary path is wrong; users had no way to diagnose
          Expected: Throws with the exact path and a hint to install/verify cursor-agent
      */
      // Note: CURSOR_BINARY is a WSL path; check via WSL since fs.existsSync on Windows can't see WSL filesystem reliably
      // We rely on the launch error from execAsync to surface the issue, but log the path explicitly so the failure is diagnostic.
      // <END Tharyn | CursorCLI
      const wslCwd = toWslPath(cwd);
      // wt wsl --cd <wslCwd> -- <binary> --workspace <wslCwd> --resume <rawUuid>
      // Single-quote args inside the wt command to keep WSL bash happy with paths containing spaces.
      const psCommand = `wt wsl --cd "${wslCwd}" -- ${CURSOR_BINARY} --workspace '${wslCwd}' --resume '${rawId}'`;
      safeLog('Launching Cursor session:', psCommand, '(binary=', CURSOR_BINARY, ')');
      try {
        await execAsync(`powershell.exe -Command "${psCommand}"`);
      } catch (error) {
        safeError(`Failed to launch Cursor session (verify ${CURSOR_BINARY} exists in WSL):`, error);
        throw new Error(`Cursor launch failed. Verify cursor-agent is at ${CURSOR_BINARY} in WSL. Underlying: ${String(error)}`);
      }
      return;
    }
    case 'claude': {
      // Use the resume script - much cleaner than inline command construction (Claude)
      const psCommand = `wt wsl -- ${LAUNCHER_PATHS.claudeResumeScript} '${cwd}' '${rawId}'`;
      safeLog('Launching session:', psCommand);
      try {
        await execAsync(`powershell.exe -Command "${psCommand}"`);
      } catch (error) {
        safeError('Failed to launch session:', error);
        throw error;
      }
      return;
    }
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      throw new Error(`Unknown provider: ${String(providerId)}`);
    }
  }
  // <END Tharyn | CursorCLI
}

/**
 * Start a new session in the specified directory (provider-aware).
 */
export async function newSession(directory: string, providerId: ProviderId = 'claude', opts?: { codexVariant?: 'codex' | 'codexSub' }): Promise<void> {
  let psCommand: string;
  const codexVariant = opts?.codexVariant || 'codex';

  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Exhaustive switch with explicit Cursor case for new-session launch
      Why: Same misroute bug as continueSession — non-Codex providers were sent to Claude
      Expected: New Cursor session opens `wt wsl --cd <dir> -- /root/.local/bin/cursor-agent --workspace <dir>`
  */
  switch (providerId) {
    case 'codex': {
      const winCwd = wslToWindowsPath(directory);
      const script = codexVariant === 'codexSub' ? LAUNCHER_PATHS.codexSubNewScript : LAUNCHER_PATHS.codexNewScript;
      psCommand = `cmd.exe /c "wt powershell -ExecutionPolicy Bypass -File ${script} -PathFromExplorer \\"${winCwd}\\""`;
      break;
    }
    case 'cursor': {
      const wslCwd = toWslPath(directory);
      psCommand = `powershell.exe -Command "wt wsl --cd '${wslCwd}' -- ${CURSOR_BINARY} --workspace '${wslCwd}'"`;
      break;
    }
    case 'claude': {
      psCommand = `wt wsl -- ${LAUNCHER_PATHS.claudeNewSessionScript} '${directory}'`;
      break;
    }
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      throw new Error(`Unknown provider: ${String(providerId)}`);
    }
  }
  // <END Tharyn | CursorCLI

  safeLog('Launching new session:', psCommand);

  try {
    await execAsync(psCommand);
  } catch (error) {
    safeError('Failed to launch new session:', error);
    throw error;
  }
}

/**
 * Get the resume command for a session (for display/copy).
 */
export function getResumeCommand(sessionId: string): string | null {
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const details = getSessionDetails(sessionId);

  if (!details) {
    return null;
  }

  const cwd = details.cwd || details.projectDisplay;
  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Exhaustive switch with Cursor-specific resume command (was: if codex / else=Claude)
      Why: Codex review error #5 + missing Cursor copy-resume-cmd path
      Expected: Cursor returns paste-friendly WSL shell command using raw UUID (not provider-prefixed)
  */
  switch (providerId) {
    case 'codex':
      return `cd "${cwd}" && codex resume --id ${rawId}`;
    case 'cursor': {
      const wslCwd = toWslPath(cwd);
      return `cd "${wslCwd}" && ${CURSOR_BINARY} --workspace "${wslCwd}" --resume ${rawId}`;
    }
    case 'claude': {
      const envPrefix = buildEnvPrefix();
      const claudeCmd = `${CLAUDE_BINARY} --permission-mode bypassPermissions --mcp-config "${MCP_CONFIG}" --resume ${rawId}`;
      return `cd "${cwd}" && ${envPrefix} ${claudeCmd}`;
    }
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      return null;
    }
  }
  // <END Tharyn | CursorCLI
}

/* START> 2025-12-05 | Sphere -> Tharyn | CC
* Branch session: Copy JSONL file with new UUID and launch
* Creates a true branch with separate session file
* 2025-12-05 Initial implementation
* 2025-12-05 Added branch prompt to tell agent session was branched
*/

/* START> Tharyn | CursorCLI
    2026-05-04
    What: BranchResult.newSessionId is nullable (Plan B / pending Cursor branch may not have a UUID immediately)
    Why: Codex review #4 — type was string but Plan B fallback would need to leave it null; Plan A (create-chat → resume) returns a real UUID, but the type must accommodate both.
    Expected: Plan-A Cursor branch returns success=true + newSessionId="cursor:<uuid>"; pending-branch fallback returns success=true + newSessionId=null + branchId set
*/
export interface BranchResult {
  success: boolean;
  newSessionId: string | null;
  branchId: number;
  error?: string;
}
// <END Tharyn | CursorCLI

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Build a bounded branch-prompt for Cursor — parent ID + workspace + branch name + first user message + last user/assistant exchanges, capped at ~6000 chars
    Why: Phase 4 — Cursor branches via Plan A (create-chat + seeded prompt). Cannot copy JSONL (would corrupt surviving session) — agent must rebuild context from a textual handoff.
    Expected: Returns a string that ends with explicit "This is a new branch from the parent Cursor session above. Continue from this context."
*/
function buildCursorBranchPrompt(
  parentSessionId: string,
  workspace: string,
  branchName: string | undefined,
  firstUserMessage: string,
  recentMessages: Array<{ role: string; text: string }>
): string {
  const PROMPT_CAP = 6000;
  const branchLabel = branchName || 'unnamed branch';

  const header = [
    `# Cursor Branch Handoff`,
    ``,
    `**Parent session:** ${parentSessionId}`,
    `**Workspace:** ${workspace}`,
    `**Branch name:** ${branchLabel}`,
    ``,
    `## Original opening message`,
    firstUserMessage ? firstUserMessage.slice(0, 500) : '(no opening message recorded)',
    ``,
    `## Recent conversation context`,
    ``,
  ].join('\n');

  const footer = [
    ``,
    `---`,
    `This is a new branch from the parent Cursor session above. Continue from this context.`,
  ].join('\n');

  let body = '';
  let truncated = 0;
  // Iterate from oldest to newest so the truncation happens in the middle when needed.
  const formatted = recentMessages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const text = (m.text || '').replace(/\s+/g, ' ').trim();
    return `**${role}:** ${text.slice(0, 800)}`;
  });

  // If everything fits, include all
  const fullBody = formatted.join('\n\n');
  if ((header.length + fullBody.length + footer.length) <= PROMPT_CAP) {
    return header + fullBody + footer;
  }

  // Otherwise: keep the start and end, truncate the middle
  const headTail = Math.max(2, Math.floor(formatted.length / 4));
  const head = formatted.slice(0, headTail);
  const tail = formatted.slice(-headTail);
  truncated = formatted.length - head.length - tail.length;
  body = [...head, `\n[... truncated ${truncated} messages ...]\n`, ...tail].join('\n\n');

  let out = header + body + footer;
  if (out.length > PROMPT_CAP) {
    out = out.slice(0, PROMPT_CAP - footer.length - 32) + '\n[... truncated for length ...]\n' + footer;
  }
  return out;
}

/**
 * Mint a new Cursor chat UUID via `cursor-agent create-chat` (non-interactive).
 * Returns the trimmed UUID, or throws if the output is not a valid UUID.
 */
async function mintCursorChatUuid(): Promise<string> {
  const cmd = `wsl.exe -e bash -lc "echo n | timeout 15 ${CURSOR_BINARY} create-chat"`;
  const { stdout } = await execAsync(cmd);
  // Output may include leading/trailing whitespace; UUID is the only thing.
  const trimmed = stdout.trim().split(/\s+/).pop() || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error(`cursor-agent create-chat returned unexpected output: "${stdout}"`);
  }
  return trimmed;
}

/**
 * Branch a Cursor session via Plan A — create-chat + write seeded prompt to temp file +
 * launch a new wt window that resumes the new chat. The parent JSONL is NEVER touched.
 */
async function branchCursorSession(
  parentSessionId: string,
  branchName: string | undefined,
  details: ReturnType<typeof getSessionDetails>
): Promise<BranchResult> {
  if (!details) {
    return { success: false, newSessionId: null, branchId: 0, error: 'Session details required' };
  }
  const cwd = details.cwd || details.projectDisplay;
  const wslCwd = toWslPath(cwd);

  // 1. Mint a fresh Cursor chat
  let newRawUuid: string;
  try {
    newRawUuid = await mintCursorChatUuid();
    safeLog(`[BRANCH:cursor] Minted new chat UUID: ${newRawUuid}`);
  } catch (error) {
    safeError('[BRANCH:cursor] Failed to mint new chat UUID:', error);
    return { success: false, newSessionId: null, branchId: 0, error: `create-chat failed: ${String(error)}` };
  }
  const newSessionId = buildProviderSessionId('cursor', newRawUuid);

  // 2. Build the branch prompt from parent details
  const messages = (details.messages || []).filter((m: any) => m.message?.role === 'user' || m.message?.role === 'assistant');
  // Take last ~12 message pairs for recent context
  const recent = messages.slice(-24).map((m: any) => {
    const role = m.message?.role || 'user';
    let text = '';
    const content = m.message?.content;
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && block.text) text += block.text + ' ';
      }
    }
    return { role, text };
  });
  const firstUser = messages.find((m: any) => m.message?.role === 'user');
  let firstUserText = '';
  if (firstUser) {
    const c = firstUser.message?.content;
    if (typeof c === 'string') firstUserText = c;
    else if (Array.isArray(c)) {
      for (const block of c) {
        if (block?.type === 'text' && block.text) firstUserText += block.text + ' ';
      }
    }
  }
  const prompt = buildCursorBranchPrompt(parentSessionId, wslCwd, branchName, firstUserText.trim(), recent);

  // 3. Write prompt to a temp file (avoid command-line length limits)
  const tempPath = path.join(os.tmpdir(), `cursor-branch-${crypto.randomUUID()}.md`);
  try {
    fs.writeFileSync(tempPath, prompt, 'utf-8');
    safeLog(`[BRANCH:cursor] Wrote branch prompt to ${tempPath} (${prompt.length} chars)`);
  } catch (error) {
    safeError('[BRANCH:cursor] Failed to write temp prompt:', error);
    return { success: false, newSessionId: null, branchId: 0, error: `temp write failed: ${String(error)}` };
  }

  // 4. Create branch record + link new session
  setAnnotation(parentSessionId, {
    projectPath: details.projectPath,
    autoSummary: details.autoSummary,
    firstMessage: details.firstMessage,
  });
  const branch = createBranch(parentSessionId, branchName);
  linkBranch(branch.id, newSessionId);

  // 5. Annotate the new session with "(Branched)" summary
  const parentAnnotation = getAnnotation(parentSessionId);
  const parentSummary = parentAnnotation?.userSummary || details.autoSummary || details.firstMessage || '';
  const newSummary = parentSummary ? `${parentSummary} (Branched)` : '(Branched)';
  setAnnotation(newSessionId, {
    projectPath: details.projectPath,
    userSummary: newSummary,
    notes: parentAnnotation?.notes || '',
    autoSummary: details.autoSummary,
    firstMessage: details.firstMessage,
    type: parentAnnotation?.type || '',
  });

  // 6. Convert tempPath (Windows tmpdir) to WSL path for shell access
  const tempWslPath = toWslPath(tempPath);

  // 7. Launch wt with cursor-agent --resume <newId>; seed prompt via $(cat <tempWslPath>) since
  //    cursor-agent --resume <id> "<prompt>" support was deferred in Phase 0. Even if positional
  //    prompt is unsupported, the user sees a freshly-resumed Cursor session and can paste the
  //    handoff manually from the temp file path printed in main log.
  const psCommand = `wt wsl --cd "${wslCwd}" -- bash -lc "${CURSOR_BINARY} --workspace '${wslCwd}' --resume '${newRawUuid}' \\"$(cat '${tempWslPath}')\\""`;
  safeLog('[BRANCH:cursor] Launching:', psCommand);
  try {
    await execAsync(`powershell.exe -Command "${psCommand}"`);
  } catch (error) {
    safeError('[BRANCH:cursor] Launch failed (branch DB row was still created):', error);
    // Don't fail the whole branch — DB rows are intact, user can resume manually
  }

  // Structured log: "Cursor branch launched as new seeded session"
  try {
    console.log(JSON.stringify({
      provider: 'cursor',
      action: 'branch',
      parentSessionId,
      newSessionId,
      branchId: branch.id,
      promptChars: prompt.length,
      tempPath,
      result: 'launched_new_seeded_session',
    }));
  } catch { /* ignore */ }

  return {
    success: true,
    newSessionId,
    branchId: branch.id,
  };
}
// <END Tharyn | CursorCLI

/**
 * Branch an existing session by copying its file and launching with new ID.
 *
 * 1. Generate new UUID
 * 2. Copy the JSONL file to new filename
 * 3. Append branch prompt telling agent to continue from where it left off
 * 4. Create branch record in database
 * 5. Copy annotation with " (Continued)" suffix
 * 6. Launch the new session
 */
export async function branchSession(
  parentSessionId: string,
  branchName?: string,
  opts?: { codexVariant?: 'codex' | 'codexSub' }
): Promise<BranchResult> {
  const { providerId, rawId: rawParentId } = parseProviderSessionId(parentSessionId);

  safeLog(`[BRANCH] Requested parent session: ${parentSessionId}`);

  const details = getSessionDetails(parentSessionId);

  safeLog(`[BRANCH] getSessionDetails returned:`, {
    sessionId: details?.sessionId,
    filePath: details?.filePath,
    autoSummary: details?.autoSummary?.slice(0, 100),
    firstMessage: details?.firstMessage?.slice(0, 100),
  });

  if (!details) {
    safeError(`[BRANCH] Session not found: ${parentSessionId}`);
    return {
      success: false,
      newSessionId: null,
      branchId: 0,
      error: `Session not found: ${parentSessionId}`,
    };
  }

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Phase 4 — Cursor branches via Plan A; never edit Cursor JSONL
      Why: Cursor JSONL has no per-entry session_id, but more importantly the parent transcript is the user's only artifact; copying-and-rewriting it would corrupt c658b949 (the surviving session) and is a destructive operation we explicitly forbid
      Expected: Cursor branch mints a new chat via create-chat, writes a bounded handoff prompt to a temp file, and launches wt wsl with `cursor-agent --resume <newId> "$(cat tempfile)"`; parent JSONL untouched; branch row created and linked
  */
  if (providerId === 'cursor') {
    return branchCursorSession(parentSessionId, branchName, details);
  }
  // <END Tharyn | CursorCLI

  // Verify we got the right session
  if (details.sessionId !== parentSessionId) {
    safeError(`[BRANCH] SESSION ID MISMATCH! Requested: ${parentSessionId}, Got: ${details.sessionId}`);
  }

  // Generate new session ID
  const newRawSessionId = crypto.randomUUID();
  const newSessionId = buildProviderSessionId(providerId, newRawSessionId);

  // Source and destination paths
  const sourceFile = details.filePath;
  const destDir = path.dirname(sourceFile);
  const destFile = providerId === 'codex'
    ? path.join(destDir, `rollout-${Date.now()}-${newRawSessionId}.jsonl`)
    : path.join(destDir, `${newRawSessionId}.jsonl`);

  try {
    /* START> 2026-01-11 | Tharyn | ZedUI Branch Fix
     * Fix: Replace sessionId in each entry instead of just copying file
     * The JSONL file has sessionId in every entry - must update them all
     * for Claude to recognize the conversation when resuming with new ID
     * No longer need a branch prompt - agent sees full conversation naturally
     */
    // 1. Read source file and replace session IDs in each entry
    const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
    const lines = sourceContent.split('\n');

    const updatedLines = lines.map(line => {
      if (!line.trim()) return line;

      try {
        const entry = JSON.parse(line);
        if (providerId === 'claude') {
          // Claude stores raw UUID in each entry's sessionId field.
          if (entry.sessionId === parentSessionId || entry.sessionId === rawParentId) {
            entry.sessionId = newRawSessionId;
          }
        } else {
          // Codex rollouts store ID in session_meta payload.id; update that and common aliases.
          if (entry.type === 'session_meta' || entry.type === 'meta') {
            const payload = entry.payload || entry.data || entry;
            if (payload.id === rawParentId) {
              payload.id = newRawSessionId;
            }
            if (payload.session_id === rawParentId) {
              payload.session_id = newRawSessionId;
            }
            if (entry.payload) {
              entry.payload = payload;
            } else if (entry.data) {
              entry.data = payload;
            }
          }
          if (entry.session_id === rawParentId) {
            entry.session_id = newRawSessionId;
          }
          if (entry.sessionId === rawParentId || entry.sessionId === parentSessionId) {
            entry.sessionId = newRawSessionId;
          }
        }
        return JSON.stringify(entry);
      } catch {
        // Non-JSON line (shouldn't happen), keep as-is
        return line;
      }
    });

    fs.writeFileSync(destFile, updatedLines.join('\n'));
    safeLog(`[BRANCH] Created branch with ${lines.length} entries, sessionId updated: ${parentSessionId} -> ${newSessionId}`);
    // <END | Tharyn | ZedUI Branch Fix

    // Ensure parent annotation exists using provider-prefixed ID for FK branch links.
    setAnnotation(parentSessionId, {
      projectPath: details.projectPath,
      autoSummary: details.autoSummary,
      firstMessage: details.firstMessage,
    });

    // 3. Create branch record in database
    const branch = createBranch(parentSessionId, branchName);

    // 4. Link the new session to the branch
    linkBranch(branch.id, newSessionId);

    // 5. Copy annotation with " (Branched)" suffix
    const parentAnnotation = getAnnotation(parentSessionId);
    const parentSummary = parentAnnotation?.userSummary || details.autoSummary || details.firstMessage || '';
    const newSummary = parentSummary ? `${parentSummary} (Branched)` : '(Branched)';

    setAnnotation(newSessionId, {
      projectPath: details.projectPath,
      userSummary: newSummary,
      notes: parentAnnotation?.notes || '',
      autoSummary: details.autoSummary,
      firstMessage: details.firstMessage,
      type: parentAnnotation?.type || '',
    });

    // 6. Launch the new session
    const cwd = details.cwd || details.projectDisplay;
    if (providerId === 'claude') {
      const psCommand = `wt wsl -- ${LAUNCHER_PATHS.claudeResumeScript} '${cwd}' '${newRawSessionId}'`;
      safeLog('Launching branched session:', psCommand);
      await execAsync(`powershell.exe -Command "${psCommand}"`);
    } else {
      const codexVariant = opts?.codexVariant || 'codex';
      const winCwd = wslToWindowsPath(cwd);
      const script = codexVariant === 'codexSub' ? LAUNCHER_PATHS.codexSubResumeScript : LAUNCHER_PATHS.codexResumeScript;
      const psCommand = `cmd.exe /c "wt powershell -ExecutionPolicy Bypass -File ${script} -PathFromExplorer \\"${winCwd}\\" ${newRawSessionId}"`;
      safeLog('Launching branched Codex session:', psCommand);
      await execAsync(psCommand);
    }

    return {
      success: true,
      newSessionId,
      branchId: branch.id,
    };
  } catch (error) {
    safeError('Failed to branch session:', error);

    // Cleanup: remove copied file if it exists
    if (fs.existsSync(destFile)) {
      try {
        fs.unlinkSync(destFile);
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      success: false,
      newSessionId: null,
      branchId: 0,
      error: String(error),
    };
  }
}
// <END | Sphere -> Tharyn | CC
