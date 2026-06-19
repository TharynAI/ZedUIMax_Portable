#!/usr/bin/env node
/**
 * Migrate legacy ZedUIMax data into this portable checkout.
 *
 * Uses Python's standard sqlite3 backup API instead of better-sqlite3 so the
 * script is not affected by Electron native-module rebuilds.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_SOURCE = 'E:\\ZedBang\\ZedUIMax\\data';
const DEFAULT_TARGET = path.resolve(__dirname, '..', 'data');
const TABLES = ['annotations', 'tags', 'session_tags', 'session_branches', 'type_registry'];

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    dryRun: false,
    force: false,
    allowLiveSource: false,
    verifyOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i];
    else if (arg === '--target') args.target = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--allow-live-source') args.allowLiveSource = true;
    else if (arg === '--verify-only') args.verifyOnly = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/migrate-local-data.js [options]

Options:
  --source <dir>          Source data directory (default: ${DEFAULT_SOURCE})
  --target <dir>          Target portable data directory (default: <repo>\\data)
  --dry-run               Report actions without writing files
  --force                 Replace existing target settings/database after backup
  --allow-live-source     Allow migration while original-root Electron is running
  --verify-only           Compare source and target database/settings without writing
`);
}

function fail(message) {
  throw new Error(message);
}

function normalizeWinPath(value) {
  return path.win32.resolve(value);
}

function samePath(a, b) {
  return normalizeWinPath(a).toLowerCase() === normalizeWinPath(b).toLowerCase();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(file) {
  if (!fs.existsSync(file)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex').toUpperCase();
}

function fileInfo(file) {
  if (!fs.existsSync(file)) {
    return { exists: false };
  }
  const stat = fs.statSync(file);
  return {
    exists: true,
    length: stat.size,
    mtimeUtc: stat.mtime.toISOString(),
    sha256: sha256(file),
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding || 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : (result.stderr || '');
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : (result.stdout || '');
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}\n${stdout}\n${stderr}`.trim());
  }
  return result;
}

function findPython() {
  const candidates = [
    { command: process.env.PYTHON || '', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    { command: 'python3', args: [] },
  ].filter((candidate) => candidate.command);

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '-c', 'import sqlite3, json; print("ok")'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout.trim() === 'ok') {
      return candidate;
    }
  }

  fail('Python with sqlite3 support was not found on PATH. Install Python 3 or set PYTHON.');
}

function psSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getElectronProcesses() {
  const script = `
$items = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
  Select-Object ProcessId,CommandLine
if ($items) { $items | ConvertTo-Json -Depth 3 } else { '[]' }
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    return [];
  }
  const raw = result.stdout.trim() || '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function classifyProcesses(sourceRoot, targetRoot) {
  const sourceNeedle = normalizeWinPath(sourceRoot).toLowerCase();
  const targetNeedle = normalizeWinPath(targetRoot).toLowerCase();
  const source = [];
  const target = [];

  for (const proc of getElectronProcesses()) {
    const commandLine = String(proc.CommandLine || '');
    const normalized = commandLine.toLowerCase();
    const entry = { pid: proc.ProcessId, commandLine };
    if (normalized.includes(sourceNeedle)) source.push(entry);
    if (normalized.includes(targetNeedle)) target.push(entry);
  }

  return { source, target };
}

function decodeWslList(buffer) {
  const text = buffer.includes(0) ? buffer.toString('utf16le') : buffer.toString('utf8');
  return text.replace(/\u0000/g, '');
}

function detectWsl() {
  const result = spawnSync('wsl.exe', ['-l', '-v'], {
    encoding: 'buffer',
    windowsHide: true,
    timeout: 8000,
  });
  if (result.status !== 0) {
    return { enabled: false, distroName: '', userHomeWsl: '', userHomeUnc: '' };
  }

  const distros = decodeWslList(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^NAME\s+STATE\s+VERSION$/i.test(line))
    .map((line) => {
      const isDefault = line.startsWith('*');
      const cleaned = line.replace(/^\*\s*/, '').trim();
      return { name: cleaned.split(/\s+/)[0], isDefault };
    })
    .filter((distro) => distro.name);

  const distroName = (distros.find((distro) => distro.isDefault) || distros[0] || {}).name || '';
  if (!distroName) {
    return { enabled: false, distroName: '', userHomeWsl: '', userHomeUnc: '' };
  }

  const homeResult = spawnSync('wsl.exe', ['-d', distroName, '-e', 'sh', '-lc', 'printf %s "$HOME"'], {
    encoding: 'buffer',
    windowsHide: true,
    timeout: 8000,
  });
  const userHomeWsl = homeResult.status === 0 ? decodeWslList(homeResult.stdout).trim() : '';
  const userHomeUnc = userHomeWsl
    ? `\\\\wsl.localhost\\${distroName}\\${userHomeWsl.replace(/^\/+/, '').replace(/\//g, '\\')}`
    : '';

  return {
    enabled: Boolean(distroName && userHomeWsl),
    distroName,
    userHomeWsl,
    userHomeUnc,
  };
}

