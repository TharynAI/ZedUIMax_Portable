import { useSessionStore } from '../stores/session-store';
import { useSettingsStore } from '../stores/settings-store';
import { ChevronDown, Blocks } from 'lucide-react';
import { useManageTypesDialogStore } from './ManageTypesDialog';

type TreeMode = 'type' | 'project' | 'date' | 'branches' | 'favorites';

const TREE_MODES: { value: TreeMode; label: string }[] = [
  { value: 'type', label: 'By Type' },
  { value: 'project', label: 'By Project' },
  { value: 'date', label: 'By Date' },
  { value: 'branches', label: 'By Branches' },
  { value: 'favorites', label: 'Favorites Only' },
];

const DAYS_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
];

function TreeModeSelector() {
  const { treeMode, setTreeMode, daysFilter, setDaysFilter } = useSessionStore();
  const { settings, saveSettings } = useSettingsStore();
  const openManageTypes = useManageTypesDialogStore((state) => state.open);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Tree mode selector */}
      <div className="relative flex-1">
        <select
          value={treeMode}
          onChange={(e) => setTreeMode(e.target.value as TreeMode)}
          className="w-full appearance-none cursor-pointer py-1.5 pr-7"
        >
          {TREE_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-text-secondary"
        />
      </div>

      {/* Days filter */}
      <div className="relative">
        <select
          value={daysFilter}
          onChange={(e) => setDaysFilter(Number(e.target.value))}
          className="appearance-none cursor-pointer py-1.5 pr-7"
        >
          {DAYS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-text-secondary"
        />
      </div>

      <button
        type="button"
        onClick={openManageTypes}
        className="btn btn-secondary px-3 shrink-0"
        title="Manage shared types"
      >
        <Blocks size={16} />
        Types
      </button>

      {treeMode === 'type' && (
        <label
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-secondary bg-bg-tertiary border border-transparent rounded-cyber cursor-pointer hover:text-text-primary hover:border-accent/30"
          title="Hide registered type groups that have no visible sessions"
        >
          <input
            type="checkbox"
            checked={settings.hideEmptyTypeGroups}
            onChange={(e) => saveSettings({ hideEmptyTypeGroups: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-border accent-accent"
          />
          <span>Hide empty</span>
        </label>
      )}
    </div>
  );
}

export default TreeModeSelector;
