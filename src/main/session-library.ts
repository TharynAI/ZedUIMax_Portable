import path from 'path';
import { Worker } from 'worker_threads';
import { DEFAULT_DAYS, DEFAULT_LIMIT } from '../shared/constants';
import { matchesMachineProfile } from '../shared/portable-config';
import { getRuntimePaths } from './runtime-paths';
import { getMachineProfiles, projectsFromSessions, projectSessionLibrary, type MessageSearchResult, type SessionLibraryInventory } from './session-store';

let queued: Promise<unknown> = Promise.resolve();
let messageWorker: Worker | undefined;

export type SessionWorkerJob = { windows: number[]; providerFilter?: string[] }
  | { query: string; limit: number; days: number; providerFilter?: string[] };

function startWorker<T>(job: SessionWorkerJob): { worker: Worker; result: Promise<T> } {
  const { appRoot, dataDir } = getRuntimePaths();
  const worker = new Worker(path.join(__dirname, 'session-library-worker.js'), {
    workerData: { job, appRoot, dataDir },
    execArgv: [],
  });
  const result = new Promise<T>((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Session worker exited without a result (${code})`)));
  });
  return { worker, result };
}

function scan(windows: number[], providerFilter?: string[]): Promise<SessionLibraryInventory> {
  // Serialize scans so filter changes cannot start a herd of UNC walkers or cache writers.
  const job = queued.then(() => startWorker<SessionLibraryInventory>({ windows, providerFilter }).result);
  queued = job.catch(() => undefined);
  return job;
}

export async function searchSessionMessages(
  query: string, limit?: number, days?: number, providerFilter?: string[], machineKey?: string,
): Promise<MessageSearchResult[]> {
  // The single search pane keeps only its newest query. Don't queue a Gemini search behind an old all-provider scan.
  const previous = messageWorker;
  messageWorker = undefined;
  if (previous) void previous.terminate().catch(() => undefined);
  if (typeof query !== 'string' || query.trim().length < 2) return [];
  if (machineKey && !matchesMachineProfile(getMachineProfiles()[0], machineKey)) return [];
  const count = limit === undefined ? 50 : Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
  if (!count) return [];
  const age = typeof days === 'number' && Number.isFinite(days) && days >= 1 ? days : DEFAULT_DAYS;
  const { worker, result } = startWorker<MessageSearchResult[]>({ query: query.trim(), limit: count, days: age, providerFilter });
  messageWorker = worker;
  try {
    return await result;
  } catch (error) {
    if (messageWorker !== worker) return []; // Replaced or cleared.
    throw error;
  } finally {
    if (messageWorker === worker) messageWorker = undefined;
  }
}

/* START> Tharyn | ZedUIMax Startup Performance
   2026-11-22: Keep filesystem discovery off main; SQLite and UI projections remain in main.
*/
export async function loadSessionLibrary(
  view: 'sessions' | 'projects' | 'both',
  days: number = DEFAULT_DAYS,
  limit: number = DEFAULT_LIMIT,
  providerFilter?: string[],
  machineKey?: string,
) {
  if (machineKey && !matchesMachineProfile(getMachineProfiles()[0], machineKey)) {
    return { sessions: [], projects: [] };
  }
  const listDays = Number.isFinite(days) && days >= 1 ? days : DEFAULT_DAYS;
  const windows = view === 'both' && listDays !== DEFAULT_DAYS
    ? [listDays, DEFAULT_DAYS].sort((a, b) => a - b)
    : [view === 'projects' ? DEFAULT_DAYS : listDays];
  const inventory = await scan(windows, providerFilter);
  return {
    sessions: view === 'projects' ? [] : projectSessionLibrary(inventory, listDays, limit, providerFilter, machineKey),
    projects: view === 'sessions' ? [] : projectsFromSessions(
      projectSessionLibrary(inventory, DEFAULT_DAYS, DEFAULT_LIMIT * 5, providerFilter, machineKey),
    ),
  };
}
// <END Tharyn | ZedUIMax Startup Performance
