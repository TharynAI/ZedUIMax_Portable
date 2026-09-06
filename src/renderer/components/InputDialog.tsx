/* START> Tharyn | ZedUI InputDialog
    2026-01-01
    What: Reusable input dialog component with initial value support
    Why: window.prompt() doesn't work properly in Electron, need custom dialog
    Expected: Dialog shows with pre-filled value for editing
*/
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';

// Dialog store for managing input state
interface InputDialogState {
  isOpen: boolean;
  title: string;
  placeholder: string;
  initialValue: string;
  onSubmit: ((value: string) => void) | null;
  onCancel: (() => void) | null;
  show: (options: {
    title: string;
    placeholder?: string;
    initialValue?: string;
    onSubmit: (value: string) => void;
    onCancel?: () => void;
  }) => void;
  hide: () => void;
}

export const useInputDialogStore = create<InputDialogState>((set) => ({
  isOpen: false,
  title: '',
  placeholder: '',
  initialValue: '',
  onSubmit: null,
  onCancel: null,
  show: (options) =>
    set({
      isOpen: true,
      title: options.title,
      placeholder: options.placeholder || '',
      initialValue: options.initialValue || '',
      onSubmit: options.onSubmit,
      onCancel: options.onCancel || null,
    }),
  hide: () =>
    set({
      isOpen: false,
      onSubmit: null,
      onCancel: null,
    }),
}));

function InputDialog() {
  const {
    isOpen,
    title,
    placeholder,
    initialValue,
    onSubmit,
    onCancel,
    hide,
  } = useInputDialogStore();

  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Set initial value and focus when dialog opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // Focus after a short delay to ensure the dialog is rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, initialValue]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        // Ctrl+Enter to submit (allows regular Enter for newlines)
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSubmit, onCancel, value]);

  const handleSubmit = () => {
    if (onSubmit) onSubmit(value);
    hide();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    hide();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog - Cyberpunk styling */}
      <div className="relative bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full h-32 px-3 py-2 bg-bg-primary border border-accent-border rounded-cyber text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-none font-mono text-sm"
          />
          <p className="mt-2 text-xs text-text-secondary">
            Press Ctrl+Enter to save, Escape to cancel
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn btn-primary"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default InputDialog;
// <END Tharyn | ZedUI InputDialog
