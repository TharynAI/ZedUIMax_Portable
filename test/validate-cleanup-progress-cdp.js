/* START> Tharyn | ZedUI
    2026-09-12
    What: Validate the built cleanup dialog through CDP using renderer-only synthetic progress.
    Why: Exercise the visible production UI without deleting or editing live session data.
    Expected: Hide/reopen preserves work, the host is dimmed, and the dialog exposes useful progress.
    Run: npm run test:cleanup-progress:cdp (while npm run start:debug is active)
*/
(async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const store = window.__ZEDUI_STORE__;
  const initial = store.getState();
  if (!document.querySelector('button[title^="Delete oldest"]')) {
    throw new Error('Clean control is not visible');
  }
  if (initial.cleanupProgress.phase !== 'idle') {
    throw new Error(`Expected idle cleanup state, got ${initial.cleanupProgress.phase}`);
  }

  const syntheticProgress = {
    phase: 'deleting',
    limit: 20,
    total: 20,
    processed: 7,
    deleted: 6,
    skipped: 1,
    currentSessionId: 'codex:synthetic-visual-check',
    currentProviderId: 'codex',
    message: 'Processed 7 of 20 sessions',
    failures: [{
      sessionId: 'claude:synthetic-skipped-check',
      providerId: 'claude',
      error: 'Synthetic validation issue',
    }],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  store.setState({ cleanupProgress: syntheticProgress, cleanupDialogOpen: true });
  await pause(100);

  const firstDialog = document.querySelector('.cleanup-progress-dialog[data-cleanup-phase="deleting"]');
  if (!firstDialog) throw new Error('Progress dialog did not render');
  if (!firstDialog.querySelector('button[aria-label="Hide cleanup progress"]')?.className.includes('bg-black/65')) {
    throw new Error('Progress dialog did not dim the host');
  }

  store.getState().hideCleanupProgress();
  await pause(100);
  if (document.querySelector('.cleanup-progress-dialog')) throw new Error('Hide did not close the dialog');
  if (store.getState().cleanupProgress.processed !== 7) throw new Error('Hide discarded progress');

  document.querySelector('button[title="Open cleanup status"]')?.click();
  await pause(100);
  const reopened = document.querySelector('.cleanup-progress-dialog[data-cleanup-phase="deleting"]');
  if (!reopened) throw new Error('Clean control did not reopen progress');

  return {
    safe: 'renderer state only; no delete IPC invoked',
    phase: store.getState().cleanupProgress.phase,
    progress: `${store.getState().cleanupProgress.processed}/${store.getState().cleanupProgress.total}`,
    dimmed: true,
    hideReopen: true,
    dialogText: reopened.textContent.replace(/\s+/g, ' ').trim(),
  };
})()
// <END Tharyn | ZedUI
