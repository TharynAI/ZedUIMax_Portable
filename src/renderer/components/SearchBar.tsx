/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Session Message Search
* Added toggle for searching within message content
* 2025-12-02 Initial implementation
*/
import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useSettingsStore } from '../stores/settings-store';
import { Search, X, Trash2 } from 'lucide-react';
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
    providerFilter,
    setProviderFilter,
    cleanupOldestUngrouped,
    cleanupProgress,
    showCleanupProgress,
  } = useSessionStore();
  const { settings } = useSettingsStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const showConfirmDialog = useConfirmDialogStore((state) => state.show);

  const cleanupIsRunning = cleanupProgress.phase === 'discovering'
    || cleanupProgress.phase === 'deleting'
    || cleanupProgress.phase === 'refreshing';
  const cleanupHasResult = cleanupProgress.phase === 'complete' || cleanupProgress.phase === 'failed';

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);

    // Clearing the field removes the active filter immediately; non-empty edits wait for Enter.
    if (value.length === 0) setSearchQuery('');
  }, [setSearchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setSearchQuery(localQuery.trim());
  }, [localQuery, setSearchQuery]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    setSearchQuery('');
    inputRef.current?.focus();
  }, [setSearchQuery]);

  const handleCleanupUngrouped = useCallback(() => {
    if (cleanupIsRunning || cleanupHasResult) {
      showCleanupProgress();
      return;
    }

    const count = Math.max(1, Math.floor(settings.ungroupedCleanupBatchSize || 10));

    showConfirmDialog({
      title: 'Delete Old Ungrouped Sessions',
      message: `Delete the ${count} oldest sessions currently classified as Ungrouped?`,
      detail: 'This deletes the actual Claude/Codex/Cursor session files from disk and removes their metadata. All providers are included. This cannot be undone.',
      confirmLabel: `Delete ${count}`,
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: () => {
        void cleanupOldestUngrouped(count);
      },
    });
  }, [
    cleanupHasResult,
    cleanupIsRunning,
    cleanupOldestUngrouped,
    settings.ungroupedCleanupBatchSize,
    showCleanupProgress,
    showConfirmDialog,
  ]);

  return (
    <div className="zed-search-stack">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter sessions — press Enter"
          value={localQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-10 py-1.5"
        />
        {localQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
            aria-label="Clear session filter"
            title="Clear session filter"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Provider filter */}
      <div className="zed-provider-row">
        <span className="zed-filter-label">Provider</span>
        {PROVIDER_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setProviderFilter(opt.id)}
            className={`px-2 py-1 rounded-cyber text-xs border ${
              providerFilter === opt.id
                ? 'bg-accent/20 text-accent border-accent/60 shadow-glow-sm'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border-transparent hover:border-accent/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={handleCleanupUngrouped}
          className={`zed-clean-button flex items-center gap-1.5 px-2 py-1 rounded-cyber text-xs border transition-colors ${
            cleanupIsRunning
              ? 'bg-accent/15 text-accent border-accent/40 shadow-glow-sm'
              : cleanupHasResult
                ? 'bg-bg-tertiary text-text-primary border-border hover:border-accent/50'
                : 'bg-bg-tertiary text-text-secondary border-transparent hover:text-text-primary hover:border-red-500/60'
          }`}
          title={cleanupIsRunning || cleanupHasResult
            ? 'Open cleanup status'
            : `Delete oldest ${settings.ungroupedCleanupBatchSize || 10} Ungrouped sessions from all providers`}
        >
          <Trash2 size={12} className={cleanupIsRunning ? 'animate-pulse' : ''} />
          <span>
            {cleanupIsRunning
              ? `Cleaning ${cleanupProgress.processed}/${cleanupProgress.total || '…'}`
              : cleanupHasResult
                ? 'Cleanup result'
                : 'Clean'}
          </span>
        </button>
      </div>
    </div>
  );
});

export default SearchBar;
// <END | Sphere -> Tharyn | CC
