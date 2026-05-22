/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Context menu component for message right-click actions
    Why: Allow Copy message, Branch placeholder for Phase 3
    Expected: Menu appears at cursor, Copy works, Branch shows disabled
*/
import { useEffect, useCallback } from 'react';
import { Copy, GitBranch } from 'lucide-react';
import { useMessageContextMenuStore } from '../stores/message-context-menu-store';

export default function MessageContextMenu() {
  const { isOpen, x, y, content, hide } = useMessageContextMenuStore();

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = () => hide();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    // Delay to prevent immediate close from the right-click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, hide]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      hide();
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  }, [content, hide]);

  const handleBranch = useCallback(() => {
    // Phase 3 placeholder - disabled for now
    // TODO: Implement branch from message
  }, []);

  if (!isOpen) return null;

  // Adjust position to keep menu in viewport
  const menuWidth = 180;
  const menuHeight = 100;
  const padding = 8;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - padding);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - padding);

  return (
    <div
      className="fixed z-50 context-menu"
      style={{
        left: adjustedX,
        top: adjustedY,
        minWidth: menuWidth,
      }}
    >
      {/* Copy */}
      <button
        className="context-menu-item w-full"
        onClick={handleCopy}
      >
        <Copy size={14} />
        <span>Copy</span>
      </button>

      {/* Divider */}
      <div className="context-menu-divider" />

      {/* Branch - disabled placeholder for Phase 3 */}
      <button
        className="context-menu-item w-full opacity-50 cursor-not-allowed"
        onClick={handleBranch}
        disabled
        title="Coming in Phase 3"
      >
        <GitBranch size={14} />
        <span>Branch from here</span>
      </button>
    </div>
  );
}
// <END Tharyn | ZedUI ViewTab
