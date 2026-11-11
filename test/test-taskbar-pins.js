const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceFile = process.argv[2] || path.join(__dirname, '../src/main/index.ts');
const marker = process.argv[3] || 'ZedUIMax Pinning';
const expectedId = process.argv[4] || 'com.zedbang.zeduimax';
const source = fs.readFileSync(sourceFile, 'utf8');
const start = source.indexOf(`/* START> Tharyn | ${marker}`);
const end = source.indexOf(`// <END Tharyn | ${marker}`, start);
assert(start >= 0 && end > start, 'Pin metadata block must exist');
const block = source.slice(start, end);

function run({ packaged = false, platform = 'win32', copyFails = false, iconMissing = false, launcherMissing = false, portable = '' } = {}) {
  const calls = [];
  const copied = [];
  const appRoot = 'D:\\Apps with spaces\\My app';
  const icon = packaged ? 'C:\\Temp\\extract\\resources\\icon.ico' : path.win32.join(appRoot, 'build', 'icon.ico');
  const userData = 'D:\\Profiles with spaces\\my app';
  const window = { setAppDetails: details => calls.push(details) };
  vm.runInNewContext(block, {
    app: { isPackaged: packaged, getAppPath: () => appRoot, getPath: () => userData },
    APP_ICON: icon, appIconExists: file => file === icon ? !iconMissing : !launcherMissing,
    path: path.win32, join: path.win32.join, mainWindow: window, window,
    process: { platform, execPath: packaged ? 'C:\\Temp\\extract\\App.exe' : 'D:\\Electron\\electron.exe', env: { SystemRoot: 'C:\\Windows', PORTABLE_EXECUTABLE_FILE: portable } },
    mkdirSync: () => {}, copyFileSync: (from, to) => { if (copyFails) throw new Error('read-only'); copied.push([from, to]); },
    console: { warn: () => {} }
  });
  return { calls, copied, icon, durable: path.win32.join(userData, 'branding', 'icon.ico') };
}

let result = run();
assert.equal(result.calls[0].appId, expectedId);
assert.equal(result.calls[0].appIconPath, result.durable);
assert.equal(result.calls[0].appIconIndex, 0);
assert.match(result.calls[0].relaunchCommand, /wscript\.exe".*"D:\\Apps with spaces\\My app\\/);
assert(result.calls[0].relaunchDisplayName);
assert.equal(result.copied[0][0], result.icon);
assert.equal(result.copied[0][1], result.durable);

result = run({ packaged: true, portable: 'D:\\Portable apps\\App.exe' });
assert.equal(result.calls[0].relaunchCommand, '"D:\\Portable apps\\App.exe"');
assert.equal(result.calls[0].appIconPath, result.durable);
result = run({ packaged: true });
assert.equal(result.calls[0].relaunchCommand, '"C:\\Temp\\extract\\App.exe"');
result = run({ copyFails: true });
assert.equal(result.calls[0].appIconPath, result.icon);
result = run({ launcherMissing: true });
assert.equal(result.calls[0].relaunchCommand, '"D:\\Electron\\electron.exe" "D:\\Apps with spaces\\My app"');
assert.equal(run({ platform: 'linux' }).calls.length, 0);
assert.equal(run({ iconMissing: true }).calls.length, 0);
console.log(`PASS: 7 pin metadata cases (${marker})`);