function toWslPath(winPath) {
  const match = String(winPath).match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return winPath;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function appendUnc(base, ...parts) {
  if (!base) return '';
  return [base.replace(/\\+$/, ''), ...parts].join('\\');
}

function appendWsl(base, ...parts) {
  if (!base) return '';
  return [base.replace(/\/+$/, ''), ...parts].join('/');
}

function existsWin(file) {
  return Boolean(file && fs.existsSync(file));
}

function existsWsl(file) {
  if (!file) return false;
  const result = spawnSync('wsl.exe', ['-e', 'sh', '-lc', `test -e '${String(file).replace(/'/g, "'\\''")}'`], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
  });
  return result.status === 0;
}

function commandWsl(command, fallback) {
  const result = spawnSync('wsl.exe', ['-e', 'sh', '-lc', `command -v ${command} 2>/dev/null || true`], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
  });
  const detected = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  return detected || fallback || '';
}

function providerStatus(enabled) {
  return enabled ? 'userConfigured' : 'disabled';
}

function buildPortableConfig(sourceSettings, appRoot, dataRoot) {
  const wsl = detectWsl();
  const projectsRoot = existsWin('E:\\ZedBang\\Projects') ? 'E:\\ZedBang\\Projects' : path.join(os.homedir(), 'Documents');

  const claudeBinaryPathWsl = sourceSettings.claudeBinaryPath
    || '/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/@anthropic-ai/claude-code-linux-x64/claude';
  const claudeMcpConfigPathWsl = sourceSettings.mcpConfigPath
    || '/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json';
  const claudeProjectsDir = appendUnc(wsl.userHomeUnc, '.claude', 'projects');
  const claudeNewScriptWsl = '/mnt/e/ZedBang/CLI/Cust/Claude2/_Launcher/launch-with-validation.sh';
  const claudeResumeScriptWsl = '/mnt/e/ZedBang/CLI/Cust/Claude2/_Launcher/launch-with-validation-resume.sh';
  const claudeEnabled = wsl.enabled
    && existsWin(claudeProjectsDir)
    && existsWsl(claudeBinaryPathWsl)
    && existsWsl(claudeMcpConfigPathWsl)
    && existsWsl(claudeNewScriptWsl)
    && existsWsl(claudeResumeScriptWsl);

  const codexSessionsDir = appendUnc(wsl.userHomeUnc, '.codex', 'sessions');
  const codexBinaryPathWsl = '/mnt/e/ZedBang/CLI/Cust/Codex2/bin/codex';
  const codexNewScriptWin = 'E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex.ps1';
  const codexResumeScriptWin = 'E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex_resume.ps1';
  const codexEnabled = wsl.enabled
    && existsWin(codexSessionsDir)
    && (existsWin(codexNewScriptWin) || existsWsl(codexBinaryPathWsl));

  const cursorProjectsDir = appendUnc(wsl.userHomeUnc, '.cursor', 'projects');
  const cursorBinaryPathWsl = commandWsl('cursor-agent', appendWsl(wsl.userHomeWsl, '.local', 'bin', 'cursor-agent'));
  const cursorEnabled = wsl.enabled
    && existsWin(cursorProjectsDir)
    && existsWsl(cursorBinaryPathWsl);

  const geminiNewScriptWin = 'E:\\ZedBang\\CLI\\Cust\\Gemini3\\_Launcher\\gemini3-launcher.ps1';
  const geminiResumeScriptWin = 'E:\\ZedBang\\CLI\\Cust\\Gemini3\\_Launcher\\gemini3-launcher-resume.ps1';
  const geminiCliEnabled = existsWin(geminiNewScriptWin) && existsWin(geminiResumeScriptWin);

  return {
    version: 1,
    appRoot,
    dataRoot,
    defaultWorkspaceWin: projectsRoot,
    wsl,
    providers: {
      claude: {
        enabled: claudeEnabled,
        status: providerStatus(claudeEnabled),
        projectsDir: claudeProjectsDir,
        binaryPathWsl: claudeBinaryPathWsl,
        mcpConfigPathWsl: claudeMcpConfigPathWsl,
        launchMode: 'script',
        newSessionScriptWsl: claudeNewScriptWsl,
        resumeScriptWsl: claudeResumeScriptWsl,
      },
      codex: {
        enabled: codexEnabled,
        status: providerStatus(codexEnabled),
        sessionsDir: codexSessionsDir,
        binaryPathWsl: existsWsl(codexBinaryPathWsl) ? codexBinaryPathWsl : '',
        newScriptWin: existsWin(codexNewScriptWin) ? codexNewScriptWin : '',
        resumeScriptWin: existsWin(codexResumeScriptWin) ? codexResumeScriptWin : '',
        subAgentNewScriptWin: '',
        subAgentResumeScriptWin: '',
      },
      cursor: {
        enabled: cursorEnabled,
        status: providerStatus(cursorEnabled),
        projectsDir: cursorProjectsDir,
        binaryPathWsl: cursorBinaryPathWsl,
      },
      geminiCli: {
        enabled: geminiCliEnabled,
        status: providerStatus(geminiCliEnabled),
        newScriptWin: geminiNewScriptWin,
        resumeScriptWin: geminiResumeScriptWin,
      },
      geminiApi: {
        enabled: false,
        status: 'disabled',
        keyEnvNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
      },
    },
  };
}

