const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const modules = packaged ? path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar', 'dist', 'main') : path.join(root, 'dist', 'main');
const compiledLaunchConfigPath = path.join(modules, 'main', 'launch-config.js');
const compiledPortableConfigPath = path.join(modules, 'main', 'portable-config.js');

if (!fs.existsSync(compiledLaunchConfigPath) || !fs.existsSync(compiledPortableConfigPath)) {
  throw new Error('launch config test requires a compiled main process. Run npm run build:electron first.');
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-launch-config-'));
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
require(path.join(modules, 'main', 'runtime-paths.js')).initializeRuntimePaths({ appPath: root });
const settingsFile = path.join(fixture, 'settings.json');

const { createDefaultPortableConfig } = require(compiledPortableConfigPath);
const {
  buildAssistantLaunch,
  buildClaudeLaunch,
  buildCodexLaunch,
  buildCursorLaunch,
} = require(compiledLaunchConfigPath);

function assertNoLegacyPath(text) {
  assert(!text.includes('/mnt/e/ZedBang/CLI'), text);
  assert(!text.includes('E:\\ZedBang\\CLI'), text);
  assert(!text.includes('/root/.local/bin/cursor-agent'), text);
}

try {
  const config = createDefaultPortableConfig();
  config.defaultWorkspaceWin = 'E:\\PortableWorkspace';
  config.wsl = {
    enabled: true,
    distroName: 'PortableUbuntu',
    userHomeWsl: '/home/portable',
    userHomeUnc: '\\\\wsl.localhost\\PortableUbuntu\\home\\portable',
  };
  config.providers.claude = {
    ...config.providers.claude,
    enabled: true,
    binaryPathWsl: '/home/portable/Claude2/bin/claude2',
    mcpConfigPathWsl: '/home/portable/config/mcp.json',
  };
  config.providers.codex = {
    ...config.providers.codex,
    enabled: true,
    sessionsDir: '\\\\wsl.localhost\\PortableUbuntu\\home\\portable\\.codex\\sessions',
    binaryPathWsl: '/home/portable/bin/codex',
    newScriptWin: 'C:\\PortableTools\\codex-new.ps1',
    resumeScriptWin: 'C:\\PortableTools\\codex-resume.ps1',
  };
  config.providers.cursor = {
    ...config.providers.cursor,
    enabled: true,
    projectsDir: '\\\\wsl.localhost\\PortableUbuntu\\home\\portable\\.cursor\\projects',
    binaryPathWsl: '/home/portable/bin/cursor-agent',
  };
  config.providers.geminiCli = {
    ...config.providers.geminiCli,
    enabled: true,
    newScriptWin: 'C:\\PortableTools\\gemini-new.ps1',
    resumeScriptWin: 'C:\\PortableTools\\gemini-resume.ps1',
  };

  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }, null, 2), 'utf-8');

  const claude = buildClaudeLaunch('resume', 'E:\\PortableWorkspace', 'claude-session-id');
  assert.strictEqual(claude.command, 'wt.exe');
  assert(claude.displayCommand.includes('/home/portable/Claude2/bin/claude2'));
  assert(claude.args.includes('CLAUDE2_ROOT=/home/portable/Claude2'));
  assert(!claude.displayCommand.includes('CLAUDE_ALLOW_ROOT_BYPASS'));
  assert(claude.displayCommand.includes('/home/portable/config/mcp.json'));
  assertNoLegacyPath(claude.displayCommand);

  const classifiedClaude = buildClaudeLaunch('new', 'E:\\PortableWorkspace', undefined, '11111111-1111-4111-8111-111111111111');
  assert(classifiedClaude.displayCommand.includes('--session-id'));
  assert(classifiedClaude.displayCommand.includes('11111111-1111-4111-8111-111111111111'));

  config.providers.claude.newSessionScriptWsl = '/home/portable/Claude2/_Launcher/launch-with-validation.sh';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }, null, 2), 'utf-8');
  const classifiedScriptClaude = buildClaudeLaunch('new', 'E:\\PortableWorkspace', undefined, '33333333-3333-4333-8333-333333333333');
  assert(classifiedScriptClaude.displayCommand.includes('/home/portable/Claude2/_Launcher/launch-with-validation.sh'));
  assert(classifiedScriptClaude.displayCommand.includes('CLAUDE2_EXTRA_ARGS=--session-id 33333333-3333-4333-8333-333333333333'));
  config.providers.claude.newSessionScriptWsl = '/home/portable/Claude2/_Launcher/launch-sessions.sh';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert(buildClaudeLaunch('new', 'E:\\PortableWorkspace', undefined, 'session-id').args.includes('CLAUDE2_EXTRA_ARGS=--session-id session-id'));
  config.providers.claude.newSessionScriptWsl = '/home/portable/Claude2/_Launcher/launch-with-validation.sh';

  config.providers.claude.resumeScriptWsl = '/home/portable/Claude2/_Launcher/launch-with-validation-resume.sh';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  const wrappedResume = buildClaudeLaunch('resume', 'E:\\PortableWorkspace', 'session-id');
  const wrapperIndex = wrappedResume.args.indexOf(config.providers.claude.resumeScriptWsl);
  assert.deepStrictEqual(wrappedResume.args.slice(wrapperIndex + 1), ['/mnt/e/PortableWorkspace', 'session-id', '', '/home/portable/config/mcp.json']);
  assert(!wrappedResume.args.includes(config.providers.claude.binaryPathWsl));
  const picker = buildClaudeLaunch('resume', 'E:\\PortableWorkspace');
  assert.deepStrictEqual(picker.args.slice(picker.args.indexOf(config.providers.claude.resumeScriptWsl) + 1), ['/mnt/e/PortableWorkspace', '', '', '/home/portable/config/mcp.json']);
  config.providers.claude.binaryPathWsl = '';
  config.providers.claude.mcpConfigPathWsl = '';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  const inferred = buildClaudeLaunch('resume', 'E:\\PortableWorkspace', 'session-id');
  assert(inferred.args.includes('CLAUDE2_ROOT=/home/portable/Claude2'));
  assert.deepStrictEqual(inferred.args.slice(inferred.args.indexOf(config.providers.claude.resumeScriptWsl) + 1), ['/mnt/e/PortableWorkspace', 'session-id']);
  config.providers.claude.mcpConfigPathWsl = '/home/portable/config/mcp.json';

  config.providers.claude.binaryPathWsl = '/home/portable/Claude2/node_modules/@anthropic-ai/claude-code-linux-x64/claude';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert(buildClaudeLaunch('resume', 'E:\\PortableWorkspace', 'session-id').args.includes('CLAUDE2_ROOT=/home/portable/Claude2'));
  config.providers.claude.newSessionScriptWsl = '';
  config.providers.claude.resumeScriptWsl = '';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert(buildClaudeLaunch('new', 'E:\\PortableWorkspace').args.includes('/home/portable/Claude2/bin/claude2'));
  config.providers.claude.binaryPathWsl = '/home/portable/bin/claude';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert.throws(() => buildClaudeLaunch('new', 'E:\\PortableWorkspace'), /Direct Claude binaries are not supported/);
  config.providers.claude.binaryPathWsl = '/home/portable/Claude2/bin/claude2';
  config.providers.claude.newSessionScriptWsl = '/home/portable/bin/custom-claude.sh';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert.throws(() => buildClaudeLaunch('new', 'E:\\PortableWorkspace'), /matching Claude2/);
  config.providers.claude.newSessionScriptWsl = '/home/portable/OtherClaude2/_Launcher/launch-with-validation.sh';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  assert.throws(() => buildClaudeLaunch('new', 'E:\\PortableWorkspace'), /matching Claude2/);
  const { normalizeClaudeEntryPointPath } = require(path.join(modules, 'shared', 'portable-config.js'));
  const migration = require('../scripts/migrate-local-data.js');
  for (const suffix of ['.bin/claude', '@anthropic-ai/claude-code/cli.js', '@anthropic-ai/claude-code-linux-x64/claude', '@anthropic-ai/claude-code-linux-x64-musl/claude']) {
    assert.strictEqual(normalizeClaudeEntryPointPath(`/home/portable/Claude2/node_modules/${suffix}`), '/home/portable/Claude2/bin/claude2');
    assert.strictEqual(migration.normalizeClaudeEntryPointPath(`/home/portable/Claude2/node_modules/${suffix}`), '/home/portable/Claude2/bin/claude2');
  }
  assert.strictEqual(migration.normalizeClaudeEntryPointPath(' /home/portable/Claude2/bin/claude2 '), '/home/portable/Claude2/bin/claude2');
  assert.strictEqual(migration.normalizeClaudeEntryPointPath('/home/portable/bin/claude'), '/home/portable/bin/claude');
  config.providers.claude.newSessionScriptWsl = '';
  config.providers.claude.resumeScriptWsl = '';
  config.providers.claude.binaryPathWsl = '/home/portable/Tools with spaces/Claude2/bin/claude2';
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }));
  const spaced = buildClaudeLaunch('resume', 'E:\\Workspace with spaces', 'session-id');
  assert(spaced.args.includes(config.providers.claude.binaryPathWsl));
  assert(spaced.args.includes('CLAUDE2_ROOT=/home/portable/Tools with spaces/Claude2'));
  assert(spaced.wslShellCommand.includes("CLAUDE2_ROOT='/home/portable/Tools with spaces/Claude2'"));

  const codex = buildCodexLaunch('resume', 'E:\\PortableWorkspace', 'codex-session-id');
  assert.strictEqual(codex.command, 'wt.exe');
  assert(codex.displayCommand.includes('C:\\PortableTools\\codex-resume.ps1'));
  assertNoLegacyPath(codex.displayCommand);

  const cursor = buildCursorLaunch('resume', 'E:\\PortableWorkspace', 'cursor-session-id');
  assert.strictEqual(cursor.command, 'wt.exe');
  assert(cursor.displayCommand.includes('/home/portable/bin/cursor-agent'));
  assertNoLegacyPath(cursor.displayCommand);

  const classifiedCursor = buildAssistantLaunch('cursor', 'new', 'E:\\PortableWorkspace', '22222222-2222-4222-8222-222222222222');
  assert(classifiedCursor.displayCommand.includes('--resume'));
  assert(classifiedCursor.displayCommand.includes('22222222-2222-4222-8222-222222222222'));

  const gemini = buildAssistantLaunch('gemini3', 'new', 'E:\\PortableWorkspace');
  assert.strictEqual(gemini.command, 'powershell.exe');
  assert(gemini.displayCommand.includes('C:\\PortableTools\\gemini-new.ps1'));
  assertNoLegacyPath(gemini.displayCommand);

  config.providers.claude.enabled = false;
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }, null, 2), 'utf-8');
  assert.throws(() => buildClaudeLaunch('new', 'E:\\PortableWorkspace'), /Claude is not enabled or configured/);

  console.log(`launch config tests passed (${packaged ? 'app.asar' : 'source'}, isolated fixture)`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
