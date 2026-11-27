/* START> Tharyn | ZedUIMax Gemini Search
   2026-11-27: Exercise the compiled worker, actual search box, badge and preview.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const appRoot = path.resolve(__dirname, '..');
const argument = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const contentRoot = argument('asar') || appRoot;
const evidence = argument('evidence');
const real = process.argv.includes('--real');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-gemini-search-'));
const fromMain = name => require(path.join(contentRoot, 'dist/main/main', name + '.js'));
process.env.ZEDUI_APP_ROOT = appRoot;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({
  zedTrafficControlData: path.join(fixture, 'tower', 'data'), zeduiDb: path.join(fixture, 'zedui.db'),
}));
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ pid: process.pid, fixture, real, contentRoot }));

const wait = async (read, label) => {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (await read()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out: ' + label);
};

app.whenReady().then(async () => {
  const { createDefaultPortableConfig } = fromMain('portable-config');
  const settings = real
    ? JSON.parse(fs.readFileSync(path.join(appRoot, 'data/settings.json'), 'utf8'))
    : {};
  const config = settings.portableConfig || createDefaultPortableConfig();
  for (const provider of ['claude', 'codex', 'cursor']) config.providers[provider].enabled = false;
  const transcripts = path.join(fixture, 'gemini');
  if (!real) config.providers.geminiCli.sessionsDir = transcripts;
  config.providers.geminiCli.enabled = true;
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({
    portableConfig: config, providerFilter: 'gemini', zoomLevel: 1,
  }));

  const id = real ? '3ef2d78e-a0ea-4c31-88c5-4ece116794dd' : '11111111-1111-4111-8111-111111111111';
  const sessionId = 'gemini:' + id;
  const phrase = real ? 'Gemini Remote connection ready' : 'Orchid spindle';
  const summary = 'Gemini search acceptance';
  const stamp = new Date().toISOString();
  if (!real) {
    const project = path.join(transcripts, 'project');
    const chats = path.join(project, 'chats');
    fs.mkdirSync(chats, {recursive:true});
    fs.writeFileSync(path.join(project, '.project_root'), 'E:\\fixture\\workspace');
    const put = (name, kind, session, contents) => {
      const file = path.join(chats, `session-${name}.jsonl`);
      fs.writeFileSync(file, [{sessionId:session, kind, projectHash:'fixture', startTime:stamp}, ...contents]
        .map(value => JSON.stringify(value)).join('\n') + '\n');
      return file;
    };
    put('main', 'main', id, [
      {id:'u1', type:'user', displayContent:'Obsolete draft'},
      {id:'context', type:'user', content:[{text:'  <session_context>Ignore hidden context'}]},
      {id:'response', type:'user', content:[{functionResponse:{name:'Hidden tool result'}}], displayContent:'Hidden tool result'},
      null,
      {id:'u1', type:'user', displayContent:[{text:'Needle:\n Orchid spindle  ready.'}], content:[{text:'Hidden fallback'}], timestamp:stamp},
      {id:'u2', type:'user', content:[{text:'Part-only user reply'}]},
      {id:'m1', type:'gemini', content:'Assistant old copy'},
      {id:'m1', type:'gemini', content:[{text:'Assistant final copy'}], toolCalls:[{name:'fixture_lookup',args:{value:'tool marker'}}]},
    ]);
    put('helper', 'subagent', 'auxiliary', [{id:'u',type:'user',content:'Auxiliary hidden'}]);
    const old = put('old', 'main', 'old', [{id:'u',type:'user',content:'Old date marker'}]);
    const date = new Date(Date.now() - 14 * 86400000);
    fs.utimesSync(old, date, date);
  }

  const db = fromMain('metadata-db');
  db.initDb();
  if (!real) db.setAnnotation(sessionId, {userSummary:summary});
  const handlers = new Map();
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (name, fn) => {handlers.set(name, fn); handle(name, fn);};
  fromMain('ipc-handlers').setupIpcHandlers();
  const search = (query, days = 30, filter = ['gemini'], machine) =>
    handlers.get('sessions:searchMessages')(null, query, 50, days, filter, machine);
  if (!real) {
    const [hit] = await search('orchid spindle');
    assert.equal(hit.sessionId, sessionId);
    assert.equal(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength), phrase);
    assert.equal(hit.messageIndex, 0);
    assert.equal(hit.session.displaySummary, summary);
    assert.equal(hit.session.cwd, 'E:\\fixture\\workspace');
    for (const hidden of ['Obsolete draft','hidden context','Hidden tool result','Hidden fallback','Assistant old copy','Auxiliary hidden']) {
      assert.deepEqual(await search(hidden), [], hidden);
    }
    assert.equal((await search('Part-only user reply'))[0].messageIndex, 1);
    assert.equal((await search('Assistant final copy'))[0].messageType, 'assistant');
    assert.equal((await search('tool marker'))[0].messageIndex, 2);
    assert.deepEqual(await search(phrase, 30, ['codex']), []);
    assert.deepEqual(await search(phrase, 30, ['gemini'], 'id:foreign'), []);
    assert.deepEqual(await search('Old date marker', 7), []);
    assert.equal((await search('Old date marker', 30))[0].sessionId, 'gemini:old');
    assert.equal((await search('orchid spindle', 30, []))[0].sessionId, sessionId);
    const oldRequest = search('never present');
    assert.deepEqual(await search(''), []);
    assert.deepEqual(await oldRequest, []);
    console.log('PASS: final record wins, visible text/tools only, exact machine/provider/date routing, cancellation');
  }

  const win = new BrowserWindow({show:false,width:1100,height:850,webPreferences:{
    contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:Boolean(evidence),
    preload:path.join(contentRoot, 'dist/main/main/preload.js'),
  }});
  try {
    await win.loadFile(path.join(contentRoot, 'dist/renderer/index.html'));
    const evaluate = code => win.webContents.executeJavaScript(code);
    await wait(() => evaluate('window.__ZEDUI_STORE__.getState().sessions.length > 0'), 'initial Gemini library');
    await evaluate(`document.querySelector('button[aria-label="Search message content"]').click()`);
    await evaluate(`document.querySelector('input[placeholder="Search messages"]').focus()`);
    win.webContents.debugger.attach('1.3');
    try {
      await win.webContents.debugger.sendCommand('Input.insertText', {text:phrase});
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    } finally { win.webContents.debugger.detach(); }
    await wait(() => evaluate(`window.__ZEDUI_STORE__.getState().messageSearchResults.some(r=>r.sessionId===${JSON.stringify(sessionId)})`), 'known Gemini content hit');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.zed-index-scroll button mark')).some(m=>m.textContent.toLowerCase()===${JSON.stringify(phrase.toLowerCase())} && m.closest('button').textContent.includes('Gemini'))`), true);
    // Simulate a hit outside the already-loaded list; Gemini selection uses its exact preview.
    await evaluate('window.__ZEDUI_STORE__.setState({sessions: []})');
    const index = await evaluate(`window.__ZEDUI_STORE__.getState().messageSearchResults.findIndex(r=>r.sessionId===${JSON.stringify(sessionId)})`);
    await evaluate(`document.querySelectorAll('.zed-index-scroll button')[${index}].click()`);
    await wait(() => evaluate(`window.__ZEDUI_STORE__.getState().selectedSession?.sessionId===${JSON.stringify(sessionId)} && document.querySelector('.zed-session-review').textContent.includes('Gemini')`), 'selected Gemini preview');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    if (evidence) fs.writeFileSync(evidence, (await win.webContents.capturePage()).toPNG());
    console.log('PASS: search box finds a Gemini phrase, highlights it and opens the exact session preview: ' + sessionId);
  } finally { win.destroy(); }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
// <END Tharyn | ZedUIMax Gemini Search
