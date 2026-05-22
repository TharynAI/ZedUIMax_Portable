/**
 * session-store.ts - Read and parse Claude Code session files.
 *
 * Scans ~/.claude/projects/ for all projects and sessions,
 * allowing cross-directory session discovery and resume.
 *
 * Ported from: /mnt/e/ZedBang/MPC2/Cust/SessionBang/lib/session_store.py
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  DEFAULT_DAYS,
  DEFAULT_LIMIT,
  MIN_SESSION_SIZE,
  ProviderId,
} from '../shared/constants';
import {
  DEFAULT_PROVIDERS,
  buildProviderSessionId as buildSessionId,
  parseProviderSessionId,
} from './provider-utils';
import { buildClaudeLaunch, buildCodexLaunch, buildCursorLaunch } from './launch-config';
import { loadPortableConfigFromSettingsFile } from './portable-config';
import type { PortableProviderConfig } from '../shared/portable-config';
/* START> Tharyn | CursorCLI
    2026-05-04
    What: Import metadata-db cwd_override helpers and deleteSessionMetadata
    Why: Phase 2b — relocate becomes metadata-only for Cursor, and delete needs transactional metadata cleanup
    Expected: getSessions/getSessionDetails apply overrides; deleteSession cascades metadata
*/
import { deleteSessionMetadata, getCwdOverride, getAllCwdOverrides } from './metadata-db';
// <END Tharyn | CursorCLI

// Interfaces
export interface ProjectInfo {
  path: string;              // Directory name or derived key, e.g., "-mnt-e-ZedBang"
  displayPath: string;       // Human-readable, e.g., "/mnt/e/ZedBang"
  sessionCount: number;
  lastActivity: Date | null;
  providerId: ProviderId;
}

export interface SessionInfo {
  sessionId: string;         // Provider-prefixed ID (e.g., "claude:uuid", "codex:uuid")
  rawSessionId: string;      // ID from provider file/metadata
  providerId: ProviderId;
  model?: string;
  projectPath: string;
  projectDisplay: string;
  autoSummary: string;
  firstMessage: string;
  timestamp: Date;
  messageCount: number;
  cwd: string;
  filePath: string;
  fileSize: number;
}

export interface SessionDetails extends SessionInfo {
  messages: any[];
  version: string;
}

