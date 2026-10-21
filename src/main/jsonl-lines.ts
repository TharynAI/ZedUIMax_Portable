/* START> Tharyn | ZedUIMax Large Transcripts
    2026-10-21
    What: Read a JSONL transcript one line at a time with bounded memory.
    Why: `fs.readFileSync(file, 'utf-8')` throws once a file passes V8's maximum string length
         (~512 MiB). Long-running Codex rollouts are already past it (Bramble 692 MB, Nimbus 544 MB),
         so their details resolved to null and Continue/Branch failed with "Session not found".
    Expected: Any transcript size is readable; callers see the same lines `split('\n')` produced,
         except that a trailing '\r' is not stripped (matching the previous behaviour).
*/
import fs from 'fs';

const CHUNK_BYTES = 4 * 1024 * 1024;

/** Calls `onLine` for each line. Return `false` from `onLine` to stop early. */
export function forEachLineSync(filePath: string, onLine: (line: string) => boolean | void): void {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let carry: Buffer[] = [];
    let position = 0;
    for (;;) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (bytesRead <= 0) break;
      position += bytesRead;
      let start = 0;
      for (;;) {
        const newline = buffer.indexOf(10, start);
        if (newline === -1 || newline >= bytesRead) break;
        const piece = buffer.subarray(start, newline);
        const line = carry.length > 0 ? Buffer.concat([...carry, piece]).toString('utf-8') : piece.toString('utf-8');
        carry = [];
        if (onLine(line) === false) return;
        start = newline + 1;
      }
      if (start < bytesRead) carry.push(Buffer.from(buffer.subarray(start, bytesRead)));
    }
    if (carry.length > 0) onLine(Buffer.concat(carry).toString('utf-8'));
  } finally {
    fs.closeSync(fd);
  }
}
// <END Tharyn | ZedUIMax Large Transcripts
