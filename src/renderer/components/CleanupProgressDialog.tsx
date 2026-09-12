import { useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useSessionStore, type CleanupPhase } from '../stores/session-store';

/* START> Tharyn | ZedUI
    2026-09-12
    What: Present persistent, staged Ungrouped cleanup progress over a dimmed host app.
    Why: Cleanup previously appeared to freeze while sequential filesystem and database work ran invisibly.
    Expected: Users can see, hide, reopen, and inspect cleanup progress without starting duplicate work.
*/
const ACTIVE_PHASES: CleanupPhase[] = ['discovering', 'deleting', 'refreshing'];

const phaseLabel: Record<CleanupPhase, string> = {
  idle: 'Idle',
  discovering: 'Finding sessions',
  deleting: 'Deleting sessions',
  refreshing: 'Refreshing library',
  complete: 'Cleanup complete',
  failed: 'Cleanup stopped',
};

function CleanupProgressDialog() {
  const {
    cleanupDialogOpen,
    cleanupProgress,
    hideCleanupProgress,
    clearCleanupProgress,
  } = useSessionStore();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const isActive = ACTIVE_PHASES.includes(cleanupProgress.phase);
  const isFailed = cleanupProgress.phase === 'failed';
  const isComplete = cleanupProgress.phase === 'complete';
  const isVisible = cleanupDialogOpen && cleanupProgress.phase !== 'idle';

  const progressPercent = useMemo(() => {
    if (cleanupProgress.phase === 'discovering') return 4;
    if (cleanupProgress.phase === 'deleting') {
      if (!cleanupProgress.total) return 8;
      return Math.max(8, Math.min(92, Math.round((cleanupProgress.processed / cleanupProgress.total) * 92)));
    }
    if (cleanupProgress.phase === 'refreshing') return 96;
    if (isComplete) return 100;
    return Math.max(4, cleanupProgress.total
      ? Math.round((cleanupProgress.processed / cleanupProgress.total) * 92)
      : 4);
  }, [cleanupProgress.phase, cleanupProgress.processed, cleanupProgress.total, isComplete]);

  useEffect(() => {
    if (!isVisible) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isActive) hideCleanupProgress();
      else clearCleanupProgress();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearCleanupProgress, hideCleanupProgress, isActive, isVisible]);

  if (!isVisible) return null;

  const closeDialog = () => {
    if (isActive) hideCleanupProgress();
    else clearCleanupProgress();
  };

  const stageClass = (phase: CleanupPhase) => {
    const order: CleanupPhase[] = ['discovering', 'deleting', 'refreshing'];
    const currentIndex = order.indexOf(cleanupProgress.phase);
    const stageIndex = order.indexOf(phase);
    const passed = isComplete || (currentIndex >= 0 && stageIndex < currentIndex);
    const current = cleanupProgress.phase === phase;
    return passed
      ? 'border-green-500/45 bg-green-500/10 text-green-300'
      : current
        ? 'border-accent/60 bg-accent/15 text-accent shadow-glow-sm'
        : 'border-border bg-bg-primary/65 text-text-muted';
  };

  return (
    <div
      className="cleanup-progress-dialog fixed inset-0 z-50 flex items-center justify-center"
      data-cleanup-phase={cleanupProgress.phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cleanup-progress-title"
    >
      <button
        type="button"
        aria-label={isActive ? 'Hide cleanup progress' : 'Close cleanup result'}
        className="absolute inset-0 w-full h-full bg-black/65 backdrop-blur-sm cursor-default"
        onClick={closeDialog}
      />

      <div className={`relative w-full max-w-xl mx-4 overflow-hidden rounded-cyber border bg-bg-secondary shadow-cyber ${
        isFailed ? 'border-red-500/55' : 'border-accent-border'
      }`}>
        <div className="h-0.5 bg-bg-primary overflow-hidden">
          <div
            className={`cleanup-progress-track h-full transition-[width] duration-300 ${isFailed ? 'bg-red-500' : 'bg-accent'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-cyber border ${
              isFailed
                ? 'border-red-500/45 bg-red-500/15 text-red-400'
                : isComplete
                  ? 'border-green-500/45 bg-green-500/15 text-green-400'
                  : 'border-accent/45 bg-accent/10 text-accent'
            }`}>
              {isFailed
                ? <AlertTriangle size={21} />
                : isComplete
                  ? <CheckCircle2 size={21} />
                  : <Loader2 size={21} className="animate-spin" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">Ungrouped session maintenance</p>
              <h2 id="cleanup-progress-title" className="truncate text-lg font-semibold text-text-primary">
                {phaseLabel[cleanupProgress.phase]}
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDialog}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-cyber transition-colors"
            title={isActive ? 'Hide while cleanup continues' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.12em]">
            <div className={`flex items-center justify-center gap-1.5 border px-2 py-2 rounded-cyber ${stageClass('discovering')}`}>
              <Search size={12} /> Find
            </div>
            <div className={`flex items-center justify-center gap-1.5 border px-2 py-2 rounded-cyber ${stageClass('deleting')}`}>
              <Trash2 size={12} /> Delete
            </div>
            <div className={`flex items-center justify-center gap-1.5 border px-2 py-2 rounded-cyber ${stageClass('refreshing')}`}>
              <RefreshCw size={12} /> Refresh
            </div>
          </div>

          <div aria-live="polite" aria-atomic="true">
            <div className="mb-2 flex items-end justify-between gap-3">
              <p className="text-sm text-text-primary">{cleanupProgress.message}</p>
              <span className="flex-none font-mono text-xs text-accent">{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-cyber border border-border bg-bg-primary">
              <div
                className={`h-full transition-[width] duration-300 ${isFailed ? 'bg-red-500' : 'bg-accent shadow-glow-sm'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-cyber border border-border bg-border">
            <Metric label="Found" value={cleanupProgress.total || '—'} />
            <Metric label="Removed" value={cleanupProgress.deleted} tone="success" />
            <Metric label="Skipped" value={cleanupProgress.skipped} tone={cleanupProgress.skipped ? 'error' : 'default'} />
          </div>

          {(cleanupProgress.currentSessionId || cleanupProgress.currentProviderId) && (
            <div className="flex items-start gap-3 rounded-cyber border border-accent-border bg-bg-primary/75 px-3 py-3">
              <Database size={15} className="mt-0.5 flex-none text-accent" />
              <div className="min-w-0 font-mono text-xs">
                <p className="text-text-secondary">Current item</p>
                <p className="truncate text-text-primary">
                  {cleanupProgress.currentProviderId || 'unknown'} · {cleanupProgress.currentSessionId || 'unknown'}
                </p>
              </div>
            </div>
          )}

          {cleanupProgress.failures.length > 0 && (
            <div className="max-h-32 overflow-auto rounded-cyber border border-red-500/30 bg-red-500/5 px-3 py-2">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-red-300">
                Issues
              </p>
              {cleanupProgress.failures.slice(-5).map((failure, index) => (
                <p key={`${failure.providerId}-${failure.sessionId}-${index}`} className="truncate font-mono text-[11px] text-red-200/85">
                  {failure.providerId}{failure.sessionId ? ` · ${failure.sessionId}` : ''}: {failure.error}
                </p>
              ))}
            </div>
          )}

          {isActive && (
            <p className="text-xs text-text-secondary">
              You can hide this window while cleanup continues. Closing ZedUI interrupts the active cleanup.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-border bg-bg-tertiary/50 px-5 py-3">
          <p className="font-mono text-[11px] text-text-secondary">
            Batch limit {cleanupProgress.limit}
          </p>
          <button
            type="button"
            onClick={closeDialog}
            className={isActive ? 'btn btn-secondary flex items-center gap-2' : 'btn btn-primary'}
          >
            {isActive && <EyeOff size={14} />}
            {isActive ? 'Hide' : 'Done'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'error';
}) {
  const toneClass = tone === 'success'
    ? 'text-green-400'
    : tone === 'error'
      ? 'text-red-400'
      : 'text-text-primary';

  return (
    <div className="bg-bg-primary/80 px-3 py-3 text-center">
      <p className={`font-mono text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">{label}</p>
    </div>
  );
}

export default CleanupProgressDialog;
// <END Tharyn | ZedUI
