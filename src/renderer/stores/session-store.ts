/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 2: Enhanced Branch Visualization
* Added branches data loading for tree visualization
* 2025-12-02 Initial implementation
* Phase 3: Session Message Search
* Added message search state and actions
* 2025-12-02 Message search implementation
*/
import { create } from 'zustand';
import type { SessionViewModel, TagInfo, ProjectInfo, BranchInfo, MessageSearchResult } from '../types/session';
import { useSettingsStore } from './settings-store';

type ProviderFilter = 'all' | 'claude' | 'codex' | 'cursor';

type TreeMode = 'type' | 'project' | 'date' | 'branches' | 'favorites';

/* START> Tharyn | CursorCLI
    2026-05-03
    What: Module-scoped one-shot hydration flag for OD-1 providerFilter persistence
    Why: Avoid re-hydrating on every loadSessions; users may legitimately set 'all' later
    Expected: First successful hydration flips flag; subsequent loadSessions skip the hydration block
*/
let hasHydratedProviderFilter = false;
// <END Tharyn | CursorCLI

interface SessionStore {
  // Data
  sessions: SessionViewModel[];
  projects: ProjectInfo[];
  tags: TagInfo[];
  types: TagInfo[];
  branches: BranchInfo[];  // Branch relationships from database
  isLoading: boolean;
  error: string | null;
// <END | Sphere -> Tharyn | CC

  // Selection
  selectedSessionId: string | null;
  selectedSession: SessionViewModel | null;

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Bulk Operations - Multi-select support
  * 2025-12-02 Initial implementation
  */
  // Multi-selection for bulk operations
  selectedSessionIds: Set<string>;
  isMultiSelectMode: boolean;
  // <END | Sphere -> Tharyn | CC

  // Filters
  searchQuery: string;
  treeMode: TreeMode;
  daysFilter: number;
  providerFilter: ProviderFilter;

