/* START> Tharyn | ZedUIMax Launch Classification
    2026-09-12
    What: Collect category and summary before every new indexed CLI launch.
    Why: A new native session otherwise arrives as Ungrouped and becomes immediate cleanup noise.
    Expected: Claude2, Codex2, CursX, and Cursor launches enter the library already named and
         grouped; Resume is unchanged; Gemini states that its sessions are not indexed yet.
*/

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Play, Rocket, RotateCcw, X } from 'lucide-react';
import type { LaunchClassificationNotice } from '../../shared/launch-classification';
import { useSessionStore } from '../stores/session-store';

interface LauncherOption {
  id: string;
  label: string;
  indexed: boolean;
}

const LAUNCHERS: LauncherOption[] = [
  { id: 'claude2', label: 'Claude2', indexed: true },
  { id: 'codex2', label: 'Codex2', indexed: true },
  { id: 'cursx', label: 'CursX', indexed: true },
  { id: 'gemini3', label: 'Gemini3', indexed: false },
  { id: 'cursor', label: 'Cursor', indexed: true },
];

interface LaunchDraft {
  launcher: LauncherOption;
  userSummary: string;
  type: string;
}

export default function LauncherMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<LaunchClassificationNotice | null>(null);
  const [hoveredLauncher, setHoveredLauncher] = useState<string | null>(null);
  const [draft, setDraft] = useState<LaunchDraft | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const types = useSessionStore(state => state.types);
  const refreshData = useSessionStore(state => state.refreshData);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredLauncher(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    let active = true;
    void window.electronAPI.getLaunchClassificationNotices()
      .then(notices => {
        if (active && notices.length > 0) setNotice(notices[notices.length - 1]);
      })
      .catch(error => console.error('Unable to load launch classification notices:', error));

    const unsubscribe = window.electronAPI.onLaunchClassification(next => {
      if (!active) return;
      setNotice(next);
      if (next.state === 'applied') void refreshData();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshData]);

  useEffect(() => {
    if (!draft || isLaunching) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draft, isLaunching]);

  const runLaunch = async (
    launcher: LauncherOption,
    mode: 'new' | 'resume',
    classification?: { userSummary: string; type: string },
  ) => {
    setLaunchError(null);
    setIsLaunching(true);
    try {
      const result = await window.electronAPI.launchAssistant(launcher.id, mode, undefined, classification);
      if (!result.success) {
        setLaunchError(result.error || 'Unable to launch assistant.');
        return false;
      }
      if (result.classification) {
        setNotice(result.classification);
        if (result.classification.state === 'applied') void refreshData();
      }
      return true;
    } catch (error) {
      console.error('Error launching assistant:', error);
      setLaunchError(error instanceof Error ? error.message : 'Unable to launch assistant.');
      return false;
    } finally {
      setIsLaunching(false);
    }
  };

  const handleNew = (launcher: LauncherOption) => {
    setIsOpen(false);
    setHoveredLauncher(null);
    if (!launcher.indexed) {
      void runLaunch(launcher, 'new');
      return;
    }
    setLaunchError(null);
    setDraft({ launcher, userSummary: '', type: '' });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.userSummary.trim() || !draft.type.trim()) return;
    const launched = await runLaunch(draft.launcher, 'new', {
      userSummary: draft.userSummary,
      type: draft.type,
    });
    if (launched) setDraft(null);
  };

  const dismissNotice = async () => {
    if (launchError) {
      setLaunchError(null);
      return;
    }
    if (!notice) return;
    if (notice.id.startsWith('launch:')) {
      await window.electronAPI.dismissLaunchClassification(notice.id);
    }
    setNotice(null);
  };

  const renderSubmenu = (launcher: LauncherOption) => (
    <div className="absolute right-full top-0 pr-1">
      <div className="bg-bg-secondary border border-border rounded shadow-lg min-w-[132px]">
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center gap-2"
          onClick={() => handleNew(launcher)}
          title={launcher.indexed ? 'Launch with category and summary' : 'Launch only — sessions are not indexed yet'}
        >
          <Play size={14} />
          <span>{launcher.indexed ? 'New' : 'New · unindexed'}</span>
        </button>
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center gap-2"
          onClick={() => {
            setIsOpen(false);
            setHoveredLauncher(null);
            void runLaunch(launcher, 'resume');
          }}
        >
          <RotateCcw size={14} />
          <span>Resume</span>
        </button>
      </div>
    </div>
  );

  const canLaunch = Boolean(draft?.userSummary.trim() && draft?.type.trim()) && !isLaunching;
  const noticeTone = notice?.state === 'failed'
    ? 'failed'
    : notice?.state === 'applied'
      ? 'applied'
      : notice?.state === 'unsupported'
        ? 'unsupported'
        : 'pending';

  return (
    <div className="relative" ref={menuRef}>
      <button className="icon-btn" onClick={() => setIsOpen(!isOpen)} title="Launch Assistant">
        <Rocket size={27} />
      </button>

      {!draft && (launchError || notice) && (
        <div role="alert" className={`launch-classification-notice ${launchError ? 'failed' : noticeTone}`}>
          <span className="launch-classification-notice-icon">
            {noticeTone === 'applied' && !launchError
              ? <CheckCircle2 size={16} />
              : notice?.state === 'pending' && !launchError
                ? <Loader2 size={16} className="animate-spin" />
                : <AlertTriangle size={16} />}
          </span>
          <div>
            <strong>{launchError ? 'Launch failed' : notice?.launcherLabel}</strong>
            <p>{launchError || notice?.message}</p>
          </div>
          <button aria-label="Dismiss launch notice" title="Dismiss" onClick={() => void dismissNotice()}>
            <X size={14} />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-bg-secondary border border-border rounded shadow-lg min-w-[150px] z-50">
          {LAUNCHERS.map(launcher => (
            <div
              key={launcher.id}
              className="relative"
              onMouseEnter={() => setHoveredLauncher(launcher.id)}
              onMouseLeave={() => setHoveredLauncher(null)}
            >
              <button className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center justify-between">
                <span>{launcher.label}</span>
                <ChevronRight size={14} className="text-text-tertiary" />
              </button>
              {hoveredLauncher === launcher.id && renderSubmenu(launcher)}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="launch-classification-backdrop" role="presentation">
          <form className="launch-classification-dialog" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="launch-classification-title">
            <div className="launch-classification-kicker">Classify before launch</div>
            <div className="launch-classification-heading">
              <div>
                <h2 id="launch-classification-title">New {draft.launcher.label} session</h2>
                <p>The native session will enter the library with this identity.</p>
              </div>
              <span>{draft.launcher.label}</span>
            </div>

            <label className="launch-classification-field">
              <span>Summary</span>
              <input
                autoFocus
                maxLength={160}
                value={draft.userSummary}
                onChange={event => setDraft({ ...draft, userSummary: event.target.value })}
                placeholder="What is this session for?"
                disabled={isLaunching}
              />
              <small>{draft.userSummary.trim().length}/160</small>
            </label>

            <label className="launch-classification-field">
              <span>Category</span>
              <input
                list="launch-classification-types"
                maxLength={80}
                value={draft.type}
                onChange={event => setDraft({ ...draft, type: event.target.value })}
                placeholder="Select or enter a category"
                disabled={isLaunching}
              />
              <datalist id="launch-classification-types">
                {types.map(type => <option key={type.name} value={type.name} />)}
              </datalist>
            </label>

            {launchError && <p className="launch-classification-error">{launchError}</p>}

            <div className="launch-classification-footer">
              <p>Both fields are required. Cancel starts nothing.</p>
              <div>
                <button type="button" className="launch-classification-cancel" onClick={() => setDraft(null)} disabled={isLaunching}>Cancel</button>
                <button type="submit" className="launch-classification-submit" disabled={!canLaunch}>
                  {isLaunching ? <><Loader2 size={14} className="animate-spin" /> Launching</> : <><Rocket size={14} /> Launch & classify</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// <END Tharyn | ZedUIMax Launch Classification