function getProviderRoot(config: PortableProviderConfig, providerId: ProviderId): string {
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

function providerRootExists(config: PortableProviderConfig, providerId: ProviderId): boolean {
  const root = getProviderRoot(config, providerId);
  return Boolean(root && fs.existsSync(root));
}

function getConfiguredProviders(providerFilter?: ProviderId[]): {
  config: PortableProviderConfig;
  providers: ProviderId[];
} {
  const config = loadPortableConfigFromSettingsFile();
  const requested = providerFilter && providerFilter.length ? providerFilter : DEFAULT_PROVIDERS;
  return {
    config,
    providers: requested.filter((providerId) => Boolean(getProviderRoot(config, providerId))),
  };
}

/* START> Tharyn | ZedUI Windows
    2025-12-28
    What: Convert display paths to Windows format on Windows
    Why: UI should show Windows paths (E:\ZedBang) not WSL (/mnt/e/ZedBang)
    Expected: Paths display as Windows format when running native Windows app
*/
/**
 * Convert directory name to human-readable path.
 * "-mnt-e-ZedBang" -> "/mnt/e/ZedBang" (WSL) or "E:\ZedBang" (Windows)
 */
function dirNameToDisplayPath(dirname: string): string {
  let display = dirname.replace(/-/g, '/');
  // Fix double slashes
  while (display.includes('//')) {
    display = display.replace('//', '/');
  }

  // Convert to Windows path format if running on Windows
  if (process.platform === 'win32') {
    const mntMatch = display.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (mntMatch) {
      const drive = mntMatch[1].toUpperCase();
      const restPath = mntMatch[2].replace(/\//g, '\\');
      return `${drive}:\\${restPath}`;
    }
  }

  return display;
}
// <END Tharyn | ZedUI Windows

/**
 * Normalize any WSL/UNC/Windows path to display-friendly format.
 */
function normalizeDisplayPath(p: string): string {
  if (!p) return '';

  // If UNC from WSL, convert \\wsl.localhost\\Ubuntu-22.04\\root\\path -> /root/path
  const uncMatch = p.match(/^\\\\wsl\.localhost\\[^\\]+\\(.*)$/i);
  if (uncMatch) {
    return '/' + uncMatch[1].replace(/\\/g, '/');
  }

  // If WSL style /mnt/e/...
  if (p.startsWith('/mnt/')) {
    const mntMatch = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (mntMatch && process.platform === 'win32') {
      const drive = mntMatch[1].toUpperCase();
      const restPath = mntMatch[2].replace(/\//g, '\\');
      return `${drive}:\\${restPath}`;
    }
    return p;
  }

  // If Windows path and on Windows, leave as-is; if on WSL convert to WSL-style
  const winMatch = p.match(/^([a-zA-Z]):[/\\](.*)$/);
  if (winMatch && process.platform !== 'win32') {
    const drive = winMatch[1].toLowerCase();
    const rest = winMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }

  return p;
}

function readFirstLines(filePath: string, maxLines: number, maxBytes: number = 1024 * 1024): string[] {
  const fd = fs.openSync(filePath, 'r');
  try {
    const chunks: Buffer[] = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesReadTotal = 0;
    let newlineCount = 0;

    while (bytesReadTotal < maxBytes && newlineCount < maxLines) {
      const bytesToRead = Math.min(buffer.length, maxBytes - bytesReadTotal);
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, bytesReadTotal);
      if (bytesRead <= 0) break;

      const chunk = Buffer.from(buffer.subarray(0, bytesRead));
      chunks.push(chunk);
      bytesReadTotal += bytesRead;

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 10) newlineCount++;
      }
    }

    return Buffer.concat(chunks).toString('utf-8').split('\n').slice(0, maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

function isNativeAbiMismatch(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|different Node\.js version/.test(text);
}

/* START> Tharyn | CursorCLI
    2026-05-03
    What: Cursor project-slug to display path decoder (mirrors Claude's dirNameToDisplayPath)
    Why: Cursor stores workspace as `mnt-e-ZedBang-Projects` (no leading dash); decode to /mnt/e/ZedBang/Projects then to E:\ on Windows
    Expected: 'mnt-e-ZedBang-Projects' -> '/mnt/e/ZedBang/Projects' (WSL) or 'E:\\ZedBang\\Projects' (Windows)
*/
function cursorSlugToDisplayPath(slug: string): string {
  let display = '/' + slug.replace(/-/g, '/');
  while (display.includes('//')) {
    display = display.replace('//', '/');
  }
  if (process.platform === 'win32') {
    const mntMatch = display.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (mntMatch) {
      const drive = mntMatch[1].toUpperCase();
      const restPath = mntMatch[2].replace(/\//g, '\\');
      return `${drive}:\\${restPath}`;
    }
  }
  return display;
}

function cursorSlugToWslPath(slug: string): string {
  let p = '/' + slug.replace(/-/g, '/');
  while (p.includes('//')) p = p.replace('//', '/');
  return p;
}
// <END Tharyn | CursorCLI

/**
 * Get short ID (first 8 characters).
 */
export function getShortId(sessionId: string): string {
  const { rawId } = parseProviderSessionId(sessionId);
  return rawId.slice(0, 8);
}

/**
 * Format file size for display.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${Math.floor(bytes / 1024)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/* START> 2025-12-20 | Sphere -> Tharyn | CC
 * Improved time display with progressive precision
 * < 1h: Xm, < 1d: Xh Ym, < 1w: Xd Yh Zm, >= 1w: Date Xd Yh Zm
 */
export function formatAge(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();

  const totalMins = Math.floor(diffMs / 60000);
  const totalHours = Math.floor(diffMs / 3600000);
  const totalDays = Math.floor(diffMs / 86400000);

  const mins = totalMins % 60;
  const hours = totalHours % 24;
  const days = totalDays % 7;

  if (totalHours < 1) {
    // Less than 1 hour: show minutes only
    return `${totalMins}m`;
  } else if (totalDays < 1) {
    // Less than 1 day: show hours and minutes
    return `${totalHours}h ${mins}m`;
  } else if (totalDays < 7) {
    // Less than 1 week: show days, hours, minutes
    return `${totalDays}d ${hours}h ${mins}m`;
  } else {
    // 1 week or more: show date + days, hours, minutes
    const dateStr = timestamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${dateStr} ${days}d ${hours}h ${mins}m`;
  }
}
// <END | Sphere -> Tharyn | CC

/**
 * Format date for display.
 */
export function formatDate(timestamp: Date): string {
  return timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Scan ~/.claude/projects/ for all project directories.
 */
export function getAllProjects(providerFilter?: ProviderId[]): ProjectInfo[] {
  const sessions = getSessions(providerFilter, DEFAULT_DAYS, DEFAULT_LIMIT * 5);
  const map = new Map<string, ProjectInfo>();

  for (const s of sessions) {
    const key = `${s.providerId}:${s.projectPath}`;
    const existing = map.get(key);
    if (existing) {
      existing.sessionCount += 1;
      if (!existing.lastActivity || s.timestamp > existing.lastActivity) {
        existing.lastActivity = s.timestamp;
      }
    } else {
      map.set(key, {
        path: s.projectPath,
        displayPath: s.projectDisplay,
        sessionCount: 1,
        lastActivity: s.timestamp,
        providerId: s.providerId,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  });
}

/**
 * Parse a .jsonl session file, extract key info.
 * Only reads the first few lines for efficiency.
 */
function parseSessionFile(filePath: string, projectPath: string, projectDisplay: string): SessionInfo | null {
  const rawSessionId = path.basename(filePath, '.jsonl');
  const providerId: ProviderId = 'claude';
  const sessionId = buildSessionId(providerId, rawSessionId);
  let autoSummary = '';
  let firstMessage = '';
  let timestamp: Date | null = null;
  let cwd = '';
  let messageCount = 0;

  try {
    /* START> Tharyn | ZedUI ScanFix
        2026-01-26
        What: Increase scan limit from 20 to 100 lines
        Why: New Claude Code format puts many summaries at top, messages come later
        Expected: Sessions with summaries at top are properly detected
    */
    const lines = readFirstLines(filePath, 100); // Scan first 100 lines for new format
    // <END Tharyn | ZedUI ScanFix

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        const entryType = entry.type || '';

        /* START> 2026-01-10 | Tharyn | ZedUI Branch Fix
         * Fix: Use LAST summary found (most recent)
         * Claude scatters summaries throughout the file as conversation progresses
         * The last summary is the most recent/relevant one
         * Previous "first summary" fix was wrong - that assumed summaries at top
         */
        if (entryType === 'summary') {
          autoSummary = entry.summary || '';  // Keep overwriting to get the last one
        // <END | Tharyn | ZedUI Branch Fix
        } else if (entryType === 'user') {
          messageCount++;

          if (!firstMessage) {
            const msg = entry.message || {};
            let content = msg.content || '';
            /* START> 2025-12-01 | Sphere -> Tharyn | CC
            * Fix: Handle Claude API content format (array of content blocks)
            * Content can be string or array like [{type: "text", text: "..."}]
            * 2025-12-01 Initial fix for React crash on click
            */
            if (Array.isArray(content)) {
              // Extract text from content blocks
              content = content
                .filter((block: any) => block.type === 'text' && block.text)
                .map((block: any) => block.text)
                .join('\n');
            }
            // <END | Sphere -> Tharyn | CC
            if (typeof content === 'string') {
              firstMessage = content.length > 200 ? content.slice(0, 200) + '...' : content;
            }
          }

          if (!cwd) {
            cwd = entry.cwd || '';
          }
        } else if (entryType === 'assistant') {
          messageCount++;
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    const stat = fs.statSync(filePath);

    /* START> 2025-12-05 | Sphere -> Tharyn | CC
    * Fix: Use file modification time for session timestamp
    * Previously used first message timestamp which never updated on resume
    * Now uses mtime to reflect actual last activity
    * 2025-12-05 Fix for sessions showing wrong date after resume
    */
    // Use file modification time as timestamp (reflects last activity)
    timestamp = stat.mtime;
    // <END | Sphere -> Tharyn | CC

    return {
      sessionId,
      rawSessionId,
      providerId,
      projectPath,
      projectDisplay,
      autoSummary,
      firstMessage,
      timestamp,
      messageCount,
      cwd,
      filePath,
      fileSize: stat.size,
    };
  } catch {
    return null;
  }
}

/**
 * Get sessions, optionally filtered by project and age.
 */
function getClaudeSessions(projectsRoot: string, days: number = DEFAULT_DAYS): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return [];
  }

  const projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => path.join(projectsRoot, d.name));

  for (const projectDir of projectDirs) {
    const dirname = path.basename(projectDir);
    const projectDisplay = dirNameToDisplayPath(dirname);

    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

    for (const file of files) {
      const filePath = path.join(projectDir, file);

      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime < cutoff || stat.size < MIN_SESSION_SIZE) {
          continue;
        }

        const session = parseSessionFile(filePath, dirname, projectDisplay);
        if (session && session.timestamp >= cutoff && (session.messageCount > 0 || session.autoSummary)) {
          sessions.push(session);
        }
      } catch {
        continue;
      }
    }
  }

  return sessions;
}

/**
 * Aggregate sessions across providers with optional filter.
 */
export function getSessions(
  providerFilter?: ProviderId[],
  days: number = DEFAULT_DAYS,
  limit: number = DEFAULT_LIMIT
): SessionInfo[] {
  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Default provider list now includes 'cursor' so Browse aggregates all three providers
      Why: Cursor is a peer; omitting from default would hide Cursor sessions until a filter is set
      Expected: getSessions() returns Claude + Codex + Cursor sorted by activity
  */
  const { config, providers } = getConfiguredProviders(providerFilter);
  // <END Tharyn | CursorCLI

  let sessions: SessionInfo[] = [];

  if (providers.includes('claude')) {
    sessions = sessions.concat(getClaudeSessions(getProviderRoot(config, 'claude'), days));
  }
  if (providers.includes('codex')) {
    sessions = sessions.concat(getCodexSessions(getProviderRoot(config, 'codex'), days));
  }
  if (providers.includes('cursor')) {
    sessions = sessions.concat(getCursorSessions(getProviderRoot(config, 'cursor'), days));
  }

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Apply cwd_override from annotations table in a single batch fetch
      Why: Phase 2b relocate persists override in DB; UI must reflect it everywhere getSessions is used
      Expected: Sessions whose annotations.cwd_override is set show that path as their cwd (Cursor relocate target)
  */
  try {
    const overrides = getAllCwdOverrides();
    if (overrides.size > 0) {
      for (const s of sessions) {
        const override = overrides.get(s.sessionId) || overrides.get(s.rawSessionId);
        if (override) {
          s.cwd = override;
          // Keep projectDisplay roughly synchronized for UI clarity (best-effort)
          s.projectDisplay = normalizeDisplayPath(override);
        }
      }
    }
  } catch (err) {
    if (process.versions.electron && !isNativeAbiMismatch(err)) {
      console.error('Applying cwd_overrides failed:', err);
    }
  }
  // <END Tharyn | CursorCLI

  sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return sessions.slice(0, limit);
}

/* START> Tharyn | CursorCLI
    2026-05-03
    What: Cursor CLI transcript scanner — walks /root/.cursor/projects/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl
    Why: Discover Cursor sessions for the Browse tab as peers of Claude/Codex
    Expected: Returns SessionInfo[] for all top-level transcripts (skips the subagents/ subdirectory)
*/
function getCursorSessions(projectsRoot: string, days: number = DEFAULT_DAYS): SessionInfo[] {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return [];
  }

  const sessions: SessionInfo[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  let projectSlugs: string[] = [];
  try {
    projectSlugs = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return [];
  }

  for (const slug of projectSlugs) {
    const transcriptsDir = path.join(projectsRoot, slug, 'agent-transcripts');
    if (!fs.existsSync(transcriptsDir)) continue;

    let chatDirs: fs.Dirent[] = [];
    try {
      chatDirs = fs.readdirSync(transcriptsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
    } catch {
      continue;
    }

    for (const chatDir of chatDirs) {
      const chatId = chatDir.name;
      // Top-level transcript file is named after the chat UUID; subagents live in a sibling dir
      const transcriptFile = path.join(transcriptsDir, chatId, `${chatId}.jsonl`);
      if (!fs.existsSync(transcriptFile)) continue;

      try {
        const stat = fs.statSync(transcriptFile);
        if (stat.size < 64) continue; // Cursor transcripts can be smaller than Claude/Codex; loosen the floor
        if (stat.mtime < cutoff) continue;

        const session = parseCursorSessionFile(transcriptFile, slug, stat);
        if (session) {
          sessions.push(session);
        }
      } catch {
        continue;
      }
    }
  }

  return sessions;
}

function parseCursorSessionFile(filePath: string, slug: string, stat: fs.Stats): SessionInfo | null {
  const rawSessionId = path.basename(filePath, '.jsonl');
  const providerId: ProviderId = 'cursor';
  const sessionId = buildSessionId(providerId, rawSessionId);
  const projectDisplay = cursorSlugToDisplayPath(slug);
  const cwd = cursorSlugToWslPath(slug);

  let firstMessage = '';
  let messageCount = 0;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const role = entry.role;
      if (role !== 'user' && role !== 'assistant') continue;
      messageCount++;

      if (!firstMessage && role === 'user') {
        const msg = entry.message || {};
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        const textBlock = blocks.find((b: any) => b && b.type === 'text' && typeof b.text === 'string');
        if (textBlock) {
          let text: string = textBlock.text;
          // Cursor often wraps the first user message in <user_query>...</user_query>; strip for display
          const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
          if (m) text = m[1];
          firstMessage = text.length > 200 ? text.slice(0, 200) + '...' : text;
        }
      }
    }
  } catch {
    return null;
  }

  if (messageCount === 0) return null;

  return {
    sessionId,
    rawSessionId,
    providerId,
    projectPath: slug,
    projectDisplay,
    autoSummary: '',
    firstMessage: firstMessage || '(Cursor session)',
    timestamp: stat.mtime,
    messageCount,
    cwd,
    filePath,
    fileSize: stat.size,
  };
}

function findCursorTranscriptFile(rawSessionId: string, projectsRoot: string): { filePath: string; slug: string } | null {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) return null;
  let slugs: string[] = [];
  try {
    slugs = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return null;
  }
  for (const slug of slugs) {
    const candidate = path.join(projectsRoot, slug, 'agent-transcripts', rawSessionId, `${rawSessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, slug };
    }
  }
  return null;
}

function getCursorSessionDetails(rawSessionId: string, projectsRoot: string): SessionDetails | null {
  const found = findCursorTranscriptFile(rawSessionId, projectsRoot);
  if (!found) return null;

  const { filePath, slug } = found;
  const providerId: ProviderId = 'cursor';
  const sessionId = buildSessionId(providerId, rawSessionId);
  const projectDisplay = cursorSlugToDisplayPath(slug);
  const cwd = cursorSlugToWslPath(slug);

  let firstMessage = '';
  const messages: any[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const role = entry.role;
      if (role !== 'user' && role !== 'assistant') continue;

      // Map Cursor envelope -> SessionMessage shape used by ConversationView.
      // Renderer expects: { type, message: { role, content } } where content is a string.
      const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
      const textParts: string[] = [];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text);
        } else if (b.type === 'tool_use') {
          // Render as readable debug line; never crash on non-text blocks
          const name = b.name || 'tool';
          let argSummary = '';
          try {
            argSummary = JSON.stringify(b.input ?? {}).slice(0, 200);
          } catch {
            argSummary = '(unserializable input)';
          }
          textParts.push(`[tool_use ${name} ${argSummary}]`);
        }
      }
      const stringContent = textParts.join('\n');

      messages.push({
        type: role,
        message: { role, content: stringContent },
      });

      if (!firstMessage && role === 'user') {
        let text = stringContent;
        const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
        if (m) text = m[1];
        firstMessage = text.length > 200 ? text.slice(0, 200) + '...' : text;
      }
    }

    const stat = fs.statSync(filePath);
    return {
      sessionId,
      rawSessionId,
      providerId,
      projectPath: slug,
      projectDisplay,
      autoSummary: '',
      firstMessage: firstMessage || '(Cursor session)',
      timestamp: stat.mtime,
      messageCount: messages.length,
      cwd,
      filePath,
      fileSize: stat.size,
      messages,
      version: '',
    };
  } catch {
    return null;
  }
}
// <END Tharyn | CursorCLI