function runPythonSqlite(python, payload) {
  const script = String.raw`
import json, os, sqlite3, sys

payload = json.loads(sys.argv[1])
tables = payload["tables"]

def table_counts(conn):
    result = {}
    for table in tables:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
            (table,),
        ).fetchone() is not None
        result[table] = {
            "exists": exists,
            "count": conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] if exists else None,
        }
    return result

def integrity(conn):
    return conn.execute("PRAGMA integrity_check").fetchone()[0]

source = payload["sourceDb"]
target = payload["targetDb"]
tmp = payload.get("targetTmp")
mode = payload["mode"]

source_conn = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
source_result = {"integrity": integrity(source_conn), "counts": table_counts(source_conn)}

target_result = None
if mode == "backup":
    if os.path.exists(tmp):
        os.remove(tmp)
    target_conn = sqlite3.connect(tmp)
    source_conn.backup(target_conn)
    target_conn.close()
    verify_conn = sqlite3.connect(tmp)
    target_result = {"integrity": integrity(verify_conn), "counts": table_counts(verify_conn)}
    verify_conn.close()
elif mode == "verify":
    target_conn = sqlite3.connect(f"file:{target}?mode=ro", uri=True)
    target_result = {"integrity": integrity(target_conn), "counts": table_counts(target_conn)}
    target_conn.close()
else:
    raise ValueError(f"Unknown mode: {mode}")

source_conn.close()
print(json.dumps({"source": source_result, "target": target_result}, sort_keys=True))
`;

  const result = run(python.command, [...python.args, '-c', script, JSON.stringify(payload)], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });
  return JSON.parse(result.stdout);
}

function backupIfExists(file, backupDir, actions) {
  if (!fs.existsSync(file)) return null;
  ensureDir(backupDir);
  const backupPath = path.join(backupDir, path.basename(file));
  fs.copyFileSync(file, backupPath);
  actions.push({ action: 'backup', from: file, to: backupPath });
  return backupPath;
}

