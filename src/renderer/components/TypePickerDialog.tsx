/* START> Tharyn | ZedUI Windows
    2025-12-28
    What: TypePickerDialog component with combo box
    Why: Allow user to type new category or pick from existing ones
    Expected: Input field with dropdown of existing types, filtered as user types
    2025-12-28
    What: Fix dropdown not showing - add debug logging, fix CSS structure
    Why: Dropdown was not appearing due to CSS positioning and missing feedback
    Expected: Dropdown shows on focus/click, with proper positioning below input
*/
import { useEffect, useState, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { create } from 'zustand';

interface TypePickerState {
  isOpen: boolean;
  sessionId: string | null;
  currentType: string;
  onConfirm: ((type: string) => void) | null;
  open: (sessionId: string, currentType: string, onConfirm: (type: string) => void) => void;
  close: () => void;
}

export const useTypePickerStore = create<TypePickerState>((set) => ({
  isOpen: false,
  sessionId: null,
  currentType: '',
  onConfirm: null,
  open: (sessionId, currentType, onConfirm) => set({ isOpen: true, sessionId, currentType, onConfirm }),
  close: () => set({ isOpen: false, sessionId: null, currentType: '', onConfirm: null }),
}));

// Expose for CDP testing
if (typeof window !== 'undefined') {
  (window as any).__TYPE_PICKER_STORE__ = useTypePickerStore;
}

interface TypeInfo {
  name: string;
  count: number;
}

function TypePickerDialog() {
  const { isOpen, currentType, onConfirm, close } = useTypePickerStore();
  const [inputValue, setInputValue] = useState('');
  const [existingTypes, setExistingTypes] = useState<TypeInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showAllTypes, setShowAllTypes] = useState(false); // When true, show all types unfiltered
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load existing types when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInputValue(currentType || '');
      setShowDropdown(false);
      setHighlightedIndex(-1);

      // Fetch existing types
      window.electronAPI.getAllTypes().then((types) => {
        setExistingTypes(types || []);
      }).catch(() => {
        setExistingTypes([]);
      });

      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, currentType]);

  // Handle escape key and click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDropdown) {
          setShowDropdown(false);
        } else {
          close();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, showDropdown, close]);

  if (!isOpen) return null;

  // Filter types based on input (unless showAllTypes is true from button click)
  const filteredTypes = showAllTypes
    ? existingTypes
    : existingTypes.filter((t) =>
        t.name.toLowerCase().includes(inputValue.toLowerCase())
      );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
    setShowAllTypes(false); // When typing, filter the results
    setHighlightedIndex(-1);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setHighlightedIndex((prev) =>
        prev < filteredTypes.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredTypes.length) {
        handleSelectType(filteredTypes[highlightedIndex].name);
      } else {
        handleConfirm();
      }
    } else if (e.key === 'Tab' && showDropdown && filteredTypes.length > 0) {
      e.preventDefault();
      // Auto-complete with first match
      if (highlightedIndex >= 0) {
        setInputValue(filteredTypes[highlightedIndex].name);
      } else if (filteredTypes.length > 0) {
        setInputValue(filteredTypes[0].name);
      }
      setShowDropdown(false);
    }
  };

  const handleSelectType = (typeName: string) => {
    setInputValue(typeName);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (onConfirm) {
      onConfirm(trimmed);
    }
    close();
  };

  const handleClear = () => {
    if (onConfirm) {
      onConfirm('');
    }
    close();
  };

  const handleToggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!showDropdown) {
      setShowAllTypes(true); // When opening via button, show all types
    }
    setShowDropdown(!showDropdown);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      {/* Dialog - Cyberpunk styling */}
      <div className="relative bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Set Type</h2>
          <button
            onClick={close}
            className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <div ref={containerRef}>
            <label className="block text-sm text-text-secondary mb-1">
              Type a new category or select existing
            </label>
            {/* Input with separate dropdown button */}
            <div className="relative">
              <div className="flex gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Enter type..."
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleToggleDropdown}
                  className="px-2 bg-bg-tertiary border border-border rounded-cyber hover:bg-bg-elevated transition-colors flex items-center"
                  title="Show existing types"
                >
                  <ChevronDown size={18} className={`text-text-secondary transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Dropdown - positioned below input row */}
              {showDropdown && filteredTypes.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 bg-bg-tertiary border border-border rounded-cyber shadow-lg max-h-72 overflow-auto">
                  {filteredTypes.map((type, index) => (
                    <button
                      key={type.name}
                      type="button"
                      onClick={() => handleSelectType(type.name)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-bg-elevated transition-colors ${
                        index === highlightedIndex ? 'bg-bg-elevated' : ''
                      }`}
                    >
                      <span className="text-text-primary">{type.name}</span>
                      <span className="text-text-secondary text-xs">({type.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Show "no matches" hint when typing but no matches in existing */}
              {showDropdown && inputValue && filteredTypes.length === 0 && existingTypes.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 bg-bg-tertiary border border-border rounded-cyber shadow-lg px-3 py-2">
                  <span className="text-text-secondary text-sm">New type: "{inputValue}"</span>
                </div>
              )}

              {/* Show hint when no types exist yet */}
              {showDropdown && existingTypes.length === 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 bg-bg-tertiary border border-border rounded-cyber shadow-lg px-3 py-2">
                  <span className="text-text-secondary text-sm">No existing types - enter a new one</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button
            onClick={handleClear}
            className="btn btn-secondary text-sm"
          >
            Clear Type
          </button>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="btn btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary text-sm"
            >
              Set Type
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TypePickerDialog;
// <END Tharyn | ZedUI Windows
