import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../stores/session-store';
import {
  Star,
  Play,
  GitBranch,
  Copy,
  FolderOpen,
  FileText,
  Clock,
  HardDrive,
  MessageSquare,
  X,
  Plus,
  AlertTriangle,
  Folder,
} from 'lucide-react';
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Centralized provider display lookup for preview badge
    Why: Inline ternary only handled Claude/Codex
    Expected: Cursor sessions show purple 'Cursor' badge
*/
import { getProviderDisplay } from '../providers/display';
// <END Tharyn | CursorCLI

function SessionPreview() {
  const { selectedSession } = useSessionStore();

  if (!selectedSession) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary px-6">
        <div className="browse-empty-state text-center">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>Select a session to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <PreviewHeader session={selectedSession} />

      {/* Metadata */}
      <PreviewMetadata session={selectedSession} />

      {/* Working Directory */}
      <PreviewWorkingDirectory session={selectedSession} />

      {/* Summary */}
      <PreviewSummary session={selectedSession} />

      {/* Tags */}
      <PreviewTags session={selectedSession} />

      {/* Notes */}
      <PreviewNotes session={selectedSession} />

      {/* Actions */}
      <PreviewActions session={selectedSession} />
    </div>
  );
}

function PreviewHeader({ session }: { session: any }) {
  const { toggleFavorite, updateAnnotation } = useSessionStore();
  const [editingType, setEditingType] = useState(false);
  const [typeValue, setTypeValue] = useState(session.annotation?.type || '');

  const handleFavorite = () => {
    toggleFavorite(session.sessionId);
  };

  const handleTypeSubmit = () => {
    updateAnnotation(session.sessionId, { type: typeValue });
    setEditingType(false);
  };

  return (
    <div className="browse-preview-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="browse-section-label">Session</div>
          <h2 className="mt-1 text-2xl font-semibold text-text-primary whitespace-normal break-words leading-tight">
            {session.displaySummary}
          </h2>
        </div>
        <button
          onClick={handleFavorite}
          className="p-2 rounded-cyber border border-border bg-bg-tertiary text-text-secondary hover:text-amber-100"
          title={session.annotation?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            size={16}
            className={session.annotation?.isFavorite ? 'star fill-current' : ''}
          />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* START> Tharyn | CursorCLI
            2026-05-03
            What: Provider badge via display map
            Why: Cursor needs distinct badge; centralizes drift
            Expected: Claude/Codex/Cursor render correct label + tint
        */}
        {(() => {
          const disp = getProviderDisplay(session.providerId);
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${disp.badgeBgClass} ${disp.badgeBorderClass}`}
              title={`${disp.label} session`}
            >
              {disp.label}
            </span>
          );
        })()}
        {/* <END Tharyn | CursorCLI */}
        {editingType ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={typeValue}
              onChange={(e) => setTypeValue(e.target.value)}
              placeholder="Enter type..."
              className="text-sm py-1 px-2"
              autoFocus
              onBlur={handleTypeSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTypeSubmit();
                if (e.key === 'Escape') setEditingType(false);
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingType(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-cyber bg-amber-500/12 text-amber-100 text-xs border border-amber-400/25"
          >
            {session.annotation?.type || 'Set type...'}
          </button>
        )}
      </div>

      <div className="text-sm text-text-secondary">
        Session: <code className="bg-bg-tertiary px-1 rounded-cyber">{session.shortId}</code>
      </div>
    </div>
  );
}

function PreviewMetadata({ session }: { session: any }) {
  return (
    <div className="browse-preview-card space-y-3">
      <h3 className="browse-section-label">Metadata</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-text-secondary">
          <FolderOpen size={14} />
          <span className="truncate" title={session.projectDisplay}>
            {session.projectDisplay}
          </span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock size={14} />
          <span>{session.dateDisplay}</span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <MessageSquare size={14} />
          <span>{session.messageCount} messages</span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <HardDrive size={14} />
          <span>{session.sizeDisplay}</span>
        </div>
      </div>
    </div>
  );
}

/* START> 2025-12-08 | Sphere -> Tharyn | CC
 * Working Directory field with relocation capability
 * Shows warning when directory doesn't exist, allows changing via folder picker
 * 2025-12-08 Initial implementation
 * 2025-12-20 Added Windows path display conversion
 */
function PreviewWorkingDirectory({ session }: { session: any }) {
  const { loadSessions } = useSessionStore();
  const [dirExists, setDirExists] = useState<boolean | null>(null);
  const [isRelocating, setIsRelocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayPath, setDisplayPath] = useState<string>('');

  const cwd = session.cwd || session.projectDisplay;

  // Convert to Windows path for display
  useEffect(() => {
    if (cwd) {
      window.electronAPI.toWindowsPath(cwd).then(setDisplayPath);
    }
  }, [cwd]);

  // Check if directory exists when session changes
  useEffect(() => {
    if (cwd) {
      window.electronAPI.checkDirectoryExists(cwd).then(setDirExists);
    }
  }, [cwd, session.sessionId]);

  const handleSelectDirectory = async () => {
    setError(null);
    const newPath = await window.electronAPI.selectDirectory();
    if (!newPath) return; // User cancelled

    setIsRelocating(true);
    try {
      const result = await window.electronAPI.relocateSession(session.sessionId, newPath);
      if (result.success) {
        // Refresh sessions to pick up the change
        loadSessions();
        setDirExists(true);
      } else {
        setError(result.error || 'Relocation failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRelocating(false);
    }
  };

  return (
    <div className="browse-preview-card space-y-3">
      <h3 className="browse-section-label">Working Directory</h3>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-cyber border border-border bg-bg-tertiary/60 px-3 py-2 text-sm">
          {dirExists === false && (
            <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" title="Directory does not exist" />
          )}
          <span className="truncate text-text-secondary" title={displayPath || cwd}>
            {displayPath || cwd || '(unknown)'}
          </span>
        </div>
        <button
          onClick={handleSelectDirectory}
          disabled={isRelocating}
          className="btn btn-secondary p-2"
          title="Change working directory"
        >
          <Folder size={16} />
        </button>
      </div>

      {dirExists === false && (
        <p className="text-xs text-yellow-500">
          ⚠️ Directory does not exist. Click the folder icon to relocate this session.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400">
          Error: {error}
        </p>
      )}

      {isRelocating && (
        <p className="text-xs text-text-secondary">
          Relocating session...
        </p>
      )}
    </div>
  );
}
// <END | Sphere -> Tharyn | CC

function PreviewSummary({ session }: { session: any }) {
  const { updateAnnotation } = useSessionStore();
  const [editing, setEditing] = useState(false);
  const [summaryValue, setSummaryValue] = useState(session.annotation?.userSummary || '');
  const resolvedSummary =
    session.annotation?.userSummary ||
    session.autoSummary ||
    session.firstMessage ||
    session.displaySummary ||
    '';

  const handleSubmit = () => {
    updateAnnotation(session.sessionId, { userSummary: summaryValue });
    setEditing(false);
  };

  // Update local state when session changes
  React.useEffect(() => {
    setSummaryValue(session.annotation?.userSummary || '');
  }, [session.sessionId, session.annotation?.userSummary]);

  return (
    <div className="browse-preview-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="browse-section-label">Summary</h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-accent hover:text-accent-hover"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={summaryValue}
            onChange={(e) => setSummaryValue(e.target.value)}
            placeholder="Enter your summary..."
            className="min-h-[80px] resize-y"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="btn btn-secondary text-sm py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="btn btn-primary text-sm py-1"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {resolvedSummary || (
            <span className="text-text-secondary italic">No summary available</span>
          )}
        </p>
      )}
    </div>
  );
}

function PreviewTags({ session }: { session: any }) {
  const { addTags, removeTag } = useSessionStore();
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  const tags = session.annotation?.tags || [];

  const handleAddTag = () => {
    if (newTag.trim()) {
      addTags(session.sessionId, [newTag.trim()]);
      setNewTag('');
      setAdding(false);
    }
  };

  const handleRemoveTag = (tag: string) => {
    removeTag(session.sessionId, tag);
  };

  return (
    <div className="browse-preview-card space-y-3">
      <h3 className="section-header">Tags</h3>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag: string) => (
          <span key={tag} className="tag-chip">
            #{tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="hover:text-accent"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {adding ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="tag name"
              className="text-sm py-1 px-2 w-24"
              autoFocus
              onBlur={() => !newTag && setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTag();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <button onClick={handleAddTag} className="text-accent">
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="tag-chip text-text-secondary hover:text-text-primary"
          >
            <Plus size={12} />
            Add tag
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewNotes({ session }: { session: any }) {
  const { updateAnnotation } = useSessionStore();
  const [editing, setEditing] = useState(false);
  const [notesValue, setNotesValue] = useState(session.annotation?.notes || '');

  const handleSubmit = () => {
    updateAnnotation(session.sessionId, { notes: notesValue });
    setEditing(false);
  };

  // Update local state when session changes
  React.useEffect(() => {
    setNotesValue(session.annotation?.notes || '');
  }, [session.sessionId, session.annotation?.notes]);

  return (
    <div className="browse-preview-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-header">Notes</h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-accent hover:text-accent-hover"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Add notes about this session..."
            className="min-h-[80px] resize-y"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="btn btn-secondary text-sm py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="btn btn-primary text-sm py-1"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm">
          {session.annotation?.notes || (
            <span className="text-text-secondary italic">No notes</span>
          )}
        </p>
      )}
    </div>
  );
}

function PreviewActions({ session }: { session: any }) {
  const { continueSession, branchSession } = useSessionStore();

  const handleContinue = () => {
    continueSession(session.sessionId);
  };

  const handleBranch = () => {
    console.log('Branch button clicked for session:', session.sessionId);
    // Note: window.prompt() is not supported in Electron, so we branch without a name
    // A proper dialog can be added later if branch names are needed
    console.log('Calling branchSession (no name)...');
    branchSession(session.sessionId, undefined);
  };

  const handleCopyId = () => {
    window.electronAPI.copyToClipboard(session.sessionId);
  };

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Replace local provider-specific synth with IPC getResumeInfo() (Phase 2.7 / 3.2)
      Why: Same drift as ContextMenu — Cursor sessions copied a Claude command from the preview pane
      Expected: Cursor preview Copy Resume Cmd produces a Cursor command; Claude/Codex unchanged
  */
  const handleCopyCommand = async () => {
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
  };

  return (
    <div className="browse-preview-card space-y-3">
      <h3 className="browse-section-label">Actions</h3>
      <div className="flex gap-2">
        <button onClick={handleContinue} className="btn btn-primary flex-1">
          <Play size={16} className="inline mr-2" />
          Continue
        </button>
        <button
          onClick={handleBranch}
          className="btn btn-secondary flex-1"
        >
          <GitBranch size={16} className="inline mr-2" />
          Branch
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopyId}
          className="btn btn-secondary flex-1 text-sm"
          title="Copy session ID"
        >
          <Copy size={14} className="inline mr-1" />
          Copy ID
        </button>
        <button
          onClick={handleCopyCommand}
          className="btn btn-secondary flex-1 text-sm"
          title="Copy resume command"
        >
          <Copy size={14} className="inline mr-1" />
          Copy Command
        </button>
        <button
          onClick={handleOpenFolder}
          className="btn btn-secondary text-sm"
          title="Open in file explorer"
        >
          <FolderOpen size={14} />
        </button>
      </div>
    </div>
  );
}

export default SessionPreview;
