/**
 * useKeyboardShortcuts.ts - Global keyboard shortcut handler
 *
 * Provides keyboard navigation and shortcuts for ZedUI:
 * - Arrow keys: Navigate tree
 * - Enter: Continue selected session
 * - Delete: Delete selected session (with confirmation)
 * - Ctrl+F / Cmd+F: Focus search
 * - Ctrl+R / F5: Refresh
 * - Escape: Clear selection / close dialogs
 */

import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useConfirmDialogStore } from '../components/ConfirmDialog';
import { useSettingsStore } from '../stores/settings-store';

interface UseKeyboardShortcutsOptions {
  onFocusSearch?: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    sessions,
    selectedSessionId,
    selectedSession,
    selectSession,
    deleteSession,
    continueSession,
    loadSessions,
    loadProjects,
    loadTags,
    loadBranches,
  } = useSessionStore();

  const showConfirmDialog = useConfirmDialogStore((state) => state.show);
  const isDialogOpen = useConfirmDialogStore((state) => state.isOpen);

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Keyboard refresh clears selection and triggers loading state
  * Provides visual feedback that refresh occurred
  * 2025-12-02 Initial implementation
  */
  // Refresh all data and clear selection
  const handleRefresh = useCallback(() => {
    selectSession(null);  // Clear selection on refresh
    loadSessions();
    loadProjects();
    loadTags();
    loadBranches();
  }, [selectSession, loadSessions, loadProjects, loadTags, loadBranches]);
  // <END | Sphere -> Tharyn | CC

  // Navigate to next/previous session in list
  const navigateSession = useCallback(
    (direction: 'up' | 'down') => {
      if (sessions.length === 0) return;

      const currentIndex = selectedSessionId
        ? sessions.findIndex((s) => s.sessionId === selectedSessionId)
        : -1;

      let newIndex: number;
      if (direction === 'down') {
        newIndex = currentIndex < sessions.length - 1 ? currentIndex + 1 : 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : sessions.length - 1;
      }

      selectSession(sessions[newIndex].sessionId);
    },
    [sessions, selectedSessionId, selectSession]
  );

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Honor settings.confirmOnDelete (OD-3) — skip dialog when user has disabled it
      Why: Codex review flagged this hook as ignoring the setting; was always confirming
      Expected: confirmOnDelete=false → keyboard Delete deletes immediately; true → prior behavior
  */
  // Delete selected session, optionally with confirmation
  const handleDelete = useCallback(() => {
    if (!selectedSession) return;
    const confirmOnDelete = useSettingsStore.getState().settings.confirmOnDelete;

    if (!confirmOnDelete) {
      deleteSession(selectedSession.sessionId);
      return;
    }

    showConfirmDialog({
      title: 'Delete Session',
      message: 'Are you sure you want to permanently delete this session?',
      detail: `Session: ${selectedSession.sessionId}\nProject: ${selectedSession.projectDisplay}`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: () => {
        deleteSession(selectedSession.sessionId);
      },
    });
  }, [selectedSession, showConfirmDialog, deleteSession]);
  // <END Tharyn | CursorCLI

  // Continue selected session
  const handleContinue = useCallback(() => {
    if (!selectedSession) return;
    continueSession(selectedSession.sessionId);
  }, [selectedSession, continueSession]);

  // Main keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Don't handle if dialog is open (dialog has its own handlers)
      if (isDialogOpen) return;

      // Ctrl/Cmd + F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        options.onFocusSearch?.();
        return;
      }

      // Ctrl/Cmd + R or F5: Refresh
      if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        handleRefresh();
        return;
      }

      // Skip remaining shortcuts if in input
      if (isInput) return;

      // Arrow keys: Navigate sessions
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSession('down');
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateSession('up');
        return;
      }

      // Enter: Continue selected session
      if (e.key === 'Enter' && selectedSession) {
        e.preventDefault();
        handleContinue();
        return;
      }

      // Delete/Backspace: Delete selected session
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSession) {
        e.preventDefault();
        handleDelete();
        return;
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        selectSession(null);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isDialogOpen,
    selectedSession,
    options,
    handleRefresh,
    navigateSession,
    handleContinue,
    handleDelete,
    selectSession,
  ]);
}
