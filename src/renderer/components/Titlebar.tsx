import { useSessionStore } from '../stores/session-store';

export default function Titlebar() {
  const { sessions, isLoading, error } = useSessionStore();
  const handleMinimize = () => window.electronAPI.minimize();
  const handleMaximize = () => window.electronAPI.toggleMaximize();
  const handleClose = () => window.electronAPI.close();
  const healthTone = error ? 'error' : isLoading ? 'working' : 'ready';
  const healthLabel = error
    ? 'Index warning'
    : isLoading
      ? 'Indexing sessions'
      : `${sessions.length} sessions ready`;

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-title">
          <span className="titlebar-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className="titlebar-text">ZEDMAX</span>
          <span className="titlebar-subtitle">SESSION CONTROL</span>
          <span className="titlebar-version">v1.0</span>
        </div>
        <div className={`titlebar-health ${healthTone}`} title={error || healthLabel}>
          <i />
          <span>{healthLabel}</span>
        </div>
      </div>
      <div className="titlebar-controls" aria-label="window controls">
        <button className="titlebar-btn" onClick={handleMinimize} aria-label="Minimize">
          &#x2212;
        </button>
        <button className="titlebar-btn" onClick={handleMaximize} aria-label="Maximize / Restore">
          &#9633;
        </button>
        <button className="titlebar-btn titlebar-btn-close" onClick={handleClose} aria-label="Close">
          &#10005;
        </button>
      </div>
    </div>
  );
}
