import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSessionStore } from './stores/session-store';
import { useSettingsStore } from './stores/settings-store';
import SessionTree from './components/SessionTree';
import SessionPreview from './components/SessionPreview';
import SearchBar, { SearchBarRef } from './components/SearchBar';
import TreeModeSelector from './components/TreeModeSelector';
import ContextMenu from './components/ContextMenu';
import ConfirmDialog from './components/ConfirmDialog';
import CleanupProgressDialog from './components/CleanupProgressDialog';
import SettingsDialog from './components/SettingsDialog';
import TypePickerDialog from './components/TypePickerDialog';
import InputDialog from './components/InputDialog';
import ManageTypesDialog from './components/ManageTypesDialog';
import BulkActionBar from './components/BulkActionBar';
import MessageSearchResults from './components/MessageSearchResults';
import Titlebar from './components/Titlebar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Activity, Database, RefreshCw, Search, Settings } from 'lucide-react';
import { getTowerHandleLabel } from './providers/display';
/* START> Tharyn | ZedUI DisplayMenu
    2025-12-30
    What: Import DisplayMenu component
    Why: Add display resolution dropdown to toolbar
    Expected: DisplayMenu available for toolbar integration
*/
import DisplayMenu from './components/DisplayMenu';
// <END Tharyn | ZedUI DisplayMenu

/* START> Tharyn | ZedUI LauncherMenu
    2026-01-11
    What: Import LauncherMenu component
    Why: Add assistant launcher dropdown to toolbar
    Expected: LauncherMenu available for toolbar integration
*/
import LauncherMenu from './components/LauncherMenu';
// <END Tharyn | ZedUI LauncherMenu

/* START> 2025-12-01 | Sphere -> Tharyn | CC
* Expose Zustand store for test automation via Chrome DevTools Protocol
* Allows Claude to interact with UI programmatically via test-runner.js
* 2025-12-01 Initial implementation
* 2025-12-02 Added settings store exposure
*/
// Expose Zustand stores to window for test automation
(window as any).__ZEDUI_STORE__ = useSessionStore;
(window as any).__ZEDUI_SETTINGS__ = useSettingsStore;
// <END | Sphere -> Tharyn | CC

