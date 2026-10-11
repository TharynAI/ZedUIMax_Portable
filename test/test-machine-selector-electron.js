/* START> Tharyn | ZedMax
    2026-10-10
    What: Exercise machine-name sizing and filtering in the compiled/packaged renderer.
    Why: A fixed toolbar width hid machine names even when space was available.
    Expected: Selected names fit, exceptional names are bounded, native selection keeps routing.
*/
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
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
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-machine-selector-'));
process.env.ZEDUI_APP_ROOT = appRoot;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({ zeduiDb: path.join(fixture, 'zedui.db') }));
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true, packaged }));
childProcess.exec = (command, callback) => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  callback(null, '[]', '');
};
childProcess.exec[require('node:util').promisify.custom] = async command => {
  assert(command.includes('getDisplays.ps1'), 'Unexpected shell command');
  return { stdout: '[]', stderr: '' };
};
childProcess.execFile = () => { throw new Error('Machine fixture must not launch a real CLI'); };
const profiles = [
  { machineName: 'THARYN-WORKSTATION-MAIN-DESKTOP-2026', machineId: 'desktop' },
  { machineName: 'LAPTOP-7', machineId: 'laptop' },
  { machineName: 'REMOTE-WORKSTATION-WITH-AN-EXCEPTIONALLY-LONG-NAME-'.repeat(3), machineId: 'remote' },
];
const sessionCalls = [];
const projectCalls = [];
let win;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = code => win.webContents.executeJavaScript(code);
const timeout = setTimeout(() => { console.error('FAIL: machine fixture timed out'); app.exit(1); }, 45000);
async function waitFor(code) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(code)) return;
    await pause(50);
  }
  throw new Error('UI did not reach expected state: ' + code);
}
async function selectProfile(index) {
  await evaluate(`(() => {
    const select = document.querySelector('select[aria-label="Machine"]');
    select.value = ${JSON.stringify('id:' + profiles[index].machineId)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`document.querySelector('.zed-machine-measure')?.textContent === ${JSON.stringify(profiles[index].machineName)}
    && !window.__ZEDUI_STORE__.getState().isLoading`);
}
async function geometry() {
  return evaluate(`(() => {
    const select = document.querySelector('select[aria-label="Machine"]');
    const css = getComputedStyle(select);
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.font = css.font;
    const zoom = window.__ZEDUI_SETTINGS__.getState().settings.zoomLevel;
    const rect = element => { const r = element.getBoundingClientRect();
      return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    const selected = select.selectedOptions[0].textContent.trim();
    return { selected, title:select.title, labelTitle:select.closest('label').title,
      textWidth:canvas.measureText(selected).width,
      available:select.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
      valueWidth:document.querySelector('.zed-machine-value').offsetWidth,
      ellipsis:css.textOverflow, color:css.color, background:getComputedStyle(select.closest('label')).backgroundColor,
      heading:rect(document.querySelector('.zed-view-heading')),
      label:rect(select.closest('label')),
      actions:Array.from(document.querySelector('.zed-header-actions').children)
        .filter(e=>getComputedStyle(e).display!=='none').map(rect),
      viewport:innerWidth, zoom, font:css.font, clientWidth:select.clientWidth,
      boundsWidth:select.getBoundingClientRect().width };
  })()`);
}
function assertLayout(g) {
  assert.equal(g.title, g.selected, 'Select tooltip must expose the full machine name');
  assert.equal(g.labelTitle, g.selected);
  assert.equal(g.ellipsis, 'ellipsis');
  assert(g.valueWidth <= 360.5, 'Exceptional names must have a sensible maximum');
  assert(g.label.x >= g.heading.x - 1 && g.label.right <= g.heading.right + 1, 'Selector must stay inside heading');
  for (const r of g.actions) {
    assert(r.right <= g.heading.right + 1 && r.x >= g.heading.x - 1, 'Header action must stay visible');
  }
  for (let i = 0; i < g.actions.length; i++) for (let j = i + 1; j < g.actions.length; j++) {
    const a = g.actions[i], b = g.actions[j];
    assert(!(a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1), 'Header actions must not overlap');
  }
}
app.whenReady().then(async () => {
  require(path.join(modules, 'runtime-paths.js')).initializeRuntimePaths({ appPath: appRoot });
  const config = require(path.join(modules, 'portable-config.js')).createDefaultPortableConfig();
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config, zoomLevel: 1 }));
  require(path.join(modules, 'metadata-db.js')).initDb();
  require(path.join(modules, 'ipc-handlers.js')).setupIpcHandlers();
  for (const channel of ['machines:list', 'sessions:get', 'sessions:projects']) ipcMain.removeHandler(channel);
  ipcMain.handle('machines:list', () => profiles);
  ipcMain.handle('sessions:get', (_, days, limit, providers, machineKey) => { sessionCalls.push(machineKey); return []; });
  ipcMain.handle('sessions:projects', (_, providers, machineKey) => { projectCalls.push(machineKey); return []; });
  win = new BrowserWindow({ show: false, width: 1700, height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(modules, 'preload.js') } });
  await win.loadFile(path.join(contentRoot, 'dist/renderer/index.html'));
  await waitFor(`!!document.querySelector('.zed-machine-measure') && !window.__ZEDUI_STORE__.getState().isLoading`);
  for (const theme of ['dark', 'light']) {
    nativeTheme.themeSource = theme;
    // The shipped app is dark-only. Light tokens are fixture coverage, not a new app theme.
    await evaluate(`(() => {
      const shell = document.querySelector('.zed-app-shell');
      shell.style.setProperty('--zed-panel-deep', ${JSON.stringify(theme === 'light' ? '#f5f5f5' : '#131411')});
      shell.style.setProperty('--zed-text', ${JSON.stringify(theme === 'light' ? '#202020' : '#f0ede4')});
      shell.style.colorScheme = ${JSON.stringify(theme)};
    })()`);
    await waitFor(`getComputedStyle(document.querySelector('select[aria-label="Machine"]')).color ===
      ${JSON.stringify(theme === 'light' ? 'rgb(32, 32, 32)' : 'rgb(240, 237, 228)')}`);
    for (const width of [1700, 980, 720, 600, 420]) {
      win.setContentSize(width, 850);
      await selectProfile(0);
      await pause(80);
      const g = await geometry();
      assertLayout(g);
      if (width >= 600) assert(g.available >= g.textWidth - 1, 'Full name must fit when room exists: ' + JSON.stringify(g));
      assert.equal(g.color, theme === 'light' ? 'rgb(32, 32, 32)' : 'rgb(240, 237, 228)');
      console.log('PASS: ' + theme + ' width ' + width + ' toolbar/tooltip/full-name constraints');
    }
  }
  win.setContentSize(1700, 850);
  await selectProfile(0);
  const long = await geometry();
  await selectProfile(1);
  const short = await geometry();
  assert(short.valueWidth < long.valueWidth, 'Width follows selected name, not longest unselected option');
  assert(short.available >= short.textWidth - 1);
  await waitFor(`window.__ZEDUI_STORE__.getState().selectedMachineKey === 'id:laptop'`);
  assert.equal(sessionCalls.at(-1), 'id:laptop', 'Machine selection must route session reload');
  assert.equal(projectCalls.at(-1), 'id:laptop', 'Machine selection must route project reload');
  await selectProfile(2);
  const exceptional = await geometry();
  assertLayout(exceptional);
  assert(exceptional.available < exceptional.textWidth, 'Only constrained exceptional names truncate');
  await selectProfile(0);
  await evaluate(`window.__ZEDUI_SETTINGS__.setState(s => ({ settings:{ ...s.settings, zoomLevel:1.5 } }))`);
  await pause(80);
  const zoomed = await geometry();
  assertLayout(zoomed);
  assert(zoomed.available >= zoomed.textWidth - 1, 'Name must remain fitted after zoom: ' + JSON.stringify(zoomed));
  await evaluate(`window.__ZEDUI_STORE__.setState({ machineProfiles:[], selectedMachineKey:null })`);
  await waitFor(`!document.querySelector('select[aria-label="Machine"]')`);
  console.log('PASS: selection changes intrinsic width, routes sessions/projects, caps extreme names, handles zoom/empty profiles');
  clearTimeout(timeout);
  win.destroy();
  console.log(JSON.stringify({ result:'PASS', fixture, packaged }));
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
// <END Tharyn | ZedMax
