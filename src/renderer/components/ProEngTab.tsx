import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import {
  CheckCircle2,
  Blocks,
  Bot,
  ChevronDown,
  Copy,
  Edit3,
  FilePlus2,
  FolderPlus,
  Save,
  Search,
  Send,
  Sparkles,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useConfirmDialogStore } from './ConfirmDialog';
import { useInputDialogStore } from './InputDialog';
import { useManageTypesDialogStore } from './ManageTypesDialog';
import { useTypePickerStore } from './TypePickerDialog';
import { useProEngStore } from '../stores/proeng-store';
import { useSessionStore } from '../stores/session-store';
import type { ProEngProvider, ProEngSessionSummary } from '../../shared/proeng';

type ProEngTreeMode = 'type' | 'date' | 'favorites';
type ContextMenuState = { x: number; y: number; sessionId: string } | null;

const PROVIDER_FILTERS: Array<{ id: 'all' | ProEngProvider; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
];

const DAYS_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
];

const TREE_MODE_OPTIONS: Array<{ value: ProEngTreeMode; label: string }> = [
  { value: 'type', label: 'By Type' },
  { value: 'date', label: 'By Date' },
  { value: 'favorites', label: 'Favorites Only' },
];

function providerBadge(provider: ProEngProvider) {
  if (provider === 'anthropic') {
    return 'bg-[#3b2716] text-[#ffc88e]';
  }
  if (provider === 'openai') {
    return 'bg-[#183032] text-[#94f5ea]';
  }
  return 'bg-[#2c2240] text-[#d4b4ff]';
}

function relativeTime(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function buildTreeGroups(sessions: ProEngSessionSummary[], treeMode: ProEngTreeMode, typeNames: string[]) {
  if (treeMode === 'favorites') {
    const favorites = sessions.filter((session) => session.isFavorite);
    return favorites.length > 0
      ? [{ id: 'favorites', label: 'Favorites', sessions: favorites }]
      : [];
  }

  if (treeMode === 'date') {
    const now = Date.now();
    const groups: Array<{ id: string; label: string; sessions: ProEngSessionSummary[] }> = [
      { id: 'today', label: 'Today', sessions: [] },
      { id: 'week', label: 'This Week', sessions: [] },
      { id: 'month', label: 'This Month', sessions: [] },
      { id: 'older', label: 'Older', sessions: [] },
    ];

    for (const session of sessions) {
      const ageMs = now - new Date(session.updatedAt).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        groups[0].sessions.push(session);
      } else if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        groups[1].sessions.push(session);
      } else if (ageMs < 30 * 24 * 60 * 60 * 1000) {
        groups[2].sessions.push(session);
      } else {
        groups[3].sessions.push(session);
      }
    }

    return groups.filter((group) => group.sessions.length > 0);
  }

  const byType = new Map<string, ProEngSessionSummary[]>();
  for (const typeName of typeNames) {
    byType.set(typeName, []);
  }
  for (const session of sessions) {
    const typeName = session.type || 'Uncategorized';
    if (!byType.has(typeName)) {
      byType.set(typeName, []);
    }
    byType.get(typeName)!.push(session);
  }
  if (!byType.has('Uncategorized') && sessions.some((session) => !session.type)) {
    byType.set('Uncategorized', []);
  }

  return Array.from(byType.entries())
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    })
    .map(([label, groupedSessions]) => ({ id: `type-${label}`, label, sessions: groupedSessions }));
}