  // Actions
  loadSessions: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadTags: () => Promise<void>;
  loadTypes: () => Promise<void>;
  loadBranches: () => Promise<void>;  // Load branch relationships
  selectSession: (sessionId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTreeMode: (mode: TreeMode) => void;
  setDaysFilter: (days: number) => void;
  setProviderFilter: (provider: ProviderFilter) => void;
  refreshData: () => Promise<void>;

  // Session actions
  toggleFavorite: (sessionId: string) => Promise<void>;
  updateAnnotation: (sessionId: string, data: { userSummary?: string; notes?: string; type?: string }) => Promise<void>;
  addTags: (sessionId: string, tags: string[]) => Promise<void>;
  removeTag: (sessionId: string, tag: string) => Promise<void>;
  continueSession: (sessionId: string) => Promise<void>;
  branchSession: (sessionId: string, branchName?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  cleanupOldestUngrouped: (limit: number) => Promise<number>;

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Bulk Operations actions
  * 2025-12-02 Initial implementation
  */
  // Multi-select actions
  toggleMultiSelect: (sessionId: string) => void;
  addToSelection: (sessionId: string) => void;
  removeFromSelection: (sessionId: string) => void;
  selectRange: (toSessionId: string) => void;
  clearMultiSelect: () => void;
  selectAll: () => void;

  // Bulk operations
  bulkDelete: () => Promise<number>;
  bulkAddTags: (tags: string[]) => Promise<void>;
  bulkSetType: (type: string) => Promise<void>;
  createType: (name: string) => Promise<void>;
  renameType: (oldName: string, newName: string) => Promise<number>;
  deleteType: (name: string) => Promise<void>;
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Session Message Search
  * State and actions for full-text message search
  * 2025-12-02 Initial implementation
  */
  // Message search state
  messageSearchEnabled: boolean;
  messageSearchResults: MessageSearchResult[];
  messageSearchLoading: boolean;
  targetMessageIndex: number | null;  // For jumping to specific message in conversation viewer

  // Message search actions
  setMessageSearchEnabled: (enabled: boolean) => void;
  searchMessages: (query: string) => Promise<void>;
  clearMessageSearch: () => void;
  setTargetMessage: (sessionId: string, messageIndex: number) => void;
  clearTargetMessage: () => void;
  // <END | Sphere -> Tharyn | CC
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  sessions: [],
  projects: [],
  tags: [],
  types: [],
  branches: [],
  isLoading: false,
  error: null,
  selectedSessionId: null,
  selectedSession: null,
  selectedSessionIds: new Set<string>(),
  isMultiSelectMode: false,
  searchQuery: '',
  treeMode: 'type',
  daysFilter: 30,
  providerFilter: 'all',
  // Message search initial state
  messageSearchEnabled: false,
  messageSearchResults: [],
  messageSearchLoading: false,
  targetMessageIndex: null,

  // Load sessions from main process
  loadSessions: async () => {
    /* START> Tharyn | CursorCLI
        2026-05-03
        What: Hydrate providerFilter from settings on first call (OD-1)
        Why: settings-store loads asynchronously; first loadSessions may run before hydration
        Expected: If settings have a saved providerFilter and store is still default 'all', adopt it
    */
    if (!hasHydratedProviderFilter) {
      hasHydratedProviderFilter = true;
      try {
        const settingsState = useSettingsStore.getState();
        if (settingsState.isLoaded) {
          const saved = settingsState.settings.providerFilter;
          if (saved && saved !== get().providerFilter) {
            set({ providerFilter: saved });
          }
        } else {
          // settings not yet loaded; defer hydration to next loadSessions call
          hasHydratedProviderFilter = false;
        }
      } catch (err) {
        console.error('providerFilter hydration failed:', err);
      }
    }
    // <END Tharyn | CursorCLI
    set({ isLoading: true, error: null });
    try {
      const { daysFilter, searchQuery, providerFilter } = get();
      const providerArg = providerFilter === 'all' ? undefined : [providerFilter];

      let sessions: SessionViewModel[];

      if (searchQuery) {
        sessions = await window.electronAPI.searchSessions(searchQuery);
      } else {
        sessions = await window.electronAPI.getSessions(daysFilter, undefined, providerArg);
      }

      // Convert timestamps to Date objects
      sessions = sessions.map(s => ({
        ...s,
        timestamp: new Date(s.timestamp),
        annotation: s.annotation ? {
          ...s.annotation,
          createdAt: new Date(s.annotation.createdAt),
          updatedAt: new Date(s.annotation.updatedAt),
        } : undefined,
      }));

      set({ sessions, isLoading: false });

      // Update selected session if it exists
      const { selectedSessionId } = get();
      if (selectedSessionId) {
        const selected = sessions.find(s => s.sessionId === selectedSessionId);
        set({ selectedSession: selected || null });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Load projects
  loadProjects: async () => {
    try {
      const { providerFilter } = get();
      const providerArg = providerFilter === 'all' ? undefined : [providerFilter];
      const projects = await window.electronAPI.getProjects(providerArg);
      set({
        projects: projects.map((p: any) => ({
          ...p,
          lastActivity: p.lastActivity ? new Date(p.lastActivity) : null,
        })),
      });
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  },

  // Load tags
  loadTags: async () => {
    try {
      const tags = await window.electronAPI.getAllTags();
      set({ tags });
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  },

  loadTypes: async () => {
    try {
      const types = await window.electronAPI.getAllTypes();
      set({ types });
    } catch (error) {
      console.error('Failed to load types:', error);
    }
  },

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Load branch relationships for tree visualization
  * 2025-12-02 Initial implementation
  */
  // Load branches
  loadBranches: async () => {
    try {
      const branches = await window.electronAPI.getBranches();
      set({
        branches: branches.map((b: any) => ({
          ...b,
          createdAt: new Date(b.createdAt),
          linkedAt: b.linkedAt ? new Date(b.linkedAt) : undefined,
        })),
      });
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  },
  // <END | Sphere -> Tharyn | CC

  // Select a session
  selectSession: (sessionId) => {
    const { sessions } = get();
    const selected = sessionId ? sessions.find(s => s.sessionId === sessionId) : null;
    set({
      selectedSessionId: sessionId,
      selectedSession: selected || null,
      // Clear multi-select when doing a normal single selection
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
    });
  },

  // Set search query
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().loadSessions();
  },

  // Set tree mode
  setTreeMode: (mode) => {
    set({ treeMode: mode });
  },

  // Set days filter
  setDaysFilter: (days) => {
    set({ daysFilter: days });
    get().loadSessions();
  },

  // Set provider filter
  setProviderFilter: (provider) => {
    set({ providerFilter: provider });
    /* START> Tharyn | CursorCLI
        2026-05-03
        What: Persist provider filter to settings.json via settings-store (OD-1)
        Why: User preference should survive app restart
        Expected: settings.json gains providerFilter key; reload at startup hydrates back
    */
    try {
      useSettingsStore.getState().saveSettings({ providerFilter: provider });
    } catch (err) {
      console.error('Failed to persist providerFilter:', err);
    }
    // <END Tharyn | CursorCLI
    get().loadSessions();
    get().loadProjects();
  },

  // Refresh all data
  refreshData: async () => {
    await Promise.all([
      get().loadSessions(),
      get().loadProjects(),
      get().loadTags(),
      get().loadTypes(),
      get().loadBranches(),
    ]);
  },

  // Toggle favorite
  toggleFavorite: async (sessionId) => {
    try {
      const isFavorite = await window.electronAPI.toggleFavorite(sessionId);

      // Update local state
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.sessionId === sessionId
            ? {
                ...s,
                annotation: {
                  ...s.annotation!,
                  isFavorite,
                  sessionId,
                  userSummary: s.annotation?.userSummary || '',
                  notes: s.annotation?.notes || '',
                  tags: s.annotation?.tags || [],
                  createdAt: s.annotation?.createdAt || new Date(),
                  updatedAt: new Date(),
                },
              }
            : s
        ),
        selectedSession: state.selectedSession?.sessionId === sessionId
          ? {
              ...state.selectedSession,
              annotation: {
                ...state.selectedSession.annotation!,
                isFavorite,
                sessionId,
                userSummary: state.selectedSession.annotation?.userSummary || '',
                notes: state.selectedSession.annotation?.notes || '',
                tags: state.selectedSession.annotation?.tags || [],
                createdAt: state.selectedSession.annotation?.createdAt || new Date(),
                updatedAt: new Date(),
              },
            }
          : state.selectedSession,
      }));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  },

  // Update annotation
  updateAnnotation: async (sessionId, data) => {
    try {
      const annotation = await window.electronAPI.updateAnnotation(sessionId, data);

      // Update local state
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.sessionId === sessionId
            ? {
                ...s,
                annotation: {
                  ...annotation,
                  createdAt: new Date(annotation.createdAt),
                  updatedAt: new Date(annotation.updatedAt),
                },
                displaySummary: annotation.userSummary || s.autoSummary || s.firstMessage || '(No summary)',
              }
            : s
        ),
        selectedSession: state.selectedSession?.sessionId === sessionId
          ? {
              ...state.selectedSession,
              annotation: {
                ...annotation,
                createdAt: new Date(annotation.createdAt),
                updatedAt: new Date(annotation.updatedAt),
              },
              displaySummary: annotation.userSummary || state.selectedSession.autoSummary || state.selectedSession.firstMessage || '(No summary)',
            }
          : state.selectedSession,
      }));

      // Reload tags if type changed
      if (data.type !== undefined) {
        get().loadTags();
        get().loadTypes();
      }
    } catch (error) {
      console.error('Failed to update annotation:', error);
    }
  },