function compareCounts(sourceCounts, targetCounts) {
  const mismatches = [];
  for (const table of TABLES) {
    const source = sourceCounts[table] || {};
    const target = targetCounts[table] || {};
    if (source.exists !== target.exists || source.count !== target.count) {
      mismatches.push({ table, source, target });
    }
  }
  return mismatches;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = normalizeWinPath(args.source);
  const targetDir = normalizeWinPath(args.target);
  const sourceRoot = path.win32.dirname(sourceDir);
  const targetRoot = path.win32.dirname(targetDir);
  const sourceDb = path.win32.join(sourceDir, 'zedui.db');
  const sourceSettingsFile = path.win32.join(sourceDir, 'settings.json');
  const targetDb = path.win32.join(targetDir, 'zedui.db');
  const targetSettingsFile = path.win32.join(targetDir, 'settings.json');
  const logsDir = path.win32.join(targetDir, 'logs');
  const backupDir = path.win32.join(targetDir, 'backups', `migration-${timestamp()}`);
  const manifestPath = path.win32.join(logsDir, `migration-${timestamp()}.json`);
  const actions = [];

  if (samePath(sourceDir, targetDir)) {
    fail('Source and target data directories resolve to the same path.');
  }
  if (!fs.existsSync(sourceDb)) {
    fail(`Source DB is missing: ${sourceDb}`);
  }
  if (!fs.existsSync(sourceSettingsFile)) {
    fail(`Source settings are missing: ${sourceSettingsFile}`);
  }

  const processes = classifyProcesses(sourceRoot, targetRoot);
  if (processes.source.length > 0 && !args.allowLiveSource) {
    fail(`Original app appears to be running from ${sourceRoot}. Close it first or rerun with --allow-live-source.\n${JSON.stringify(processes.source, null, 2)}`);
  }
  if (processes.target.length > 0 && !args.verifyOnly) {
    fail(`Portable app appears to be running from ${targetRoot}. Close it before migrating.\n${JSON.stringify(processes.target, null, 2)}`);
  }

  const python = findPython();
  const sourceSettings = readJson(sourceSettingsFile);
  const targetSettings = readJson(targetSettingsFile);
  const portableConfig = buildPortableConfig(sourceSettings, targetRoot, targetDir);
  const mergedSettings = {
    ...targetSettings,
    ...sourceSettings,
    claudeBinaryPath: sourceSettings.claudeBinaryPath || portableConfig.providers.claude.binaryPathWsl,
    mcpConfigPath: sourceSettings.mcpConfigPath || portableConfig.providers.claude.mcpConfigPathWsl,
    portableConfig,
  };

  const before = {
    source: {
      settings: fileInfo(sourceSettingsFile),
      db: fileInfo(sourceDb),
    },
    target: {
      settings: fileInfo(targetSettingsFile),
      db: fileInfo(targetDb),
      nativeRebuild: fileInfo(path.win32.join(targetDir, 'native-rebuild.json')),
    },
  };

  const mode = args.verifyOnly ? 'verify' : 'backup';
  const tmpDb = `${targetDb}.tmp-${process.pid}`;
  let sqliteResult = null;

  if (args.dryRun) {
    actions.push({ action: 'dry-run', detail: 'No files will be written.' });
  } else {
    ensureDir(targetDir);
    ensureDir(logsDir);
  }

  if (args.verifyOnly) {
    if (!fs.existsSync(targetDb)) fail(`Target DB is missing: ${targetDb}`);
    sqliteResult = runPythonSqlite(python, { mode, sourceDb, targetDb, tables: TABLES });
  } else if (args.dryRun) {
    sqliteResult = runPythonSqlite(python, { mode: 'verify', sourceDb, targetDb: sourceDb, tables: TABLES });
    actions.push({ action: 'would-backup-db', from: sourceDb, to: targetDb });
    actions.push({ action: 'would-write-settings', to: targetSettingsFile });
  } else {
    if (fs.existsSync(targetDb) && !args.force) {
      fail(`Target DB already exists: ${targetDb}. Rerun with --force to replace it after backup.`);
    }

    for (const file of [
      targetSettingsFile,
      targetDb,
      `${targetDb}-shm`,
      `${targetDb}-wal`,
    ]) {
      backupIfExists(file, backupDir, actions);
    }

    sqliteResult = runPythonSqlite(python, { mode, sourceDb, targetDb, targetTmp: tmpDb, tables: TABLES });
    if (sqliteResult.target.integrity !== 'ok') {
      fail(`Target DB integrity check failed before replace: ${sqliteResult.target.integrity}`);
    }
    fs.renameSync(tmpDb, targetDb);
    actions.push({ action: 'sqlite-backup', from: sourceDb, to: targetDb });

    for (const stale of [`${targetDb}-shm`, `${targetDb}-wal`]) {
      if (fs.existsSync(stale)) {
        fs.unlinkSync(stale);
        actions.push({ action: 'remove-stale-target-sidecar', path: stale });
      }
    }

    writeJson(targetSettingsFile, mergedSettings);
    actions.push({ action: 'write-settings', to: targetSettingsFile });
  }

  const mismatches = compareCounts(sqliteResult.source.counts, sqliteResult.target.counts);
  if (mismatches.length > 0) {
    fail(`Source/target DB table counts differ:\n${JSON.stringify(mismatches, null, 2)}`);
  }

  const after = {
    source: {
      settings: fileInfo(sourceSettingsFile),
      db: fileInfo(sourceDb),
    },
    target: {
      settings: fileInfo(targetSettingsFile),
      db: fileInfo(targetDb),
      nativeRebuild: fileInfo(path.win32.join(targetDir, 'native-rebuild.json')),
    },
  };

  const manifest = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    verifyOnly: args.verifyOnly,
    sourceDir,
    targetDir,
    sourceRoot,
    targetRoot,
    python: python.command,
    processes,
    before,
    after,
    sqlite: sqliteResult,
    portableConfigSummary: {
      appRoot: portableConfig.appRoot,
      dataRoot: portableConfig.dataRoot,
      defaultWorkspaceWin: portableConfig.defaultWorkspaceWin,
      wsl: portableConfig.wsl,
      providers: Object.fromEntries(Object.entries(portableConfig.providers).map(([key, value]) => [key, {
        enabled: value.enabled,
        status: value.status,
      }])),
    },
    actions,
  };

  if (!args.dryRun) {
    writeJson(manifestPath, manifest);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    verifyOnly: args.verifyOnly,
    manifest: args.dryRun ? null : manifestPath,
    sourceCounts: sqliteResult.source.counts,
    targetCounts: sqliteResult.target.counts,
    targetIntegrity: sqliteResult.target.integrity,
    providerSummary: manifest.portableConfigSummary.providers,
    actions,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
}
