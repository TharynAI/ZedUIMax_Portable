import { parentPort, workerData } from 'worker_threads';
import { initializeRuntimePaths } from './runtime-paths';
import { SessionLibraryCache } from './session-library-cache';
import { scanSessionLibrary } from './session-store';

if (!parentPort) throw new Error('Session library scanner requires a worker');

const { windows, providerFilter, appRoot, dataDir } = workerData;
initializeRuntimePaths({ env: { ...process.env, ZEDUI_APP_ROOT: appRoot, ZEDUI_DATA_ROOT: dataDir } });
const cache = new SessionLibraryCache(dataDir);
const inventory = scanSessionLibrary(windows, providerFilter, cache);
cache.save();
parentPort.postMessage(inventory);