function getClaudeSessionDetails(rawSessionId: string, projectsRoot: string): SessionDetails | null {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return null;
  }

  const projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  for (const projectDir of projectDirs) {
    const sessionFile = path.join(projectsRoot, projectDir.name, `${rawSessionId}.jsonl`);

    if (fs.existsSync(sessionFile)) {
      return parseSessionDetails(sessionFile, projectDir.name);
    }
  }

  return null;
}

/**
 * Get full details for a specific session (provider-aware).
 */
export function getSessionDetails(sessionId: string): SessionDetails | null {
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const config = loadPortableConfigFromSettingsFile();
  const providerRoot = getProviderRoot(config, providerId);
  if (!providerRoot) {
    return null;
  }

  let details: SessionDetails | null;
  switch (providerId) {
    case 'claude':
      details = getClaudeSessionDetails(rawId, providerRoot);
      break;
    case 'codex':
      details = getCodexSessionDetails(rawId, providerRoot);
      break;
    case 'cursor':
      details = getCursorSessionDetails(rawId, providerRoot);
      break;
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      return null;
    }
  }

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Apply cwd_override from annotations table on the details object
      Why: Renderer reads details.cwd for the working-directory panel and the resume command builder
      Expected: If cwd_override exists for this sessionId, details.cwd reflects it; else unchanged
  */
  if (details) {
    try {
      const override = getCwdOverride(sessionId);
      if (override) {
        details.cwd = override;
        details.projectDisplay = normalizeDisplayPath(override);
      }
    } catch (err) {
      console.error('Applying cwd_override to details failed:', err);
    }
  }
  // <END Tharyn | CursorCLI

  return details;
}

