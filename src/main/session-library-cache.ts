import fs from 'fs';
import path from 'path';
import type { SessionInfo } from './session-store';

type Entry = { mtime: number; ctime: number; size: number; row: SessionInfo };
const MAX_ENTRIES = 20_000;
const MAX_BYTES = 32 * 1024 * 1024;

/* START> Tharyn | ZedUIMax Startup Performance
   2026-11-22: Cache only file-derived rows, never annotation or scan results.
   Each scan enumerates current files; missing roots and deleted files cannot surface cached rows.
*/
export class SessionLibraryCache {
  private readonly file: string;
  private readonly entries = new Map<string, Entry>();
  private dirty = false;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'library-cache-v1.json');
    try {
      if (fs.statSync(this.file).size > MAX_BYTES) return;
      const entries = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Array<[string, Entry]>;
      for (const [key, entry] of entries.slice(-MAX_ENTRIES)) {
        if (typeof key !== 'string' || typeof entry?.row?.sessionId !== 'string') continue;
        entry.row.timestamp = new Date(entry.row.timestamp);
        if (Number.isFinite(entry.row.timestamp.getTime())) this.entries.set(key, entry);
      }
    } catch { /* A missing or unreadable cache is a cold scan. */ }
  }

  read(provider: string, file: string, stat: fs.Stats, parse: () => SessionInfo | null): SessionInfo | null {
    // Keep path case: Linux paths seen through the WSL share can be case-sensitive.
    const key = `${provider}:${file}`;
    const cached = this.entries.get(key);
    this.entries.delete(key);
    if (cached && cached.mtime === stat.mtimeMs && cached.ctime === stat.ctimeMs && cached.size === stat.size) {
      this.entries.set(key, cached);
      return { ...cached.row };
    }
    const row = parse();
    this.dirty ||= Boolean(cached || row);
    if (row) {
      if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, { mtime: stat.mtimeMs, ctime: stat.ctimeMs, size: stat.size, row: { ...row } });
    }
    return row;
  }

  save(): void {
    if (!this.dirty) return;
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      const entries = [...this.entries];
      let body = JSON.stringify(entries);
      while (Buffer.byteLength(body) > MAX_BYTES) {
        entries.splice(0, Math.ceil(entries.length / 2));
        body = JSON.stringify(entries);
      }
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn('Could not save library cache:', error);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* Renamed or never written. */ }
    }
  }
}
// <END Tharyn | ZedUIMax Startup Performance
