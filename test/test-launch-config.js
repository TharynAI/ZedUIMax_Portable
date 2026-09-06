const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const compiledLaunchConfigPath = path.join(root, 'dist', 'main', 'main', 'launch-config.js');
const compiledPortableConfigPath = path.join(root, 'dist', 'main', 'main', 'portable-config.js');

if (!fs.existsSync(compiledLaunchConfigPath) || !fs.existsSync(compiledPortableConfigPath)) {
  throw new Error('launch config test requires a compiled main process. Run npm run build:electron first.');
}

const settingsFile = path.join(root, 'data', 'settings.json');
const previousSettings = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf-8') : null;

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
    binaryPathWsl: '/home/portable/bin/claude',
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
  assert(claude.displayCommand.includes('/home/portable/bin/claude'));
  assert(claude.displayCommand.includes('/home/portable/config/mcp.json'));
  assertNoLegacyPath(claude.displayCommand);

  const codex = buildCodexLaunch('resume', 'E:\\PortableWorkspace', 'codex-session-id');
  assert.strictEqual(codex.command, 'wt.exe');
  assert(codex.displayCommand.includes('C:\\PortableTools\\codex-resume.ps1'));
  assertNoLegacyPath(codex.displayCommand);

  const cursor = buildCursorLaunch('resume', 'E:\\PortableWorkspace', 'cursor-session-id');
  assert.strictEqual(cursor.command, 'wt.exe');
  assert(cursor.displayCommand.includes('/home/portable/bin/cursor-agent'));
  assertNoLegacyPath(cursor.displayCommand);

  const gemini = buildAssistantLaunch('gemini3', 'new', 'E:\\PortableWorkspace');
  assert.strictEqual(gemini.command, 'powershell.exe');
  assert(gemini.displayCommand.includes('C:\\PortableTools\\gemini-new.ps1'));
  assertNoLegacyPath(gemini.displayCommand);

  config.providers.claude.enabled = false;
  fs.writeFileSync(settingsFile, JSON.stringify({ portableConfig: config }, null, 2), 'utf-8');
  assert.throws(() => buildClaudeLaunch('new', 'E:\\PortableWorkspace'), /Claude is not enabled or configured/);

  console.log('launch config tests passed');
} finally {
  if (previousSettings === null) {
    if (fs.existsSync(settingsFile)) {
      fs.unlinkSync(settingsFile);
    }
  } else {
    fs.writeFileSync(settingsFile, previousSettings, 'utf-8');
  }
}
