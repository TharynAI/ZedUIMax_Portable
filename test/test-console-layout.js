const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const build = process.env.ZEDUI_CONSOLE_BUILD || path.join(__dirname, '..', 'dist', 'main', 'main');
const { captureConsoleLayout, previewConsoleLayout } = require(path.join(build, 'console-layout'));
const { storeConsoleObservation } = require(path.join(build, 'console-layout-store'));
const { renderConsoleLayoutReport } = require(path.join(build, 'console-layout-report'));
const id = '11111111-1111-4111-8111-111111111111';
const now = Date.now();
function fixture() {
  return {
    now, distro: 'Fixture', settings: { reservedPanelSerial: 'SAM:reserved' },
    terminal: { schemaVersion: 1, machineName: 'fixture', capturedAt: new Date(now).toISOString(), errors: [], windows: [
      { hwnd: '10', pid: 100, processStart: 'fixture', rect: { x: 10, y: 20, width: 800, height: 600 }, dpi: 96,
        tabs: [{ title: 'Agent', bounds: { x: 20, y: 30, width: 100, height: 30 } }] },
    ] },
    native: { schemaVersion: 1, capturedAt: new Date(now).toISOString(), bootId: 'fixture', errors: [], records: [
      { pid: 42, startTicks: '123', executable: '/canonical/claude', cwd: '/mnt/d/Project with spaces', sessionIds: [id] },
    ] },
    tower: { generatedAt: now, hubGeneration: 'fixture', seq: 1,
      monitors: [{ serial: 'LEN:agent', deviceName: 'DISPLAY99', x: 0, y: 0, width: 1920, height: 1080 }],
      agents: [{ name: 'Agent', product: 'claude-code', sessionId: id, hostPid: { host: 'wsl', pid: 42, distro: 'Fixture' } }],
    },
    resolveRecipe: session => ({ command: 'canonical.exe', args: ['resume', session.sessionId, session.cwd] }),
  };
}
let count = 0;
function test(name, run) { run(); count++; console.log(`PASS ${name}`); }
function tab(snapshot) { return snapshot.windows[0].tabs[0]; }
test('Unique title corroborates exact native UUID, host and cwd; never exact-pane/executable', () => {
  const capture = captureConsoleLayout(fixture());
  assert.equal(tab(capture).session.sessionId, id);
  assert.equal(tab(capture).session.cwd, 'D:\\Project with spaces');
  assert.equal(tab(capture).exactPaneBinding, false);
  assert.equal(capture.executionReady, false);
  assert.equal(capture.windows[0].panelSerial, 'LEN:agent');
  assert.deepEqual(previewConsoleLayout(capture).actions, []);
});
test('Duplicate tab titles never map', () => {
  const f = fixture(); f.terminal.windows[0].tabs.push({ title: 'Agent' });
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Duplicate Tower names never map', () => {
  const f = fixture(); f.tower.agents.push({ ...f.tower.agents[0], sessionId: '22222222-2222-4222-8222-222222222222' });
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Duplicate UUID across native processes blocks instead of product/home guessing', () => {
  const f = fixture(); f.native.records.push({ ...f.native.records[0], pid: 43 });
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Duplicate UUID across Tower products blocks', () => {
  const f = fixture(); f.tower.agents.push({ ...f.tower.agents[0], name: 'Other', product: 'clausor' });
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Wrong host PID or missing distro blocks', () => {
  const f = fixture(); f.tower.agents[0].hostPid.pid = 41;
  assert.equal(tab(captureConsoleLayout(f)).session, null);
  f.tower.agents[0].hostPid.pid = 42; f.tower.agents[0].hostPid.distro = '';
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Unknown products/remote agents cannot become local Claude', () => {
  const f = fixture(); f.tower.agents[0].product = 'field-relay';
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Native family mismatch blocks', () => {
  const f = fixture(); f.native.records[0].executable = '/canonical/codex';
  assert.equal(tab(captureConsoleLayout(f)).session, null);
});
test('Clausor retains isolated product route', () => {
  const f = fixture(); f.tower.agents[0].product = 'clausor'; f.native.records[0].executable = '/clibridge/claude.exe';
  let seen; f.resolveRecipe = session => { seen = session.productId; return { command: 'clausor.ps1', args: [] }; };
  assert.equal(tab(captureConsoleLayout(f)).session.productId, 'clausor'); assert.equal(seen, 'clausor');
});
test('Returning Samsung and current reserved flags both block placement', () => {
  const f = fixture(); f.tower.monitors[0].serial = 'SAM:reserved';
  assert.equal(captureConsoleLayout(f).windows[0].panelIdentityEligible, false);
  f.tower.monitors[0].serial = 'LEN:agent'; f.tower.monitors[0].reservedForUser = true;
  assert.equal(captureConsoleLayout(f).windows[0].panelIdentityEligible, false);
});
test('Unknown and duplicate serials fail closed', () => {
  const f = fixture(); f.tower.monitors.push({ ...f.tower.monitors[0], serial: null, x: 2000 });
  assert.equal(captureConsoleLayout(f).windows[0].panelIdentityEligible, false);
  f.tower.monitors[1].serial = 'LEN:agent';
  assert.ok(captureConsoleLayout(f).diagnostics.includes('duplicate-panel-serial'));
});
test('Renumbered device retains serial and panel-relative rect', () => {
  const f = fixture(); f.tower.monitors[0].deviceName = 'DISPLAY1';
  const w = captureConsoleLayout(f).windows[0];
  assert.equal(w.panelSerial, 'LEN:agent'); assert.equal(w.observedPanelRelativeRect.x, 10);
});
test('Minimized placeholder and maximized normal rect remain unknown', () => {
  const f = fixture(); f.terminal.windows[0].minimized = true;
  assert.equal(captureConsoleLayout(f).windows[0].normalRect, null);
  assert.equal(captureConsoleLayout(f).windows[0].panelSerial, null);
  f.terminal.windows[0].minimized = false; f.terminal.windows[0].maximized = true;
  assert.equal(captureConsoleLayout(f).windows[0].normalRect, null);
});
test('Missing recipe is explicit; no default provider fallback', () => {
  const f = fixture(); f.resolveRecipe = () => { throw new Error('not configured'); };
  assert.ok(tab(captureConsoleLayout(f)).blockers.includes('canonical-resume-recipe-unavailable'));
});
test('Stale/partial observations are disclosed', () => {
  const f = fixture(); f.tower.generatedAt -= 120000; f.native.errors.push({ pid: 42, error: 'EACCES' });
  const s = captureConsoleLayout(f);
  assert.ok(s.diagnostics.includes('tower-snapshot-stale'));
  assert.ok(s.diagnostics.includes('native-observation-partial'));
  assert.equal(s.windows[0].panelIdentityEligible, false);
});
test('Allowlist serialization drops environment, transcripts and arbitrary source fields', () => {
  const f = fixture(); f.native.token = 'SECRET'; f.terminal.windows[0].environment = 'SECRET'; f.tower.messages = 'SECRET';
  assert.equal(JSON.stringify(captureConsoleLayout(f)).includes('SECRET'), false);
});
test('Missing/oversize schema is refused', () => {
  const f = fixture(); f.terminal.schemaVersion = 99;
  assert.throws(() => captureConsoleLayout(f), /schema/);
  f.terminal.schemaVersion = 1; f.terminal.windows = Array.from({ length: 257 }, () => ({}));
  assert.throws(() => captureConsoleLayout(f), /excessive/);
});
test('Partial UIA enumeration and no panels remain explicit', () => {
  const f = fixture(); f.terminal.windows[0].tabError = 'unavailable'; f.tower.monitors = [];
  const s = captureConsoleLayout(f);
  assert.ok(s.diagnostics.includes('terminal-tab-enumeration-partial'));
  assert.ok(s.diagnostics.includes('panel-identity-or-geometry-unknown'));
});
test('CursX keeps codex provider and its own product recipe', () => {
  const f = fixture(); f.tower.agents[0].product = 'cursx'; f.native.records[0].executable = '/canonical/codex';
  let seen; f.resolveRecipe = session => { seen = session.productId; return { command: 'cursx.ps1', args: [] }; };
  const s = captureConsoleLayout(f);
  assert.equal(tab(s).session.provider, 'codex'); assert.equal(seen, 'cursx');
});
test('Atomic snapshots bounded to five rotations, protected files and nonempty latest retained', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-layout-'));
  try {
    const s = captureConsoleLayout(fixture()); const file = storeConsoleObservation(dir, s);
    const protectedFile = path.join(dir, 'console-layout', 'pre-reboot.json');
    fs.writeFileSync(protectedFile, 'protected');
    for (let i = 0; i < 7; i++) storeConsoleObservation(dir, s);
    assert.equal(fs.readdirSync(path.dirname(file)).filter(n => /^observed-/.test(n)).length, 5);
    assert.equal(storeConsoleObservation(dir, { ...s, windows: [] }), null);
    assert.equal(JSON.parse(fs.readFileSync(file)).windows.length, 1);
    assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'protected');
    fs.writeFileSync(path.join(dir, 'console-layout', '.capture.lock'), 'peer');
    assert.throws(() => storeConsoleObservation(dir, s), /EEXIST/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('Static report escapes names/recipes, keeps argv exact and includes feedback contract', () => {
  const s = captureConsoleLayout(fixture());
  s.windows[0].tabs[0].title = '<script>alert("x")</script>';
  s.windows[0].tabs[0].recipe.args = ['/mnt/d/a path', '</pre><script>attack</script>'];
  const html = renderConsoleLayoutReport(s);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('/mnt/d/a path'));
  assert.ok(html.includes('data-zedremote-feedback="v1"'));
  assert.ok(html.includes('Review only. Nothing will move or restart.'));
});
test('Report omits malformed numeric geometry from SVG attributes', () => {
  const s = captureConsoleLayout(fixture());
  s.panels[0].rect.x = '0" onload="attack'; s.windows[0].observedRect.x = '0" onload="attack';
  const html = renderConsoleLayoutReport(s);
  assert.ok(!html.includes('onload="attack'));
});
console.log(`${count}/${count} console-layout fixtures passed`);
