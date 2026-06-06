import { LAUNCH_ENV } from '../shared/constants';
import type { ProviderId } from '../shared/constants';
import { loadPortableConfigFromSettingsFile } from './portable-config';
import { toWslPath, wslToWindowsPath } from './provider-utils';
import type { PortableProviderConfig } from '../shared/portable-config';

export type CodexVariant = 'codex' | 'codexSub';
export type AssistantLauncherId = 'claude2' | 'codex2' | 'cursor' | 'gemini3';
export type AssistantLaunchMode = 'new' | 'resume';

export interface LaunchCommand {
  command: string;
  args: string[];
  displayCommand: string;
  wslShellCommand?: string;
}

function winQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@\\-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function wslQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function displayCommand(command: string, args: string[]): string {
  return [command, ...args].map(winQuote).join(' ');
}

function requireWsl(config: PortableProviderConfig): string {
  if (!config.wsl.enabled || !config.wsl.distroName) {
    throw new Error('WSL is not configured. Open Settings > Portable Setup and run WSL detection.');
  }
  return config.wsl.distroName;
}

function wtWslArgs(config: PortableProviderConfig, wslCwd: string, commandArgs: string[]): string[] {
  const distroName = requireWsl(config);
  const args = ['wsl', '-d', distroName];
  if (wslCwd) {
    args.push('--cd', wslCwd);
  }
  args.push('--', ...commandArgs);
  return args;
}

function wslExeArgs(config: PortableProviderConfig, commandArgs: string[]): string[] {
  const distroName = requireWsl(config);
  return ['-d', distroName, '--', ...commandArgs];
}

function providerUnavailable(provider: string): Error {
  return new Error(`${provider} is not enabled or configured. Open Settings > Portable Setup and configure the provider first.`);
}

function ensureWorkspace(workspaceWin: string): string {
  if (!workspaceWin) {
    throw new Error('No workspace is configured. Set Default Workspace in Settings > Portable Setup or pass a workspace explicitly.');
  }
  return workspaceWin;
}

function claudeCommandArgs(binaryPathWsl: string, mcpConfigPathWsl: string | undefined, resumeId?: string): string[] {
  const args = [
    'env',
    ...Object.entries(LAUNCH_ENV).map(([key, value]) => `${key}=${value}`),
    binaryPathWsl,
    '--permission-mode',
    'bypassPermissions',
  ];
  if (mcpConfigPathWsl) {
    args.push('--mcp-config', mcpConfigPathWsl);
  }
  if (resumeId) {
    args.push('--resume', resumeId);
  }
  return args;
}

function claudeShellCommand(binaryPathWsl: string, mcpConfigPathWsl: string | undefined, cwd: string, resumeId?: string): string {
  const envPrefix = Object.entries(LAUNCH_ENV).map(([key, value]) => `${key}=${value}`).join(' ');
  const mcpArg = mcpConfigPathWsl ? ` --mcp-config ${wslQuote(mcpConfigPathWsl)}` : '';
  const resumeArg = resumeId ? ` --resume ${wslQuote(resumeId)}` : '';
  return `cd ${wslQuote(cwd)} && ${envPrefix} ${wslQuote(binaryPathWsl)} --permission-mode bypassPermissions${mcpArg}${resumeArg}`;
}

export function buildClaudeLaunch(mode: 'new' | 'resume', cwd: string, resumeId?: string): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const provider = config.providers.claude;
  if (!provider.enabled) {
    throw providerUnavailable('Claude');
  }

  const wslCwd = toWslPath(cwd);
  const script = mode === 'resume' ? provider.resumeScriptWsl?.trim() : provider.newSessionScriptWsl?.trim();
  if (script) {
    const scriptArgs = mode === 'resume' && resumeId ? [script, wslCwd, resumeId] : [script, wslCwd];
    if (mode === 'resume' && resumeId && provider.binaryPathWsl.trim()) {
      scriptArgs.push(provider.binaryPathWsl.trim());
      if (provider.mcpConfigPathWsl?.trim()) {
        scriptArgs.push(provider.mcpConfigPathWsl.trim());
      }
    }
    const args = wtWslArgs(config, '', scriptArgs);
    return {
      command: 'wt.exe',
      args,
      displayCommand: displayCommand('wt', args),
      wslShellCommand: scriptArgs.map(wslQuote).join(' '),
    };
  }

  const binaryPathWsl = provider.binaryPathWsl.trim();
  if (!binaryPathWsl) {
    throw new Error('Claude binary path is not configured.');
  }
  if (mode === 'resume' && !resumeId) {
    throw new Error('Claude latest-resume requires a configured resume script.');
  }

  const commandArgs = claudeCommandArgs(binaryPathWsl, provider.mcpConfigPathWsl?.trim(), mode === 'resume' ? resumeId : undefined);
  const args = wtWslArgs(config, wslCwd, commandArgs);
  return {
    command: 'wt.exe',
    args,
    displayCommand: displayCommand('wt', args),
    wslShellCommand: claudeShellCommand(binaryPathWsl, provider.mcpConfigPathWsl?.trim(), wslCwd, mode === 'resume' ? resumeId : undefined),
  };
}

function codexScript(provider: PortableProviderConfig['providers']['codex'], mode: 'new' | 'resume', variant: CodexVariant): string {
  if (variant === 'codexSub') {
    return (mode === 'resume' ? provider.subAgentResumeScriptWin : provider.subAgentNewScriptWin)?.trim() || '';
  }
  return (mode === 'resume' ? provider.resumeScriptWin : provider.newScriptWin)?.trim() || '';
}

