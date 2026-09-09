/* START> Tharyn | ZedUIMax SharedPaths
    2026-09-08
    What: Resolve another product's install location from one shared file instead of a literal.
    Why:  Parity plan 005 A3a / P1.5. This app held an absolute path to ZedTrafficControl's data
          directory while the tower held one to this app's database, so each product's install root
          anchored the other's - and this app has already moved twice (ZedUI -> ZedUIMax ->
          ZedUIMax_Portable). It also defeats test isolation: on 2026-09-08 the tower's own suite,
          correctly run against an isolated --data directory, still wrote 34 synthetic rows into the
          live zedui.db, because a literal cannot be redirected by a harness.
    Expected: One file, owned by no product, names every cross-product location. A missing entry
          fails loudly naming this product, the key and where it looked - never a hardcoded
          fallback, since a silent default lets the shared file rot untested.
*/
import * as fs from 'fs';

/**
 * The one address that cannot come from the file. Deliberately the Projects repo: the only tree all
 * three products already agree exists, and which belongs to none of them.
 */
const SHARED_CONFIG_WIN = 'E:\\ZedBang\\Projects\\.config\\zedbang-paths.json';

export type SharedPathKey = 'zedTrafficControlData' | 'zeduiDb';

let cache: Record<string, string> | null = null;
let cacheFrom = '';

/** Windows path -> a path this process can actually read, on Windows or under WSL. */
function toNative(win: string): string {
  if (process.platform === 'win32') return win;
  return /^[A-Za-z]:/.test(win)
    ? `/mnt/${win[0]!.toLowerCase()}/${win.slice(3).replace(/\\/g, '/')}`
    : win;
}

/**
 * Windows-canonical path for a shared location. Throws with a message naming who was asking, what
 * for, and where it looked - the failure surfaces in whichever product moved, not the one that
 * broke, so it has to identify itself.
 */
export function sharedPath(key: SharedPathKey, asker = 'zeduimax'): string {
  const fileWin = process.env.ZEDBANG_PATHS ?? SHARED_CONFIG_WIN;
  const where = process.env.ZEDBANG_PATHS ? ' (from ZEDBANG_PATHS)' : ' (and ZEDBANG_PATHS is unset)';
  if (!cache || cacheFrom !== fileWin) {
    let raw: string;
    try {
      raw = fs.readFileSync(toNative(fileWin), 'utf8');
    } catch {
      throw new Error(`${asker}: cannot read the shared path file at ${fileWin}${where}`);
    }
    try {
      cache = JSON.parse(raw) as Record<string, string>;
    } catch (e) {
      throw new Error(`${asker}: ${fileWin} is not valid JSON - ${(e as Error).message}`);
    }
    cacheFrom = fileWin;
  }
  const value = cache[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${asker}: no ${key} in ${fileWin}${where}`);
  }
  return value;
}
// <END Tharyn | ZedUIMax SharedPaths
