import fs from 'fs';
import path from 'path';

export interface RuntimePathInputs {
  appPath?: string;
  cwd?: string;
  dirname?: string;
  execPath?: string;
  isPackaged?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface RuntimePaths {
  appRoot: string;
  dataDir: string;
  logsDir: string;
  userDataDir: string;
  settingsFile: string;
  dbPath: string;
  bundledProEngRoot: string;
  proEngConfigDir: string;
  proEngStarterDir: string;
  proEngScriptsDir: string;
  proEngDefaultsFile: string;
  proEngStarterPromptFile: string;
  proEngBridgeFile: string;
  mutableProEngRoot: string;
  proEngSessionsDir: string;
  proEngTemplatesDir: string;
}

let cachedPaths: RuntimePaths | null = null;

function pathExists(candidate: string | undefined): candidate is string {
  return Boolean(candidate && fs.existsSync(candidate));
}

function directoryFor(candidate: string): string {
  try {
    const stat = fs.statSync(candidate);
    return stat.isDirectory() ? candidate : path.dirname(candidate);
  } catch {
    return candidate;
  }
}

function findAppRootFrom(start: string | undefined): string | null {
  if (!start) return null;

  let current = path.resolve(directoryFor(start));
  const { root } = path.parse(current);

  while (current && current !== root) {
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      return current;
    }
    current = path.dirname(current);
  }

  if (current === root && fs.existsSync(path.join(current, 'package.json'))) {
    return current;
  }

  return null;
}

function resolveAppRoot(inputs: RuntimePathInputs): string {
  const env = inputs.env || process.env;

  if (env.ZEDUI_APP_ROOT) {
    return path.resolve(env.ZEDUI_APP_ROOT);
  }

  if (inputs.isPackaged && inputs.execPath) {
    return path.dirname(path.resolve(inputs.execPath));
  }

  const candidates = [
    inputs.appPath,
    inputs.cwd,
    inputs.dirname,
    process.cwd(),
    __dirname,
  ];

  for (const candidate of candidates) {
    const root = findAppRootFrom(candidate);
    if (root) {
      return root;
    }
  }

  return path.resolve(inputs.cwd || process.cwd());
}

function isInsideOrSame(parent: string, child: string): boolean {
  const normalizedParent = path.resolve(parent);
  const normalizedChild = path.resolve(child);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertPortableWritableRoot(label: string, appRoot: string, writablePath: string, env: NodeJS.ProcessEnv): void {
  if (env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT === '1') {
    return;
  }

  if (!isInsideOrSame(appRoot, writablePath)) {
    throw new Error(
      `${label} resolved outside the app root: ${writablePath}. ` +
      'Portable mode keeps mutable files under the clone root unless ZEDUI_ALLOW_EXTERNAL_DATA_ROOT=1 is set.'
    );
  }
}

/* START> Tharyn | PortableInstall
    2026-05-22
    What: Resolve app, data, Electron userData, and ProEng paths from the running install root
    Why: Portable clones must write beside their own checkout instead of a long-lived local development folder
    Expected: Settings, SQLite, logs, Electron storage, and ProEng mutable data live under <appRoot>\data
*/
export function resolveRuntimePaths(inputs: RuntimePathInputs = {}): RuntimePaths {
  const env = inputs.env || process.env;
  const appRoot = resolveAppRoot(inputs);
  const dataDir = path.resolve(env.ZEDUI_DATA_ROOT || path.join(appRoot, 'data'));

  assertPortableWritableRoot('Data root', appRoot, dataDir, env);

  const logsDir = path.join(dataDir, 'logs');
  const userDataDir = path.join(dataDir, 'userData');
  const bundledProEngRoot = path.join(appRoot, 'resources', 'proeng');
  const proEngConfigDir = path.join(bundledProEngRoot, 'config');
  const proEngStarterDir = path.join(proEngConfigDir, 'starter-prompts');
  const proEngScriptsDir = path.join(bundledProEngRoot, 'scripts');
  const mutableProEngRoot = path.join(dataDir, 'proeng');

  return {
    appRoot,
    dataDir,
    logsDir,
    userDataDir,
    settingsFile: path.join(dataDir, 'settings.json'),
    dbPath: path.join(dataDir, 'zedui.db'),
    bundledProEngRoot,
    proEngConfigDir,
    proEngStarterDir,
    proEngScriptsDir,
    proEngDefaultsFile: path.join(proEngConfigDir, 'provider-defaults.json'),
    proEngStarterPromptFile: path.join(proEngStarterDir, 'generic.md'),
    proEngBridgeFile: path.join(proEngScriptsDir, 'proeng_llm.py'),
    mutableProEngRoot,
    proEngSessionsDir: path.join(mutableProEngRoot, 'sessions'),
    proEngTemplatesDir: path.join(mutableProEngRoot, 'templates'),
  };
}
// <END Tharyn | PortableInstall

export function initializeRuntimePaths(inputs: RuntimePathInputs = {}): RuntimePaths {
  cachedPaths = resolveRuntimePaths(inputs);
  return cachedPaths;
}

export function getRuntimePaths(): RuntimePaths {
  if (!cachedPaths) {
    cachedPaths = resolveRuntimePaths();
  }
  return cachedPaths;
}

export function ensureRuntimeWritableDirs(paths = getRuntimePaths()): void {
  for (const dir of [
    paths.dataDir,
    paths.logsDir,
    paths.userDataDir,
    paths.mutableProEngRoot,
    paths.proEngSessionsDir,
    paths.proEngTemplatesDir,
  ]) {
    if (!pathExists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
