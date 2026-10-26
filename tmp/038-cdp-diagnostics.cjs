const { getProxyForUrl } = require('./cu-tools/node_modules/playwright-core/lib/utilsBundle.js');
const { bypassLoopbackProxy } = require('./038-cdp-connection.cjs');
const before = !!getProxyForUrl('http://127.0.0.1:9247/json/version/');
bypassLoopbackProxy();
console.log(JSON.stringify({
  httpProxyConfigured: !!(process.env.http_proxy || process.env.HTTP_PROXY),
  allProxyConfigured: !!(process.env.all_proxy || process.env.ALL_PROXY),
  loopbackWouldUseProxyBefore: before,
  loopbackWouldUseProxyAfter: !!getProxyForUrl('http://127.0.0.1:9247/json/version/')
}));
