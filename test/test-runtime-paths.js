const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const compiledModulePath = path.join(__dirname, '..', 'dist', 'main', 'main', 'runtime-paths.js');

if (!fs.existsSync(compiledModulePath)) {
  throw new Error('runtime-paths test requires a compiled main process. Run npm run build:electron first.');
}

const { resolveRuntimePaths } = require(compiledModulePath);

function makeRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"zedui-runtime-path-test"}\n', 'utf-8');
  fs.mkdirSync(path.join(root, 'dist', 'main', 'main'), { recursive: true });
  fs.mkdirSync(path.join(root, 'resources', 'proeng', 'config', 'starter-prompts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'resources', 'proeng', 'scripts'), { recursive: true });
  return root;
}

const sourceRoot = makeRoot('zedui-runtime-source-');
const sourceDistDir = path.join(sourceRoot, 'dist', 'main', 'main');
const sourcePaths = resolveRuntimePaths({
  appPath: sourceRoot,
  cwd: sourceRoot,
  dirname: sourceDistDir,
  isPackaged: false,
  env: {},
});

assert.strictEqual(sourcePaths.appRoot, sourceRoot);
assert.strictEqual(sourcePaths.dataDir, path.join(sourceRoot, 'data'));
assert.strictEqual(sourcePaths.settingsFile, path.join(sourceRoot, 'data', 'settings.json'));
assert.strictEqual(sourcePaths.dbPath, path.join(sourceRoot, 'data', 'zedui.db'));
assert.strictEqual(sourcePaths.userDataDir, path.join(sourceRoot, 'data', 'userData'));
assert.strictEqual(sourcePaths.logsDir, path.join(sourceRoot, 'data', 'logs'));
assert.strictEqual(sourcePaths.proEngSessionsDir, path.join(sourceRoot, 'data', 'proeng', 'sessions'));
assert.strictEqual(sourcePaths.proEngTemplatesDir, path.join(sourceRoot, 'data', 'proeng', 'templates'));
assert.strictEqual(sourcePaths.proEngBridgeFile, path.join(sourceRoot, 'resources', 'proeng', 'scripts', 'proeng_llm.py'));

const outsideDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-runtime-outside-data-'));
assert.throws(
  () => resolveRuntimePaths({
    appPath: sourceRoot,
    cwd: sourceRoot,
    dirname: sourceDistDir,
    isPackaged: false,
    env: { ZEDUI_DATA_ROOT: outsideDataRoot },
  }),
  /outside the app root/
);

const allowedExternalPaths = resolveRuntimePaths({
  appPath: sourceRoot,
  cwd: sourceRoot,
  dirname: sourceDistDir,
  isPackaged: false,
  env: {
    ZEDUI_DATA_ROOT: outsideDataRoot,
    ZEDUI_ALLOW_EXTERNAL_DATA_ROOT: '1',
  },
});
assert.strictEqual(allowedExternalPaths.dataDir, outsideDataRoot);

const packagedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-runtime-packaged-'));
const packagedPaths = resolveRuntimePaths({
  cwd: sourceRoot,
  execPath: path.join(packagedRoot, 'ZedUIMax.exe'),
  isPackaged: true,
  env: {},
});
assert.strictEqual(packagedPaths.appRoot, packagedRoot);
assert.strictEqual(packagedPaths.dataDir, path.join(packagedRoot, 'data'));

console.log('runtime path tests passed');