  // Add tags
  addTags: async (sessionId, tags) => {
    try {
      const allTags = await window.electronAPI.addTags(sessionId, tags);

      // Update local state
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.sessionId === sessionId
            ? {
                ...s,
                annotation: {
                  ...s.annotation!,
                  tags: allTags,
                  sessionId,
                  userSummary: s.annotation?.userSummary || '',
                  notes: s.annotation?.notes || '',
                  isFavorite: s.annotation?.isFavorite || false,
                  createdAt: s.annotation?.createdAt || new Date(),
                  updatedAt: new Date(),
                },
              }
            : s
        ),
        selectedSession: state.selectedSession?.sessionId === sessionId
          ? {
              ...state.selectedSession,
              annotation: {
                ...state.selectedSession.annotation!,
                tags: allTags,
                sessionId,
                userSummary: state.selectedSession.annotation?.userSummary || '',
                notes: state.selectedSession.annotation?.notes || '',
                isFavorite: state.selectedSession.annotation?.isFavorite || false,
                createdAt: state.selectedSession.annotation?.createdAt || new Date(),
                updatedAt: new Date(),
              },
            }
          : state.selectedSession,
      }));

      // Reload tags
      get().loadTags();
    } catch (error) {
      console.error('Failed to add tags:', error);
    }
  },

  // Remove tag
  removeTag: async (sessionId, tag) => {
    try {
      const remainingTags = await window.electronAPI.removeTag(sessionId, tag);

      // Update local state
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.sessionId === sessionId
            ? {
                ...s,
                annotation: s.annotation ? { ...s.annotation, tags: remainingTags } : undefined,
              }
            : s
        ),
        selectedSession: state.selectedSession?.sessionId === sessionId
          ? {
              ...state.selectedSession,
              annotation: state.selectedSession.annotation ? { ...state.selectedSession.annotation, tags: remainingTags } : undefined,
            }
          : state.selectedSession,
      }));

      // Reload tags
      get().loadTags();
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  },

  // Continue session
  continueSession: async (sessionId) => {
    try {
      const { codexVariant } = useSettingsStore.getState().settings as any;
      await window.electronAPI.continueSession(sessionId, codexVariant);
    } catch (error) {
      console.error('Failed to continue session:', error);
    }
  },

  /* START> 2025-12-05 | Sphere -> Tharyn | CC
  * Branch session: Creates new session file with copied content
  * Copies JSONL file with new UUID, creates branch record, launches new session
  * 2025-12-05 Initial implementation
  */
  // Branch session
  branchSession: async (sessionId, branchName) => {
    console.log('[Store] branchSession called with:', sessionId, branchName);
    try {
      console.log('[Store] Calling window.electronAPI.branchSession...');
      const { codexVariant } = useSettingsStore.getState().settings as any;
      const result = await window.electronAPI.branchSession(sessionId, branchName, codexVariant);
      console.log('[Store] branchSession result:', result);

      if (!result.success) {
        console.error('[Store] Branch failed:', result.error);
        return;
      }

      console.log(`[Store] Branched session ${sessionId} to new session ${result.newSessionId}`);

      // Reload sessions and branches to show the new session
      await Promise.all([
        get().loadSessions(),
        get().loadBranches(),
      ]);
    } catch (error) {
      console.error('[Store] Failed to branch session:', error);
    }
  },
  // <END | Sphere -> Tharyn | CC

  // Delete session
  deleteSession: async (sessionId) => {
    try {
      const result = await window.electronAPI.deleteSession(sessionId);

      if (result?.deleted) {
        // Remove from local state
        set((state) => ({
          sessions: state.sessions.filter(s => s.sessionId !== sessionId),
          selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
          selectedSession: state.selectedSession?.sessionId === sessionId ? null : state.selectedSession,
        }));

        // Reload projects to update counts
        get().loadProjects();

        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  },

  cleanupOldestUngrouped: async (limit) => {
    const deleteLimit = Math.max(1, Math.floor(limit));
    const { daysFilter } = get();

    try {
      const allProviderSessions = await window.electronAPI.getSessions(daysFilter, undefined, undefined);
      const candidates: SessionViewModel[] = allProviderSessions
        .map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp),
          annotation: s.annotation ? {
            ...s.annotation,
            createdAt: new Date(s.annotation.createdAt),
            updatedAt: new Date(s.annotation.updatedAt),
          } : undefined,
        }))
        .filter((session: SessionViewModel) => (session.annotation?.type || 'Ungrouped') === 'Ungrouped')
        .sort((a: SessionViewModel, b: SessionViewModel) => a.timestamp.getTime() - b.timestamp.getTime())
        .slice(0, deleteLimit);

      let deletedCount = 0;
      const deletedIds = new Set<string>();

      for (const session of candidates) {
        try {
          const result = await window.electronAPI.deleteSession(session.sessionId);
          if (result?.deleted) {
            deletedCount++;
            deletedIds.add(session.sessionId);
          }
        } catch (error) {
          console.error(`Failed to delete ungrouped session ${session.sessionId}:`, error);
        }
      }

      set((state) => ({
        sessions: state.sessions.filter(s => !deletedIds.has(s.sessionId)),
        selectedSessionIds: new Set([...state.selectedSessionIds].filter(id => !deletedIds.has(id))),
        selectedSessionId: deletedIds.has(state.selectedSessionId || '') ? null : state.selectedSessionId,
        selectedSession: deletedIds.has(state.selectedSession?.sessionId || '') ? null : state.selectedSession,
      }));

      await get().refreshData();
      return deletedCount;
    } catch (error) {
      console.error('Failed to clean up ungrouped sessions:', error);
      return 0;
    }
  },

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Bulk Operations implementation
  * Multi-select and bulk actions for sessions
  * 2025-12-02 Initial implementation
  */

  // Toggle multi-select for a session (Ctrl+Click)
  toggleMultiSelect: (sessionId) => {
    set((state) => {
      const newSet = new Set(state.selectedSessionIds);

      // When entering multi-select mode, include the currently selected session
      if (newSet.size === 0 && state.selectedSessionId && state.selectedSessionId !== sessionId) {
        newSet.add(state.selectedSessionId);
      }

      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return {
        selectedSessionIds: newSet,
        isMultiSelectMode: newSet.size > 0,
      };
    });
  },

  // Add to selection (Shift+Click)
  addToSelection: (sessionId) => {
    set((state) => {
      const newSet = new Set(state.selectedSessionIds);

      // When entering multi-select mode, include the currently selected session
      if (newSet.size === 0 && state.selectedSessionId && state.selectedSessionId !== sessionId) {
        newSet.add(state.selectedSessionId);
      }

      newSet.add(sessionId);
      return {
        selectedSessionIds: newSet,
        isMultiSelectMode: newSet.size > 0,
      };
    });
  },

  // Remove from selection (Ctrl+Click)
  removeFromSelection: (sessionId) => {
    set((state) => {
      const newSet = new Set(state.selectedSessionIds);
      newSet.delete(sessionId);
      return {
        selectedSessionIds: newSet,
        isMultiSelectMode: newSet.size > 0,
      };
    });
  },

  // Select range of sessions (Shift+Click)
  selectRange: (toSessionId) => {
    const { sessions, selectedSessionId, selectedSessionIds } = get();
    if (!selectedSessionId) {
      // No anchor, just select this one
      set({
        selectedSessionIds: new Set([toSessionId]),
        isMultiSelectMode: true,
      });
      return;
    }

    // Find indices
    const fromIndex = sessions.findIndex(s => s.sessionId === selectedSessionId);
    const toIndex = sessions.findIndex(s => s.sessionId === toSessionId);

    if (fromIndex === -1 || toIndex === -1) return;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);

    const newSet = new Set(selectedSessionIds);
    for (let i = start; i <= end; i++) {
      newSet.add(sessions[i].sessionId);
    }

    set({
      selectedSessionIds: newSet,
      isMultiSelectMode: true,
    });
  },

  // Clear multi-selection
  clearMultiSelect: () => {
    set({
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
    });
  },

  // Select all visible sessions
  selectAll: () => {
    const { sessions } = get();
    set({
      selectedSessionIds: new Set(sessions.map(s => s.sessionId)),
      isMultiSelectMode: true,
    });
  },

  // Bulk delete selected sessions
  bulkDelete: async () => {
    const { selectedSessionIds } = get();
    let deletedCount = 0;
    const deletedIds = new Set<string>();

    for (const sessionId of selectedSessionIds) {
      try {
        const result = await window.electronAPI.deleteSession(sessionId);
        if (result?.deleted) {
          deletedCount++;
          deletedIds.add(sessionId);
        }
      } catch (error) {
        console.error(`Failed to delete session ${sessionId}:`, error);
      }
    }

    // Update local state
    set((state) => ({
      sessions: state.sessions.filter(s => !deletedIds.has(s.sessionId)),
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
      selectedSessionId: deletedIds.has(state.selectedSessionId || '') ? null : state.selectedSessionId,
      selectedSession: deletedIds.has(state.selectedSession?.sessionId || '') ? null : state.selectedSession,
    }));

    // Reload projects
    get().loadProjects();

    return deletedCount;
  },

  // Bulk add tags to selected sessions
  bulkAddTags: async (tags) => {
    const { selectedSessionIds } = get();

    for (const sessionId of selectedSessionIds) {
      try {
        await window.electronAPI.addTags(sessionId, tags);
      } catch (error) {
        console.error(`Failed to add tags to session ${sessionId}:`, error);
      }
    }

    // Reload sessions to reflect changes
    get().loadSessions();
    get().loadTags();
    get().loadTypes();
  },

  // Bulk set type for selected sessions
  bulkSetType: async (type) => {
    const { selectedSessionIds } = get();

    for (const sessionId of selectedSessionIds) {
      try {
        await window.electronAPI.updateAnnotation(sessionId, { type });
      } catch (error) {
        console.error(`Failed to set type for session ${sessionId}:`, error);
      }
    }

    // Reload sessions to reflect changes
    get().loadSessions();
    get().loadTypes();
  },

  createType: async (name) => {
    await window.electronAPI.createType(name);
    await get().loadTypes();
  },

  /* START> Tharyn | ZedUI TypeRename
      2026-01-11
      What: Rename a type across all sessions that have it
      Why: Allow organizing/consolidating types without editing each session
      Expected: All sessions with oldName type update to newName
  */
  renameType: async (oldName, newName) => {
    const count = await window.electronAPI.renameType(oldName, newName);
    await get().loadSessions();
    await get().loadTypes();
    return count;
  },

  deleteType: async (name) => {
    await window.electronAPI.deleteType(name);
    await get().loadTypes();
    await get().loadSessions();
  },
  // <END Tharyn | ZedUI TypeRename
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Session Message Search implementation
  * 2025-12-02 Initial implementation
  */
  // Toggle message search mode
  setMessageSearchEnabled: (enabled) => {
    set({
      messageSearchEnabled: enabled,
      messageSearchResults: [],
      messageSearchLoading: false,
    });
  },

  // Perform message search
  searchMessages: async (query) => {
    if (query.length < 2) {
      set({ messageSearchResults: [], messageSearchLoading: false });
      return;
    }

    set({ messageSearchLoading: true });

    try {
      const { daysFilter, providerFilter } = get();
      const providerArg = providerFilter === 'all' ? undefined : [providerFilter];
      const results = await window.electronAPI.searchMessages(query, 50, daysFilter, providerArg);

      // Convert timestamps to Date objects
      const processedResults = results.map((r: any) => ({
        ...r,
        timestamp: r.timestamp ? new Date(r.timestamp) : undefined,
      }));

      set({ messageSearchResults: processedResults, messageSearchLoading: false });
    } catch (error) {
      console.error('Message search failed:', error);
      set({ messageSearchResults: [], messageSearchLoading: false });
    }
  },

  // Clear message search results
  clearMessageSearch: () => {
    set({
      messageSearchResults: [],
      messageSearchLoading: false,
    });
  },

  // Set target message for jumping to in conversation viewer
  setTargetMessage: (sessionId, messageIndex) => {
    set({
      selectedSessionId: sessionId,
      targetMessageIndex: messageIndex,
    });
    // Also update selectedSession
    const { sessions } = get();
    const selected = sessions.find(s => s.sessionId === sessionId);
    set({ selectedSession: selected || null });
  },

  // Clear target message after scrolling to it
  clearTargetMessage: () => {
    set({ targetMessageIndex: null });
  },
  // <END | Sphere -> Tharyn | CC
}));

// Expose store on window for CDP testing
if (typeof window !== 'undefined') {
  (window as any).__SESSION_STORE__ = useSessionStore;
}
