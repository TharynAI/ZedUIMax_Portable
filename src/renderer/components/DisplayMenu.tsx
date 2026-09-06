/* START> Tharyn | ZedUI DisplayMenu
    2025-12-30
    What: Display resolution dropdown menu component
    Why: Allow quick switching between resolutions for individual or all displays
    Expected: Monitor icon dropdown with All + individual display options, each with resolution submenus
    2026-01-11
    What: Rename presets and add iPad Agent
    Why: Clearer naming for use case (PC Work, PC Agent, iPad Agent)
    Expected: Three resolution options with descriptive names
*/

import { useState, useEffect, useRef } from 'react';
import { Monitor, Check } from 'lucide-react';

interface Display {
  deviceName: string;
  displayNumber: number;
  currentWidth: number;
  currentHeight: number;
  isPrimary: boolean;
}

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const RESOLUTIONS: ResolutionOption[] = [
  { label: 'PC Work', width: 2560, height: 1440 },
  { label: 'PC Agent', width: 1600, height: 900 },
  { label: 'iPad Agent', width: 1680, height: 1050 },
];

export default function DisplayMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [hoveredDisplay, setHoveredDisplay] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load displays on mount
  useEffect(() => {
    loadDisplays();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHoveredDisplay(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const loadDisplays = async () => {
    try {
      const result = await window.electronAPI.getDisplays();
      if (result.success) {
        setDisplays(result.displays);
      } else {
        console.error('Failed to load displays:', result.error);
      }
    } catch (error) {
      console.error('Error loading displays:', error);
    }
  };

  const handleResolutionChange = async (deviceName: string, width: number, height: number) => {
    try {
      const result = await window.electronAPI.setResolution(deviceName, width, height);
      if (result.success) {
        console.log(`Resolution changed: ${result.message}`);
        // Reload displays to update current resolution indicators
        await loadDisplays();
      } else {
        console.error('Resolution change failed:', result.message);
      }
    } catch (error) {
      console.error('Error changing resolution:', error);
    }
    setIsOpen(false);
    setHoveredDisplay(null);
  };

  const isCurrentResolution = (display: Display, width: number, height: number): boolean => {
    return display.currentWidth === width && display.currentHeight === height;
  };

  const renderSubmenu = (display: Display | null) => {
    const displayKey = display?.deviceName || 'all';

    return (
      <div className="absolute left-full top-0 ml-1 bg-bg-secondary border border-border rounded shadow-lg min-w-[140px]">
        {RESOLUTIONS.map((res) => {
          const isCurrent = display ? isCurrentResolution(display, res.width, res.height) : false;

          return (
            <button
              key={res.label}
              className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center justify-between"
              onClick={() => handleResolutionChange(display?.deviceName || 'all', res.width, res.height)}
            >
              <span>{res.label}</span>
              {isCurrent && <Check size={14} className="text-accent" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="icon-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Display Resolution"
      >
        <Monitor size={27} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-bg-secondary border border-border rounded shadow-lg min-w-[180px] z-50">
          {/* "All" option at top */}
          <div
            className="relative"
            onMouseEnter={() => setHoveredDisplay('all')}
            onMouseLeave={() => setHoveredDisplay(null)}
          >
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center justify-between">
              <span className="font-medium">All Displays</span>
              <span className="text-xs text-text-tertiary">▸</span>
            </button>
            {hoveredDisplay === 'all' && renderSubmenu(null)}
          </div>

          <div className="h-px bg-border my-1" />

          {/* Individual displays */}
          {displays.map((display) => (
            <div
              key={display.deviceName}
              className="relative"
              onMouseEnter={() => setHoveredDisplay(display.deviceName)}
              onMouseLeave={() => setHoveredDisplay(null)}
            >
              <button className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary flex items-center justify-between">
                <span>
                  Display {display.displayNumber}
                  {display.isPrimary && <span className="text-xs text-accent ml-1">(Primary)</span>}
                </span>
                <span className="text-xs text-text-tertiary">▸</span>
              </button>
              {hoveredDisplay === display.deviceName && renderSubmenu(display)}
            </div>
          ))}

          {displays.length === 0 && (
            <div className="px-4 py-2 text-sm text-text-tertiary">
              No displays detected
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// <END Tharyn | ZedUI DisplayMenu