export function buildCodexLaunch(mode: 'new' | 'resume', cwd: string, resumeId?: string, variant: CodexVariant = 'codex'): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const provider = config.providers.codex;
  if (!provider.enabled) {
    throw providerUnavailable('Codex');
  }

  const script = codexScript(provider, mode, variant);
  if (script) {
    const winCwd = wslToWindowsPath(cwd);
    const psArgs = ['powershell', '-ExecutionPolicy', 'Bypass', '-File', script, '-PathFromExplorer', winCwd];
    if (mode === 'resume' && resumeId) {
      psArgs.push(resumeId);
    }
    return {
      command: 'wt.exe',
      args: psArgs,
      displayCommand: displayCommand('wt', psArgs),
    };
  }

  const binaryPathWsl = provider.binaryPathWsl?.trim();
  if (!binaryPathWsl) {
    throw new Error('Codex launch script or WSL binary path is not configured.');
  }

  const wslCwd = toWslPath(cwd);
  const commandArgs = mode === 'resume'
    ? (resumeId ? [binaryPathWsl, 'resume', resumeId] : [binaryPathWsl, 'resume'])
    : [binaryPathWsl];
  const args = wtWslArgs(config, wslCwd, commandArgs);
  const wslShellCommand = mode === 'resume'
    ? `cd ${wslQuote(wslCwd)} && ${wslQuote(binaryPathWsl)} resume${resumeId ? ` ${wslQuote(resumeId)}` : ''}`
    : `cd ${wslQuote(wslCwd)} && ${wslQuote(binaryPathWsl)}`;
  return {
    command: 'wt.exe',
    args,
    displayCommand: displayCommand('wt', args),
    wslShellCommand,
  };
}

function cursorBinary(config: PortableProviderConfig): string {
  const provider = config.providers.cursor;
  if (!provider.enabled) {
    throw providerUnavailable('Cursor');
  }
  const binaryPathWsl = provider.binaryPathWsl.trim();
  if (!binaryPathWsl) {
    throw new Error('Cursor binary path is not configured.');
  }
  return binaryPathWsl;
}

export function buildCursorLaunch(mode: 'new' | 'resume', cwd: string, resumeId?: string): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const binaryPathWsl = cursorBinary(config);
  const wslCwd = toWslPath(cwd);
  const commandArgs = [binaryPathWsl, '--workspace', wslCwd];
  if (mode === 'resume' && resumeId) {
    commandArgs.push('--resume', resumeId);
  } else if (mode === 'resume') {
    commandArgs.push('resume');
  }
  const args = wtWslArgs(config, wslCwd, commandArgs);
  const resumeArg = mode === 'resume' && resumeId ? ` --resume ${wslQuote(resumeId)}` : mode === 'resume' ? ' resume' : '';
  return {
    command: 'wt.exe',
    args,
    displayCommand: displayCommand('wt', args),
    wslShellCommand: `cd ${wslQuote(wslCwd)} && ${wslQuote(binaryPathWsl)} --workspace ${wslQuote(wslCwd)}${resumeArg}`,
  };
}

export function buildCursorCreateChatCommand(): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const binaryPathWsl = cursorBinary(config);
  const shellCommand = `echo n | timeout 15 ${wslQuote(binaryPathWsl)} create-chat`;
  const args = wslExeArgs(config, ['bash', '-lc', shellCommand]);
  return {
    command: 'wsl.exe',
    args,
    displayCommand: displayCommand('wsl', args),
  };
}

export function buildCursorSeededBranchLaunch(cwd: string, resumeId: string, tempWslPath: string): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const binaryPathWsl = cursorBinary(config);
  const wslCwd = toWslPath(cwd);
  const shellCommand = `${wslQuote(binaryPathWsl)} --workspace ${wslQuote(wslCwd)} --resume ${wslQuote(resumeId)} "$(cat ${wslQuote(tempWslPath)})"`;
  const args = wtWslArgs(config, wslCwd, ['bash', '-lc', shellCommand]);
  return {
    command: 'wt.exe',
    args,
    displayCommand: displayCommand('wt', args),
  };
}

export function buildAssistantLaunch(launcherId: AssistantLauncherId, mode: AssistantLaunchMode, workspace?: string): LaunchCommand {
  const config = loadPortableConfigFromSettingsFile();
  const workspaceWin = ensureWorkspace(workspace || config.defaultWorkspaceWin);

  switch (launcherId) {
    case 'claude2':
      return buildClaudeLaunch(mode, workspaceWin);
    case 'codex2':
      return buildCodexLaunch(mode, workspaceWin);
    case 'cursor':
      return buildCursorLaunch(mode, workspaceWin);
    case 'gemini3': {
      const provider = config.providers.geminiCli;
      if (!provider.enabled) {
        throw providerUnavailable('Gemini CLI');
      }
      const script = (mode === 'resume' ? provider.resumeScriptWin : provider.newScriptWin)?.trim();
      if (!script) {
        throw new Error(`Gemini CLI ${mode} script is not configured.`);
      }
      const args = ['-ExecutionPolicy', 'Bypass', '-File', script, '-PathFromExplorer', workspaceWin];
      return {
        command: 'powershell.exe',
        args,
        displayCommand: displayCommand('powershell', args),
      };
    }
    default: {
      const _exhaustive: never = launcherId;
      void _exhaustive;
      throw new Error(`Unknown launcher: ${String(launcherId)}`);
    }
  }
}