function App() {
  const { sessions, projects, loadSessions, loadProjects, loadTags, loadTypes, loadBranches, isLoading } = useSessionStore();
  const { loadSettings, openDialog: openSettingsDialog, settings, setZoomLevel } = useSettingsStore();
  const searchBarRef = useRef<SearchBarRef>(null);

  // Load data on mount
  useEffect(() => {
    loadSessions();
    loadProjects();
    loadTags();
    loadTypes();
    loadBranches();
    loadSettings();
  }, []);

  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Re-apply persisted providerFilter after settings load (OD-1)
      Why: loadSessions runs before loadSettings completes; without this re-apply,
           the persisted filter is ignored on first paint
      Expected: After settings load, session store adopts saved providerFilter and
                triggers a fresh loadSessions with the correct provider arg
  */
  const settingsIsLoaded = useSettingsStore(s => s.isLoaded);
  const persistedProviderFilter = useSettingsStore(s => s.settings.providerFilter);
  const sessionProviderFilter = useSessionStore(s => s.providerFilter);
  const setSessionProviderFilter = useSessionStore(s => s.setProviderFilter);
  useEffect(() => {
    if (!settingsIsLoaded) return;
    if (!persistedProviderFilter) return;
    if (persistedProviderFilter === sessionProviderFilter) return;
    setSessionProviderFilter(persistedProviderFilter);
    // setProviderFilter triggers loadSessions/loadProjects internally
  }, [settingsIsLoaded, persistedProviderFilter]);
  // <END Tharyn | CursorCLI

  // Enable keyboard shortcuts
  useKeyboardShortcuts({
    onFocusSearch: () => searchBarRef.current?.focus(),
  });

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Global zoom via Ctrl+scroll wheel
   * Scales entire UI uniformly, persisted to settings
   * 2025-12-08 Initial implementation
   * 2026-01-01 Switch from transform:scale to CSS zoom
   * What: Use CSS zoom instead of transform:scale
   * Why: transform:scale doesn't affect layout - flexbox children calculated wrong
   * Expected: Status bar stays at bottom, content areas flex properly at all zoom levels
   */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoomLevel(settings.zoomLevel + delta);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [settings.zoomLevel, setZoomLevel]);

  // Compute zoom styles using CSS zoom for better flexbox compatibility
  // CSS zoom (non-standard but supported in Chromium/Electron) properly affects layout
  // unlike transform: scale() which only visually scales without affecting flexbox calculations
  const zoomStyle = useMemo(() => ({
    zoom: settings.zoomLevel,
  }), [settings.zoomLevel]);
  // <END | Sphere -> Tharyn | CC

  /* START> 2026-01-02 | Tharyn | ZedUI Scrollbars
   * Dynamic scrollbar sizing via injected style element
   * CSS ::-webkit-scrollbar doesn't support calc() with CSS vars
   * Must inject/update style element when settings change
   * Uses !important to override base CSS in index.css
   */
  useEffect(() => {
    const styleId = 'zedui-scrollbar-styles';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      ::-webkit-scrollbar {
        width: ${settings.scrollbarWidth}px !important;
        height: ${settings.scrollbarHeight}px !important;
      }
    `;
  }, [settings.scrollbarWidth, settings.scrollbarHeight]);
  // <END Tharyn | ZedUI Scrollbars

  const handleRefresh = () => {
    loadSessions();
    loadProjects();
    loadTags();
    loadBranches();
  };

  /* START> Tharyn | ZedMax
      2026-09-12
      What: Replace the legacy horizontal tabs with the current ZedCache-family rail and dashboard shell.
      Why: View and ProEng are deprecated; ZedMax now has one focused session-management workspace.
      Expected: Browse, search, launch, display, refresh, settings, cleanup, and session actions remain available.
  */
  return (
    <div className="zed-app-shell">
      <Titlebar />

      <div className="zed-workspace" style={zoomStyle}>
        <NavigationRail
          onFocusSearch={() => searchBarRef.current?.focus()}
          onOpenSettings={openSettingsDialog}
        />

        <main className="zed-main-view">
          <header className="zed-view-heading">
            <div>
              <span className="zed-eyebrow">Session operations</span>
              <h1>Session Library</h1>
              <p>Find, classify, and resume agent work across every harness.</p>
            </div>
            <div className="zed-header-actions">
              <div className="zed-index-state" title="Sessions currently indexed in this view">
                <i />
                <span>{sessions.length} indexed</span>
              </div>
              <LauncherMenu />
              <DisplayMenu />
              <button className="icon-btn" onClick={handleRefresh} title="Refresh session index">
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </header>

          <SessionMetrics sessions={sessions} projectCount={projects.length} />

          <div className="zed-workbench-wrap">
            <BrowseTab searchBarRef={searchBarRef} />
          </div>

          <StatusBar />
        </main>
      </div>

      {/* Context menu (portal) */}
      <ContextMenu />

      {/* Confirmation dialog (portal) */}
      <ConfirmDialog />

      {/* Ungrouped cleanup progress (persists when hidden) */}
      <CleanupProgressDialog />

      {/* Settings dialog (portal) */}
      <SettingsDialog />

      {/* Type picker dialog (portal) */}
      <TypePickerDialog />

      {/* Shared type management dialog */}
      <ManageTypesDialog />

      {/* Input dialog for editing summaries */}
      <InputDialog />

      {/* Bulk action bar (appears when multi-selecting) */}
      <BulkActionBar />
    </div>
  );
  // <END Tharyn | ZedMax
}

interface BrowseTabProps {
  searchBarRef: React.RefObject<SearchBarRef>;
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Session Message Search integration
* Show MessageSearchResults when message search is enabled
* 2025-12-02 Initial implementation
*/
function BrowseTab({ searchBarRef }: BrowseTabProps) {
  const {
    messageSearchEnabled,
    messageSearchResults,
    messageSearchLoading,
    searchQuery,
    selectSession,
  } = useSessionStore();
  const { settings, saveSettings } = useSettingsStore();
  const [sidebarWidth, setSidebarWidth] = useState<number>(settings.sidebarWidth || 420);

  useEffect(() => {
    if (settings.sidebarWidth && settings.sidebarWidth !== sidebarWidth) {
      setSidebarWidth(settings.sidebarWidth);
    }
  }, [settings.sidebarWidth]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let latest = startWidth;

    const handleMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.min(640, Math.max(240, startWidth + delta));
      latest = next;
      setSidebarWidth(next);
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      saveSettings({ sidebarWidth: latest });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleSelectMessageResult = useCallback((sessionId: string, messageIndex: number) => {
    void messageIndex;
    selectSession(sessionId);
  }, [selectSession]);

  return (
    <div className="zed-session-workbench">
      {/* Left panel - Tree or Message Search Results */}
      <div
        className="zed-session-index"
        style={{ width: sidebarWidth, minWidth: 240, maxWidth: 640 }}
      >
        <div className="zed-index-tools">
          <SearchBar ref={searchBarRef} />
          {!messageSearchEnabled && <TreeModeSelector />}
        </div>
        <div className="zed-index-scroll">
          {messageSearchEnabled ? (
            <MessageSearchResults
              results={messageSearchResults}
              isLoading={messageSearchLoading}
              query={searchQuery}
              onSelectSession={handleSelectMessageResult}
            />
          ) : (
            <SessionTree />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="resize-handle"
        onMouseDown={startResize}
        role="separator"
        aria-label="Resize sidebar"
      />

      {/* Right panel - Preview */}
      <div className="zed-session-review">
        <SessionPreview />
      </div>
    </div>
  );
}
// <END | Sphere -> Tharyn | CC

function NavigationRail({
  onFocusSearch,
  onOpenSettings,
}: {
  onFocusSearch: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="zed-nav-rail" aria-label="ZedMax navigation">
      <button type="button" className="active" title="Session library" aria-current="page">
        <Database size={18} />
        <span>Sessions</span>
      </button>
      <button type="button" onClick={onFocusSearch} title="Focus session search">
        <Search size={18} />
        <span>Search</span>
      </button>
      <div className="zed-rail-spacer" />
      <div className="zed-rail-health" title="Local session index ready">
        <Activity size={14} />
        <span>Ready</span>
      </div>
      <button type="button" onClick={onOpenSettings} title="Open settings">
        <Settings size={18} />
        <span>Settings</span>
      </button>
    </nav>
  );
}

function SessionMetrics({
  sessions,
  projectCount,
}: {
  sessions: ReturnType<typeof useSessionStore.getState>['sessions'];
  projectCount: number;
}) {
  const grouped = sessions.filter((session) => (session.annotation?.type || 'Ungrouped') !== 'Ungrouped').length;
  const favorites = sessions.filter((session) => session.annotation?.isFavorite).length;
  const providers = new Set(sessions.map((session) => session.product || session.providerId)).size;

  return (
    <section className="zed-metric-grid" aria-label="Visible session totals">
      <Metric label="Visible sessions" value={sessions.length} detail="current filter" tone="amber" />
      <Metric label="Projects" value={projectCount} detail="active roots" />
      <Metric label="Grouped" value={grouped} detail="classified sessions" />
      <Metric label="Harnesses" value={providers} detail={`${favorites} favorites`} />
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: 'amber';
}) {
  return (
    <article className={`zed-metric ${tone === 'amber' ? 'amber' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusBar() {
  const { sessions, selectedSession } = useSessionStore();
  const towerHandle = selectedSession
    ? getTowerHandleLabel(selectedSession.annotation?.callSign, selectedSession.sessionId)
    : null;

  return (
    <footer className="zed-status-bar">
      <div>
        {selectedSession ? (
          <>
            {towerHandle && <span className="zed-status-handle">{towerHandle}</span>}
            <span>Session {selectedSession.shortId}</span>
            <span>{selectedSession.messageCount} messages</span>
            <span>{selectedSession.projectDisplay}</span>
          </>
        ) : (
          <span>{sessions.length} sessions</span>
        )}
      </div>
      <span className="zed-status-product">ZedMax · session control</span>
    </footer>
  );
}

export default App;
