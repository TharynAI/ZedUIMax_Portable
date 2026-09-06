import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AlertTriangle, X } from 'lucide-react';

// Dialog store for managing confirmation state
interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  isDangerous: boolean;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
  show: (options: {
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDangerous?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  }) => void;
  hide: () => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  detail: undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  isDangerous: false,
  onConfirm: null,
  onCancel: null,
  show: (options) =>
    set({
      isOpen: true,
      title: options.title,
      message: options.message,
      detail: options.detail,
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      isDangerous: options.isDangerous ?? false,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel || null,
    }),
  hide: () =>
    set({
      isOpen: false,
      onConfirm: null,
      onCancel: null,
    }),
}));

function ConfirmDialog() {
  const {
    isOpen,
    title,
    message,
    detail,
    confirmLabel,
    cancelLabel,
    isDangerous,
    onConfirm,
    onCancel,
    hide,
  } = useConfirmDialogStore();

  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter') {
        handleConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
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
      <div className="relative bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            {isDangerous && (
              <div className="p-2 bg-red-500/20 rounded-cyber">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
            )}
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-text-primary">{message}</p>
          {detail && (
            <div className="mt-3 p-3 bg-bg-primary rounded-cyber border border-accent-border">
              <pre className="text-sm text-accent break-all whitespace-pre-wrap font-mono">{detail}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            className={`btn ${isDangerous ? 'bg-red-600 hover:bg-red-500 text-white' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
