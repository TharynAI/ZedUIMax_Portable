import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Blocks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useSessionStore } from '../stores/session-store';

interface ManageTypesDialogState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useManageTypesDialogStore = create<ManageTypesDialogState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

function ManageTypesDialog() {
  const { isOpen, close } = useManageTypesDialogStore();
  const { types, loadTypes, createType, renameType, deleteType } = useSessionStore();
  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeName, setEditingTypeName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTypes();
      setError(null);
      setNewTypeName('');
      setEditingTypeName(null);
      setEditingValue('');
    }
  }, [isOpen, loadTypes]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.name.localeCompare(b.name)), [types]);

  if (!isOpen) {
    return null;
  }

  const handleCreate = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) {
      return;
    }

    try {
      await createType(trimmed);
      setNewTypeName('');
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  };

  const handleRename = async (typeName: string) => {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === typeName) {
      setEditingTypeName(null);
      setEditingValue('');
      return;
    }

    try {
      await renameType(typeName, trimmed);
      setEditingTypeName(null);
      setEditingValue('');
      setError(null);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    }
  };

  const handleDelete = async (typeName: string) => {
    try {
      await deleteType(typeName);
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div className="relative w-full max-w-2xl mx-4 bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-cyber bg-accent/10 text-accent">
              <Blocks size={18} />
            </div>
            <div>
              <div className="text-lg font-semibold text-text-primary">Manage Types</div>
              <div className="text-sm text-text-secondary">Shared across Browse, ProEng, and future panels.</div>
            </div>
          </div>
          <button onClick={close} className="p-1 hover:bg-bg-tertiary rounded-cyber transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreate();
                }
              }}
              placeholder="Create a new shared type"
              className="flex-1"
            />
            <button className="btn btn-primary px-3" onClick={() => void handleCreate()}>
              <Plus size={16} />
              Create
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-cyber border border-red-500/40 bg-red-500/10 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="border border-border rounded-cyber overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_160px] gap-3 px-4 py-2 text-xs uppercase tracking-[0.18em] text-text-secondary bg-bg-tertiary/70">
              <span>Name</span>
              <span>Usage</span>
              <span>Actions</span>
            </div>

            <div className="max-h-[420px] overflow-auto divide-y divide-border">
              {sortedTypes.length === 0 ? (
                <div className="px-4 py-8 text-sm text-text-secondary text-center">
                  No shared types yet. Create the first one here.
                </div>
              ) : (
                sortedTypes.map((type) => {
                  const isEditing = editingTypeName === type.name;
                  return (
                    <div key={type.name} className="grid grid-cols-[minmax(0,1fr)_120px_160px] gap-3 px-4 py-3 items-center">
                      <div className="min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(event) => setEditingValue(event.target.value)}
                            onBlur={() => void handleRename(type.name)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                void handleRename(type.name);
                              }
                              if (event.key === 'Escape') {
                                setEditingTypeName(null);
                                setEditingValue('');
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <div className="truncate text-text-primary">{type.name}</div>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">{type.count} session{type.count === 1 ? '' : 's'}</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-ghost px-2 py-1 text-sm"
                          onClick={() => {
                            setEditingTypeName(type.name);
                            setEditingValue(type.name);
                          }}
                        >
                          <Pencil size={14} />
                          Rename
                        </button>
                        <button
                          className="btn btn-ghost px-2 py-1 text-sm text-red-300 hover:text-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => void handleDelete(type.name)}
                          disabled={type.count > 0}
                          title={type.count > 0 ? 'Delete is blocked until this type is empty.' : 'Delete type'}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-border bg-bg-tertiary/50">
          <button className="btn btn-secondary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManageTypesDialog;