// ---------------- Codex provider ----------------

function walkCodexFiles(root: string, collector: (filePath: string, stat: fs.Stats) => void) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const stat = fs.statSync(full);
          collector(full, stat);
        }
      } catch {
        continue;
      }
    }
  }
}

function deriveCodexProjectKey(cwd: string): { projectPath: string; projectDisplay: string } {
  if (!cwd) {
    return { projectPath: 'codex-unknown', projectDisplay: '(Codex)' };
  }
  const normalized = cwd.replace(/\\/g, '/');
  const projectPath = normalized.replace(/[:]/g, '').replace(/\//g, '-');
  const projectDisplay = normalizeDisplayPath(normalized);
  return { projectPath, projectDisplay };
}

function parseCodexContent(content: any): string {
  let value = content;
  if (value && typeof value === 'object' && 'text' in value) {
    value = (value as any).text;
  }

  if (Array.isArray(value)) {
    return value
      .filter((block: any) =>
        (block.type === 'text' || block.type === 'input_text') && block.text || typeof block === 'string')
      .map((block: any) => (typeof block === 'string' ? block : block.text))
      .join('\n');
  }

  return typeof value === 'string' ? value : '';
}

function sanitizeSummary(summary: string, firstMessage: string): string {
  const noisePatterns = [/^# /i, /Projects - Claude Instructions/i, /Skills/i];
  const isNoise = !!summary && noisePatterns.some((re) => re.test(summary));
  if (summary && !isNoise) return summary;
  if (firstMessage) return firstMessage;
  if (summary && !isNoise) return summary.slice(0, 200);
  return '(No summary)';
}

function parseCodexSessionFile(filePath: string, stat: fs.Stats): SessionInfo | null {
  const providerId: ProviderId = 'codex';
  let rawSessionId = '';
  let autoSummary = '';
  let firstMessage = '';
  let model = '';
  let timestamp: Date | null = null;
  let cwd = '';
  let messageCount = 0;

  try {
    const lines = readFirstLines(filePath, 120);

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type || '';

        if (entryType === 'session_meta' || entryType === 'meta') {
          const payload = entry.payload || entry.data || entry;
          rawSessionId = payload.id || rawSessionId;
          cwd = payload.cwd || payload.working_dir || cwd;
          model = payload.model || payload.model_provider || payload.model_id || payload.model_name || model;
          if (payload.timestamp && !timestamp) {
            timestamp = new Date(payload.timestamp);
          }
          if (!autoSummary && payload.summary) {
            autoSummary = String(payload.summary).slice(0, 200);
          }
        } else if (entryType === 'response_item') {
          const role = entry.payload?.role || entry.role || entry.message?.role;
          const text = parseCodexContent(entry.payload?.content ?? entry.message?.content ?? entry.content);
          if (role === 'user' && !firstMessage && text) {
            firstMessage = text.length > 200 ? text.slice(0, 200) + '...' : text;
          }
          if (role === 'user' || role === 'assistant') {
            messageCount++;
          }
        }
      } catch {
        continue;
      }
    }

    if (!rawSessionId) {
      rawSessionId = path.basename(filePath, '.jsonl').replace(/^rollout-[0-9]+-/, '');
    }

    // Use file modification time to reflect latest activity (resume/appends)
    timestamp = stat.mtime;

    const { projectPath, projectDisplay } = deriveCodexProjectKey(cwd);
    const sessionId = buildSessionId(providerId, rawSessionId);
    autoSummary = sanitizeSummary(autoSummary, firstMessage);

    return {
      sessionId,
      rawSessionId,
      providerId,
      projectPath,
      projectDisplay,
      autoSummary,
      firstMessage,
      timestamp,
      model: model || undefined,
      messageCount,
      cwd,
      filePath,
      fileSize: stat.size,
    };
  } catch {
    return null;
  }
}

