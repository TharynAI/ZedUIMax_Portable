/* START> Tharyn | ZedUI LauncherMenu
    2026-01-11
    What: Dropdown menu to launch AI assistants (Claude, Codex, Gemini)
    Why: Quick access to launch new or resume sessions for different AI tools
    Expected: Rocket icon dropdown with Claude2, Codex2, Gemini3 submenus
*/

import { useState, useEffect, useRef } from 'react';
import { Rocket, ChevronRight, Play, RotateCcw } from 'lucide-react';

interface LauncherOption {
  id: string;
  label: string;
}

/* START> Tharyn | CursorCLI
    2026-05-03
    What: Add Cursor entry to launcher dropdown
    Why: Phase 2 — let users start a new Cursor session or resume the latest from the Rocket menu
    Expected: LauncherMenu shows Cursor below Gemini3 with New/Resume submenu
*/
const LAUNCHERS: LauncherOption[] = [
  { id: 'claude2', label: 'Claude2' },
  { id: 'codex2', label: 'Codex2' },
  { id: 'gemini3', label: 'Gemini3' },
  { id: 'cursor', label: 'Cursor' },
];
// <END Tharyn | CursorCLI

export default function LauncherMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredLauncher, setHoveredLauncher] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHoveredLauncher(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleLaunch = async (launcherId: string, mode: 'new' | 'resume') => {
    try {
      const result = await window.electronAPI.launchAssistant(launcherId, mode);
      if (!result.success) {
        console.error('Launch failed:', result.error);
      }
    } catch (error) {
      console.error('Error launching assistant:', error);
    }
    setIsOpen(false);
    setHoveredLauncher(null);
  };

  const renderSubmenu = (launcher: LauncherOption) => {
    return (
      <div className="absolute left-full top-0 ml-1 bg-bg-secondary border border-border rounded shadow-lg min-w-[100px]">
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center gap-2"
          onClick={() => handleLaunch(launcher.id, 'new')}
        >
          <Play size={14} />
          <span>New</span>
        </button>
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center gap-2"
          onClick={() => handleLaunch(launcher.id, 'resume')}
        >
          <RotateCcw size={14} />
          <span>Resume</span>
        </button>
      </div>
    );
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="icon-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Launch Assistant"
      >
        <Rocket size={27} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-bg-secondary border border-border rounded shadow-lg min-w-[140px] z-50">
          {LAUNCHERS.map((launcher) => (
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
    </div>
  );
}

// <END Tharyn | ZedUI LauncherMenu
