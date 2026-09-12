/* START> Tharyn | ZedMax
    2026-09-12
    What: Exercise the built single-workspace shell and tower identity in an isolated hidden Electron fixture.
    Why: Prevent the deprecated tabs or `<handle>@<session-id>` presentation from returning.
    Expected: Browse remains the only workspace and every visible tower identity is handle-only.
    Run: npm run test:zedmax-shell
*/
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedmax-shell-'));
const root = path.resolve(__dirname, '..');
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));

console.log(JSON.stringify({ fixture, pid: process.pid, hidden: true }));

let win;
const timeout = setTimeout(() => {
  console.error('FAIL: ZedMax shell fixture timed out');
  app.exit(1);
}, 30000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({
    portableConfig: portable.createDefaultPortableConfig(),
    zoomLevel: 1,
  }));
  require('../dist/main/main/metadata-db.js').initDb();
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
  await waitFor(`!!window.__ZEDUI_STORE__ && !!document.querySelector('.zed-session-workbench')`);

  await evaluate(`(() => {
    const session = {
      sessionId: 'codex:01a06ea4-1234-5678-9abc-def012345678',
      rawSessionId: '01a06ea4-1234-5678-9abc-def012345678',
      providerId: 'codex',
      product: 'codex',
      projectPath: 'fixture-project',
      projectDisplay: 'E:\\\\Fixture\\\\Tower',
      autoSummary: 'Synthetic tower identity session',
      firstMessage: 'Synthetic fixture only',
      displaySummary: 'Synthetic tower identity session',
      timestamp: new Date(),
      messageCount: 12,
      cwd: 'E:\\\\Fixture\\\\Tower',
      fileSize: 256,
      filePath: 'E:\\\\Fixture\\\\Tower\\\\session.jsonl',
      shortId: '01a06ea4',
      sizeDisplay: '256 B',
      ageDisplay: 'now',
      dateDisplay: 'Sep 12 10:00',
      annotation: {
        sessionId: 'codex:01a06ea4-1234-5678-9abc-def012345678',
        userSummary: '',
        notes: '',
        isFavorite: false,
        tags: [],
        type: 'Ungrouped',
        callSign: 'Warden@01a06ea4',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    window.__ZEDUI_STORE__.setState({
      sessions: [session],
      projects: [{
        path: 'fixture-project',
        displayPath: 'E:\\\\Fixture\\\\Tower',
        sessionCount: 1,
        lastActivity: new Date(),
        providerId: 'codex',
      }],
      selectedSessionId: session.sessionId,
      selectedSession: session,
      isLoading: false,
      error: null,
    });
  })()`);
  await waitFor(`document.querySelector('.zed-preview-handle')?.textContent.trim() === 'Warden'`);

  const shell = await evaluate(`(() => {
    const exactButtonLabels = Array.from(document.querySelectorAll('button'))
      .map(button => button.textContent.trim());
    return {
      heading: document.querySelector('.zed-view-heading h1')?.textContent.trim(),
      workspaceCount: document.querySelectorAll('.zed-session-workbench').length,
      rail: Array.from(document.querySelectorAll('.zed-nav-rail button span')).map(node => node.textContent.trim()),
      hasViewTab: exactButtonLabels.includes('View'),
      hasProEngTab: exactButtonLabels.includes('ProEng'),
      previewHandle: document.querySelector('.zed-preview-handle')?.textContent.trim(),
      statusHandle: document.querySelector('.zed-status-handle')?.textContent.trim(),
      previewTitle: document.querySelector('.zed-preview-handle')?.getAttribute('title'),
      bodyContainsComposite: document.body.innerText.includes('Warden@01a06ea4'),
      titleHealth: document.querySelector('.titlebar-health')?.textContent.trim(),
    };
  })()`);

  assert.equal(shell.heading, 'Session Library');
  assert.equal(shell.workspaceCount, 1);
  assert.deepEqual(shell.rail, ['Sessions', 'Search', 'Settings']);
  assert.equal(shell.hasViewTab, false);
  assert.equal(shell.hasProEngTab, false);
  assert.equal(shell.previewHandle, 'Warden');
  assert.equal(shell.statusHandle, 'Warden');
  assert.equal(shell.bodyContainsComposite, false);
  assert.match(shell.previewTitle, /^Handle: Warden · Session: codex:01a06ea4-/);
  assert.equal(shell.titleHealth, '1 sessions ready');
  console.log('PASS: ZedMax exposes one Browse workspace with the ZedCache-family shell');
  console.log('PASS: tower identity is handle-only while the stable session ID remains secondary metadata');

  await evaluate(`document.querySelector('.browse-tree-group')?.click()`);
  await waitFor(`!!document.querySelector('.browse-tree-session [title^="Handle: Warden · Session:"]')`);
  assert.equal(
    await evaluate(`document.querySelector('.browse-tree-session [title^="Handle: Warden · Session:"]').textContent.trim()`),
    'Warden',
  );
  console.log('PASS: session index rows also render the handle without the session suffix');

  await evaluate(`(() => {
    const state = window.__ZEDUI_STORE__.getState();
    window.__ZEDUI_STORE__.setState({
      selectedSessionId: null,
      selectedSession: null,
      messageSearchEnabled: true,
      searchQuery: 'synthetic',
      messageSearchLoading: false,
      messageSearchResults: [{
        sessionId: state.sessions[0].sessionId,
        projectPath: 'fixture-project',
        projectDisplay: 'E:\\\\Fixture\\\\Tower',
        messageIndex: 3,
        messageType: 'user',
        snippet: 'Synthetic message result',
        matchStart: 0,
        matchLength: 9,
        timestamp: new Date(),
      }],
    });
  })()`);
  await waitFor(`document.querySelector('.zed-index-scroll')?.innerText.includes('Synthetic message result')`);
  await evaluate(`Array.from(document.querySelectorAll('.zed-index-scroll .cursor-pointer'))
    .find(node => node.textContent.includes('Synthetic message result')).click()`);
  await waitFor(`window.__ZEDUI_STORE__.getState().selectedSessionId?.startsWith('codex:01a06ea4-')`);
  assert.equal(await evaluate(`document.querySelectorAll('.zed-session-workbench').length`), 1);
  assert.equal(await evaluate(`document.querySelector('.zed-preview-handle')?.textContent.trim()`), 'Warden');
  console.log('PASS: message-search results select a session without leaving the Browse workbench');

  clearTimeout(timeout);
  win.destroy();
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});

// Fixture data remains in the printed OS temp directory for diagnosis; no recursive deletion.
// <END Tharyn | ZedMax
