import { parentPort, workerData } from 'worker_threads';
import { initializeRuntimePaths } from './runtime-paths';
import { SessionLibraryCache } from './session-library-cache';
import { scanSessionLibrary, searchMessages } from './session-store';
import type { SessionWorkerJob } from './session-library';

if (!parentPort) throw new Error('Session library scanner requires a worker');

const { appRoot, dataDir } = workerData;
const job: SessionWorkerJob = workerData.job;
initializeRuntimePaths({ env: { ...process.env, ZEDUI_APP_ROOT: appRoot, ZEDUI_DATA_ROOT: dataDir } });
if ('query' in job) {
  parentPort.postMessage(searchMessages(job.query, job.limit, job.days, job.providerFilter));
} else {
  const cache = new SessionLibraryCache(dataDir);
  const inventory = scanSessionLibrary(job.windows, job.providerFilter, cache);
  cache.save();
  parentPort.postMessage(inventory);
}
