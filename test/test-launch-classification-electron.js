const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-launch-classification-'));
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));

app.whenReady().then(async () => {
  const runtime = require('../dist/main/main/runtime-paths.js');
  runtime.initializeRuntimePaths({ appPath: root });
  const portable = require('../dist/main/main/portable-config.js');
  const config = portable.createDefaultPortableConfig();
  const sessionsRoot = path.join(fixture, 'codex-sessions');
  config.providers.codex.enabled = true;
  config.providers.codex.sessionsDir = sessionsRoot;
  fs.mkdirSync(sessionsRoot, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));

  const db = require('../dist/main/main/metadata-db.js');
  db.initDb();
  const classifier = require('../dist/main/main/launch-classifier.js');

  const claudeTarget = classifier.classificationTargetForLauncher('claude2');
  const exact = classifier.applyExactLaunchClassification(
    claudeTarget,
    '11111111-1111-4111-8111-111111111111',
    'E:\\ZedBang\\Projects',
    { userSummary: 'Exact identity test', type: 'App Development' },
  );
  assert.equal(exact.state, 'applied');
  assert.equal(db.getAnnotation(exact.sessionId).userSummary, 'Exact identity test');
  assert.equal(db.getAnnotation(exact.sessionId).type, 'App Development');

  const codexTarget = classifier.classificationTargetForLauncher('codex2');
  const pending = classifier.queuePendingLaunchClassification(
    codexTarget,
    'E:\\ZedBang\\Projects',
    { userSummary: 'Pending matcher test', type: 'Harness Analysis' },
  );
  assert.equal(pending.state, 'pending');

  const rawId = '22222222-2222-4222-8222-222222222222';
  const datedDir = path.join(sessionsRoot, '2026', '09', '12');
  fs.mkdirSync(datedDir, { recursive: true });
  const rollout = path.join(datedDir, `rollout-2026-09-12T20-00-01-${rawId}.jsonl`);
  fs.writeFileSync(rollout, [
    JSON.stringify({ type: 'session_meta', payload: { id: rawId, cwd: 'E:\\ZedBang\\Projects', model_provider: 'openai' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fixture' }] } }),
    '',
  ].join('\n'));

  const changed = await classifier.reconcilePendingLaunchClassifications();
  assert.equal(changed.length, 1);
  assert.equal(changed[0].state, 'applied');
  assert.equal(changed[0].sessionId, `codex:${rawId}`);
  assert.equal(db.getAnnotation(`codex:${rawId}`).userSummary, 'Pending matcher test');
  assert.equal(db.getAnnotation(`codex:${rawId}`).type, 'Harness Analysis');
  assert.equal(classifier.getVisibleLaunchClassificationNotices().length, 0);

  console.log('PASS: exact and durable pending launch classifications attach to native session IDs');
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
