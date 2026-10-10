/* START> Tharyn | ZedMax
    2026-10-10
    What: Exercise multi-home Claude product behavior using a private registry, DB and transcripts.
    Why: Home isolation must hold through every read/launch/mutation, including duplicate native IDs.
    Expected: Clausor shares annotation keys but never default Claude routing or mutation targets.
*/
const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-clausor-'));
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));
const calls = [];
cp.execFile = (command, args, options, callback) => {
  calls.push({ command, args }); callback(null, '', '');
};
let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${checks}: ${name}`); };

app.whenReady().then(async () => {
  const runtime = require('../dist/main/main/runtime-paths.js');
  runtime.initializeRuntimePaths({ appPath: root });
  const portable = require('../dist/main/main/portable-config.js');
  const config = portable.createDefaultPortableConfig();
  const normalRoot = path.join(fixture, 'normal', 'projects');
  const clausorRoot = path.join(fixture, 'Clausor with spaces', 'projects');
  const workspace = path.join(fixture, 'Workspace with spaces');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(path.join(fixture, 'tower', 'config'), { recursive: true });
  fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({
    zedTrafficControlData: path.join(fixture, 'tower', 'data'), zeduiDb: path.join(fixture, 'zedui.db'),
  }));
  const product = {
    id: 'clausor', label: 'Clausor', keyProvider: 'claude', harness: 'claude-code', inferenceRoute: 'cursor',
    home: path.dirname(clausorRoot), sessionsDir: clausorRoot,
    launch: { exe: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Fixture with spaces\\clausor.ps1', 'new', '--cwd', '{cwd}'] },
    resume: { exe: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Fixture with spaces\\clausor.ps1', 'resume', '--cwd', '{cwd}', '--session', '{sessionId}'] },
  };
  fs.writeFileSync(path.join(fixture, 'tower', 'config', 'agent-products.json'), JSON.stringify({ version: 1, products: [
    { id: 'claude-code', label: 'Claude Code', keyProvider: 'claude', harness: 'claude-code', fallback: true, home: path.dirname(normalRoot), sessionsDir: normalRoot },
    product,
  ] }));
  config.providers.claude.enabled = true;
  config.providers.claude.projectsDir = normalRoot;
  config.providers.claude.binaryPathWsl = '/fixture/claude';
  config.wsl.enabled = true; config.wsl.distroName = 'Fixture';
  config.defaultWorkspaceWin = workspace;
  const saveConfig = () => fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));
  saveConfig();
  const db = require('../dist/main/main/metadata-db.js'); db.initDb();
  const store = require('../dist/main/main/session-store.js');
  const launch = require('../dist/main/main/launch-config.js');
  const launcher = require('../dist/main/main/launcher.js');
  const relocate = require('../dist/main/main/session-relocator.js');
  const products = require('../dist/main/main/agent-products.js');
  const classifier = require('../dist/main/main/launch-classifier.js');
  const rawNormal = '11111111-1111-4111-8111-111111111111';
  const rawClausor = '22222222-2222-4222-8222-222222222222';
  const normalId = `claude:${rawNormal}`;
  const clausorId = `claude:${rawClausor}`;
  function writeSession(base, rawId, label) {
    const dir = path.join(base, '-fixture-workspace'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${rawId}.jsonl`);
    const content = [
      { type: 'summary', summary: label },
      { type: 'user', sessionId: rawId, cwd: workspace, timestamp: new Date().toISOString(), message: { role: 'user', content: 'clausor-fixture-needle ' + 'fixture '.repeat(650) } },
      { type: 'assistant', sessionId: rawId, cwd: workspace, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'synthetic response' }] } },
    ].map(x => JSON.stringify(x)).join('\n') + '\n';
    fs.writeFileSync(file, content); return { file, content };
  }
  const normal = writeSession(normalRoot, rawNormal, 'Normal fixture');
  const clausor = writeSession(clausorRoot, rawClausor, 'Clausor fixture');
  db.setAnnotation(normalId, { userSummary: 'shared lookup normal', type: 'Fixture' });
  db.setAnnotation(clausorId, { userSummary: 'shared lookup clausor', type: 'Fixture', notes: 'keep notes' });
  check('default and isolated roots list together with original key space', () => {
    const sessions = store.getSessions(['claude'], 30);
    assert.equal(sessions.length, 2);
    assert.equal(sessions.find(x => x.sessionId === clausorId).product, 'clausor');
    assert.equal(sessions.find(x => x.sessionId === normalId).product, 'claude-code');
    assert.equal(store.getSessions(['clausor'], 30).length, 1);
    assert.equal(store.getSessions(['clausor'], 30)[0].sessionId, clausorId);
  });
  check('details, projects, native identities and message search preserve product', () => {
    assert.equal(store.getSessionDetails(clausorId).product, 'clausor');
    assert.equal(store.getSessionDetails(clausorId).productLabel, 'Clausor');
    assert.equal(store.getSessions(['clausor'], 30)[0].productLabel, 'Clausor');
    assert.equal(store.findSessionProject(clausorId), '-fixture-workspace');
    assert.equal(store.getAllProjects(['clausor'])[0].sessionCount, 1);
    assert.equal(store.getSessionIdentities('claude', 'clausor')[0].sessionId, clausorId);
    const hits = store.searchMessages('clausor-fixture-needle', 50, 30, ['clausor']);
    assert.equal(hits.length, 1); assert.equal(hits[0].product, 'clausor');
    assert.equal(hits[0].sessionId, clausorId);
  });
  check('new, exact resume and picker are Terminal commands with correct home launcher', () => {
    const fresh = launch.buildAssistantLaunch('clausor', 'new', workspace, rawClausor);
    assert.equal(fresh.command, 'wt.exe');
    assert.deepEqual(fresh.args.slice(-3), ['--', '--session-id', rawClausor]);
    assert(fresh.args.includes(workspace));
    const exact = launch.buildClaudeLaunch('resume', workspace, rawClausor, undefined, 'clausor');
    assert.equal(exact.args.at(-1), rawClausor);
    const picker = launch.buildAssistantLaunch('clausor', 'resume', workspace);
    assert(!picker.args.includes('--session')); assert(!picker.args.includes(''));
    assert(launch.buildAssistantLaunch('claude2', 'new', workspace, rawNormal).args.includes('/fixture/claude'));
  });
  await launcher.continueSession(clausorId);
  check('Continue and both copied-command paths use Clausor', () => {
    assert.equal(calls.at(-1).command, 'wt.exe');
    assert(calls.at(-1).args.includes(product.resume.args[6]));
    assert(launcher.getResumeCommand(clausorId).includes('clausor.ps1'));
    assert(store.getResumeInfo(clausorId).wtCommand.includes('clausor.ps1'));
  });
  const handlers = new Map();
  ipcMain.handle = (name, fn) => handlers.set(name, fn);
  require('../dist/main/main/ipc-handlers.js').setupIpcHandlers();
  const annotationHits = await handlers.get('sessions:search')(null, 'shared lookup', 1, undefined, ['clausor']);
  check('annotation search filters before limiting results', () => {
    assert.equal(annotationHits.length, 1); assert.equal(annotationHits[0].sessionId, clausorId);
  });
  const originalDetails = store.getSessionDetails;
  let detailsRead = 0;
  store.getSessionDetails = (...args) => { detailsRead++; return originalDetails(...args); };
  try {
    await handlers.get('sessions:search')(null, 'shared lookup', 1);
  } finally {
    store.getSessionDetails = originalDetails;
  }
  check('search stops reading transcripts after enough matching results', () => assert.equal(detailsRead, 1));
  check('registry labels are authoritative rather than a static product name', () => {
    const registered = products.productById('clausor');
    const label = registered.label;
    try {
      registered.label = 'Clausor fixture label';
      assert.equal(store.getSessions(['clausor'], 30)[0].productLabel, registered.label);
      assert.equal(store.getSessionDetails(clausorId).productLabel, registered.label);
    } finally {
      registered.label = label;
    }
  });
  check('exact new-session classification retains claude annotation key', () => {
    const target = classifier.classificationTargetForLauncher('clausor');
    assert.equal(target.exactIdentity, 'claude'); assert.equal(target.product, 'clausor');
    const result = classifier.applyExactLaunchClassification(target, rawClausor, workspace, { userSummary: 'Exact Clausor fixture', type: 'Isolated' });
    assert.equal(result.sessionId, clausorId); assert.equal(db.getAnnotation(clausorId).type, 'Isolated');
    assert.equal(db.getAnnotation(clausorId).notes, 'keep notes');
  });
  const branch = await launcher.branchSession(clausorId, 'Fixture branch');
  check('branch keeps Clausor transcript root, launcher, lineage and annotations', () => {
    assert.equal(branch.success, true, branch.error);
    const child = store.getSessionDetails(branch.newSessionId);
    assert.equal(child.product, 'clausor'); assert.equal(path.dirname(child.filePath), path.dirname(clausor.file));
    assert.equal(calls.at(-1).args.at(-1), child.rawSessionId);
    assert.equal(db.getAnnotation(child.sessionId).type, 'Isolated');
    assert.equal(fs.readFileSync(clausor.file, 'utf8'), clausor.content);
  });
  const registry = products.loadProducts();
  const index = registry.findIndex(x => x.id === 'clausor');
  registry[index] = { ...product, resume: undefined };
  const beforeFiles = fs.readdirSync(path.dirname(clausor.file));
  const beforeCalls = calls.length;
  const missingRoute = await launcher.branchSession(clausorId);
  check('missing product route refuses branch before writes and never launches Claude', () => {
    assert.equal(missingRoute.success, false);
    assert.deepEqual(fs.readdirSync(path.dirname(clausor.file)), beforeFiles);
    assert.equal(calls.length, beforeCalls);
    assert.equal(store.getResumeInfo(clausorId), null);
  });
  registry[index] = product;
  const relocatedDir = path.join(fixture, 'Relocated workspace'); fs.mkdirSync(relocatedDir);
  const relocation = relocate.relocateSession(clausorId, relocatedDir);
  check('relocation stays in isolated product root and leaves default Claude unchanged', () => {
    assert.equal(relocation.success, true, relocation.error);
    const source = store.findClaudeSessionSource(rawClausor);
    assert.equal(source.dir, clausorRoot); assert.equal(source.product, 'clausor');
    assert.equal(fs.readFileSync(normal.file, 'utf8'), normal.content);
    assert.equal(fs.existsSync(clausor.file), false);
  });
  const duplicate = writeSession(normalRoot, rawClausor, 'Ambiguous fixture');
  check('duplicate native ID refuses details, lookup, copy, delete and relocation', () => {
    for (const act of [() => store.getSessionDetails(clausorId), () => store.findSessionProject(clausorId),
      () => store.deleteSession(clausorId), () => launcher.getResumeCommand(clausorId),
      () => relocate.relocateSession(clausorId, workspace)]) assert.throws(act, /Ambiguous Claude session/);
    assert(fs.existsSync(duplicate.file)); assert(db.getAnnotation(clausorId));
  });
  await assert.rejects(() => launcher.continueSession(clausorId), /Ambiguous Claude session/);
  await assert.rejects(() => launcher.branchSession(clausorId), /Ambiguous Claude session/);
  fs.unlinkSync(duplicate.file);
  const deleted = store.deleteSession(clausorId);
  check('delete cascades only recovered product session metadata and transcript', () => {
    assert.equal(deleted.deleted, true); assert.equal(fs.existsSync(deleted.filePath), false);
    assert.equal(db.getAnnotation(clausorId), null);
    assert.equal(fs.readFileSync(normal.file, 'utf8'), normal.content); assert(db.getAnnotation(normalId));
  });
  config.providers.claude.enabled = false; saveConfig();
  check('isolated product remains independent when default Claude provider is disabled', () => {
    assert.equal(store.getSessions(['clausor'], 30).length, 1);
    assert.equal(store.getSessionDetails(branch.newSessionId).product, 'clausor');
  });
  config.providers.claude.enabled = true; saveConfig();
  registry[index] = { ...product, sessionsDir: path.join(fixture, 'absent') };
  check('missing isolated root is empty while configured default remains', () => {
    assert.equal(store.getSessions(['clausor'], 30).length, 0);
    assert.equal(store.getSessions(['claude'], 30).length, 1);
  });
  registry.splice(0);
  check('absent registry retains default Claude discovery and launch', () => {
    assert.equal(store.getSessions(['claude'], 30)[0].sessionId, normalId);
    assert.throws(() => launch.buildAssistantLaunch('clausor', 'new', workspace), /refusing to launch it as Claude/);
    assert(launch.buildAssistantLaunch('claude2', 'new', workspace).args.includes('/fixture/claude'));
  });
  console.log(JSON.stringify({ result: 'PASS', checks, fixture, pid: process.pid }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
// <END Tharyn | ZedMax
