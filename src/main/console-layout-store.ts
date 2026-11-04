import fs from 'fs';
import path from 'path';
import type { ConsoleLayoutSnapshot } from './console-layout';
import { previewConsoleLayout } from './console-layout';

/* START> Tharyn | ZedUIMax
   2026-11-04: One local writer; observations cannot replace protected named/pre-reboot captures.
*/
export function storeConsoleObservation(dataDir: string, snapshot: ConsoleLayoutSnapshot): string | null {
  const dir = path.join(dataDir, 'console-layout');
  fs.mkdirSync(dir, { recursive: true });
  const latest = path.join(dir, 'latest-observed.json');
  const lock = path.join(dir, '.capture.lock');
  const fd = fs.openSync(lock, 'wx');
  const temporary = path.join(dir, `.capture-${process.pid}.tmp`);
  try {
    if (!snapshot.windows.length && fs.existsSync(latest)) return null;
    fs.writeFileSync(temporary, JSON.stringify({ ...snapshot, preview: previewConsoleLayout(snapshot) }, null, 2), { flag: 'wx' });
    for (let i = 5; i > 1; i--) {
      const previous = path.join(dir, `observed-${i - 1}.json`);
      if (fs.existsSync(previous)) fs.copyFileSync(previous, path.join(dir, `observed-${i}.json`));
    }
    if (fs.existsSync(latest)) fs.copyFileSync(latest, path.join(dir, 'observed-1.json'));
    fs.renameSync(temporary, latest);
    return latest;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
// <END Tharyn | ZedUIMax
