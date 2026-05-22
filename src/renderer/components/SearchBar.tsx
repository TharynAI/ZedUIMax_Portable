/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Session Message Search
* Added toggle for searching within message content
* 2025-12-02 Initial implementation
*/
import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useSettingsStore } from '../stores/settings-store';
import { Search, X, MessageSquare, Trash2 } from 'lucide-react';
import { useConfirmDialogStore } from './ConfirmDialog';
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Centralized provider filter options (was hardcoded ['all','claude','codex'])
    Why: Cursor must appear in filter; future providers add via single source of truth
    Expected: Provider filter row renders All/Claude/Codex/Cursor
*/
import { PROVIDER_FILTER_OPTIONS } from '../providers/display';
// <END Tharyn | CursorCLI

export interface SearchBarRef {
  focus: () => void;
}

const SearchBar = forwardRef<SearchBarRef>(function SearchBar(_, ref) {
  const {
    searchQuery,
    setSearchQuery,
    messageSearchEnabled,
    setMessageSearchEnabled,
    searchMessages,
    clearMessageSearch,
    providerFilter,
    setProviderFilter,
    cleanupOldestUngrouped,
  } = useSessionStore();
  const { settings } = useSettingsStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [isCleaningUngrouped, setIsCleaningUngrouped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const showConfirmDialog = useConfirmDialogStore((state) => state.show);

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  // Debounced search
  const debounceRef = React.useRef<NodeJS.Timeout>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new timeout
    debounceRef.current = setTimeout(() => {
      if (messageSearchEnabled) {
        searchMessages(value);
      } else {
        setSearchQuery(value);
      }
    }, 300);
  }, [setSearchQuery, messageSearchEnabled, searchMessages]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    if (messageSearchEnabled) {
      clearMessageSearch();
    } else {
      setSearchQuery('');
    }
  }, [setSearchQuery, messageSearchEnabled, clearMessageSearch]);

  const toggleMessageSearch = useCallback(() => {
    const newEnabled = !messageSearchEnabled;
    setMessageSearchEnabled(newEnabled);

    // If enabling and there's a query, perform message search
    if (newEnabled && localQuery.length >= 2) {
      searchMessages(localQuery);
    } else if (!newEnabled) {
      // If disabling, clear message results and perform session search
      clearMessageSearch();
      if (localQuery) {
        setSearchQuery(localQuery);
      }
    }
  }, [messageSearchEnabled, setMessageSearchEnabled, localQuery, searchMessages, clearMessageSearch, setSearchQuery]);

  const handleCleanupUngrouped = useCallback(() => {
    const count = Math.max(1, Math.floor(settings.ungroupedCleanupBatchSize || 10));

    showConfirmDialog({
      title: 'Delete Old Ungrouped Sessions',
      message: `Delete the ${count} oldest sessions currently classified as Ungrouped?`,
      detail: 'This deletes the actual Claude/Codex/Cursor session files from disk and removes their metadata. All providers are included. This cannot be undone.',
      confirmLabel: `Delete ${count}`,
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: () => {
        setIsCleaningUngrouped(true);
        cleanupOldestUngrouped(count)
          .catch((error) => console.error('Ungrouped cleanup failed:', error))
          .finally(() => setIsCleaningUngrouped(false));
      },
    });
  }, [cleanupOldestUngrouped, settings.ungroupedCleanupBatchSize, showConfirmDialog]);

  // When message search is disabled from outside, reset to session search
  useEffect(() => {
    if (!messageSearchEnabled && localQuery) {
      setSearchQuery(localQuery);
    }
  }, [messageSearchEnabled]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder={messageSearchEnabled ? "Search in messages..." : "Search sessions..."}
          value={localQuery}
          onChange={handleChange}
          className="pl-9 pr-10 py-1.5"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Message search toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMessageSearch}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-cyber text-xs transition-colors ${
            messageSearchEnabled
              ? 'bg-accent/20 text-accent border border-accent/50 shadow-glow-sm'
              : 'bg-bg-tertiary text-black border border-transparent hover:text-text-primary hover:border-accent/30'
          }`}
          title="Search within message content"
        >
          <MessageSquare size={12} />
          <span>Search Messages</span>
        </button>
        {messageSearchEnabled && (
          <span className="text-xs text-text-secondary">
            Searches within conversation content
          </span>
        )}
      </div>

      {/* Provider filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Provider:</span>
        {PROVIDER_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setProviderFilter(opt.id)}
            className={`px-2 py-1 rounded-cyber text-xs border ${
              providerFilter === opt.id
                ? 'bg-accent/20 text-accent border-accent/60 shadow-glow-sm'
                : 'bg-bg-tertiary text-black hover:text-text-primary border-transparent hover:border-accent/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={handleCleanupUngrouped}
          disabled={isCleaningUngrouped}
          className="flex items-center gap-1.5 px-2 py-1 rounded-cyber text-xs border bg-bg-tertiary text-black hover:text-text-primary border-transparent hover:border-red-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Delete oldest ${settings.ungroupedCleanupBatchSize || 10} Ungrouped sessions from all providers`}
        >
          <Trash2 size={12} />
          <span>{isCleaningUngrouped ? 'Cleaning' : 'Clean'}</span>
        </button>
      </div>
    </div>
  );
});

export default SearchBar;
// <END | Sphere -> Tharyn | CC
