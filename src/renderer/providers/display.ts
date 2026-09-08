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

/* START> Tharyn | CursX
    2026-09-07
    What: Badge a session by its PRODUCT when it has one, falling back to the provider.
    Why:  CursX sessions are keyed `codex:` deliberately, so getProviderDisplay would badge them
          "Codex" - hiding the only thing that distinguishes them, and hiding it in the one place
          the user chooses which session to resume. A distinct tint matters as much as the label:
          the two are otherwise identical rows.
          Note getProviderDisplay falls back to `claude` for an unknown id, so an unrecognised
          product must NOT be routed through it - it would silently mislabel as Claude.
    Expected: CursX rows read "CursX" in their own colour; Codex, Claude and Cursor unchanged.
*/
const productMap: Record<string, ProviderDisplay> = {
  cursx: {
    id: 'codex',            // still Codex-family for anything keyed off the id
    label: 'CursX',
    assistantName: 'CursX',
    badgeBgClass: 'bg-teal-900/20',
    badgeBorderClass: 'border-teal-700/40',
  },
};

export function getSessionDisplay(
  providerId: ProviderId,
  product?: string | null,
): ProviderDisplay {
  if (product && productMap[product]) return productMap[product]!;
  return getProviderDisplay(providerId);
}

export const PRODUCT_FILTER_OPTIONS: ReadonlyArray<{ id: string; label: string }> =
  Object.entries(productMap).map(([id, d]) => ({ id, label: d.label }));
// <END Tharyn | CursX

export const PROVIDER_FILTER_OPTIONS: ReadonlyArray<{ id: ProviderId | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
];
// <END Tharyn | CursorCLI
