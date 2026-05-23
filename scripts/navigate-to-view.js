// Navigate to View tab and select a session
const http = require('http');
const WebSocket = require('ws');
const DEBUG_PORT = Number(process.env.ZEDUI_CDP_PORT || 9233);

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: id++, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({
        id: id++,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true }
      }));
    });

    ws.on('message', data => {
      const msg = JSON.parse(data);
      if (msg.id === 2) {
        ws.close();
        resolve(msg.result);
      }
    });

    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 5000);
  });
}

async function main() {
  try {
    const targets = await getTargets();
    const renderer = targets.find(t => t.type === 'page' && t.url.includes('index.html'));
    if (!renderer) { console.log('No renderer'); return; }

    // Select first session and switch to View tab
    const result = await evaluate(renderer.webSocketDebuggerUrl, `
      (() => {
        const store = window.__ZEDUI_STORE__;
        if (!store) return 'Store not found';

        const state = store.getState();
        const sessions = state.sessions;

        if (sessions.length === 0) return 'No sessions';

        // Select first session (use selectSession from state)
        state.selectSession(sessions[0].sessionId);

        // Click View tab
        const viewTab = document.querySelector('button.tab:nth-child(2)');
        if (viewTab) viewTab.click();

        return 'Selected session and switched to View tab';
      })()
    `);

    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
