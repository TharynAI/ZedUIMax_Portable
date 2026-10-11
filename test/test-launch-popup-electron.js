/* START> Tharyn | ZedMax
    2026-10-10
    What: Exercise all-provider launch notices in the compiled renderer and preload.
    Why: Successful launches must not leave a popup requiring manual dismissal.
    Expected: New/Resume and background classification are quiet; approvals and errors remain.
*/
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const appRoot = packaged ? path.join(root, 'release', 'win-unpacked') : root;
const contentRoot = packaged ? path.join(appRoot, 'resources', 'app.asar') : root;
const modules = path.join(contentRoot, 'dist', 'main', 'main');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-launch-popup-'));
process.env.ZEDUI_APP_ROOT = appRoot;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({ zeduiDb: path.join(fixture, 'zedui.db') }));
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true, packaged, electron: process.versions.electron }));
childProcess.exec = (command, callback) => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  callback(null, '[]', '');
};
childProcess.exec[require('node:util').promisify.custom] = async command => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  return { stdout: '[]', stderr: '' };
};
childProcess.execFile = () => { throw new Error('This UI fixture must not launch a real CLI'); };
const providers = [
  ['claude2', 'Claude2', 'applied'], ['codex2', 'Codex2', 'pending'],
  ['cursx', 'CursX', 'pending'], ['clausor', 'Clausor', 'applied'],
];
const calls = [];
let failLaunch = false;
let history = providers.map(([id, label, state]) => notice(id, label, state));
let win;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = code => win.webContents.executeJavaScript(code);
const timeout = setTimeout(() => { console.error('FAIL: launch-popup fixture timed out'); app.exit(1); }, 45000);
async function waitFor(code) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(code)) return;
    await pause(50);
  }
  throw new Error('UI did not reach expected state: ' + code);
}
function notice(id, label, state) {
  return { id: 'launch:' + id, launcherId: id, launcherLabel: label, state,
    userSummary: 'Popup fixture', type: 'Fixture', message: 'Fixture ' + state,
    createdAt: new Date().toISOString() };
}
async function choose(label, mode) {
  await evaluate(`document.querySelector('button[title="Launch Assistant"]').click()`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(label)})`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(mode)})`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(mode)}).click()`);
}
async function submit() {
  await waitFor(`!!document.querySelector('form[role="dialog"]')`);
  assert.equal(await evaluate(`document.querySelector('form[role="dialog"] button[type="submit"]').disabled`), true);
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    document.querySelectorAll('form[role="dialog"] input').forEach((input, i) => {
      setter.call(input, i ? 'Fixture' : 'Popup fixture');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  })()`);
  await waitFor(`!document.querySelector('form[role="dialog"] button[type="submit"]').disabled`);
  await evaluate(`document.querySelector('form[role="dialog"] button[type="submit"]').click()`);
}
async function assertQuiet(message) {
  await pause(100);
  assert.equal(await evaluate(`!!document.querySelector('[aria-modal="true"], .launch-classification-notice')`), false, message);
}
app.whenReady().then(async () => {
  require(path.join(modules, 'runtime-paths.js')).initializeRuntimePaths({ appPath: appRoot });
  const config = require(path.join(modules, 'portable-config.js')).createDefaultPortableConfig();
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));
  require(path.join(modules, 'metadata-db.js')).initDb();
  require(path.join(modules, 'ipc-handlers.js')).setupIpcHandlers();
  ipcMain.removeHandler('assistant:launch');
  ipcMain.removeHandler('assistant:classification:list');
  ipcMain.removeHandler('assistant:classification:dismiss');
  ipcMain.handle('assistant:classification:list', () => history);
  ipcMain.handle('assistant:classification:dismiss', () => true);
  ipcMain.handle('assistant:launch', (_, id, mode, workspace, classification) => {
    calls.push({ id, mode, classification });
    if (failLaunch) return { success: false, error: 'Fixture launch error' };
    const [, label, state] = providers.find(p => p[0] === id);
    return { success: true, classification: mode === 'new' ? notice(id, label, state) : undefined };
  });
  win = new BrowserWindow({ show: false, width: 1400, height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false,
      preload: path.join(modules, 'preload.js') } });
  await win.loadFile(path.join(contentRoot, 'dist/renderer/index.html'));
  await waitFor(`!!document.querySelector('button[title="Launch Assistant"]')`);
  await assertQuiet('Persisted success/pending notices must not replay on startup');
  console.log('PASS: startup ignores historical success/pending notices');
  for (const [id, label] of providers) {
    const before = calls.length;
    await choose(label, 'New');
    await waitFor(`!!document.querySelector('form[role="dialog"]')`);
    assert.equal(calls.length, before, 'Prelaunch approval must not launch automatically');
    await submit();
    await waitFor(`!document.querySelector('form[role="dialog"]')`);
    assert.deepEqual(calls.at(-1), { id, mode: 'new', classification: { userSummary: 'Popup fixture', type: 'Fixture' } });
    await assertQuiet(label + ' successful New must leave no popup');
    win.webContents.send('assistant:classification', notice(id, label, 'pending'));
    await assertQuiet(label + ' pending broadcast must not show a popup');
    win.webContents.send('assistant:classification', notice(id, label, 'applied'));
    await assertQuiet(label + ' applied broadcast must not show a popup');
    await choose(label, 'Resume');
    await assertQuiet(label + ' successful Resume must leave no popup');
    assert.equal(calls.at(-1).mode, 'resume');
    failLaunch = true;
    await choose(label, 'New');
    await submit();
    await waitFor(`document.querySelector('.launch-classification-error')?.textContent.includes('Fixture launch error')`);
    assert.equal(await evaluate(`!!document.querySelector('form[role="dialog"]')`), true, 'Launch error must preserve editable approval form');
    await evaluate(`document.querySelector('.launch-classification-cancel').click()`);
    await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Fixture launch error')`);
    await evaluate(`document.querySelector('[aria-label="Dismiss launch notice"]').click()`);
    await assertQuiet(label + ' launch error remains manually dismissible');
    failLaunch = false;
    win.webContents.send('assistant:classification', notice(id, label, 'failed'));
    await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Fixture failed')`);
    await pause(150);
    assert.equal(await evaluate(`!!document.querySelector('[role="alert"]')`), true, 'Classification failures remain visible');
    win.webContents.send('assistant:classification', notice(id, label, 'applied'));
    await pause(100);
    assert.equal(await evaluate(`!!document.querySelector('[role="alert"]')`), true, 'Unrelated success must not erase a failure');
    await evaluate(`document.querySelector('[aria-label="Dismiss launch notice"]').click()`);
    await assertQuiet(label + ' classification error remains dismissible');
    console.log('PASS: ' + label + ' New/Resume/broadcasts quiet; approvals and errors retained');
  }
  history = [notice('cursx', 'CursX', 'failed'), notice('codex2', 'Codex2', 'pending')];
  await win.webContents.reload();
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Fixture failed')`);
  console.log('PASS: persisted failure remains visible even when the latest history entry is pending');
  clearTimeout(timeout);
  win.destroy();
  console.log(JSON.stringify({ result: 'PASS', providers: providers.length, fixture, packaged }));
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
// <END Tharyn | ZedMax
