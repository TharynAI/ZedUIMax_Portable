import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSessionStore } from './stores/session-store';
import { useSettingsStore } from './stores/settings-store';
import SessionTree from './components/SessionTree';
import SessionPreview from './components/SessionPreview';
import SearchBar, { SearchBarRef } from './components/SearchBar';
import TreeModeSelector from './components/TreeModeSelector';
import ContextMenu from './components/ContextMenu';
import MessageContextMenu from './components/MessageContextMenu';
import ConfirmDialog from './components/ConfirmDialog';
import SettingsDialog from './components/SettingsDialog';
import TypePickerDialog from './components/TypePickerDialog';
import InputDialog from './components/InputDialog';
import ProEngTab from './components/ProEngTab';
import ManageTypesDialog from './components/ManageTypesDialog';
/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Replace ConversationViewer with new ConversationView
    Why: New component uses react-virtuoso for better performance
    Expected: View tab displays conversations with smooth scrolling
*/
import ConversationView from './components/ConversationView';
// <END Tharyn | ZedUI ViewTab
import BulkActionBar from './components/BulkActionBar';
import MessageSearchResults from './components/MessageSearchResults';
import Titlebar from './components/Titlebar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { RefreshCw, Settings, FolderOpen, FileText, Sparkles } from 'lucide-react';
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

/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Rename 'edit' tab to 'view'
    Why: Tab now focuses on viewing conversations, not editing
    Expected: Tab type updated throughout app
*/
type Tab = 'browse' | 'view' | 'proeng';
// <END Tharyn | ZedUI ViewTab

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const { loadSessions, loadProjects, loadTags, loadTypes, loadBranches, isLoading } = useSessionStore();
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
    height: '100%',
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

  /* START> Tharyn | ZedUI Cyberpunk
      2025-12-28
      What: Add Titlebar outside zoom wrapper
      Why: Titlebar should not scale with zoom, remain fixed at top
      Expected: Frameless window with custom titlebar controls
      2025-12-28
      What: Restore titlebar for native Windows with titleBarOverlay
      Why: titleBarOverlay works on native Windows, enables snap + custom branding
      Expected: Native Windows snap with custom titlebar branding
      2025-12-28
      What: Add full-width separator below titlebar
      Why: CSS border on titlebar was cut off by Windows native controls
      Expected: Edge-to-edge separator line under titlebar + Windows buttons
  */
  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Custom Titlebar - branding only, native controls via titleBarOverlay */}
      <Titlebar />
      {/* Full-width separator below titlebar + Windows controls */}
      <div className="h-px bg-border flex-shrink-0" />

      {/* Zoomable content area */}
      <div className="flex flex-col flex-1 overflow-hidden" style={zoomStyle}>
        {/* Tab bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border">
          <div className="flex gap-1">
            <button
              className={`tab ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={16} />
                Browse
              </div>
            </button>
            <button
              className={`tab ${activeTab === 'view' ? 'active' : ''}`}
              onClick={() => setActiveTab('view')}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} />
                View
              </div>
            </button>
            <button
              className={`tab ${activeTab === 'proeng' ? 'active' : ''}`}
              onClick={() => setActiveTab('proeng')}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                ProEng
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* START> Tharyn | ZedUI LauncherMenu
                2026-01-11
                What: Add LauncherMenu to toolbar
                Why: Quick access to launch AI assistants
                Expected: Rocket icon dropdown appears in toolbar
            */}
            <LauncherMenu />
            {/* <END Tharyn | ZedUI LauncherMenu */}

            {/* START> Tharyn | ZedUI DisplayMenu
                2025-12-30
                What: Add DisplayMenu to toolbar left of refresh button
                Why: Allow quick resolution switching for displays
                Expected: Monitor icon dropdown appears in toolbar
            */}
            <DisplayMenu />
            {/* <END Tharyn | ZedUI DisplayMenu */}
            <button
              className="icon-btn"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw size={27} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              className="icon-btn"
              onClick={openSettingsDialog}
              title="Settings"
            >
              <Settings size={27} />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'browse' && <BrowseTab searchBarRef={searchBarRef} onSwitchToEdit={() => setActiveTab('view')} />}
          {activeTab === 'view' && <ViewTab />}
          {activeTab === 'proeng' && <ProEngTab />}
        </div>

        {/* Status bar */}
        <StatusBar activeTab={activeTab} />
      </div>

      {/* Context menu (portal) */}
      <ContextMenu />

      {/* Message context menu for View tab */}
      <MessageContextMenu />

      {/* Confirmation dialog (portal) */}
      <ConfirmDialog />

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
  // <END Tharyn | ZedUI Cyberpunk
}

interface BrowseTabProps {
  searchBarRef: React.RefObject<SearchBarRef>;
  onSwitchToEdit: () => void;
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Session Message Search integration
* Show MessageSearchResults when message search is enabled
* 2025-12-02 Initial implementation
*/
function BrowseTab({ searchBarRef, onSwitchToEdit }: BrowseTabProps) {
  const {
    messageSearchEnabled,
    messageSearchResults,
    messageSearchLoading,
    searchQuery,
    setTargetMessage,
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
    // Set the target message and switch to Edit tab
    setTargetMessage(sessionId, messageIndex);
    onSwitchToEdit();
  }, [setTargetMessage, onSwitchToEdit]);

  return (
    <div className="flex h-full bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_28%),linear-gradient(180deg,_rgba(32,32,32,0.98),_rgba(20,20,20,0.98))]">
      {/* Left panel - Tree or Message Search Results */}
      <div
        className="flex flex-col border-r border-border bg-bg-secondary/35"
        style={{ width: sidebarWidth, minWidth: 240, maxWidth: 640 }}
      >
        <div className="border-b border-border px-3 py-3 space-y-3 bg-bg-secondary/80">
          <SearchBar ref={searchBarRef} />
          {!messageSearchEnabled && <TreeModeSelector />}
        </div>
        <div className="flex-1 overflow-auto px-2 py-2">
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
      <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,_rgba(28,28,28,0.8),_rgba(18,18,18,0.92))]">
        <SessionPreview />
      </div>
    </div>
  );
}
// <END | Sphere -> Tharyn | CC

/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Rename EditTab to ViewTab, use new ConversationView
    Why: View tab rebuilt with react-virtuoso for performance
    Expected: Smooth conversation viewing experience
*/
function ViewTab() {
  return <ConversationView />;
}
// <END Tharyn | ZedUI ViewTab

function StatusBar({ activeTab }: { activeTab: Tab }) {
  const { sessions, selectedSession } = useSessionStore();

  if (activeTab === 'proeng') {
    return (
      <div className="flex items-center justify-between px-4 py-1 bg-bg-secondary border-t border-border text-sm text-text-secondary">
        <div className="flex items-center gap-4">
          <span>Prompt engineering workspace</span>
          <span>Three-pane layout</span>
        </div>
        <div>
          ZedUI Session Launcher
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-bg-secondary border-t border-border text-sm text-text-secondary">
      <div className="flex items-center gap-4">
        {selectedSession ? (
          <>
            <span>Selected: {selectedSession.shortId}</span>
            <span>{selectedSession.messageCount} messages</span>
            <span>{selectedSession.projectDisplay}</span>
          </>
        ) : (
          <span>{sessions.length} sessions</span>
        )}
      </div>
      <div>
        ZedUI Session Launcher
      </div>
    </div>
  );
}

export default App;
