// Test actual scrollbar rendering
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
      console.log('No renderer found.');
      return;
    }

    console.log('Found renderer:', renderer.url);

    // Create a test div to measure scrollbar
    const measureResult = await evaluate(renderer.webSocketDebuggerUrl, `
      (() => {
        // Create test container with forced scrollbars
        const outer = document.createElement('div');
        outer.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden;';

        const inner = document.createElement('div');
        inner.style.cssText = 'width:200px;height:200px;';
        outer.appendChild(inner);
        document.body.appendChild(outer);

        // Measure scrollbar dimensions
        const scrollbarWidth = outer.offsetWidth - outer.clientWidth;
        const scrollbarHeight = outer.offsetHeight - outer.clientHeight;

        // Get style element content
        const styleEl = document.getElementById('zedui-scrollbar-styles');
        const styleContent = styleEl ? styleEl.textContent : 'Style element not found';

        // Check all stylesheets for scrollbar rules
        let scrollbarRules = [];
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              if (rule.cssText && rule.cssText.includes('webkit-scrollbar')) {
                scrollbarRules.push({
                  source: sheet.href || 'inline',
                  rule: rule.cssText
                });
              }
            }
          } catch(e) {}
        }

        document.body.removeChild(outer);

        return {
          measuredScrollbarWidth: scrollbarWidth,
          measuredScrollbarHeight: scrollbarHeight,
          dynamicStyleContent: styleContent,
          allScrollbarRules: scrollbarRules
        };
      })()
    `);

    console.log('\n=== Scrollbar Measurement ===');
    console.log(JSON.stringify(measureResult, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
