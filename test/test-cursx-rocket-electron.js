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
const testedProduct = process.argv.includes('--product=clausor') ? 'clausor' : 'cursx';
const productLabel = testedProduct === 'clausor' ? 'Clausor' : 'CursX';
const keyProvider = testedProduct === 'clausor' ? 'claude' : 'codex';
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
fs.mkdirSync(path.join(fixture, 'tower', 'config'), { recursive: true });
const fixtureScript = path.join(fixture, 'launcher with spaces.ps1');
fs.writeFileSync(fixtureScript, '# fixture launcher; subprocesses are stubbed\n');
fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({
  zedTrafficControlData: path.join(fixture, 'tower', 'data'), zeduiDb: path.join(fixture, 'zedui.db'),
}));
fs.writeFileSync(path.join(fixture, 'tower', 'config', 'agent-products.json'), JSON.stringify({ version: 1, products: [{
  id: testedProduct, label: productLabel, keyProvider, harness: testedProduct === 'clausor' ? 'claude-code' : 'codex',
  inferenceRoute: 'cursor', home: path.join(fixture, 'home'), sessionsDir: path.join(fixture, 'home', testedProduct === 'clausor' ? 'projects' : 'sessions'),
  launch: { exe: 'powershell.exe', args: ['-File', fixtureScript, 'new', '--cwd', '{cwd}'] },
  resume: { exe: 'powershell.exe', args: testedProduct === 'clausor'
    ? ['-File', fixtureScript, 'resume', '--cwd', '{cwd}', '--session', '{sessionId}']
    : ['-File', fixtureScript, 'resume', '{cwd}', '{sessionId}'] },
}] }));
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));
const calls = [];
let failLaunch = false;
childProcess.execFile = (exe, args, options, callback) => {
  assert.equal(exe, 'wt.exe', `${productLabel} must have an interactive Windows Terminal`);
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
  const buttons = `document.querySelector('button[title="Launch Assistant"]').parentElement.querySelectorAll('button')`;
  await evaluate(`document.querySelector('button[title="Launch Assistant"]').click()`);
  await waitFor(`Array.from(${buttons}).some(b => b.textContent === '${productLabel}')`);
  await evaluate(`Array.from(${buttons}).find(b => b.textContent === '${productLabel}').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  await waitFor(`Array.from(${buttons}).some(b => b.textContent === '${mode}')`);
  const bounds = await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '${mode}');
    const r = button.getBoundingClientRect();
    return { left: r.left, right: r.right, viewport: innerWidth };
  })()`);
  assert(bounds.left >= 0 && bounds.right <= bounds.viewport,
    `Rocket action must stay inside the window: ${JSON.stringify(bounds)}`);
  console.log(`Rocket ${mode} bounds: ${JSON.stringify(bounds)}`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '${mode}').click()`);
  await waitFor(`!Array.from(${buttons}).some(b => b.textContent === '${productLabel}')`);
}
async function classify() {
  await waitFor(`!!document.querySelector('form[role="dialog"]')`);
  const callsBefore = calls.length;
  assert.equal(await evaluate(`document.querySelector('form[role="dialog"] button[type="submit"]').disabled`), true);
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('form[role="dialog"] input');
    ['Rocket fixture summary', 'Fixture category'].forEach((value, i) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[i], value);
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
    });
  })()`);
  await waitFor(`!document.querySelector('form[role="dialog"] button[type="submit"]').disabled`);
  assert.equal(calls.length, callsBefore, 'Classification inputs must not launch anything');
  await evaluate(`document.querySelector('form[role="dialog"] button[type="submit"]').click()`);
  await waitFor(failLaunch
    ? `document.querySelector('.launch-classification-error')?.textContent.includes('Fixture: CursX unavailable')`
    : `!document.querySelector('form[role="dialog"]')`);
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
  sessions.getSessionDetails = id => id === `${keyProvider}:${resumeId}`
    ? { sessionId: id, providerId: keyProvider, product: testedProduct, cwd: config.defaultWorkspaceWin, projectDisplay: config.defaultWorkspaceWin }
    : getDetails(id);
  const getProduct = sessions.getCodexProductForRawId;
  sessions.getCodexProductForRawId = id => id === resumeId ? 'cursx' : getProduct(id);
  require('../dist/main/main/ipc-handlers.js').setupIpcHandlers();
  const products = require('../dist/main/main/agent-products.js');
  const product = products.productById(testedProduct);
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
    if (mode === 'new' || mode === 'New') await classify();
    assert.equal(await evaluate(`!!document.querySelector('.launch-classification-notice')`), false,
      'Successful New/Resume must not leave a notice requiring dismissal');
    const call = calls.at(-1);
    const nativeId = mode === 'New' && testedProduct === 'clausor' ? call.args.at(-1) : undefined;
    const filled = products.fillCommand(command, { cwd: config.defaultWorkspaceWin });
    const expectedArgs = filled.args.filter(arg => arg !== '');
    if (mode === 'Resume' && testedProduct === 'clausor') expectedArgs.splice(expectedArgs.indexOf('--session'), 1);
    if (nativeId) {
      assert.match(nativeId, /^[0-9a-f-]{36}$/);
      expectedArgs.push('--', '--session-id', nativeId);
      const annotation = require('../dist/main/main/metadata-db.js').getAnnotation(`claude:${nativeId}`);
      assert.equal(annotation.userSummary, 'Rocket fixture summary');
      assert.equal(annotation.type, 'Fixture category');
    }
    assert.deepEqual({ exe: call.exe, args: call.args }, {
      exe: 'wt.exe', args: [filled.exe, ...expectedArgs],
    });
    assert.equal(call.options.windowsHide, false);
    console.log(`PASS: rocket ${productLabel} ${mode} -> compiled preload -> main IPC -> registered script`);
  }
  await evaluate(`window.electronAPI.continueSession('${keyProvider}:${resumeId}')`);
  const resumed = calls.at(-1);
  const expectedResume = products.fillCommand(product.resume, { cwd: config.defaultWorkspaceWin, sessionId: resumeId });
  assert.deepEqual({ exe: resumed.exe, args: resumed.args }, {
    exe: 'wt.exe', args: [expectedResume.exe, ...expectedResume.args],
  });
  console.log(`PASS: saved ${productLabel} session Resume IPC -> Windows Terminal with exact native UUID`);
  failLaunch = true;
  await choose('New');
  await classify();
  assert.equal(await evaluate(`!!document.querySelector('form[role="dialog"]')`), true, 'Failed launch keeps the classification draft');
  await evaluate(`Array.from(document.querySelector('form[role="dialog"]').querySelectorAll('button')).find(b => b.textContent === 'Cancel').click()`);
  await waitFor(`!!document.querySelector('[role="alert"]')`);
  await evaluate(`document.querySelector('button[aria-label="Dismiss launch notice"]').click()`);
  if (testedProduct === 'cursx') {
    await waitFor(`document.querySelector('[role="alert"] strong')?.textContent === '${productLabel}'`);
    assert.match(await evaluate(`document.querySelector('[role="alert"] p').textContent`), /launch failed/,
      'Only the genuine pending-classification failure should remain');
    await evaluate(`document.querySelector('button[aria-label="Dismiss launch notice"]').click()`);
  }
  await waitFor(`!document.querySelector('[role="alert"]')`);
  console.log('PASS: persistent visible error and dismissal; no real subprocess or live database used');
  clearTimeout(timeout);
  win.destroy();
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
// Fixture data remains in the printed OS temp directory for diagnosis; no recursive deletion.
// <END Tharyn | CursX
