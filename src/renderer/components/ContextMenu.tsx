import React, { useEffect } from 'react';
import { create } from 'zustand';
import { useSessionStore } from '../stores/session-store';
import { useConfirmDialogStore } from './ConfirmDialog';
import { useTypePickerStore } from './TypePickerDialog';
import { useInputDialogStore } from './InputDialog';
import { useSettingsStore } from '../stores/settings-store';
import type { SessionViewModel } from '../types/session';
import {
  Play,
  GitBranch,
  Star,
  Tag,
  FileText,
  Copy,
  FolderOpen,
  Trash2,
} from 'lucide-react';

// Context menu store
interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  session: SessionViewModel | null;
  show: (x: number, y: number, session: SessionViewModel) => void;
  hide: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  session: null,
  show: (x, y, session) => set({ isOpen: true, x, y, session }),
  hide: () => set({ isOpen: false, session: null }),
}));

function ContextMenu() {
  const { isOpen, x, y, session, hide } = useContextMenuStore();
  const { continueSession, branchSession, toggleFavorite, updateAnnotation, deleteSession } = useSessionStore();
  const showConfirmDialog = useConfirmDialogStore((state) => state.show);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (isOpen) {
      const handleClick = (e: MouseEvent) => {
        // Only hide if click is outside the menu
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          hide();
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') hide();
      };

      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, hide]);

  if (!isOpen || !session) {
    return null;
  }

  const handleContinue = () => {
    continueSession(session.sessionId);
    hide();
  };

  const handleBranch = () => {
    console.log('[ContextMenu] Branch clicked for session:', session.sessionId);
    // Note: window.prompt() is not supported in Electron, so we branch without a name
    // A proper dialog can be added later if branch names are needed
    console.log('[ContextMenu] Calling branchSession (no name)...');
    branchSession(session.sessionId, undefined);
    hide();
  };

  const handleToggleFavorite = () => {
    toggleFavorite(session.sessionId);
    hide();
  };

  const handleSetType = () => {
    hide();
    const { selectedSessionIds, isMultiSelectMode } = useSessionStore.getState();

    // If multiple sessions selected, apply type to all of them
    if (isMultiSelectMode && selectedSessionIds.size > 1) {
      useTypePickerStore.getState().open(
        session.sessionId,
        session.annotation?.type || '',
        (type) => {
          // Update all selected sessions
          for (const sessionId of selectedSessionIds) {
            updateAnnotation(sessionId, { type });
          }
        }
      );
    } else {
      // Single session
      useTypePickerStore.getState().open(
        session.sessionId,
        session.annotation?.type || '',
        (type) => {
          updateAnnotation(session.sessionId, { type });
        }
      );
    }
  };

  const handleEditSummary = () => {
    hide();
    useInputDialogStore.getState().show({
      title: 'Edit Summary',
      placeholder: 'Enter session summary...',
      initialValue: session.annotation?.userSummary || session.autoSummary || '',
      onSubmit: (summary) => {
        updateAnnotation(session.sessionId, { userSummary: summary });
      },
    });
  };

  const handleCopyId = () => {
    window.electronAPI.copyToClipboard(session.sessionId);
    hide();
  };

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Replace local provider-specific synth with IPC getResumeInfo() (Phase 2.7 / 3.2)
      Why: Renderer was hardcoded for Claude/Codex only — Cursor sessions copied a Claude command; adding providers required renderer edits
      Expected: Cursor sessions copy `cd "<wslCwd>" && /root/.local/bin/cursor-agent --workspace "<wslCwd>" --resume <id>`; Claude/Codex unchanged
  */
  const handleCopyCommand = async () => {
    hide();
    try {
      const info = await window.electronAPI.getResumeInfo(session.sessionId);
      if (info && info.wslShellCommand) {
        window.electronAPI.copyToClipboard(info.wslShellCommand);
      } else {
        console.error('getResumeInfo returned null for', session.sessionId);
      }
    } catch (err) {
      console.error('Failed to get resume info:', err);
    }
  };
  // <END Tharyn | CursorCLI

  const handleOpenFolder = () => {
    window.electronAPI.showInFolder(session.filePath);
    hide();
  };

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Honor settings.confirmOnDelete (OD-3) — skip dialog when user has disabled it
      Why: Codex review flagged this component as ignoring the setting
      Expected: confirmOnDelete=false → context-menu Delete deletes immediately; true → prior behavior
  */
  const handleDelete = () => {
    hide();
    const confirmOnDelete = useSettingsStore.getState().settings.confirmOnDelete;

    if (!confirmOnDelete) {
      deleteSession(session.sessionId);
      return;
    }

    showConfirmDialog({
      title: 'Delete Session',
      message: 'Are you sure you want to permanently delete this session?',
      detail: `Session: ${session.sessionId}\nProject: ${session.projectDisplay}`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      isDangerous: true,
      onConfirm: () => {
        deleteSession(session.sessionId);
      },
    });
  };
  // <END Tharyn | CursorCLI

  // Adjust position to keep menu in viewport
  // Menu has ~11 items (32px each) + 4 dividers (9px each) + padding = ~400px
  const menuHeight = 400;
  const menuWidth = 200;
  const padding = 8;

  const menuStyle: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - menuWidth - padding),
    top: Math.min(y, window.innerHeight - menuHeight - padding),
  };

  return (
    <div ref={menuRef} className="context-menu" style={menuStyle}>
      <MenuItem icon={<Play size={16} />} label="Continue" onClick={handleContinue} />
      <MenuItem icon={<GitBranch size={16} />} label="Branch" onClick={handleBranch} />

      <div className="context-menu-divider" />

      <MenuItem
        icon={<Star size={16} className={session.annotation?.isFavorite ? 'star fill-current' : ''} />}
        label={session.annotation?.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
        onClick={handleToggleFavorite}
      />
      <MenuItem icon={<Tag size={16} />} label="Set Type..." onClick={handleSetType} />
      <MenuItem icon={<FileText size={16} />} label="Edit Summary..." onClick={handleEditSummary} />

      <div className="context-menu-divider" />

      <MenuItem icon={<Copy size={16} />} label="Copy Session ID" onClick={handleCopyId} />
      <MenuItem icon={<Copy size={16} />} label="Copy Resume Cmd" onClick={handleCopyCommand} />

      <div className="context-menu-divider" />

      <MenuItem icon={<FolderOpen size={16} />} label="Open in Explorer" onClick={handleOpenFolder} />

      <div className="context-menu-divider" />

      <MenuItem icon={<Trash2 size={16} className="text-red-400" />} label="Delete Session..." onClick={handleDelete} danger />
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps) {
  return (
    <div
      className={`context-menu-item ${danger ? 'text-red-400 hover:bg-red-500/10' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

export default ContextMenu;
