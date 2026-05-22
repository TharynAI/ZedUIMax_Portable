import { ProviderId } from '../shared/constants';

export const DEFAULT_PROVIDERS: ProviderId[] = ['claude', 'codex', 'cursor'];

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
