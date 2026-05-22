import { ProviderId } from '../shared/constants';

export const DEFAULT_PROVIDERS: ProviderId[] = ['claude', 'codex', 'cursor'];

export const LAUNCHER_PATHS = {
  claudeResumeScript: '/mnt/e/ZedBang/ZedUIMax/_Launcher/resume-session.sh',
  claudeNewSessionScript: '/mnt/e/ZedBang/CLI/Cust/Claude2/_Launcher/launch-sessions.sh',
  codexNewScript: 'E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex.ps1',
  codexResumeScript: 'E:\\ZedBang\\CLI\\Cust\\Codex2\\_Launcher\\cust_codex_resume.ps1',
  codexSubNewScript: 'E:\\ZedBang\\CLI\\Cust\\Codex2_subAgent\\_Launcher\\cust_codex_mag.ps1',
  codexSubResumeScript: 'E:\\ZedBang\\CLI\\Cust\\Codex2_subAgent\\_Launcher\\cust_codex_mag_resume.ps1',
} as const;

export function isProviderId(value: string): value is ProviderId {
  return value === 'claude' || value === 'codex' || value === 'cursor';
}

export function buildProviderSessionId(providerId: ProviderId, rawId: string): string {
  return `${providerId}:${rawId}`;
}

export function parseProviderSessionId(sessionId: string): { providerId: ProviderId; rawId: string } {
  const [maybeProvider, ...rest] = sessionId.split(':');
  if (isProviderId(maybeProvider)) {
    return { providerId: maybeProvider, rawId: rest.join(':') };
  }
  return { providerId: 'claude', rawId: sessionId };
}

export function toWslPath(p: string): string {
  if (!p) return p;
  if (p.startsWith('/')) return p;
  const m = p.match(/^([a-zA-Z]):[/\\](.*)$/);
  if (m) {
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
  }
  return p;
}

export function wslToWindowsPath(p: string): string {
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) {
    const drive = m[1].toUpperCase();
    const rest = m[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return p;
}
