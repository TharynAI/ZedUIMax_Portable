/* START> Tharyn | ZedUI
    2026-09-12
    What: Exercise the built cleanup UI with delayed synthetic provider sessions in a hidden Electron fixture.
    Why: Prove progress, Hide/reopen, duplicate prevention, failure reporting, and completion without live user data.
    Expected: Exactly one delete attempt per fixture session and a durable two-removed/one-skipped result.
    Run: npm run test:cleanup-progress
*/
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-cleanup-progress-'));
const root = path.resolve(__dirname, '..');
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));

console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));

const now = Date.now();
let fixtureSessions = [
  makeSession('claude:cleanup-fixture-1', 'claude', now - 3000),
  makeSession('codex:cleanup-fixture-2', 'codex', now - 2000),
  makeSession('cursor:cleanup-fixture-3', 'cursor', now - 1000),
];
const deleteCalls = [];
let win;

const timeout = setTimeout(() => {
  console.error('FAIL: cleanup progress fixture timed out');
  app.exit(1);
}, 45000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeSession(sessionId, providerId, timestamp) {
  return {
    sessionId,
    rawSessionId: sessionId.split(':')[1],
    providerId,
    projectPath: 'fixture-project',
    projectDisplay: 'E:\\Fixture\\Cleanup',
    autoSummary: `Synthetic ${providerId} cleanup session`,
    firstMessage: 'Synthetic fixture only',
    timestamp: new Date(timestamp),
    messageCount: 1,
    cwd: 'E:\\Fixture\\Cleanup',
    fileSize: 128,
    filePath: path.join(fixture, `${providerId}.jsonl`),
  };
}

async function evaluate(code) {
  return win.webContents.executeJavaScript(code);
}

async function waitFor(code, attempts = 100) {
  for (let index = 0; index < attempts; index++) {
    if (await evaluate(code)) return;
    await pause(100);
  }
  throw new Error(`UI did not reach expected state: ${code}`);
}

app.whenReady().then(async () => {
  const runtime = require('../dist/main/main/runtime-paths.js');
  runtime.initializeRuntimePaths({ appPath: root });
  const portable = require('../dist/main/main/portable-config.js');
  const config = portable.createDefaultPortableConfig();
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({
    portableConfig: config,
    ungroupedCleanupBatchSize: 3,
    zoomLevel: 1,
  }));
  require('../dist/main/main/metadata-db.js').initDb();

  const sessions = require('../dist/main/main/session-store.js');
  sessions.getSessions = () => fixtureSessions.slice();
  sessions.deleteSession = async sessionId => {
    deleteCalls.push(sessionId);
    await pause(900);
    if (sessionId.includes('fixture-2')) {
      throw new Error('Fixture: locked session');
    }
    fixtureSessions = fixtureSessions.filter(session => session.sessionId !== sessionId);
    return { deleted: true, filePath: path.join(fixture, 'synthetic.jsonl'), projectDisplay: 'fixture' };
  };

  require('../dist/main/main/ipc-handlers.js').setupIpcHandlers();
  win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(root, 'dist/main/main/preload.js'),
    },
  });
  await win.loadFile(path.join(root, 'dist/renderer/index.html'));

  await waitFor(`!!document.querySelector('button[title^="Delete oldest"]')`);
  await evaluate(`document.querySelector('button[title^="Delete oldest"]').click()`);
  await waitFor(`Array.from(document.querySelectorAll('h2')).some(node => node.textContent === 'Delete Old Ungrouped Sessions')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => /^Delete \\d+$/.test(button.textContent.trim())).click()`);

  await waitFor(`!!document.querySelector('.cleanup-progress-dialog[data-cleanup-phase="deleting"]')`);
  const activeSnapshot = await evaluate(`(() => {
    const store = window.__ZEDUI_STORE__.getState();
    const dialog = document.querySelector('.cleanup-progress-dialog');
    return {
      phase: store.cleanupProgress.phase,
      total: store.cleanupProgress.total,
      open: store.cleanupDialogOpen,
      dimmed: dialog?.querySelector('button[aria-label="Hide cleanup progress"]')?.className.includes('bg-black/65'),
    };
  })()`);
  assert.deepEqual(activeSnapshot, { phase: 'deleting', total: 3, open: true, dimmed: true });
  console.log('PASS: destructive confirmation transitions to a dimmed, determinate cleanup dialog');

  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Hide').click()`);
  await waitFor(`!document.querySelector('.cleanup-progress-dialog')`);
  assert.equal(await evaluate(`window.__ZEDUI_STORE__.getState().cleanupProgress.phase`), 'deleting');
  await evaluate(`document.querySelector('button[title="Open cleanup status"]').click()`);
  await waitFor(`!!document.querySelector('.cleanup-progress-dialog[data-cleanup-phase="deleting"]')`);
  console.log('PASS: Hide removes the scrim; the Clean control reopens the same active operation');

  // Clicking the compact active control again must only reopen status, never launch another cleanup.
  await evaluate(`document.querySelector('button[title="Open cleanup status"]').click()`);
  await waitFor(`document.querySelector('.cleanup-progress-dialog')?.dataset.cleanupPhase === 'complete'`);

  const result = await evaluate(`(() => {
    const state = window.__ZEDUI_STORE__.getState();
    return {
      progress: state.cleanupProgress,
      text: document.querySelector('.cleanup-progress-dialog').textContent,
      remainingSessions: state.sessions.length,
    };
  })()`);
  assert.equal(result.progress.total, 3);
  assert.equal(result.progress.processed, 3);
  assert.equal(result.progress.deleted, 2);
  assert.equal(result.progress.skipped, 1);
  assert.equal(result.remainingSessions, 1);
  assert.match(result.text, /2 removed, 1 skipped/i);
  assert.match(result.text, /Fixture: locked session/);
  assert.deepEqual(deleteCalls, [
    'claude:cleanup-fixture-1',
    'codex:cleanup-fixture-2',
    'cursor:cleanup-fixture-3',
  ]);
  console.log('PASS: exactly three attempts complete with two removed, one visible skip, and no duplicate cleanup');

  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Done').click()`);
  await waitFor(`!document.querySelector('.cleanup-progress-dialog')`);
  assert.equal(await evaluate(`window.__ZEDUI_STORE__.getState().cleanupProgress.phase`), 'idle');
  assert(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Clean')`));
  console.log('PASS: Done clears the durable result and restores the idle Clean control');

  clearTimeout(timeout);
  win.destroy();
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});

// Fixture data remains in the printed OS temp directory for diagnosis; no recursive deletion.
// <END Tharyn | ZedUI
