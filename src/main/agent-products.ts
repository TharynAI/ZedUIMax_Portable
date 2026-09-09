/* START> Tharyn | CursX
    2026-09-07
    What: Read the agent PRODUCT registry that ZedTrafficControl publishes, and resolve which
          product a session file belongs to from the root it was found in.
    Why: CursX is the Codex CLI harness driving Cursor-hosted inference from an isolated
         CODEX_HOME. It is genuinely provider `codex` - its annotation rows are keyed
         `codex:<uuid>` and one already carries the tower call sign `Warden` - so it must keep
         that key. Two things must NOT be shared with normal Codex, though: what the user sees,
         and which launcher resumes it. Resuming a CursX thread through the normal Codex launcher
         points the wrong CODEX_HOME at the conversation.

         `providerId` cannot carry this. It is parsed back out of the session id
         (provider-utils.ts), and a CursX id says `codex:` - so any site that re-parses it would
         flip a `cursx` session back to `codex`. Product is therefore a separate dimension,
         derived from the ROOT a transcript was discovered in, which is the one piece of evidence
         that cannot drift.
    Expected: CursX sessions appear beside Codex ones, badged CursX, resumed through the CursX
         launcher, joined to the same `codex:<uuid>` annotations. No registry means exactly
         today's behaviour: one Codex root, one Codex launcher.
*/
import * as fs from 'fs';
import * as path from 'path';

import { sharedPath } from './shared-paths';

/* START> Tharyn | ZedUIMax SharedPaths
    2026-09-08
    What: Take the tower's data directory from the shared path file, not a literal.
    Why:  Parity plan 005 A3a. See shared-paths.ts for the full reasoning.
    Expected: Same directory as before on a normal install; redirectable by a harness; a loud,
          self-identifying failure if the shared file is missing the key.
*/
const towerDataDir = (): string => sharedPath('zedTrafficControlData', 'zeduimax-products');
// <END Tharyn | ZedUIMax SharedPaths

export interface ProductCommand {
  exe: string;
  args: string[];
}

export interface AgentProduct {
  id: string;
  label: string;
  /** The database key prefix. Deliberately shared: `codex` and `cursx` are both `codex`. */
  keyProvider: string;
  harness: string;
  inferenceRoute: string;
  home: string | null;
  sessionsDir: string | null;
  fallback?: boolean;
  launch?: ProductCommand;
  resume?: ProductCommand;
  appServerUrl?: string | null;
}

