/* START> Tharyn | ZedUIMax
   2026-11-04: Read-only layout evidence. This module contains no restore or process-control API.
*/
import { createHash, randomUUID } from 'crypto';

type Row = Record<string, unknown>;
export interface LayoutRect { x: number; y: number; width: number; height: number }
export interface LayoutRecipe { command: string; args: string[] }
export interface LayoutSession {
  sessionId: string; productId: string; provider: string; cwd: string;
  pid: number; startTicks: string; executable: string;
}
export type RecipeResolver = (session: LayoutSession) => LayoutRecipe;

function row(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
function list(value: unknown, limit: number): Row[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Missing or excessive observation rows');
  return value.map(row);
}
function text(value: unknown): string {
  return typeof value === 'string' && value.length <= 8192 ? value : '';
}
function rect(value: unknown): LayoutRect | null {
  const r = row(value);
  if (![r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  if (Number(r.width) <= 0 || Number(r.height) <= 0) return null;
  return { x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) };
}
function overlap(a: LayoutRect, b: LayoutRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
function uuid(value: unknown): string {
  const s = text(value).toLowerCase();
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(s) ? s : '';
}
function windowsCwd(value: unknown): string {
  const s = text(value);
  if (/^[A-Za-z]:[\\/]/.test(s)) return s.replace(/\//g, '\\');
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(s);
  return match ? `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}` : '';
}
function countBy(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

export function captureConsoleLayout(input: {
  terminal: unknown; native: unknown; tower: unknown; settings: unknown;
  distro: string; now?: number; resolveRecipe: RecipeResolver;
}) {
  const terminal = row(input.terminal), native = row(input.native), tower = row(input.tower);
  if (terminal.schemaVersion !== 1 || native.schemaVersion !== 1) throw new Error('Unsupported observer schema');
  const windows = list(terminal.windows, 256), processes = list(native.records, 4096);
  const agents = list(tower.agents, 4096), rawPanels = list(tower.monitors, 32);
  const diagnostics: string[] = [];
  const now = input.now ?? Date.now();
  if (windows.some(w => text(w.tabError))) diagnostics.push('terminal-tab-enumeration-partial');
  const towerAge = now - Number(tower.generatedAt);
  if (!Number.isFinite(towerAge) || towerAge < -5000 || towerAge > 60000) diagnostics.push('tower-snapshot-stale');
  for (const [name, source] of [['terminal', terminal], ['native', native]] as const) {
    const age = now - Date.parse(text(source.capturedAt));
    if (!Number.isFinite(age) || age < -5000 || age > 60000) diagnostics.push(`${name}-observation-stale`);
    if (!Array.isArray(source.errors) || source.errors.length) diagnostics.push(`${name}-observation-partial`);
  }
  const reservedSerial = text(row(input.settings).reservedPanelSerial);
  if (!reservedSerial) diagnostics.push('reserved-panel-identity-unknown');
  const panels = rawPanels.map(p => ({
    serial: text(p.serial) || null, deviceName: text(p.deviceName), rect: rect(p),
    reserved: p.reservedForUser === true || (!!reservedSerial && p.serial === reservedSerial),
    occupied: p.occupied === true, ownerAgentId: text(p.ownerAgentId) || null,
  })).sort((a, b) => (a.serial || '').localeCompare(b.serial || ''));
  if (!panels.length || panels.some(p => !p.serial || !p.rect)) diagnostics.push('panel-identity-or-geometry-unknown');
  const serialCounts = countBy(panels.map(p => p.serial || ''));
  if ([...serialCounts.values()].some(n => n > 1)) diagnostics.push('duplicate-panel-serial');
  const titles = countBy(windows.flatMap(w => list(w.tabs, 1024).map(t => text(t.title))));
  const agentTitles = countBy(agents.map(a => text(a.name)));
  const agentIds = countBy(agents.map(a => uuid(a.sessionId)).filter(Boolean));
  const nativeIds = countBy(processes.flatMap(p => Array.isArray(p.sessionIds)
    ? p.sessionIds.map(uuid).filter(Boolean) : []));
  const captured = windows.map((w, windowIndex) => {
    const bounds = rect(w.rect);
    const minimized = w.minimized === true;
    const areas = bounds && !minimized ? panels.filter(p => p.rect)
      .map(p => ({ panel: p, area: overlap(bounds, p.rect!) })).sort((a, b) => b.area - a.area) : [];
    const panel = areas[0]?.area > 0 && areas[0].area !== areas[1]?.area ? areas[0].panel : null;
    const tabs = list(w.tabs, 1024).map((t, index) => {
      const title = text(t.title);
      const blockers: string[] = [];
      let session: LayoutSession | null = null, recipe: LayoutRecipe | null = null;
      if (!title || titles.get(title) !== 1 || agentTitles.get(title) !== 1) {
        blockers.push('title-not-globally-unique-or-not-a-Tower-agent');
      } else {
        const agent = agents.find(a => a.name === title)!;
        const id = uuid(agent.sessionId), productId = text(agent.product), host = row(agent.hostPid);
        const provider = productId === 'claude-code' || productId === 'clausor' ? 'claude'
          : productId === 'codex' || productId === 'cursx' ? 'codex' : '';
        if (!id || !provider) blockers.push('unsupported-local-session-or-product');
        else if (agentIds.get(id) !== 1 || nativeIds.get(id) !== 1) blockers.push('native-UUID-missing-or-ambiguous');
        else {
          const p = processes.find(p => Array.isArray(p.sessionIds) && p.sessionIds.some(v => uuid(v) === id))!;
          const exe = text(p.executable), binary = exe.split('/').pop();
          const binaryFamily = binary === 'claude' || binary === 'claude.exe' ? 'claude' : binary === 'codex' ? 'codex' : '';
          const cwd = windowsCwd(p.cwd);
          if (host.host !== 'wsl' || host.pid !== p.pid || host.distro !== input.distro) blockers.push('native-host-or-distro-not-corroborated');
          if (binaryFamily !== provider) blockers.push('native-provider-mismatch');
          if (!cwd || !/^\d+$/.test(text(p.startTicks))) blockers.push('native-cwd-or-start-unavailable');
          if (!blockers.length) {
            session = { sessionId: id, productId, provider, cwd, pid: Number(p.pid), startTicks: text(p.startTicks), executable: exe };
            try {
              const resolved = input.resolveRecipe(session);
              if (!resolved.command || !Array.isArray(resolved.args) || resolved.args.some(a => typeof a !== 'string')) throw new Error();
              recipe = { command: resolved.command, args: [...resolved.args] };
            } catch { blockers.push('canonical-resume-recipe-unavailable'); }
          }
        }
      }
      return {
        tabKey: `observed-${windowIndex}-${index}`, index, title,
        selected: typeof t.selected === 'boolean' ? t.selected : null,
        evidence: session ? 'unique-title-native-corroborated' : 'unmapped',
        productHomeVerified: false, exactPaneBinding: false, splitTopology: 'unknown', session, recipe, blockers,
        executionReady: false,
      };
    });
    const tabBounds = list(w.tabs, 1024).map(t => rect(t.bounds));
    const tabOrderCorroborated = tabBounds.length > 0 && tabBounds.every((r, i) => r
      && !row((w.tabs as unknown[])[i]).offscreen && (!i || (r.x > tabBounds[i - 1]!.x
        && Math.abs(r.y - tabBounds[i - 1]!.y) <= 2)));
    return {
      windowKey: `observed-${windowIndex}`, managedWindowName: null,
      hwnd: text(w.hwnd), pid: Number(w.pid), processStart: text(w.processStart), wtVersion: text(w.wtVersion),
      observedRect: bounds, normalRect: minimized || w.maximized === true ? null : bounds,
      panelSerial: panel?.serial ?? null,
      observedPanelRelativeRect: panel?.rect && bounds ? { ...bounds, x: bounds.x - panel.rect.x, y: bounds.y - panel.rect.y } : null,
      maximized: w.maximized === true, minimized, dpi: Number(w.dpi),
      panelIdentityEligible: !!panel && !panel.reserved && diagnostics.length === 0,
      tabOrderEvidence: tabOrderCorroborated && !minimized ? 'UIA-traversal-and-visible-horizontal-bounds' : 'UIA-traversal-only',
      splitTopology: 'unknown', tabs,
    };
  });
  return {
    schemaVersion: 1, snapshotId: randomUUID(), purpose: 'read-only-prototype', capturedAt: new Date(now).toISOString(),
    machineName: text(terminal.machineName), bootId: text(native.bootId), distro: input.distro,
    observations: { terminalAt: text(terminal.capturedAt), nativeAt: text(native.capturedAt) },
    tower: { hubGeneration: text(tower.hubGeneration), seq: Number(tower.seq), generatedAt: Number(tower.generatedAt) },
    panelMapDigest: createHash('sha256').update(JSON.stringify(panels)).digest('hex'),
    reservedPanelSerial: reservedSerial || null, panels, diagnostics, windows: captured,
    executionReady: false,
  };
}

export type ConsoleLayoutSnapshot = ReturnType<typeof captureConsoleLayout>;

/** Current evidence cannot authorize a legacy cold restore. Keep the preview explicitly non-executable. */
export function previewConsoleLayout(snapshot: ConsoleLayoutSnapshot) {
  return {
    schemaVersion: 1, snapshotId: snapshot.snapshotId, executable: false, actions: [] as never[],
    blockers: [...snapshot.diagnostics, 'restore-executor-not-implemented', 'legacy-pane-and-split-binding-unproven'],
    windows: snapshot.windows.map(w => ({
      windowKey: w.windowKey, sourcePanelSerial: w.panelSerial, observedRect: w.observedRect,
      tabs: w.tabs.map(t => ({ index: t.index, title: t.title, session: t.session, recipe: t.recipe,
        evidence: t.evidence, action: t.session ? 'skip-live-session' : 'blocked-unmapped', blockers: t.blockers })),
    })),
  };
}
// <END Tharyn | ZedUIMax