function parseCodexSessionDetails(filePath: string, stat: fs.Stats): SessionDetails | null {
  const providerId: ProviderId = 'codex';
  let rawSessionId = '';
  let autoSummary = '';
  let firstMessage = '';
  let model = '';
  let timestamp: Date | null = null;
  let cwd = '';
  let version = '';
  const messages: any[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type || '';

        if (entryType === 'session_meta' || entryType === 'meta') {
          const payload = entry.payload || entry.data || entry;
          rawSessionId = payload.id || rawSessionId;
          cwd = payload.cwd || payload.working_dir || cwd;
          model = payload.model || payload.model_provider || payload.model_id || payload.model_name || model;
          if (payload.timestamp && !timestamp) {
            timestamp = new Date(payload.timestamp);
          }
          if (!autoSummary && payload.summary) {
            autoSummary = String(payload.summary).slice(0, 200);
          }
          if (!version && payload.cli_version) {
            version = payload.cli_version;
          }
        } else if (entryType === 'response_item') {
          const role = entry.payload?.role || entry.role || entry.message?.role;
          const text = parseCodexContent(entry.payload?.content ?? entry.message?.content ?? entry.content);

          if (role === 'user' || role === 'assistant') {
            messages.push({
              type: role === 'user' ? 'user' : 'assistant',
              message: {
                role,
                content: text,
              },
              timestamp: entry.timestamp || entry.message?.timestamp,
            });
          }

          if (role === 'user' && !firstMessage && text) {
            firstMessage = text.length > 200 ? text.slice(0, 200) + '...' : text;
          }
        }
      } catch {
        continue;
      }
    }

    if (!rawSessionId) {
      rawSessionId = path.basename(filePath, '.jsonl').replace(/^rollout-[0-9]+-/, '');
    }

    // Use file modification time to reflect latest activity (resume/appends)
    timestamp = stat.mtime;

    const { projectPath, projectDisplay } = deriveCodexProjectKey(cwd);
    const sessionId = buildSessionId(providerId, rawSessionId);
    autoSummary = sanitizeSummary(autoSummary, firstMessage);

    return {
      sessionId,
      rawSessionId,
      providerId,
      projectPath,
      projectDisplay,
      autoSummary,
      firstMessage,
      timestamp,
      model: model || undefined,
      messageCount: messages.length,
      cwd,
      filePath,
      fileSize: stat.size,
      messages,
      version,
    };
  } catch {
    return null;
  }
}

function getCodexSessions(sessionsRoot: string, days: number = DEFAULT_DAYS): SessionInfo[] {
  if (!sessionsRoot || !fs.existsSync(sessionsRoot)) {
    return [];
  }

  const sessions: SessionInfo[] = [];

  const scan = (windowDays: number) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    walkCodexFiles(sessionsRoot, (filePath, stat) => {
      if (stat.mtime < cutoff || stat.size < MIN_SESSION_SIZE) return;
      const session = parseCodexSessionFile(filePath, stat);
      if (session) {
        sessions.push(session);
      }
    });
  };

  scan(days);

  // If nothing found within the window, retry with a longer horizon (1 year)
  if (sessions.length === 0 && days < 365) {
    scan(365);
  }

  return sessions;
}

function findCodexFileById(rawSessionId: string, sessionsRoot: string): string | null {
  let found: string | null = null;
  walkCodexFiles(sessionsRoot, (filePath) => {
    if (found) return;
    if (filePath.includes(rawSessionId)) {
      found = filePath;
    }
  });
  return found;
}

function getCodexSessionDetails(rawSessionId: string, sessionsRoot: string): SessionDetails | null {
  if (!sessionsRoot || !fs.existsSync(sessionsRoot)) {
    return null;
  }

  const sessionFile = findCodexFileById(rawSessionId, sessionsRoot);
  if (!sessionFile) {
    return null;
  }

  try {
    const stat = fs.statSync(sessionFile);
    return parseCodexSessionDetails(sessionFile, stat);
  } catch {
    return null;
  }
}

/**
 * Parse full session details including all messages.
 */
function parseSessionDetails(filePath: string, projectPath: string): SessionDetails | null {
  const rawSessionId = path.basename(filePath, '.jsonl');
  const providerId: ProviderId = 'claude';
  const sessionId = buildSessionId(providerId, rawSessionId);
  const projectDisplay = dirNameToDisplayPath(projectPath);
  let autoSummary = '';
  let firstMessage = '';
  let timestamp: Date | null = null;
  let cwd = '';
  let version = '';
  const messages: any[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        const entryType = entry.type || '';

        /* START> 2026-01-10 | Tharyn | ZedUI Branch Fix
         * Fix: Use LAST summary found (most recent) - same fix as parseSessionFile
         * Claude scatters summaries throughout the file as conversation progresses
         */
        if (entryType === 'summary') {
          autoSummary = entry.summary || '';  // Keep overwriting to get the last one
        // <END | Tharyn | ZedUI Branch Fix
        } else if (entryType === 'user' || entryType === 'assistant') {
          messages.push(entry);

          if (entryType === 'user') {
            if (!firstMessage) {
              const msg = entry.message || {};
              let content = msg.content || '';
              /* START> 2025-12-01 | Sphere -> Tharyn | CC
              * Fix: Handle Claude API content format (array of content blocks)
              * Content can be string or array like [{type: "text", text: "..."}]
              * 2025-12-01 Initial fix for React crash on click
              */
              if (Array.isArray(content)) {
                content = content
                  .filter((block: any) => block.type === 'text' && block.text)
                  .map((block: any) => block.text)
                  .join('\n');
              }
              // <END | Sphere -> Tharyn | CC
              if (typeof content === 'string') {
                firstMessage = content.length > 200 ? content.slice(0, 200) + '...' : content;
              }
            }

            if (!cwd) {
              cwd = entry.cwd || '';
            }

            if (!version) {
              version = entry.version || '';
            }
          }
        }
      } catch {
        continue;
      }
    }

    const stat = fs.statSync(filePath);

    /* START> 2025-12-05 | Sphere -> Tharyn | CC
    * Fix: Use file modification time for session timestamp
    * Consistent with parseSessionFile fix
    * 2025-12-05 Fix for sessions showing wrong date after resume
    */
    // Use file modification time as timestamp (reflects last activity)
    timestamp = stat.mtime;
    // <END | Sphere -> Tharyn | CC

    return {
      sessionId,
      rawSessionId,
      providerId,
      projectPath,
      projectDisplay,
      autoSummary,
      firstMessage,
      timestamp,
      messageCount: messages.length,
      cwd,
      filePath,
      fileSize: stat.size,
      messages,
      version,
    };
  } catch {
    return null;
  }
}