/** One comparable form for a path, folding `/mnt/e/...` and `E:\...` together. */
export function canonPath(p: string | null | undefined): string {
  if (!p) return '';
  let s = String(p).trim().replace(/\\/g, '/').toLowerCase();
  const m = /^\/mnt\/([a-z])\//.exec(s);
  if (m) s = `${m[1]}:/${s.slice(m[0].length)}`;
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function isUnder(child: string, parent: string): boolean {
  const c = canonPath(child);
  const p = canonPath(parent);
  if (!c || !p) return false;
  return c === p || c.startsWith(`${p}/`);
}

let cache: { at: number; products: AgentProduct[] } | null = null;
const CACHE_MS = 30_000;

/**
 * Load the registry, tolerating its absence.
 *
 * Two locations, in order: an override in the tower's data dir, then the version-controlled file
 * in its config dir. `data/` is gitignored in the tower repo, so the config copy is the one that
 * exists on a normal install; reading only `data/` would find nothing, silently.
 */
let warnedSharedPath = false;

export function loadProducts(towerDataDirWin?: string): AgentProduct[] {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.products;
  /* START> Tharyn | ZedUIMax SharedPaths
      2026-09-08
      What: Report a missing shared-path entry once and carry on with an empty registry, rather
            than throwing out of here.
      Why:  Parity plan 005 says fail loudly, and it is right - but this function runs on EVERY
            session listing (session-store.ts:1182,1185,1211). Throwing here would take out the
            whole Browse tab because a path file is absent, which is loud in the wrong place. The
            dangerous case is already guarded where it is dangerous: buildCodexLaunch throws for a
            non-codex product with no launch command, so a CursX session still cannot be
            misrouted into the normal Codex launcher. Loud at the boundary that matters, quiet at
            the one that does not.
      Expected: Sessions still list with a missing shared file; the reason is on the console once,
            not once per listing; and launching CursX still refuses rather than misrouting.
  */
  if (towerDataDirWin === undefined) {
    try {
      towerDataDirWin = towerDataDir();
    } catch (e) {
      if (!warnedSharedPath) {
        warnedSharedPath = true;
        console.error(`[agent-products] product registry unavailable: ${(e as Error).message}`);
      }
      cache = { at: Date.now(), products: [] };
      return [];
    }
  }
  // <END Tharyn | ZedUIMax SharedPaths
  // Registry paths are stored Windows-style, but this code also runs under WSL (tests, tooling),
  // where `E:\...` is not a readable path and every read silently misses. A missing registry is
  // NOT harmless here: it makes CursX resume fall through to the normal Codex launcher, which is
  // the exact misroute this module exists to prevent. Convert before touching the filesystem.
  const dir = toNativeReadPath(towerDataDirWin).replace(/[\\/]+$/, '');
  const parent = dir.replace(/[\\/][^\\/]+$/, '');
  let products: AgentProduct[] = [];
  for (const file of [path.join(dir, 'agent-products.json'),
                      path.join(parent, 'config', 'agent-products.json')]) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(raw?.products) ? raw.products : [];
      const valid = list.filter((p: any) => typeof p?.id === 'string' && typeof p?.keyProvider === 'string');
      if (valid.length > 0) { products = valid; break; }
    } catch {
      // Try the next location; a corrupt override must not mask the shipped file.
    }
  }
  cache = { at: Date.now(), products };
  return products;
}

/** Every product that shares a provider's database key, i.e. every root to discover for it. */
export function productsForProvider(providerId: string): AgentProduct[] {
  return loadProducts().filter((p) => p.keyProvider === providerId);
}

/**
 * Which product a discovered transcript belongs to, by the root it was found in.
 *
 * Longest match wins, so a bridge profile nested inside a wider tree resolves to itself. A file
 * under no registered root falls back to the provider's default product, which keeps every
 * pre-existing session behaving exactly as it did before.
 */
export function productForFile(filePath: string, providerId: string): AgentProduct | null {
  const candidates = productsForProvider(providerId);
  let best: AgentProduct | null = null;
  for (const p of candidates) {
    if (!p.sessionsDir || !isUnder(filePath, p.sessionsDir)) continue;
    if (!best || canonPath(p.sessionsDir).length > canonPath(best.sessionsDir).length) best = p;
  }
  return best ?? candidates.find((p) => p.fallback) ?? null;
}

export function productById(id: string | null | undefined): AgentProduct | null {
  if (!id) return null;
  return loadProducts().find((p) => p.id === id) ?? null;
}

/** Substitute `{sessionId}` / `{cwd}` into a product command. */
export function fillCommand(
  cmd: ProductCommand,
  vars: { sessionId?: string | null; cwd?: string | null },
): ProductCommand {
  const sub = (s: string): string =>
    s.replace(/\{sessionId\}/g, vars.sessionId ?? '').replace(/\{cwd\}/g, vars.cwd ?? '');
  return { exe: cmd.exe, args: cmd.args.map(sub) };
}

/** A Windows path in the form this process reads. Registry paths are stored Windows-style. */
export function toNativeReadPath(p: string): string {
  if (process.platform === 'win32') return p;
  return /^[A-Za-z]:[\\/]/.test(p)
    ? `/mnt/${p[0]!.toLowerCase()}/${p.slice(3).replace(/\\/g, '/')}`
    : p;
}
// <END Tharyn | CursX
