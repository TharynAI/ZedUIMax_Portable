import { create } from 'zustand';
import type {
  CreateProEngSessionInput,
  ProEngChatMode,
  ProEngDefaultsConfig,
  ProEngProvider,
  ProEngSessionRecord,
  ProEngSessionSummary,
} from '../../shared/proeng';

type ProEngProviderFilter = 'all' | ProEngProvider;
type ProEngTreeMode = 'type' | 'date' | 'favorites';

interface ProEngState {
  sessions: ProEngSessionSummary[];
  selectedSessionId: string | null;
  selectedSession: ProEngSessionSummary | null;
  selectedRecord: ProEngSessionRecord | null;
  activePrompt: string;
  starterPrompt: string;
  defaults: (ProEngDefaultsConfig & {
    starterPromptPath: string;
    starterPrompt: string;
    templatesDirectory: string;
    sessionsDirectory: string;
  }) | null;
  searchQuery: string;
  providerFilter: ProEngProviderFilter;
  treeMode: ProEngTreeMode;
  daysFilter: number;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  selectedSessionIds: Set<string>;
  isMultiSelectMode: boolean;
  loadDefaults: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadSession: (sessionId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  setSearchQuery: (value: string) => void;
  setProviderFilter: (value: ProEngProviderFilter) => void;
  setTreeMode: (value: ProEngTreeMode) => void;
  setDaysFilter: (value: number) => void;
  selectSession: (sessionId: string | null) => Promise<void>;
  createSession: (input: CreateProEngSessionInput) => Promise<void>;
  renameSession: (name: string, sessionId?: string) => Promise<void>;
  updateSummary: (summary: string, sessionId?: string) => Promise<void>;
  updateType: (type: string, sessionId?: string) => Promise<void>;
  updateAgent: (provider: ProEngProvider) => Promise<void>;
  setChatMode: (chatMode: ProEngChatMode) => Promise<void>;
  setDebugCaptureEnabled: (enabled: boolean) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  updatePrompt: (content: string) => Promise<void>;
  savePromptTemplate: () => Promise<string | null>;
  toggleFavorite: (sessionId: string) => Promise<void>;
  addTags: (tags: string[]) => Promise<void>;
  removeTag: (tag: string) => Promise<void>;
  toggleMultiSelect: (sessionId: string) => void;
  addToSelection: (sessionId: string) => void;
  removeFromSelection: (sessionId: string) => void;
  clearMultiSelect: () => void;
  bulkDelete: () => Promise<number>;
  deleteSessions: (sessionIds: string[]) => Promise<number>;
  bulkSetType: (type: string) => Promise<void>;
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, '');
}

function applyFilters(
  sessions: ProEngSessionSummary[],
  searchQuery: string,
  providerFilter: ProEngProviderFilter,
  daysFilter: number
) {
  const cutoff = Date.now() - daysFilter * 24 * 60 * 60 * 1000;
  const query = searchQuery.trim().toLowerCase();

  return sessions.filter((session) => {
    if (providerFilter !== 'all' && session.provider !== providerFilter) {
      return false;
    }

    if (daysFilter > 0 && new Date(session.updatedAt).getTime() < cutoff) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      session.name,
      session.displaySummary,
      session.type,
      session.model,
      ...session.tags,
    ].join('\n').toLowerCase();

    return haystack.includes(query);
  });
}

