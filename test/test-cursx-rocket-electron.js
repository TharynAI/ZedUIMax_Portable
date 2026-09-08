/* START> Tharyn | CursX
    2026-09-08
    What: Run the built rocket renderer, preload and main IPC in a hidden Electron fixture.
    Why: Verify clicks reach the registered CursX commands without live DB writes or agent launches.
    Expected: New/Resume dispatch correct arguments and launch failures remain visible.
    Run: node_modules\electron\dist\electron.exe test\test-cursx-rocket-electron.js --no-sandbox
*/
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-cursx-rocket-'));
const root = path.resolve(__dirname, '..');
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));
const calls = [];
let failLaunch = false;
childProcess.execFile = (exe, args, options, callback) => {
  assert.equal(exe, 'wt.exe', 'CursX must have an interactive Windows Terminal');
  calls.push({ exe, args, options });
  callback(failLaunch ? new Error('Fixture: CursX unavailable') : null, '', '');
};
// The toolbar also enumerates displays on mount. Do not run that system query in this fixture.
childProcess.exec = (command, callback) => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  callback(null, '[]', '');
};
childProcess.exec[require('node:util').promisify.custom] = async command => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  return { stdout: '[]', stderr: '' };
};
let win;
const timeout = setTimeout(() => { console.error('FAIL: fixture timed out'); app.exit(1); }, 45000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(code) { return win.webContents.executeJavaScript(code); }
async function waitFor(code) {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(code)) return;
    await pause(100);
  }
  throw new Error(`UI did not reach expected state: ${code}`);
}
async function choose(mode) {
  await evaluate(`document.querySelector('button[title="Launch Assistant"]').click()`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'CursX')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'CursX').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === '${mode}')`);
  const bounds = await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '${mode}');
    const r = button.getBoundingClientRect();
    return { left: r.left, right: r.right, viewport: innerWidth };
  })()`);
  assert(bounds.left >= 0 && bounds.right <= bounds.viewport,
    `Rocket action must stay inside the window: ${JSON.stringify(bounds)}`);
  console.log(`Rocket ${mode} bounds: ${JSON.stringify(bounds)}`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '${mode}').click()`);
  await waitFor(`!Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'CursX')`);
}
app.whenReady().then(async () => {
  const runtime = require('../dist/main/main/runtime-paths.js');
  runtime.initializeRuntimePaths({ appPath: root });
  const portable = require('../dist/main/main/portable-config.js');
  const config = portable.createDefaultPortableConfig();
  config.defaultWorkspaceWin = 'G:\\Workspace with spaces';
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config, zoomLevel: 1.3 }));
  require('../dist/main/main/metadata-db.js').initDb();
  const sessions = require('../dist/main/main/session-store.js');
  const getDetails = sessions.getSessionDetails;
  const resumeId = '11111111-2222-4333-8444-555555555555';
  sessions.getSessionDetails = id => id === `codex:${resumeId}`
    ? { id, cwd: config.defaultWorkspaceWin, projectDisplay: config.defaultWorkspaceWin }
    : getDetails(id);
  const getProduct = sessions.getCodexProductForRawId;
  sessions.getCodexProductForRawId = id => id === resumeId ? 'cursx' : getProduct(id);
  require('../dist/main/main/ipc-handlers.js').setupIpcHandlers();
  const products = require('../dist/main/main/agent-products.js');
  const product = products.productById('cursx');
  assert(product?.launch && product?.resume, 'Installed registry must contain both CursX commands');
  for (const cmd of [product.launch, product.resume]) {
    assert(fs.existsSync(cmd.args[cmd.args.indexOf('-File') + 1]), 'Registered launcher script exists');
  }
  win = new BrowserWindow({ show: false, width: 1400, height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false,
      preload: path.join(root, 'dist/main/main/preload.js') } });
  await win.loadFile(path.join(root, 'dist/renderer/index.html'));
  await waitFor(`!!document.querySelector('button[title="Launch Assistant"]')`);
  // Reproduce the observed live layout: rocket sits ~26px from the right window edge.
  // The empty fixture otherwise lacks the user's toolbar content and leaves extra room.
  await evaluate(`Object.assign(document.querySelector('button[title="Launch Assistant"]').parentElement.style,
    { position: 'fixed', right: '26px', top: '45px' })`);
  await evaluate(`(() => {
    const el = document.querySelector('button[title="Launch Assistant"]').parentElement;
    const r = el.getBoundingClientRect();
    el.style.transform = 'translateX(' + ((innerWidth - 26 - r.right) / (r.width / el.offsetWidth)) + 'px)';
  })()`);
  for (const [mode, command] of [['New', product.launch], ['Resume', product.resume]]) {
    await choose(mode);
    const call = calls.at(-1);
    const filled = products.fillCommand(command, { cwd: config.defaultWorkspaceWin });
    assert.deepEqual({ exe: call.exe, args: call.args }, {
      exe: 'wt.exe', args: [filled.exe, ...filled.args.filter(arg => arg !== '')],
    });
    assert.equal(call.options.windowsHide, false);
    console.log(`PASS: rocket CursX ${mode} -> compiled preload -> main IPC -> registered script`);
  }
  await evaluate(`window.electronAPI.continueSession('codex:${resumeId}')`);
  const resumed = calls.at(-1);
  const expectedResume = products.fillCommand(product.resume, { cwd: config.defaultWorkspaceWin, sessionId: resumeId });
  assert.deepEqual({ exe: resumed.exe, args: resumed.args }, {
    exe: 'wt.exe', args: [expectedResume.exe, ...expectedResume.args],
  });
  console.log('PASS: saved CursX session Resume IPC -> Windows Terminal with exact native UUID');
  failLaunch = true;
  await choose('New');
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Fixture: CursX unavailable')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Dismiss').click()`);
  await waitFor(`!document.querySelector('[role="alert"]')`);
  console.log('PASS: persistent visible error and dismissal; no real subprocess or live database used');
  clearTimeout(timeout);
  win.destroy();
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
// Fixture data remains in the printed OS temp directory for diagnosis; no recursive deletion.
// <END Tharyn | CursX
