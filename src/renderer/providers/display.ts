/* START> Tharyn | CursorCLI
    2026-05-03
    What: Renderer-side provider display map (label, badge, assistant name)
    Why: Codex review flagged scattered if/else provider checks; centralizing here removes drift as Cursor (and any future provider) is added
    Expected: All renderer surfaces import from here instead of hardcoding 'claude'/'codex' strings
*/
import type { Session } from '../types/session';

export type ProviderId = Session['providerId'];

export interface ProviderDisplay {
  id: ProviderId;
  label: string;             // Tree/preview badge
  assistantName: string;     // MessageBubble assistant header
  badgeBgClass: string;      // Tailwind background class for badge tints
  badgeBorderClass: string;  // Tailwind border class
}

const map: Record<ProviderId, ProviderDisplay> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    assistantName: 'Claude',
    badgeBgClass: 'bg-bg-tertiary',
    badgeBorderClass: 'border-border',
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    assistantName: 'Codex',
    badgeBgClass: 'bg-amber-900/20',
    badgeBorderClass: 'border-amber-700/40',
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    assistantName: 'Cursor',
    badgeBgClass: 'bg-purple-900/20',
    badgeBorderClass: 'border-purple-700/40',
  },
};

export function getProviderDisplay(id: ProviderId): ProviderDisplay {
  return map[id] ?? map.claude;
}

export const PROVIDER_FILTER_OPTIONS: ReadonlyArray<{ id: ProviderId | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
];
// <END Tharyn | CursorCLI