/**
 * Find which project a session belongs to.
 */
export function findSessionProject(sessionId: string): string | null {
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const config = loadPortableConfigFromSettingsFile();
  const providerRoot = getProviderRoot(config, providerId);

  switch (providerId) {
    case 'claude': {
      if (!providerRoot || !fs.existsSync(providerRoot)) {
        return null;
      }
      const projectDirs = fs.readdirSync(providerRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'));
      for (const projectDir of projectDirs) {
        const sessionFile = path.join(providerRoot, projectDir.name, `${rawId}.jsonl`);
        if (fs.existsSync(sessionFile)) {
          return projectDir.name;
        }
      }
      return null;
    }
    case 'codex': {
      const details = getCodexSessionDetails(rawId, providerRoot);
      return details?.projectPath || null;
    }
    case 'cursor': {
      const found = findCursorTranscriptFile(rawId, providerRoot);
      return found?.slug || null;
    }
    default: {
      const _exhaustive: never = providerId;
      void _exhaustive;
      return null;
    }
  }
}

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Convert getResumeInfo() to dual-shape return — wslShellCommand (paste-friendly) + wtCommand (Windows Terminal launcher) for all providers; resumeCommand kept as alias of wslShellCommand for backwards compat
    Why: Phase 3 task 3.3 — renderer Copy Resume Cmd should consume the same shape the main process uses to launch, eliminating provider-specific synthesis drift in ContextMenu/SessionPreview
    Expected: getResumeInfo returns {sessionId, projectPath, cwd, resumeCommand, wslShellCommand, wtCommand}; Cursor wtCommand matches `wt wsl --cd "<wsl>" -- <bin> --workspace '<wsl>' --resume '<id>'`
*/
export interface ResumeInfo {
  sessionId: string;
  projectPath: string;
  cwd: string;
  resumeCommand: string;     // backwards-compat alias of wslShellCommand
  wslShellCommand: string;   // paste-friendly cd + binary --resume <id>
  wtCommand: string;         // Windows Terminal launcher form
}

export function getResumeInfo(sessionId: string): ResumeInfo | null {
  const { providerId, rawId } = parseProviderSessionId(sessionId);
  const details = getSessionDetails(sessionId);
  if (!details) {
    return null;
  }

  const cwd = details.cwd;

  try {
    switch (providerId) {
      case 'claude': {
        const launch = buildClaudeLaunch('resume', cwd, rawId);
        const wslShellCommand = launch.wslShellCommand || launch.displayCommand;
        return {
          sessionId,
          projectPath: details.projectDisplay,
          cwd,
          resumeCommand: wslShellCommand,
          wslShellCommand,
          wtCommand: launch.displayCommand,
        };
      }
      case 'codex': {
        const launch = buildCodexLaunch('resume', cwd, rawId);
        const wslShellCommand = launch.wslShellCommand || launch.displayCommand;
        return {
          sessionId,
          projectPath: details.projectDisplay,
          cwd,
          resumeCommand: wslShellCommand,
          wslShellCommand,
          wtCommand: launch.displayCommand,
        };
      }
      case 'cursor': {
        const launch = buildCursorLaunch('resume', cwd, rawId);
        const wslShellCommand = launch.wslShellCommand || launch.displayCommand;
        return {
          sessionId,
          projectPath: details.projectDisplay,
          cwd,
          resumeCommand: wslShellCommand,
          wslShellCommand,
          wtCommand: launch.displayCommand,
        };
      }
      default: {
        const _exhaustive: never = providerId;
        void _exhaustive;
        return null;
      }
    }
  } catch {
    return null;
  }
}
// <END Tharyn | CursorCLI

/**
 * Delete a session file.
 * Returns the deleted session info for confirmation, or null if not found.
 */
export function deleteSession(sessionId: string): { deleted: boolean; filePath: string; projectDisplay: string } | null {
  const started = Date.now();
  const { providerId } = parseProviderSessionId(sessionId);
  if (!providerRootExists(loadPortableConfigFromSettingsFile(), providerId)) {
    try {
      console.log(JSON.stringify({
        provider: providerId,
        action: 'delete',
        sessionId,
        result: 'provider_not_configured',
        durationMs: Date.now() - started,
      }));
    } catch { /* ignore */ }
    return null;
  }

  const details = getSessionDetails(sessionId);
  if (!details) {
    /* START> Tharyn | CursorCLI
        2026-05-04
        What: Orphan-metadata cleanup when transcript is missing (Phase 4 surfaced this — disposable Cursor child whose transcript never materialized leaves an annotation row deleteSession previously couldn't reach)
        Why: Phase 2b's transactional `deleteSessionMetadata` is keyed on sessionId, not file existence. Returning early here meant metadata orphans were unreachable through the normal delete path
        Expected: When file-less but metadata-present, still cascade-delete the metadata; return {deleted:true, filePath:'', projectDisplay:''} so the renderer refreshes
    */
    let orphanCounts = { annotation: 0, branches: 0, fts: 0, tags: 0 };
    try {
      orphanCounts = deleteSessionMetadata(sessionId);
    } catch (err) {
      console.error(`Orphan metadata cleanup failed for ${sessionId}:`, err);
    }
    const hadOrphan = orphanCounts.annotation > 0 || orphanCounts.branches > 0 || orphanCounts.tags > 0 || orphanCounts.fts > 0;
    try {
      console.log(JSON.stringify({
        provider: 'unknown', action: 'delete', sessionId,
        result: hadOrphan ? 'orphan_metadata_cleaned' : 'not_found',
        metadata: orphanCounts,
        durationMs: Date.now() - started,
      }));
    } catch { /* ignore */ }
    if (hadOrphan) {
      return { deleted: true, filePath: '', projectDisplay: '' };
    }
    // <END Tharyn | CursorCLI
    return null;
  }

  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Cursor delete also prunes the parent transcript folder if empty
      Why: Cursor stores each transcript in its own UUID folder; leaving an empty folder behind clutters the projects tree
      Expected: After deleting cursor:<uuid>.jsonl, the agent-transcripts/<uuid>/ folder is removed when empty
      2026-05-04
      What: Metadata cleanup runs BEFORE file unlink (transactional via deleteSessionMetadata)
      Why: Codex review #6 — SQLite FKs are not enabled; explicit cascade is required (annotations, session_tags, session_fts, session_branches parent OR child)
      Expected: Both file and metadata go in one logical operation; structured log line emitted with counts
  */
  let metadataCounts = { annotation: 0, branches: 0, fts: 0, tags: 0 };
  try {
    metadataCounts = deleteSessionMetadata(sessionId);
  } catch (err) {
    console.error(`Metadata cleanup failed for ${sessionId}:`, err);
    // Continue to attempt file unlink; metadata can be cleaned later by user if needed.
  }

  try {
    fs.unlinkSync(details.filePath);

    if (details.providerId === 'cursor') {
      const parentDir = path.dirname(details.filePath);
      try {
        const remaining = fs.readdirSync(parentDir);
        if (remaining.length === 0) {
          fs.rmdirSync(parentDir);
        }
      } catch {
        // Ignore — parent cleanup is best-effort
      }
    }

    try {
      console.log(JSON.stringify({
        provider: details.providerId,
        action: 'delete',
        sessionId,
        result: 'ok',
        metadata: metadataCounts,
        durationMs: Date.now() - started,
      }));
    } catch { /* ignore */ }

    return {
      deleted: true,
      filePath: details.filePath,
      projectDisplay: details.projectDisplay,
    };
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error);
    try {
      console.log(JSON.stringify({
        provider: details.providerId,
        action: 'delete',
        sessionId,
        result: 'file_unlink_failed',
        metadata: metadataCounts,
        error: String(error),
        durationMs: Date.now() - started,
      }));
    } catch { /* ignore */ }
    return {
      deleted: false,
      filePath: details.filePath,
      projectDisplay: details.projectDisplay,
    };
  }
  // <END Tharyn | CursorCLI
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Session Message Search
* Full-text search across message content in JSONL files
* Returns matching messages with context snippets
* 2025-12-02 Initial implementation
*/

export interface MessageSearchResult {
  sessionId: string;
  projectPath: string;
  projectDisplay: string;
  messageIndex: number;
  messageType: 'user' | 'assistant';
  snippet: string;           // Context around the match
  matchStart: number;        // Position of match in snippet
  matchLength: number;       // Length of matched text
  timestamp?: Date;
}

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Unified message-content extractor across providers (Codex review Missing item)
    Why: Codex details parse read entry.payload?.content, while Codex search read entry.message?.content/entry.content — divergent shapes meant Codex search missed messages whose payload-only shape Codex details handled. Cursor adds another envelope. Single helper now used by ALL search paths.
    Expected: Returns concatenated text for {claude (entry.message.content as string|blocks), codex (entry.payload.content|message.content|content), cursor (entry.message.content blocks of type text|tool_use)}
*/
function extractMessageContent(entry: any): string {
  if (!entry) return '';

  // Codex envelope often nests under payload — check that first, fall through to message/top-level.
  let content: any =
    entry.payload?.content
    ?? entry.message?.content
    ?? entry.content
    ?? '';

  // Handle array of content blocks (Claude/Cursor envelope, Codex input_text variant)
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block) continue;
      if (typeof block === 'string') {
        parts.push(block);
        continue;
      }
      if (typeof block !== 'object') continue;
      // text + input_text → just take the text
      if ((block.type === 'text' || block.type === 'input_text') && typeof block.text === 'string') {
        parts.push(block.text);
        continue;
      }
      // Cursor: tool_use blocks — render a debug-friendly summary so search can match tool names/inputs
      if (block.type === 'tool_use') {
        const name = block.name || 'tool';
        let argSummary = '';
        try {
          argSummary = JSON.stringify(block.input ?? {}).slice(0, 200);
        } catch {
          argSummary = '(unserializable input)';
        }
        parts.push(`[tool_use ${name} ${argSummary}]`);
      }
    }
    return parts.join('\n');
  }

  // Some Codex shapes wrap content in a {text} object
  if (content && typeof content === 'object' && typeof (content as any).text === 'string') {
    return (content as any).text;
  }

  return typeof content === 'string' ? content : '';
}
// <END Tharyn | CursorCLI

