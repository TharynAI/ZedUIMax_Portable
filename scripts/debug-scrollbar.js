// Debug scrollbar settings
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
      ws.send(JSON.stringify({
        id: id++,
        method: 'Runtime.enable'
      }));
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

    if (!renderer) {
      console.log('No renderer found. Targets:', targets.map(t => ({ type: t.type, url: t.url })));
      return;
    }

    console.log('Found renderer:', renderer.url);

    // Check current settings
    const settingsResult = await evaluate(renderer.webSocketDebuggerUrl,
      `window.__ZEDUI_SETTINGS__?.getState?.()?.settings`
    );
    console.log('\n=== Current Settings ===');
    console.log(JSON.stringify(settingsResult, null, 2));

    // Check if scrollbar style element exists
    const styleResult = await evaluate(renderer.webSocketDebuggerUrl,
      `document.getElementById('zedui-scrollbar-styles')?.textContent`
    );
    console.log('\n=== Dynamic Scrollbar Style ===');
    console.log(JSON.stringify(styleResult, null, 2));

    // Check computed scrollbar width via a scrollable element
    const computedResult = await evaluate(renderer.webSocketDebuggerUrl,
      `(() => {
        const el = document.querySelector('.overflow-auto');
        if (!el) return 'No scrollable element found';
        const style = window.getComputedStyle(el, '::-webkit-scrollbar');
        return { width: style.width, height: style.height };
      })()`
    );
    console.log('\n=== Computed Scrollbar Style ===');
    console.log(JSON.stringify(computedResult, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