function ProEngTab() {
  const {
    sessions,
    selectedSessionId,
    selectedSession,
    selectedRecord,
    activePrompt,
    searchQuery,
    providerFilter,
    treeMode,
    daysFilter,
    isLoading,
    selectedSessionIds,
    isMultiSelectMode,
    loadDefaults,
    loadSessions,
    selectSession,
    addToSelection,
    removeFromSelection,
    toggleMultiSelect,
    setSearchQuery,
    setProviderFilter,
    setTreeMode,
    setDaysFilter,
    createSession,
    renameSession,
    updateSummary,
    updateType,
    updateAgent,
    updatePrompt,
    toggleFavorite,
    addTags,
    removeTag,
    bulkDelete,
    deleteSessions,
    sendMessage,
    setChatMode,
    setDebugCaptureEnabled,
  } = useProEngStore();
  const { types } = useSessionStore();
  const openManageTypes = useManageTypesDialogStore((state) => state.open);
  const showInputDialog = useInputDialogStore((state) => state.show);
  const showConfirmDialog = useConfirmDialogStore((state) => state.show);

  const [treeWidth, setTreeWidth] = useState(370);
  const [chatWidth, setChatWidth] = useState(500);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [composer, setComposer] = useState('');
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [isBriefTree, setIsBriefTree] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    void (async () => {
      await loadDefaults();
      await loadSessions();
    })();
  }, [loadDefaults, loadSessions]);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      void selectSession(sessions[0].id);
    }
  }, [sessions, selectedSessionId, selectSession]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const treeGroups = useMemo(
    () => buildTreeGroups(sessions, treeMode, types.map((type) => type.name)),
    [sessions, treeMode, types]
  );

  useEffect(() => {
    setCollapsedGroups((previous) => {
      const validIds = new Set(treeGroups.map((group) => group.id));
      const next = new Set(Array.from(previous).filter((groupId) => validIds.has(groupId)));
      for (const group of treeGroups) {
        if (!previous.has(group.id)) {
          next.add(group.id);
        }
      }
      return next;
    });
  }, [treeGroups]);

  useEffect(() => {
    setPromptDraft(activePrompt);
    setSaveState('idle');
  }, [selectedSessionId, activePrompt]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }
    if (promptDraft === activePrompt) {
      return;
    }

    setSaveState('saving');
    const timeout = window.setTimeout(() => {
      void updatePrompt(promptDraft).then(() => {
        setSaveState('saved');
        setSaveMessage('Autosaved');
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [promptDraft, activePrompt, selectedSessionId, updatePrompt]);

  const contextSession = contextMenu
    ? sessions.find((session) => session.id === contextMenu.sessionId) ?? null
    : null;
  const visibleMessages = useMemo(() => {
    if (!selectedRecord) {
      return [];
    }
    if (selectedRecord.chatMode === 'debug') {
      return selectedRecord.messages;
    }
    return selectedRecord.messages.filter((message) => message.role !== 'system');
  }, [selectedRecord]);

  const startResize = (target: 'tree' | 'chat') => (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startTreeWidth = treeWidth;
    const startChatWidth = chatWidth;

    const onMove = (moveEvent: MouseEvent) => {
      if (target === 'tree') {
        setTreeWidth(Math.min(520, Math.max(300, startTreeWidth + (moveEvent.clientX - startX))));
        return;
      }

      setChatWidth(Math.max(360, startChatWidth + (moveEvent.clientX - startX)));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleDeleteSelection = () => {
    const targetIds = isMultiSelectMode && selectedSessionIds.size > 0
      ? Array.from(selectedSessionIds)
      : contextSession
        ? [contextSession.id]
        : selectedSessionId
          ? [selectedSessionId]
          : [];
    const count = targetIds.length;
    if (count === 0) {
      return;
    }
    showConfirmDialog({
      title: count > 1 ? 'Delete ProEng Sessions' : 'Delete ProEng Session',
      message: `Are you sure you want to permanently delete ${count} ProEng session${count > 1 ? 's' : ''}?`,
      detail: 'This removes the session.json and active-prompt.md files from resources/proeng/sessions.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: () => {
        if (count > 1) {
          void bulkDelete();
          return;
        }
        void deleteSessions(targetIds);
      },
    });
  };

  return (
    <>
      {/* PROENG_STYLE_REFERENCE_KEEP: Preserve this ProEng preview styling as a candidate app-wide alternate theme for future reuse. */}
      <div className="flex h-full bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_28%),linear-gradient(180deg,_rgba(32,32,32,0.98),_rgba(20,20,20,0.98))]">
        <div className="flex flex-col border-r border-border" style={{ width: treeWidth, minWidth: 300, maxWidth: 520 }}>
          <div className="border-b border-border px-3 py-3 space-y-3 bg-bg-secondary/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70 font-semibold">Prompt Engineering</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary px-3 py-2 text-sm" onClick={openManageTypes} title="Manage shared types">
                  <Blocks size={16} />
                  Types
                </button>
                <button className="btn btn-primary px-3 py-2 text-sm" onClick={() => setIsCreateDialogOpen(true)}>
                  <FilePlus2 size={16} />
                  New
                </button>
              </div>
            </div>

            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sessions..."
                className="pl-9 py-1.5"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Provider:</span>
              {PROVIDER_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setProviderFilter(filter.id)}
                  className={`px-2 py-1 rounded-cyber text-xs border ${
                    providerFilter === filter.id
                      ? 'bg-accent/20 text-accent border-accent/60 shadow-glow-sm'
                      : 'bg-bg-tertiary text-black border-transparent'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsBriefTree((value) => !value)}
                className={`ml-auto px-2 py-1 rounded-cyber text-xs border ${
                  isBriefTree
                    ? 'bg-accent/20 text-accent border-accent/60 shadow-glow-sm'
                    : 'bg-bg-tertiary text-black border-transparent'
                }`}
              >
                Brief
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={treeMode}
                  onChange={(event) => setTreeMode(event.target.value as ProEngTreeMode)}
                  className="w-full appearance-none cursor-pointer py-1.5 pr-7"
                >
                  {TREE_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary" />
              </div>

              <div className="relative">
                <select
                  value={daysFilter}
                  onChange={(event) => setDaysFilter(Number(event.target.value))}
                  className="appearance-none cursor-pointer py-1.5 pr-7"
                >
                  {DAYS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
            {treeGroups.length === 0 && !isLoading ? (
              <div className="rounded-cyber border border-dashed border-border px-4 py-8 text-center text-text-secondary">
                No ProEng sessions yet. Create one to start iterating prompts.
              </div>
            ) : (
              treeGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedGroups((previous) => {
                        const next = new Set(previous);
                        if (next.has(group.id)) {
                          next.delete(group.id);
                        } else {
                          next.add(group.id);
                        }
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-text-secondary hover:text-text-primary"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ChevronDown
                        size={14}
                        className={`shrink-0 transition-transform ${collapsedGroups.has(group.id) ? '-rotate-90' : 'rotate-0'}`}
                      />
                      <span className="truncate">{group.label}</span>
                    </span>
                    <span>({group.sessions.length})</span>
                  </button>

                  {!collapsedGroups.has(group.id) && (
                    <div className="space-y-1">
                    {group.sessions.map((session) => {
                      const isSelected = session.id === selectedSessionId;
                      const isMultiSelected = selectedSessionIds.has(session.id);
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={(event) => {
                            if (event.shiftKey) {
                              addToSelection(session.id);
                              return;
                            }
                            if (event.ctrlKey || event.metaKey) {
                              if (selectedSessionIds.has(session.id)) {
                                removeFromSelection(session.id);
                              } else {
                                toggleMultiSelect(session.id);
                              }
                              return;
                            }
                            void selectSession(session.id);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            const preserveMultiSelection = isMultiSelectMode && selectedSessionIds.has(session.id);
                            if (!preserveMultiSelection) {
                              void selectSession(session.id);
                            }
                            setContextMenu({ x: event.clientX, y: event.clientY, sessionId: session.id });
                          }}
                          className={`w-full text-left rounded-cyber border px-3 py-3 transition-colors ${
                            isSelected
                              ? 'border-amber-400/60 bg-amber-400/12 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]'
                              : isMultiSelected
                                ? 'border-amber-300/35 bg-amber-300/8'
                              : 'border-border bg-bg-tertiary/60 hover:border-amber-400/30 hover:bg-bg-tertiary'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="tree-favorite-icon mt-0.5">
                                {session.isFavorite ? (
                                  <Star size={14} className="star fill-current" />
                                ) : (
                                  <Sparkles size={14} className="text-text-secondary" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold ${providerBadge(session.provider)}`}>
                                    {session.provider === 'openai' ? 'OpenAI' : session.provider === 'anthropic' ? 'Anthropic' : 'Gemini'}
                                  </span>
                                  {!isBriefTree && session.tags.slice(0, 2).map((tag) => (
                                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-400/10 text-amber-200">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-1 text-[11px] font-semibold text-text-primary whitespace-normal break-words leading-tight">
                                  {session.name}
                                </div>
                                {!isBriefTree && (
                                  <div className="mt-1 text-[11px] text-text-secondary whitespace-normal break-words leading-snug">
                                    {session.displaySummary}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-text-secondary shrink-0">{relativeTime(session.updatedAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="resize-handle" onMouseDown={startResize('tree')} role="separator" aria-label="Resize ProEng tree" />

        <div className="flex flex-col border-r border-border" style={{ width: chatWidth, minWidth: 360 }}>
          <div className="border-b border-border px-4 py-4 bg-bg-secondary/55">
            {selectedSession ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/60 font-semibold">Session</div>
                    <div className="text-2xl font-semibold text-text-primary whitespace-normal break-words">{selectedSession.name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(selectedSession.id)}
                      className="p-2 rounded-cyber border border-border bg-bg-tertiary text-text-secondary hover:text-amber-100"
                      title={selectedSession.isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      <Star size={14} className={selectedSession.isFavorite ? 'star fill-current' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAgentDialogOpen(true)}
                      className="px-2 py-1 rounded-cyber text-xs border bg-bg-tertiary text-text-primary border-border"
                    >
                      Agent
                    </button>
                    <button
                      type="button"
                      onClick={() => void setChatMode('clean')}
                      className={`px-2 py-1 rounded-cyber text-xs border ${
                        selectedRecord?.chatMode === 'clean'
                          ? 'bg-amber-400/18 border-amber-400/45 text-amber-100'
                          : 'bg-bg-tertiary text-black border-transparent hover:text-text-primary'
                      }`}
                    >
                      Clean
                    </button>
                    <button
                      type="button"
                      onClick={() => void setChatMode('debug')}
                      className={`px-2 py-1 rounded-cyber text-xs border ${
                        selectedRecord?.chatMode === 'debug'
                          ? 'bg-amber-400/18 border-amber-400/45 text-amber-100'
                          : 'bg-bg-tertiary text-text-secondary border-border'
                      }`}
                    >
                      Debug
                    </button>
                    <button
                      type="button"
                      onClick={() => void setDebugCaptureEnabled(!selectedRecord?.debugCaptureEnabled)}
                      className={`px-2 py-1 rounded-cyber text-xs border ${
                        selectedRecord?.debugCaptureEnabled
                          ? 'bg-emerald-400/14 border-emerald-400/40 text-emerald-200'
                          : 'bg-bg-tertiary text-text-secondary border-border'
                      }`}
                    >
                      Capture
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm font-semibold ${providerBadge(selectedSession.provider)}`}>
                    {selectedSession.provider === 'openai' ? 'OpenAI' : selectedSession.provider === 'anthropic' ? 'Anthropic' : 'Gemini'}
                  </span>
                  <span>{selectedSession.model}</span>
                  <span>/</span>
                  <span>{selectedSession.type || 'Uncategorized'}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRecord?.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => void removeTag(tag)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-cyber bg-amber-500/12 text-amber-100 text-xs border border-amber-400/25"
                      title="Remove tag"
                    >
                      <Tag size={12} />
                      {tag}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      showInputDialog({
                        title: 'Add ProEng Tags',
                        placeholder: 'tag1, tag2',
                        onSubmit: (value) => {
                          const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
                          if (tags.length > 0) {
                            void addTags(tags);
                          }
                        },
                      });
                    }}
                    className="btn btn-secondary px-3 py-1.5 text-sm"
                  >
                    <Tag size={14} />
                    Tags
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-text-secondary">Select a ProEng session to inspect its prompt workflow.</div>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {selectedRecord ? (
              <Virtuoso
                data={visibleMessages}
                className="h-full px-3 py-3"
                itemContent={(_, message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    chatMode={selectedRecord.chatMode}
                    captureEnabled={selectedRecord.debugCaptureEnabled}
                  />
                )}
              />
            ) : (
              <div className="h-full px-3 py-3">
                <div className="rounded-cyber border border-dashed border-border px-4 py-8 text-center text-text-secondary">
                  The chat transcript will appear here once you create or select a session.
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3 bg-bg-secondary/70">
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/60 font-semibold mb-2">Chat Input</div>
            <div className="flex gap-2 items-stretch">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && composer.trim()) {
                    event.preventDefault();
                    void sendMessage(composer);
                    setComposer('');
                  }
                }}
                placeholder="Describe the next prompt revision, outcome gap, or ambiguity to resolve."
                className="flex-1 min-h-[110px] resize-none bg-[#ceb074] text-black placeholder:text-black/60"
              />
              <button
                type="button"
                onClick={() => {
                  if (!composer.trim()) {
                    return;
                  }
                  void sendMessage(composer);
                  setComposer('');
                }}
                className="px-3 py-2 rounded-cyber border bg-[#ceb074] text-black border-[#d7bb86]"
              >
                Send
              </button>
            </div>
            <div className="mt-2 text-xs text-text-secondary">Ctrl+Enter sends. `Debug` reveals payload snapshots when `Capture` is enabled.</div>
          </div>
        </div>

        <div className="resize-handle" onMouseDown={startResize('chat')} role="separator" aria-label="Resize ProEng chat" />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="border-b border-border px-4 py-4 bg-bg-secondary/55">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/60 font-semibold">Active Prompt</div>
                <div className="text-2xl font-semibold text-text-primary">Current Draft</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('proeng-active-prompt-editor')?.focus()}
                  className="px-3 py-1.5 rounded-cyber border bg-[#d3b77f] text-black border-[#dcc28e] text-sm font-medium flex items-center gap-1.5"
                >
                  <Edit3 size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void window.electronAPI.copyToClipboard(promptDraft || activePrompt);
                    setSaveMessage('Copied to clipboard');
                  }}
                  className="px-3 py-1.5 rounded-cyber border bg-[#d3b77f] text-black border-[#dcc28e] text-sm font-medium flex items-center gap-1.5"
                >
                  <Copy size={14} />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (promptDraft !== activePrompt) {
                      await updatePrompt(promptDraft);
                    }
                    const filePath = await useProEngStore.getState().savePromptTemplate();
                    if (filePath) {
                      setSaveMessage(`Saved template: ${filePath}`);
                    }
                  }}
                  className="px-3 py-1.5 rounded-cyber border bg-[#d3b77f] text-black border-[#dcc28e] text-sm font-medium flex items-center gap-1.5"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (promptDraft !== activePrompt) {
                      await updatePrompt(promptDraft);
                    }
                    await sendMessage('Review the current active prompt and propose the next revision with clarifying questions and options.');
                  }}
                  className="px-3 py-1.5 rounded-cyber border bg-[#d3b77f] text-black border-[#dcc28e] text-sm font-medium flex items-center gap-1.5"
                >
                  <Send size={14} />
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#121212] border-l border-amber-500/10">
            {selectedRecord ? (
              <div className="h-full min-h-full px-5 py-5 space-y-4 flex flex-col">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                  <span>{selectedRecord.activePromptPath.split(/[/\\]/).pop()}</span>
                  <div className="flex items-center gap-3">
                    <span>Markdown</span>
                    <span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Ready'}</span>
                  </div>
                </div>
                <textarea
                  id="proeng-active-prompt-editor"
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  className="w-full flex-1 min-h-[560px] resize-y bg-transparent border border-amber-500/10 rounded-cyber px-4 py-4 text-sm leading-relaxed text-amber-50 font-mono focus:outline-none focus:border-amber-400/35"
                  spellCheck
                />
                <div className="flex items-center justify-between gap-4 text-xs text-text-secondary">
                  <span>{saveMessage || 'Autosave keeps the working draft synchronized. Native undo/redo remains available in the editor.'}</span>
                  <span>{promptDraft.length} chars</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-text-secondary">
                The active prompt will appear here for the selected ProEng session.
              </div>
            )}
          </div>
        </div>
      </div>

      {isCreateDialogOpen && (
        <CreateProEngDialog
          existingTypes={types.map((type) => type.name)}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={async (input) => {
            await createSession(input);
            setIsCreateDialogOpen(false);
          }}
        />
      )}

      {isAgentDialogOpen && selectedSession && (
        <EditAgentDialog
          provider={selectedSession.provider}
          model={selectedSession.model}
          onClose={() => setIsAgentDialogOpen(false)}
          onSave={async (provider) => {
            await updateAgent(provider);
            setIsAgentDialogOpen(false);
          }}
        />
      )}

      {contextMenu && contextSession && (
        <div
          className="fixed z-50 bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber py-1 min-w-[220px]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 240), top: Math.min(contextMenu.y, window.innerHeight - 220) }}
        >
                  <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-bg-tertiary text-text-primary"
            onClick={() => {
              setContextMenu(null);
              showInputDialog({
                title: 'Rename ProEng Session',
                placeholder: 'Enter session name',
                initialValue: contextSession.name,
                onSubmit: (value) => {
                  void renameSession(value, contextSession.id);
                },
              });
            }}
          >
            <Edit3 size={16} />
            Rename
          </button>
          <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-bg-tertiary text-text-primary"
            onClick={() => {
              setContextMenu(null);
              void toggleFavorite(contextSession.id);
            }}
          >
            <Star size={16} className={contextSession.isFavorite ? 'star fill-current' : ''} />
            {contextSession.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          </button>
          <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-bg-tertiary text-text-primary"
            onClick={() => {
              setContextMenu(null);
              useTypePickerStore.getState().open(
                contextSession.id,
                contextSession.type,
                (type) => {
                  void updateType(type, contextSession.id);
                }
              );
            }}
          >
            <FolderPlus size={16} />
            Set Type...
          </button>
          <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-bg-tertiary text-text-primary"
            onClick={() => {
              setContextMenu(null);
              showInputDialog({
                title: 'Edit ProEng Summary',
                placeholder: 'Enter session summary',
                initialValue: contextSession.userSummary || contextSession.autoSummary,
                onSubmit: (value) => {
                  void updateSummary(value, contextSession.id);
                },
              });
            }}
          >
            <Tag size={16} />
            Edit Summary...
          </button>
          <div className="context-menu-divider" />
          <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 text-red-300 hover:bg-red-500/10"
            onClick={() => {
              setContextMenu(null);
              handleDeleteSelection();
            }}
          >
            <Trash2 size={16} />
            Delete Session...
          </button>
        </div>
      )}
    </>
  );
}

