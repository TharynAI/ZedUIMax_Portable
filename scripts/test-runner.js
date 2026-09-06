/**
 * test-runner.js - Chrome DevTools Protocol helper for ZedUI test automation
 *
 * START> 2025-12-01 | Sphere -> Tharyn | CC
 * Enables Claude to execute JavaScript in ZedUI's renderer process
 * Uses CDP to connect to Electron's remote debugging port
 * 2025-12-01 Initial implementation
 * <END | Sphere -> Tharyn | CC
 *
 * Usage:
 *   node test-runner.js "expression"
 *   node test-runner.js --file script.js
 *
 * Examples:
 *   node test-runner.js "window.__ZEDUI_STORE__.getState().sessions.length"
 *   node test-runner.js "document.querySelector('.session-tree')?.textContent"
 */

const http = require('http');
const WebSocket = require('ws');

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Use the portable CDP debug port by default while allowing an env override
    Why: The portable app can coexist with the active local app without fighting over port 9223
    Expected: `npm run test:ui` connects to the portable app on port 9233 unless ZEDUI_CDP_PORT is set
*/
const DEBUG_PORT = Number(process.env.ZEDUI_CDP_PORT || 9233);
// <END Tharyn | CursorCLI

/**
 * Get the WebSocket debugger URL for the first available target
 */
async function getDebuggerUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${DEBUG_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          // Find a page target (not devtools, not service worker)
          const pageTarget = targets.find(t => t.type === 'page');
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            resolve(pageTarget.webSocketDebuggerUrl);
          } else {
            reject(new Error(`No page target found. Is ZedUI running with --remote-debugging-port=${DEBUG_PORT}?`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse debug targets: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Cannot connect to debug port ${DEBUG_PORT}. Is ZedUI running with npm run start:debug?`));
    });

    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * Execute JavaScript expression via CDP
 */
async function executeJs(expression) {
  const wsUrl = await getDebuggerUrl();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageId = 1;

    ws.on('open', () => {
      // Send Runtime.evaluate command
      ws.send(JSON.stringify({
        id: messageId,
        method: 'Runtime.evaluate',
        params: {
          expression: expression,
          returnByValue: true,
          awaitPromise: true,
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === messageId) {
          ws.close();

          if (response.error) {
            reject(new Error(response.error.message));
          } else if (response.result.exceptionDetails) {
            const ex = response.result.exceptionDetails;
            reject(new Error(ex.exception?.description || ex.text || 'Evaluation error'));
          } else {
            resolve(response.result.result.value);
          }
        }
      } catch (e) {
        reject(new Error(`Failed to parse CDP response: ${e.message}`));
      }
    });

    ws.on('error', (e) => {
      reject(new Error(`WebSocket error: ${e.message}`));
    });

    ws.on('close', (code, reason) => {
      if (code !== 1000) {
        reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ws.close();
      reject(new Error('Execution timeout (10s)'));
    }, 10000);
  });
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode - useful helpers
    console.log('ZedUI Test Runner');
    console.log('=================');
    console.log('');
    console.log('Usage: node test-runner.js "expression"');
    console.log('');
    console.log('Common expressions:');
    console.log('  Get state:     window.__ZEDUI_STORE__.getState()');
    console.log('  Session count: window.__ZEDUI_STORE__.getState().sessions.length');
    console.log('  Is loading:    window.__ZEDUI_STORE__.getState().isLoading');
    console.log('  Load sessions: window.__ZEDUI_STORE__.getState().loadSessions()');
    console.log('  Tree mode:     window.__ZEDUI_STORE__.getState().treeMode');
    console.log('');

    // Try to show current status
    try {
      const state = await executeJs(`
        const s = window.__ZEDUI_STORE__.getState();
        JSON.stringify({
          sessions: s.sessions.length,
          isLoading: s.isLoading,
          error: s.error,
          treeMode: s.treeMode,
          selectedId: s.selectedSessionId
        })
      `);
      console.log('Current state:', JSON.parse(state));
    } catch (e) {
      console.log('Could not connect to ZedUI:', e.message);
      console.log('');
      console.log('Make sure ZedUI is running with: npm run start:debug');
    }
    return;
  }

  // Execute the provided expression
  let expression = args[0];

  // Handle --file flag
  if (args[0] === '--file' && args[1]) {
    const fs = require('fs');
    expression = fs.readFileSync(args[1], 'utf-8');
  }

  try {
    const result = await executeJs(expression);

    // Output result
    if (result === undefined) {
      console.log('undefined');
    } else if (typeof result === 'object') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
