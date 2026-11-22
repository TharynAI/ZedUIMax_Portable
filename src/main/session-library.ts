import path from 'path';
import { Worker } from 'worker_threads';
import { DEFAULT_DAYS, DEFAULT_LIMIT } from '../shared/constants';
import { matchesMachineProfile } from '../shared/portable-config';
import { getRuntimePaths } from './runtime-paths';
import { getMachineProfiles, projectsFromSessions, projectSessionLibrary, type SessionLibraryInventory } from './session-store';

let queued: Promise<unknown> = Promise.resolve();

function scan(windows: number[], filter?: string[]): Promise<SessionLibraryInventory> {
  const { appRoot, dataDir } = getRuntimePaths();
  // Serialize scans so filter changes cannot start a herd of UNC walkers or cache writers.
  const job = queued.then(() => new Promise<SessionLibraryInventory>((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'session-library-worker.js'), {
      workerData: { windows, providerFilter: filter, appRoot, dataDir },
      execArgv: [],
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Library scanner exited without a result (${code})`)));
  }));
  queued = job.catch(() => undefined);
  return job;
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
