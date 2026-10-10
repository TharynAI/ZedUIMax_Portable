// Run with the packaged executable and ELECTRON_RUN_AS_NODE=1. No GUI or CLI launches.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'release', 'win-unpacked');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-clausor-package-'));
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDUI_APP_ROOT = packageRoot;
const modules = path.join(packageRoot, 'resources', 'app.asar', 'dist', 'main', 'main');
console.log(JSON.stringify({ pid: process.pid, fixture, packageRoot, electron: process.versions.electron, hidden: true }));
require(path.join(modules, 'runtime-paths.js')).initializeRuntimePaths({ appPath: packageRoot });
const config = JSON.parse(fs.readFileSync(path.join(root, 'data', 'settings.json'), 'utf8')).portableConfig;
assert(config, 'Configured local provider setup required for live read-only smoke test');
fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));
const sharedFile = process.env.ZEDBANG_PATHS || path.resolve(root, '..', '..', '..', 'Projects', '.config', 'zedbang-paths.json');
const shared = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));
shared.zeduiDb = path.join(fixture, 'zedui.db');
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify(shared));
const db = require(path.join(modules, 'metadata-db.js'));
db.initDb();
const sessions = require(path.join(modules, 'session-store.js'));
const launcher = require(path.join(modules, 'launcher.js'));
const products = require(path.join(modules, 'agent-products.js'));
const clausor = products.productById('clausor');
assert.equal(clausor?.keyProvider, 'claude');
const counts = {};
for (const filter of ['claude', 'codex', 'cursx', 'clausor']) {
  const records = sessions.getSessions([filter], 30, 100);
  counts[filter] = records.length;
  if (filter === 'clausor') {
    assert(records.length > 0, 'Real Clausor transcripts must be discovered');
    if (process.argv[2]) {
      assert(records.some(record => record.rawSessionId === process.argv[2]), 'Requested live Clausor UUID must be listed');
    }
    for (const record of records) {
      assert.equal(record.product, 'clausor');
      assert.equal(record.productLabel, clausor.label);
      assert(record.sessionId.startsWith('claude:'));
      const details = sessions.getSessionDetails(record.sessionId);
      assert.equal(details.product, 'clausor');
      assert.equal(details.productLabel, clausor.label);
      assert.equal(path.resolve(details.filePath), path.resolve(record.filePath));
      assert(launcher.getResumeCommand(record.sessionId).includes('clausor.ps1'));
    }
    const id = records[0].sessionId;
    db.setAnnotation(id, { userSummary: 'Private packaged smoke annotation', notes: 'No live DB write', type: 'Package fixture' });
    assert.equal(db.getAnnotation(id).userSummary, 'Private packaged smoke annotation');
  }
}
console.log(JSON.stringify({ result: 'PASS', counts, db: path.join(fixture, 'zedui.db'), nativeAbi: process.versions.modules }));
