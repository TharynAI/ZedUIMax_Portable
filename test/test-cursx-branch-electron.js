/* START> Tharyn | CursX
    2026-09-08
    What: Exercise compiled branching with synthetic rollouts and a private SQLite database.
    Why: Branch must retain the parent's product/home and fail before writes if routing is absent.
    Expected: CursX and normal Codex branches route separately; parent content stays unchanged.
*/
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-cursx-branch-'));
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));
const calls = [];
cp.execFile = (command, args, options, callback) => { calls.push({ command, args }); callback(null, '', ''); };
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]).sort();
}
app.whenReady().then(async () => {
  const runtime = require('../dist/main/main/runtime-paths.js');
  runtime.initializeRuntimePaths({ appPath: root });
  const portable = require('../dist/main/main/portable-config.js');
  const config = portable.createDefaultPortableConfig();
  config.providers.codex.enabled = true;
  config.providers.codex.resumeScriptWin = 'C:\\Fixture\\codex_resume.ps1';
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));
  const db = require('../dist/main/main/metadata-db.js');
  db.initDb();
  const sessions = require('../dist/main/main/session-store.js');
  const products = require('../dist/main/main/agent-products.js');
  let product = { id: 'cursx', label: 'CursX', keyProvider: 'codex',
    resume: { exe: 'powershell.exe', args: ['-File', 'C:\\Fixture\\cursx_resume.ps1', '{cwd}', '{sessionId}'] } };
  products.productById = id => id === 'cursx' ? product : null;
  const parents = new Map();
  sessions.getSessionDetails = id => parents.get(id);
  sessions.getCodexProductForRawId = id => parents.get(`codex:${id}`)?.product || null;
  const { branchSession } = require('../dist/main/main/launcher.js');
  function parent(rawId, productId) {
    const sessionsRoot = path.join(fixture, productId, 'sessions');
    const dir = path.join(sessionsRoot, '2024', '01', '02');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `rollout-2024-01-02T03-04-05-${rawId}.jsonl`);
    const content = JSON.stringify({ type: 'session_meta', payload: { id: rawId, cwd: 'G:\\Work space', model_provider: productId === 'cursx' ? 'cursor_bridge' : 'openai' } }) + '\n' + JSON.stringify({ type: 'response_item', payload: { type: 'message', content: [{ text: 'synthetic fixture' }] } }) + '\n';
    fs.writeFileSync(filePath, content);
    const id = `codex:${rawId}`;
    parents.set(id, { sessionId: id, product: productId, filePath, cwd: 'G:\\Work space', projectPath: 'G:\\Work space', autoSummary: 'Fixture', firstMessage: 'Fixture' });
    db.setAnnotation(id, { userSummary: 'Keep\nmy summary', type: 'User category', notes: 'fixture notes' });
    return { id, sessionsRoot, filePath, content };
  }
  const cursx = parent('11111111-2222-4333-8444-555555555555', 'cursx');
  const result = await branchSession(cursx.id, 'CursX branch');
  assert.equal(result.success, true, result.error);
  assert(calls.at(-1).args.includes('C:\\Fixture\\cursx_resume.ps1'), 'CursX branch must not use the normal Codex launcher');
  assert.equal(calls.at(-1).command, 'wt.exe');
  assert.match(result.newSessionId, /^codex:[a-f0-9-]{36}$/);
  const rawChild = result.newSessionId.slice(6);
  assert.equal(calls.at(-1).args.at(-1), rawChild);
  const childFile = files(cursx.sessionsRoot).find(f => f.endsWith(`-${rawChild}.jsonl`));
  assert(childFile, 'Child stays in the CursX sessions root');
  assert.match(path.basename(childFile), /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/);
  const meta = JSON.parse(fs.readFileSync(childFile, 'utf8').split('\n')[0]);
  assert.equal(meta.payload.id, rawChild);
  assert.equal(meta.payload.model_provider, 'cursor_bridge');
  assert.equal(fs.readFileSync(cursx.filePath, 'utf8'), cursx.content);
  assert.equal(db.getAnnotation(result.newSessionId).userSummary, 'Keep\nmy summary (Branched)');
  assert.equal(db.getAnnotation(result.newSessionId).type, 'User category');
  console.log('PASS: CursX branch preserves home, content, native child ID and user metadata; launches in Terminal');
  const normal = parent('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'codex');
  const normalResult = await branchSession(normal.id);
  assert.equal(normalResult.success, true, normalResult.error);
  assert(calls.at(-1).args.includes('C:\\Fixture\\codex_resume.ps1'));
  assert.equal(fs.readFileSync(normal.filePath, 'utf8'), normal.content);
  const Database = require('better-sqlite3');
  const reader = new Database(runtime.getRuntimePaths().dbPath, { readonly: true });
  const counts = () => reader.prepare('SELECT (SELECT count(*) FROM annotations) AS annotations, (SELECT count(*) FROM session_branches) AS branches').get();
  for (const missing of [{ ...product, resume: undefined }, null]) {
    product = missing;
    const before = { files: files(cursx.sessionsRoot), rows: counts(), calls: calls.length };
    const failed = await branchSession(cursx.id, 'must not create anything');
    assert.equal(failed.success, false);
    assert.match(failed.error, /refusing to launch it as Codex/);
    assert.deepEqual({ files: files(cursx.sessionsRoot), rows: counts(), calls: calls.length }, before);
  }
  reader.close();
  console.log('PASS: normal Codex unchanged; missing CursX route fails before file/DB/process changes');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
// <END Tharyn | CursX