interface CreateProEngDialogProps {
  existingTypes: string[];
  onClose: () => void;
  onCreate: (input: { name: string; provider: ProEngProvider; type: string }) => Promise<void>;
}

function MessageCard({
  message,
  chatMode,
  captureEnabled,
}: {
  message: NonNullable<ReturnType<typeof useProEngStore.getState>['selectedRecord']>['messages'][number];
  chatMode: 'clean' | 'debug';
  captureEnabled: boolean;
}) {
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`rounded-cyber border px-3 py-3 mb-3 ${
        isAssistant
          ? 'border-amber-500/35 bg-amber-500/8'
          : message.role === 'system'
            ? 'border-sky-500/25 bg-sky-500/8'
            : 'border-border bg-bg-secondary/70'
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          {isAssistant ? (
            <Bot size={14} className="text-amber-300" />
          ) : message.role === 'system' ? (
            <CheckCircle2 size={14} className="text-sky-200" />
          ) : (
            <Tag size={14} className="text-text-secondary" />
          )}
          <span className={`font-semibold ${isAssistant ? 'text-amber-200' : 'text-text-primary'}`}>
            {message.role === 'system' ? 'System Prompt' : isAssistant ? 'Agent' : 'User'}
          </span>
        </div>
        <span className="text-text-secondary">{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div className="mt-3 whitespace-pre-wrap break-words text-sm text-text-primary leading-relaxed">
        {message.content}
      </div>
      {chatMode === 'debug' && (
        <div className="mt-3 space-y-2">
          <div className="rounded-cyber border border-border bg-black/30 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-text-secondary mb-2">Prompt Snapshot</div>
            <pre className="whitespace-pre-wrap break-words text-xs text-amber-100">{message.promptSnapshot || 'No prompt snapshot recorded.'}</pre>
          </div>
          {captureEnabled && (
            <>
              {message.rawRequest && (
                <div className="rounded-cyber border border-border bg-black/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-text-secondary mb-2">Raw Request</div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-emerald-100">{message.rawRequest}</pre>
                </div>
              )}
              {message.rawResponse && (
                <div className="rounded-cyber border border-border bg-black/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-text-secondary mb-2">Raw Response</div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-cyan-100">{message.rawResponse}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CreateProEngDialog({ existingTypes, onClose, onCreate }: CreateProEngDialogProps) {
  const { defaults, isCreating } = useProEngStore();
  const [name, setName] = useState('New Prompt Engineering Session');
  const [provider, setProvider] = useState<ProEngProvider>('anthropic');
  const [type, setType] = useState(existingTypes[0] || 'Workflow');

  const model = defaults?.defaultModels[provider] || 'Default Best';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70 font-semibold">New Session</div>
            <div className="text-xl font-semibold text-text-primary">Create ProEng Session</div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary px-3 py-2">
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-text-secondary">Session Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2">
              <span className="text-sm text-text-secondary">Provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as ProEngProvider)}>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-text-secondary">Model</span>
              <input value={model} readOnly className="bg-[#d6bb84] text-black" />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-text-secondary">Type</span>
            <input list="proeng-type-options" value={type} onChange={(event) => setType(event.target.value)} placeholder="Select or type a category" />
            <datalist id="proeng-type-options">
              {existingTypes.map((typeName) => (
                <option key={typeName} value={typeName} />
              ))}
            </datalist>
          </label>

          <div className="rounded-cyber border border-amber-500/20 bg-amber-500/8 px-3 py-3 text-sm text-text-secondary">
            <div className="flex items-center gap-2 text-amber-200 font-semibold mb-2">
              <Sparkles size={14} />
              ProEng System
            </div>
            <p>
              The hidden ProEng system prompt guides the selected provider while the visible working draft is built in the editor. Targeted templates can be added later without changing this creation flow.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <div className="text-xs text-text-secondary">Provider chooses the default model from config.</div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={() => void onCreate({ name, provider, type })} className="btn btn-primary" disabled={isCreating}>
              <FilePlus2 size={16} />
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditAgentDialog({
  provider,
  model,
  onClose,
  onSave,
}: {
  provider: ProEngProvider;
  model: string;
  onClose: () => void;
  onSave: (provider: ProEngProvider) => Promise<void>;
}) {
  const [nextProvider, setNextProvider] = useState<ProEngProvider>(provider);
  const defaults = useProEngStore((state) => state.defaults);
  const previewModel = defaults?.defaultModels[nextProvider] || model;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70 font-semibold">Session Agent</div>
            <div className="text-xl font-semibold text-text-primary">Change Provider</div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary px-3 py-2">
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-text-secondary">Provider</span>
            <select value={nextProvider} onChange={(event) => setNextProvider(event.target.value as ProEngProvider)}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-text-secondary">Model</span>
            <input value={previewModel} readOnly className="bg-[#d6bb84] text-black" />
          </label>
        </div>

        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onSave(nextProvider)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProEngTab;