export const useProEngStore = create<ProEngState>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  selectedSession: null,
  selectedRecord: null,
  activePrompt: '',
  starterPrompt: '',
  defaults: null,
  searchQuery: '',
  providerFilter: 'all',
  treeMode: 'type',
  daysFilter: 30,
  isLoading: false,
  isCreating: false,
  error: null,
  selectedSessionIds: new Set<string>(),
  isMultiSelectMode: false,

  loadDefaults: async () => {
    try {
      const defaults = await window.electronAPI.getProEngDefaults();
      set({ defaults, starterPrompt: defaults.starterPrompt });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const loadedSessions = await window.electronAPI.listProEngSessions();
      const { searchQuery, providerFilter, daysFilter } = get();
      const filtered = applyFilters(loadedSessions, searchQuery, providerFilter, daysFilter);
      const selectedSessionId = get().selectedSessionId;
      const selectedSession = selectedSessionId ? filtered.find((session) => session.id === selectedSessionId) ?? null : null;
      set({
        sessions: filtered,
        selectedSession,
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadSession: async (sessionId) => {
    if (!sessionId) {
      set({
        selectedSessionId: null,
        selectedSession: null,
        selectedRecord: null,
        activePrompt: '',
      });
      return;
    }

    try {
      const detail = await window.electronAPI.getProEngSession(sessionId);
      if (!detail) {
        set({
          selectedSessionId: null,
          selectedSession: null,
          selectedRecord: null,
          activePrompt: '',
        });
        return;
      }

      set({
        selectedSessionId: sessionId,
        selectedSession: detail.session,
        selectedRecord: detail.record,
        activePrompt: detail.activePrompt,
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  refresh: async () => {
    await get().loadDefaults();
    await get().loadSessions();
    if (get().selectedSessionId) {
      await get().loadSession(get().selectedSessionId);
    }
  },

  setSearchQuery: (value) => {
    set({ searchQuery: value });
    void get().loadSessions();
  },

  setProviderFilter: (value) => {
    set({ providerFilter: value });
    void get().loadSessions();
  },

  setTreeMode: (value) => set({ treeMode: value }),

  setDaysFilter: (value) => {
    set({ daysFilter: value });
    void get().loadSessions();
  },

  selectSession: async (sessionId) => {
    set({
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
    });
    await get().loadSession(sessionId);
  },

  createSession: async (input) => {
    set({ isCreating: true, error: null });
    try {
      const detail = await window.electronAPI.createProEngSession(input);
      await get().loadSessions();
      set({
        selectedSessionId: detail.session.id,
        selectedSession: detail.session,
        selectedRecord: detail.record,
        activePrompt: detail.activePrompt,
        isCreating: false,
      });
    } catch (error) {
      set({ error: String(error), isCreating: false });
    }
  },

  renameSession: async (name, sessionId) => {
    const selectedSessionId = sessionId || get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, { name });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  updateSummary: async (summary, sessionId) => {
    const selectedSessionId = sessionId || get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, { userSummary: summary });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  updateType: async (type, sessionId) => {
    const selectedSessionId = sessionId || get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, { type });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  updateAgent: async (provider) => {
    const selectedSessionId = get().selectedSessionId;
    const defaults = get().defaults;
    if (!selectedSessionId || !defaults) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, {
      provider,
      model: defaults.defaultModels[provider],
    });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  setChatMode: async (chatMode) => {
    const selectedSessionId = get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, { chatMode });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  setDebugCaptureEnabled: async (enabled) => {
    const selectedSessionId = get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(selectedSessionId, { debugCaptureEnabled: enabled });
    if (!detail) {
      return;
    }
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  sendMessage: async (content) => {
    const selectedSessionId = get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    const detail = await window.electronAPI.sendProEngMessage(selectedSessionId, { content });
    if (!detail) {
      return;
    }

    await get().loadSessions();
    set({
      selectedSession: detail.session,
      selectedRecord: detail.record,
      activePrompt: detail.activePrompt,
    });
  },

  updatePrompt: async (content) => {
    const selectedSessionId = get().selectedSessionId;
    if (!selectedSessionId) {
      return;
    }

    set({ activePrompt: content });
    const detail = await window.electronAPI.updateProEngPrompt(selectedSessionId, content);
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({
      selectedSession: detail.session,
      selectedRecord: detail.record,
      activePrompt: detail.activePrompt,
    });
  },

  savePromptTemplate: async () => {
    const selectedSessionId = get().selectedSessionId;
    if (!selectedSessionId) {
      return null;
    }

    const result = await window.electronAPI.saveProEngPromptTemplate({ sessionId: selectedSessionId });
    return result?.filePath || null;
  },

  toggleFavorite: async (sessionId) => {
    const current = get().sessions.find((session) => session.id === sessionId);
    if (!current) {
      return;
    }

    const detail = await window.electronAPI.updateProEngSession(sessionId, {
      isFavorite: !current.isFavorite,
    });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    if (get().selectedSessionId === sessionId) {
      set({ selectedSession: detail.session, selectedRecord: detail.record });
    }
  },

  addTags: async (tags) => {
    const selectedRecord = get().selectedRecord;
    if (!selectedRecord) {
      return;
    }

    const nextTags = Array.from(new Set([
      ...selectedRecord.tags,
      ...tags.map(normalizeTag).filter(Boolean),
    ]));

    const detail = await window.electronAPI.updateProEngSession(selectedRecord.id, { tags: nextTags });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  removeTag: async (tag) => {
    const selectedRecord = get().selectedRecord;
    if (!selectedRecord) {
      return;
    }

    const nextTags = selectedRecord.tags.filter((existing) => existing !== normalizeTag(tag));
    const detail = await window.electronAPI.updateProEngSession(selectedRecord.id, { tags: nextTags });
    if (!detail) {
      return;
    }
    await get().loadSessions();
    set({ selectedSession: detail.session, selectedRecord: detail.record });
  },

  toggleMultiSelect: (sessionId) => {
    set((state) => {
      const next = new Set(state.selectedSessionIds);
      if (next.size === 0 && state.selectedSessionId && state.selectedSessionId !== sessionId) {
        next.add(state.selectedSessionId);
      }
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }

      return {
        selectedSessionIds: next,
        isMultiSelectMode: next.size > 0,
      };
    });
  },

  addToSelection: (sessionId) => {
    set((state) => {
      const next = new Set(state.selectedSessionIds);
      if (next.size === 0 && state.selectedSessionId && state.selectedSessionId !== sessionId) {
        next.add(state.selectedSessionId);
      }
      next.add(sessionId);
      return {
        selectedSessionIds: next,
        isMultiSelectMode: next.size > 0,
      };
    });
  },

  removeFromSelection: (sessionId) => {
    set((state) => {
      const next = new Set(state.selectedSessionIds);
      next.delete(sessionId);
      return {
        selectedSessionIds: next,
        isMultiSelectMode: next.size > 0,
      };
    });
  },

  clearMultiSelect: () => {
    set({
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
    });
  },

  bulkDelete: async () => {
    const sessionIds = Array.from(get().selectedSessionIds);
    const deletedCount = await get().deleteSessions(sessionIds);
    set({
      selectedSessionIds: new Set<string>(),
      isMultiSelectMode: false,
    });
    return deletedCount;
  },

  deleteSessions: async (sessionIds) => {
    const deletedCount = await window.electronAPI.deleteProEngSessions(sessionIds);
    await get().loadSessions();
    const selectedSessionId = get().selectedSessionId;
    if (selectedSessionId && sessionIds.includes(selectedSessionId)) {
      await get().loadSession(null);
    }
    return deletedCount;
  },

  bulkSetType: async (type) => {
    const sessionIds = Array.from(get().selectedSessionIds);
    await Promise.all(sessionIds.map((sessionId) => window.electronAPI.updateProEngSession(sessionId, { type })));
    await get().loadSessions();
    if (get().selectedSessionId && sessionIds.includes(get().selectedSessionId!)) {
      await get().loadSession(get().selectedSessionId);
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as any).__PROENG_STORE__ = useProEngStore;
}
