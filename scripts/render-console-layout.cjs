// Read-only report generation from an existing local observation; no new capture or process action.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const build = process.env.ZEDUI_CONSOLE_BUILD || path.join(root, 'dist', 'main', 'main');
const { renderConsoleLayoutReport } = require(path.join(build, 'console-layout-report'));
const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node render-console-layout.cjs <snapshot.json> <report.html>');
const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
if (snapshot.schemaVersion !== 1 || snapshot.purpose !== 'read-only-prototype' || snapshot.executionReady !== false) throw new Error('Expected a read-only observation');
const html = renderConsoleLayoutReport(snapshot);
if (html.length >= 8000000) throw new Error('Report exceeds the Remote page limit');
fs.writeFileSync(output, html);
console.log(JSON.stringify({ file: output, characters: html.length, snapshotId: snapshot.snapshotId, executable: false }));
