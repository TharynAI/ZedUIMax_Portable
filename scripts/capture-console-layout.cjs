// START> Tharyn | ZedUIMax
// 2026-11-04: Bounded read-only capture CLI; never launches a Terminal or resumes/moves a session.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
if (process.platform !== 'win32') throw new Error('Run this observer with Windows Node');
if (process.argv.length > 2) throw new Error('This read-only prototype accepts no restore/launch arguments');
const root = path.resolve(__dirname, '..');
const build = process.env.ZEDUI_CONSOLE_BUILD || path.join(root, 'dist', 'main', 'main');
const { initializeRuntimePaths } = require(path.join(build, 'runtime-paths'));
const { loadPortableConfigFromSettingsFile } = require(path.join(build, 'portable-config'));
const { sharedPath } = require(path.join(build, 'shared-paths'));
const { buildClaudeLaunch, buildCodexLaunch } = require(path.join(build, 'launch-config'));
const { captureConsoleLayout } = require(path.join(build, 'console-layout'));
const { storeConsoleObservation } = require(path.join(build, 'console-layout-store'));
const paths = initializeRuntimePaths({ appPath: root, cwd: root });
const config = loadPortableConfigFromSettingsFile();
const distro = config.wsl.distroName;
if (!config.wsl.enabled || !distro) throw new Error('Configure WSL in Portable Setup before observing native sessions');
const towerDir = sharedPath('zedTrafficControlData', 'zeduimax-console-layout');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const tower = readJson(path.join(towerDir, 'state.json'));
const settings = readJson(path.join(towerDir, 'settings.json'));
const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const options = { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true };
const terminal = JSON.parse(execFileSync(path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'observe-terminal-layout.ps1')], options).replace(/^\uFEFF/, ''));
const script = path.join(__dirname, 'observe-native-sessions.mjs');
if (!/^[A-Za-z]:\\/.test(script)) throw new Error('Observer requires a local drive path for WSL translation');
const wslScript = `/mnt/${script[0].toLowerCase()}/${script.slice(3).replace(/\\/g, '/')}`;
const native = JSON.parse(execFileSync(path.join(system32, 'wsl.exe'),
  ['-d', distro, '-u', 'root', '--', 'node', wslScript], options).replace(/^\uFEFF/, ''));
const snapshot = captureConsoleLayout({ terminal, native, tower, settings, distro, resolveRecipe: session =>
  session.provider === 'claude'
    ? buildClaudeLaunch('resume', session.cwd, session.sessionId, undefined, session.productId)
    : buildCodexLaunch('resume', session.cwd, session.sessionId, 'codex', session.productId) });
const current = readJson(path.join(towerDir, 'state.json'));
const currentSettings = readJson(path.join(towerDir, 'settings.json'));
const map = state => JSON.stringify(state.monitors?.map(p => [p.serial, p.deviceName, p.x, p.y, p.width, p.height, p.reservedForUser]));
if (tower.hubGeneration !== current.hubGeneration || map(tower) !== map(current)
  || settings.reservedPanelSerial !== currentSettings.reservedPanelSerial) snapshot.diagnostics.push('panel-map-changed-during-observation');
const file = storeConsoleObservation(paths.dataDir, snapshot);
const tabs = snapshot.windows.flatMap(w => w.tabs);
console.log(JSON.stringify({ file, preview: 'embedded in observation', windows: snapshot.windows.length,
  tabs: tabs.length, corroborated: tabs.filter(t => t.session).length,
  canonicalRecipes: tabs.filter(t => t.recipe).length, diagnostics: snapshot.diagnostics,
  nativeErrors: native.errors.length, executable: false, effects: 'local-observation-files-only' }));
// <END Tharyn | ZedUIMax