/**
 * Create a snippet around the match with context.
 */
function createSnippet(text: string, matchIndex: number, matchLength: number, contextChars: number = 80): {
  snippet: string;
  matchStart: number;
} {
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + matchLength + contextChars);

  let snippet = text.slice(start, end);
  const matchStart = matchIndex - start;

  // Add ellipsis if truncated
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < text.length) {
    snippet = snippet + '...';
  }

  // Clean up newlines and excessive whitespace
  snippet = snippet.replace(/\s+/g, ' ').trim();

  return {
    snippet,
    matchStart: start > 0 ? matchStart + 3 : matchStart, // Account for ellipsis
  };
}

/**
 * Search across message content in all session files.
 * Scans JSONL files on-demand for matching text.
 */
function searchClaudeMessages(
  query: string,
  limit: number = 50,
  days: number = 30,
  projectsRoot: string
): MessageSearchResult[] {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return [];
  }

  const results: MessageSearchResult[] = [];
  const makeCutoff = (d: number) => {
    const c = new Date();
    c.setDate(c.getDate() - d);
    return c;
  };
  let cutoff = makeCutoff(days);

  const queryLower = query.toLowerCase();

  const projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  outer: for (const projectDir of projectDirs) {
    const projectPath = path.join(projectsRoot, projectDir.name);
    const projectDisplay = dirNameToDisplayPath(projectDir.name);

    const files = fs.readdirSync(projectPath)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

    for (const file of files) {
      const filePath = path.join(projectPath, file);
      const rawSessionId = path.basename(file, '.jsonl');
      const sessionId = buildSessionId('claude', rawSessionId);

      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime < cutoff) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        let messageIndex = 0;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            const entryType = entry.type;
            if (entryType === 'user' || entryType === 'assistant') {
              const messageContent = extractMessageContent(entry);
              if (messageContent) {
                const contentLower = messageContent.toLowerCase();
                const matchIndex = contentLower.indexOf(queryLower);
                if (matchIndex !== -1) {
                  const { snippet, matchStart } = createSnippet(messageContent, matchIndex, query.length);
                  let timestamp: Date | undefined;
                  if (entry.timestamp) {
                    try {
                      timestamp = new Date(entry.timestamp.replace('Z', '+00:00'));
                    } catch { /* ignore */ }
                  }
                  results.push({
                    sessionId,
                    projectPath: projectDir.name,
                    projectDisplay,
                    messageIndex,
                    messageType: entryType,
                    snippet,
                    matchStart,
                    matchLength: query.length,
                    timestamp,
                  });
                  if (results.length >= limit) break outer;
                }
              }
              messageIndex++;
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return results;
}

function searchCodexMessages(
  query: string,
  limit: number = 50,
  days: number = 30,
  sessionsRoot: string
): MessageSearchResult[] {
  if (!sessionsRoot || !fs.existsSync(sessionsRoot)) {
    return [];
  }

  const results: MessageSearchResult[] = [];
  const makeCutoff = (d: number) => {
    const c = new Date();
    c.setDate(c.getDate() - d);
    return c;
  };
  const cutoff = makeCutoff(days);

  const queryLower = query.toLowerCase();

  const scan = (windowCutoff: Date) => {
    walkCodexFiles(sessionsRoot, (filePath, stat) => {
      if (stat.mtime < windowCutoff || results.length >= limit) return;

      let messageIndex = 0;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const rawSessionId = path.basename(filePath, '.jsonl').replace(/^rollout-[0-9]+-/, '');
        const sessionId = buildSessionId('codex', rawSessionId);

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'response_item') {
              const role = entry.role || entry.message?.role;
              const messageContent = extractMessageContent(entry);
              if (messageContent) {
                const contentLower = messageContent.toLowerCase();
                const matchIndex = contentLower.indexOf(queryLower);
                if (matchIndex !== -1) {
                  const { snippet, matchStart } = createSnippet(messageContent, matchIndex, query.length);
                  let timestamp: Date | undefined;
                  if (entry.timestamp) {
                    try {
                      timestamp = new Date(entry.timestamp);
                    } catch { /* ignore */ }
                  }
                  const { projectDisplay } = deriveCodexProjectKey(entry.cwd || '');
                  results.push({
                    sessionId,
                    projectPath: deriveCodexProjectKey(entry.cwd || '').projectPath,
                    projectDisplay,
                    messageIndex,
                    messageType: role === 'user' ? 'user' : 'assistant',
                    snippet,
                    matchStart,
                    matchLength: query.length,
                    timestamp,
                  });
                  if (results.length >= limit) return;
                }
              }
              messageIndex++;
            }
          } catch {
            continue;
          }
        }
      } catch {
        return;
      }
    });
  };

  scan(cutoff);

  // If nothing found, retry with 1-year window
  if (results.length === 0 && days < 365) {
    scan(makeCutoff(365));
  }

  return results;
}

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Cursor message search — walks /root/.cursor/projects/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl
    Why: Phase 2b — search must include Cursor sessions; uses unified extractMessageContent
    Expected: Returns MessageSearchResult[] with messageIndex/messageType/matchStart/matchLength; timestamp undefined (Cursor JSONL has no timestamps per Phase 0)
