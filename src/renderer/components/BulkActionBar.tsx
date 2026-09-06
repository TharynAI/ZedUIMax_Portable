/**
 * BulkActionBar.tsx - Action bar for bulk operations on selected sessions
 *
 * START> 2025-12-02 | Sphere -> Tharyn | CC
 * Phase 3: Bulk Operations
 * Shows when multiple sessions are selected, provides bulk actions
 * 2025-12-02 Initial implementation
 */

import React, { useState, useCallback } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useConfirmDialogStore } from './ConfirmDialog';
import { useTypePickerStore } from './TypePickerDialog';
import { useSettingsStore } from '../stores/settings-store';
import { X, Trash2, Tag, FolderOpen, CheckSquare } from 'lucide-react';

function BulkActionBar() {
  const {
    selectedSessionIds,
    isMultiSelectMode,
    clearMultiSelect,
    selectAll,
    bulkDelete,
    bulkAddTags,
    bulkSetType,
    sessions,
  } = useSessionStore();

  const showConfirmDialog = useConfirmDialogStore((state) => state.show);
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  // Type input removed - now uses TypePickerDialog

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Honor settings.confirmOnDelete (OD-3) — skip dialog when user has disabled it
      Why: Codex review flagged this component as ignoring the setting
      Expected: confirmOnDelete=false → bulk delete proceeds immediately; true → prior behavior
  */
  const handleBulkDelete = useCallback(() => {
    const count = selectedSessionIds.size;
    const confirmOnDelete = useSettingsStore.getState().settings.confirmOnDelete;

    if (!confirmOnDelete) {
      (async () => {
        const deletedCount = await bulkDelete();
        console.log(`Deleted ${deletedCount} sessions`);
      })();
      return;
    }

    showConfirmDialog({
      title: 'Delete Sessions',
      message: `Are you sure you want to permanently delete ${count} session${count > 1 ? 's' : ''}?`,
      detail: 'This action cannot be undone.',
      confirmLabel: 'Delete All',
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: async () => {
        const deletedCount = await bulkDelete();
        console.log(`Deleted ${deletedCount} sessions`);
      },
    });
  }, [selectedSessionIds, showConfirmDialog, bulkDelete]);
  // <END Tharyn | CursorCLI

  const handleAddTags = useCallback(() => {
    if (!tagInput.trim()) return;

    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    bulkAddTags(tags);
    setTagInput('');
    setIsTagInputOpen(false);
  }, [tagInput, bulkAddTags]);

  const handleSetType = useCallback(() => {
    // Open TypePickerDialog for bulk type setting
    const firstSelectedId = Array.from(selectedSessionIds)[0];
    const firstSession = sessions.find(s => s.sessionId === firstSelectedId);

    useTypePickerStore.getState().open(
      firstSelectedId,
      firstSession?.annotation?.type || '',
      (type) => {
        bulkSetType(type);
      }
    );
  }, [selectedSessionIds, sessions, bulkSetType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTags();
    } else if (e.key === 'Escape') {
      setIsTagInputOpen(false);
      setTagInput('');
    }
  }, [handleAddTags]);

  if (!isMultiSelectMode) {
    return null;
  }

  const count = selectedSessionIds.size;
  const allSelected = count === sessions.length;

  return (
    <div className="bulk-action-bar">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-accent">
            {count} selected
          </span>
          <button
            onClick={clearMultiSelect}
            className="p-1 hover:bg-bg-tertiary rounded"
            title="Clear selection"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-4 w-px bg-border" />

        {!allSelected && (
          <button
            onClick={selectAll}
            className="btn btn-ghost text-sm flex items-center gap-1"
            title="Select all"
          >
            <CheckSquare size={14} />
            Select All
          </button>
        )}

        {/* Tag input or button */}
        {isTagInputOpen ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="tag1, tag2..."
              className="w-32 text-sm px-2 py-1"
              autoFocus
            />
            <button onClick={handleAddTags} className="btn btn-primary text-sm py-1">
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsTagInputOpen(true)}
            className="btn btn-ghost text-sm flex items-center gap-1"
          >
            <Tag size={14} />
            Add Tags
          </button>
        )}

        {/* Set Type - opens TypePickerDialog */}
        <button
          onClick={handleSetType}
          className="btn btn-ghost text-sm flex items-center gap-1"
        >
          <FolderOpen size={14} />
          Set Type
        </button>

        <button
          onClick={handleBulkDelete}
          className="btn btn-ghost text-sm flex items-center gap-1 text-red-400 hover:text-red-300"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

export default BulkActionBar;
// <END | Sphere -> Tharyn | CC
