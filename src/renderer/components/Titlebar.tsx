/* START> Tharyn | ZedUI Cyberpunk
    2025-12-28
    What: Custom frameless titlebar component
    Why: Enable cyberpunk aesthetic with custom window chrome
    Expected: Draggable titlebar with styled minimize/maximize/close controls
    2025-12-28
    What: Simplify for titleBarOverlay - remove custom buttons
    Why: Using native controls for Windows snap support
    Expected: Branding only, native controls handle min/max/close
*/

export default function Titlebar() {
  const handleMinimize = () => window.electronAPI.minimize();
  const handleMaximize = () => window.electronAPI.toggleMaximize();
  const handleClose = () => window.electronAPI.close();

  return (
    <div className="titlebar">
      {/* Drag region with branding - native controls rendered by titleBarOverlay */}
      <div className="titlebar-drag">
        <div className="titlebar-title">
          <span className="titlebar-icon">Z</span>
          <span className="titlebar-text">ZEDUI | MAX</span>
          <span className="titlebar-subtitle">SESSION LAUNCHER</span>
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
// <END Tharyn | ZedUI Cyberpunk