*/
function searchCursorMessages(
  query: string,
  limit: number = 50,
  days: number = 30,
  projectsRoot: string
): MessageSearchResult[] {
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return [];
  }

  const results: MessageSearchResult[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const queryLower = query.toLowerCase();

  let projectSlugs: string[] = [];
  try {
    projectSlugs = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return [];
  }

  outer: for (const slug of projectSlugs) {
    const transcriptsDir = path.join(projectsRoot, slug, 'agent-transcripts');
    if (!fs.existsSync(transcriptsDir)) continue;

    let chatDirs: fs.Dirent[] = [];
    try {
      chatDirs = fs.readdirSync(transcriptsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
    } catch {
      continue;
    }

    const projectDisplay = cursorSlugToDisplayPath(slug);

    for (const chatDir of chatDirs) {
      const chatId = chatDir.name;
      const filePath = path.join(transcriptsDir, chatId, `${chatId}.jsonl`);
      if (!fs.existsSync(filePath)) continue;

      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime < cutoff) continue;

        const rawSessionId = chatId;
        const sessionId = buildSessionId('cursor', rawSessionId);

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        let messageIndex = 0;

        for (const line of lines) {
          if (!line.trim()) continue;
          let entry: any;
          try {
            entry = JSON.parse(line);
          } catch {
            continue;
          }

          const role = entry.role;
          if (role !== 'user' && role !== 'assistant') continue;

          let messageContent = extractMessageContent(entry);
          if (!messageContent) {
            messageIndex++;
            continue;
          }

          // Strip <user_query> wrapper from first user prompt for cleaner snippets
          const m = messageContent.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
          if (m) {
            messageContent = m[1];
          }

          const contentLower = messageContent.toLowerCase();
          const matchIndex = contentLower.indexOf(queryLower);
          if (matchIndex !== -1) {
            const { snippet, matchStart } = createSnippet(messageContent, matchIndex, query.length);
            results.push({
              sessionId,
              projectPath: slug,
              projectDisplay,
              messageIndex,
              messageType: role,
              snippet,
              matchStart,
              matchLength: query.length,
              // Cursor JSONL has no per-line timestamp — leave undefined
            });
            if (results.length >= limit) break outer;
          }

          messageIndex++;
        }
      } catch {
        continue;
      }
    }
  }

  return results;
}
// <END Tharyn | CursorCLI

export function searchMessages(
  query: string,
  limit: number = 50,
  days: number = 30,
  providerFilter?: ProviderId[]
): MessageSearchResult[] {
  const started = Date.now();
  if (!query || query.length < 2) {
    return [];
  }

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Default search now includes 'cursor' alongside claude/codex
      Why: Phase 2b — Cursor must be searchable as a peer
      Expected: searchMessages('foo') returns hits across all three providers when no filter passed
  */
  const { config, providers } = getConfiguredProviders(providerFilter);
  // <END Tharyn | CursorCLI
  let results: MessageSearchResult[] = [];

  if (providers.includes('claude')) {
    results = results.concat(searchClaudeMessages(query, limit, days, getProviderRoot(config, 'claude')));
  }
  if (providers.includes('codex')) {
    results = results.concat(searchCodexMessages(query, limit, days, getProviderRoot(config, 'codex')));
  }
  if (providers.includes('cursor')) {
    results = results.concat(searchCursorMessages(query, limit, days, getProviderRoot(config, 'cursor')));
  }

  results.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  const sliced = results.slice(0, limit);

  try {
    console.log(JSON.stringify({
      provider: providers.join('+'),
      action: 'searchMessages',
      query,
      result: 'ok',
      hits: sliced.length,
      durationMs: Date.now() - started,
    }));
  } catch { /* ignore */ }

  return sliced;
}
// <END | Sphere -> Tharyn | CC
