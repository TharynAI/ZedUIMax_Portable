/* START> Tharyn | CursorCLI
    2026-05-03
    What: Cursor CLI binary constant for launch command support
    Why: Cursor CLI launch commands still use the legacy binary fallback until Phase 5 moves launches to portable config
    Expected: Discovery paths are not exported from constants; provider roots come from portable setup config
*/
export const CURSOR_BINARY = '/root/.local/bin/cursor-agent';
// <END Tharyn | CursorCLI
export const CLAUDE_BINARY = '/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/.bin/claude';
export const MCP_CONFIG = '/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json';

// Providers
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Add 'cursor' to ProviderId union and PROVIDERS list
    Why: First-class Cursor CLI integration as a peer of Claude/Codex
    Expected: Provider switches must enumerate cursor (assertNever guards in launcher)
*/
export type ProviderId = 'claude' | 'codex' | 'cursor';
export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
];
// <END Tharyn | CursorCLI

// Session filtering defaults
export const DEFAULT_DAYS = 30;
export const DEFAULT_LIMIT = 5000;
export const MIN_SESSION_SIZE = 4096; // Filter out empty/aborted sessions

// Environment variables for Claude launches
export const LAUNCH_ENV = {
  CLAUDE_ALLOW_ROOT_BYPASS: '1',
  CLAUDE_DISABLE_UPDATES: '1',
};

// IPC Channels
export const IPC_CHANNELS = {
  // Session operations
  GET_SESSIONS: 'sessions:get',
  GET_SESSION_DETAILS: 'sessions:details',
  SEARCH_SESSIONS: 'sessions:search',
  GET_PROJECTS: 'sessions:projects',

  // Annotation operations
  GET_ANNOTATION: 'annotation:get',
  UPDATE_ANNOTATION: 'annotation:update',
  TOGGLE_FAVORITE: 'annotation:favorite',
  ADD_TAGS: 'annotation:tags:add',
  REMOVE_TAG: 'annotation:tags:remove',
  SET_TYPE: 'annotation:type',
  GET_ALL_TAGS: 'annotation:tags:all',

  // Branch operations
  CREATE_BRANCH: 'branch:create',
  GET_BRANCHES: 'branch:get',
  LINK_BRANCH: 'branch:link',

  // Launch operations
  CONTINUE_SESSION: 'launch:continue',
  NEW_SESSION: 'launch:new',

  // Utility
  OPEN_EXTERNAL: 'util:open',
  COPY_TO_CLIPBOARD: 'util:copy',
  REFRESH_DATA: 'util:refresh',
  SHOW_ITEM_IN_FOLDER: 'util:showInFolder',

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
  * Session relocation channels for working directory override
  * 2025-12-08 Initial implementation
  */
  RELOCATE_SESSION: 'sessions:relocate',
  CHECK_DIRECTORY: 'sessions:checkDirectory',
  SELECT_DIRECTORY: 'dialog:selectDirectory',
  // <END | Sphere -> Tharyn | CC
} as const;

// Tree view grouping modes
export type TreeMode = 'type' | 'project' | 'date' | 'branches' | 'favorites';

export const TREE_MODES: { value: TreeMode; label: string }[] = [
  { value: 'type', label: 'By Type' },
  { value: 'project', label: 'By Project' },
  { value: 'date', label: 'By Date' },
  { value: 'branches', label: 'By Branches' },
  { value: 'favorites', label: 'Favorites Only' },
];
