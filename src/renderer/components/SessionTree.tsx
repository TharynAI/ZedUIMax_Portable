/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 2: Enhanced Branch Visualization
* Full recursive branch tree with visual connectors
* 2025-12-02 Initial implementation
*/
import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useSettingsStore } from '../stores/settings-store';
import type { SessionViewModel, BranchInfo } from '../types/session';
import { Star, ChevronRight, ChevronDown, Folder, FileText, GitBranch, Edit3 } from 'lucide-react';
import { useContextMenuStore } from './ContextMenu';
import { useInputDialogStore } from './InputDialog';
// <END | Sphere -> Tharyn | CC
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Centralized provider display lookup for badges
    Why: Inline ternary only handled 'codex' vs default-Claude; Cursor needs its own tint
    Expected: Cursor sessions show purple badge labelled 'Cursor'
*/
import { getProviderDisplay } from '../providers/display';
// <END Tharyn | CursorCLI

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  session?: SessionViewModel;
  isGroup?: boolean;
  isExpanded?: boolean;
  isBranch?: boolean;       // Is this a branch (child) of another session
  isLastChild?: boolean;    // Is this the last child in its branch group
  branchName?: string;      // Optional branch label
}

function SessionTree() {
  const {
    sessions,
    types,
    branches,
    treeMode,
    selectedSessionId,
    selectSession,
    selectedSessionIds,
    addToSelection,
    removeFromSelection,
    toggleFavorite,
  } = useSessionStore();
  const hideEmptyTypeGroups = useSettingsStore((state) => state.settings.hideEmptyTypeGroups);

  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set(['ungrouped']));

  // Build tree based on mode
  const treeData = useMemo(() => {
    return buildTree(sessions, treeMode, branches, types.map((type) => type.name), hideEmptyTypeGroups);
  }, [sessions, treeMode, branches, types, hideEmptyTypeGroups]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Phase 3: Multi-select support for bulk operations
  * Shift+Click adds to selection, Ctrl+Click removes from selection
  * Normal click replaces selection
  * 2026-01-11 Updated: Shift=add, Ctrl=remove, Normal=replace
  */
  const handleSessionClick = useCallback((e: React.MouseEvent, session: SessionViewModel) => {
    if (e.shiftKey) {
      // Shift+Click: Add to selection
      addToSelection(session.sessionId);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: Remove from selection
      removeFromSelection(session.sessionId);
    } else {
      // Normal click: Replace selection (single select)
      selectSession(session.sessionId);
    }
  }, [selectSession, addToSelection, removeFromSelection]);
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-02 | Sphere -> Tharyn | CC
  * Right-click selects session before showing context menu
  * Prevents operating on wrong session when right-clicking a different one
  * 2025-12-02 Initial implementation
  */
  const handleContextMenu = useCallback((e: React.MouseEvent, session: SessionViewModel) => {
    e.preventDefault();
    // Select the session under the cursor before showing menu
    selectSession(session.sessionId);
    useContextMenuStore.getState().show(e.clientX, e.clientY, session);
  }, [selectSession]);
  // <END | Sphere -> Tharyn | CC

  /* START> Tharyn | ZedUI TypeRename
      2026-01-11
      What: Type group context menu for rename
      Why: Allow renaming types from tree right-click
      Expected: Right-click type group shows menu with Rename option
  */
  const { renameType } = useSessionStore();
  const [typeContextMenu, setTypeContextMenu] = useState<{ x: number; y: number; typeName: string } | null>(null);

  const handleTypeGroupContextMenu = useCallback((e: React.MouseEvent, typeName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTypeContextMenu({ x: e.clientX, y: e.clientY, typeName });
  }, []);

  const handleRenameType = useCallback((typeName: string) => {
    setTypeContextMenu(null);
    useInputDialogStore.getState().show({
      title: 'Rename Type',
      placeholder: 'Enter new type name',
      initialValue: typeName,
      onSubmit: async (newName) => {
        if (newName && newName.trim() && newName.trim() !== typeName) {
          await renameType(typeName, newName.trim());
        }
      },
    });
  }, [renameType]);

  // Close type context menu on outside click
  useEffect(() => {
    if (typeContextMenu) {
      const handleClick = () => setTypeContextMenu(null);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setTypeContextMenu(null);
      };
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [typeContextMenu]);
  // <END Tharyn | ZedUI TypeRename

  // Flatten tree for rendering (virtual list)
  const flatNodes = useMemo(() => {
    const nodes: { node: TreeNode; depth: number }[] = [];

    function flatten(node: TreeNode, depth: number) {
      nodes.push({ node, depth });
      if (node.children && (node.isGroup ? expandedGroups.has(node.id) : true)) {
        for (const child of node.children) {
          flatten(child, depth + 1);
        }
      }
    }

    for (const node of treeData) {
      flatten(node, 0);
    }

    return nodes;
  }, [treeData, expandedGroups]);

  return (
    <div className="space-y-1">
      {flatNodes.map(({ node, depth }) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={depth}
          isExpanded={expandedGroups.has(node.id)}
          isSelected={node.session?.sessionId === selectedSessionId}
          isMultiSelected={selectedSessionIds.has(node.session?.sessionId || '')}
          onToggle={() => toggleGroup(node.id)}
          onClick={(e) => node.session && handleSessionClick(e, node.session)}
          onContextMenu={(e) => node.session && handleContextMenu(e, node.session)}
          onToggleFavorite={toggleFavorite}
          onGroupContextMenu={handleTypeGroupContextMenu}
          isTypeGroup={treeMode === 'type' && node.isGroup}
        />
      ))}

      {sessions.length === 0 && (
        <div className="text-center text-text-secondary py-8">
          No sessions found
        </div>
      )}

      {/* Type group context menu */}
      {typeContextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-accent-border rounded-cyber shadow-cyber py-1 min-w-[160px]"
          style={{ left: typeContextMenu.x, top: typeContextMenu.y }}
        >
          <button
            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-bg-tertiary text-text-primary"
            onClick={() => handleRenameType(typeContextMenu.typeName)}
          >
            <Edit3 size={16} />
            Rename Type...
          </button>
        </div>
      )}
    </div>
  );
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  onToggle: () => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleFavorite?: (sessionId: string) => void;
  onGroupContextMenu?: (e: React.MouseEvent, typeName: string) => void;
  isTypeGroup?: boolean;
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Enhanced TreeNodeRow with branch visualization and multi-select
* Shows branch connectors and icons for child sessions
* 2025-12-02 Initial implementation - branch visualization
* 2025-12-02 Added multi-select styling
* 2025-12-28 Tharyn: Clickable favorite icon toggle in tree
*/
function TreeNodeRow({
  node,
  depth,
  isExpanded,
  isSelected,
  isMultiSelected,
  onToggle,
  onClick,
  onContextMenu,
  onToggleFavorite,
  onGroupContextMenu,
  isTypeGroup,
}: TreeNodeRowProps) {
  const paddingLeft = depth * 16 + 8;

  if (node.isGroup) {
    const handleGroupContextMenu = (e: React.MouseEvent) => {
      if (isTypeGroup && onGroupContextMenu) {
        onGroupContextMenu(e, node.name);
      }
    };

    return (
      <div
        className="browse-tree-group"
        style={{ paddingLeft }}
        onClick={onToggle}
        onContextMenu={handleGroupContextMenu}
      >
        <span className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown size={14} className="shrink-0" />
          ) : (
            <ChevronRight size={14} className="shrink-0" />
          )}
          <Folder size={14} className="shrink-0" />
          <span className="truncate">{node.name}</span>
        </span>
        {node.children && <span>({node.children.length})</span>}
      </div>
    );
  }

  const session = node.session!;
  const isFavorite = session.annotation?.isFavorite;

  // Handle favorite icon click - toggle favorite without selecting the row
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row selection
    if (onToggleFavorite) {
      onToggleFavorite(session.sessionId);
    }
  };

  // Build class list for multi-select support
  const classes = ['browse-tree-session'];
  if (isSelected) classes.push('is-selected');
  if (isMultiSelected) classes.push('is-multi-selected');
  if (node.isBranch) classes.push('branch-child');

  return (
    <div
      className={classes.join(' ')}
      style={{ paddingLeft }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Branch connector line */}
      {node.isBranch && (
        <div className={`branch-connector ${node.isLastChild ? 'last-child' : ''}`} />
      )}
      {/* Icon: Branch icon for child sessions, clickable favorite toggle for regular sessions */}
      {node.isBranch ? (
        <GitBranch size={14} className="text-accent" />
      ) : (
        <span
          className="tree-favorite-icon cursor-pointer hover:scale-110 transition-transform"
          onClick={handleFavoriteClick}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? (
            <Star size={14} className="star fill-current" />
          ) : (
            <FileText size={14} className="text-text-secondary hover:text-accent" />
          )}
        </span>
      )}
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* START> Tharyn | CursorCLI
                2026-05-03
                What: Provider badge via display map (supports Cursor)
                Why: Inline ternary only knew Claude/Codex
                Expected: Claude/Codex/Cursor each render distinct tint + label
            */}
            {(() => {
              const disp = getProviderDisplay(session.providerId);
              return (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${disp.badgeBgClass} ${disp.badgeBorderClass}`}
                  title={`${disp.label} session`}
                >
                  {disp.label}
                </span>
              );
            })()}
            {/* <END Tharyn | CursorCLI */}
          </div>
          {/* START> Tharyn | ZedUI SummaryNewlines
              2026-08-18
              What: Render tree card summary with pre-wrap + 3-line clamp, trimmed
              Why: whitespace-normal collapsed stored newlines into one run-on line; the
                   autoSummary/firstMessage fallback can be very large, so pre-wrap alone
                   would let a single row grow to hundreds of lines
              Expected: Multi-line summaries show their line breaks, capped at 3 lines with
                   an ellipsis; full text available on hover via the title tooltip
          */}
          <div
            className="mt-1 text-[11px] font-semibold text-text-primary whitespace-pre-wrap break-words leading-tight line-clamp-3"
            title={(session.displaySummary || '').trim()}
          >
            {node.branchName ? (
              <span className="text-accent text-[10px] mr-1">[{node.branchName}]</span>
            ) : null}
            {(session.displaySummary || '').trim()}
          </div>
          {/* <END Tharyn | ZedUI SummaryNewlines */}
        </div>
      </div>
      <span className="text-xs text-text-secondary ml-2 shrink-0">{session.ageDisplay}</span>
    </div>
  );
}
// <END | Sphere -> Tharyn | CC

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Updated buildTree to pass branches for branch visualization
* 2025-12-02 Initial implementation
*/
// Build tree based on grouping mode
function buildTree(
  sessions: SessionViewModel[],
  mode: string,
  branches: BranchInfo[] = [],
  typeNames: string[] = [],
  hideEmptyTypeGroups = false
): TreeNode[] {
  switch (mode) {
    case 'type':
      return buildTypeTree(sessions, typeNames, hideEmptyTypeGroups);
    case 'project':
      return buildProjectTree(sessions);
    case 'date':
      return buildDateTree(sessions);
    case 'branches':
      return buildBranchTree(sessions, branches);
    case 'favorites':
      return buildFavoritesTree(sessions);
    default:
      return buildTypeTree(sessions);
  }
}
// <END | Sphere -> Tharyn | CC

function buildTypeTree(sessions: SessionViewModel[], typeNames: string[], hideEmptyGroups = false): TreeNode[] {
  const groups: Record<string, SessionViewModel[]> = {};

  for (const typeName of typeNames) {
    groups[typeName] = [];
  }

  for (const session of sessions) {
    const type = session.annotation?.type || 'Ungrouped';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(session);
  }

  // Sort groups, putting "Ungrouped" last
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Ungrouped') return 1;
    if (b === 'Ungrouped') return -1;
    return a.localeCompare(b);
  });

  const visibleKeys = hideEmptyGroups
    ? sortedKeys.filter((type) => groups[type].length > 0)
    : sortedKeys;

  return visibleKeys.map((type) => ({
    id: `type-${type}`,
    name: type,
    isGroup: true,
    children: groups[type].map((s) => ({
      id: s.sessionId,
      name: s.displaySummary,
      session: s,
    })),
  }));
}

function buildProjectTree(sessions: SessionViewModel[]): TreeNode[] {
  const groups: Record<string, SessionViewModel[]> = {};

  for (const session of sessions) {
    const project = session.projectDisplay;
    if (!groups[project]) {
      groups[project] = [];
    }
    groups[project].push(session);
  }

  return Object.keys(groups).sort().map((project) => ({
    id: `project-${project}`,
    name: project,
    isGroup: true,
    children: groups[project].map((s) => ({
      id: s.sessionId,
      name: s.displaySummary,
      session: s,
    })),
  }));
}

function buildDateTree(sessions: SessionViewModel[]): TreeNode[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const thisWeek = new Date(today.getTime() - 7 * 86400000);
  const thisMonth = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, SessionViewModel[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'This Month': [],
    'Older': [],
  };

  for (const session of sessions) {
    const ts = session.timestamp;
    if (ts >= today) {
      groups['Today'].push(session);
    } else if (ts >= yesterday) {
      groups['Yesterday'].push(session);
    } else if (ts >= thisWeek) {
      groups['This Week'].push(session);
    } else if (ts >= thisMonth) {
      groups['This Month'].push(session);
    } else {
      groups['Older'].push(session);
    }
  }

  // Only include non-empty groups
  return Object.entries(groups)
    .filter(([_, sessions]) => sessions.length > 0)
    .map(([period, sessions]) => ({
      id: `date-${period}`,
      name: period,
      isGroup: true,
      children: sessions.map((s) => ({
        id: s.sessionId,
        name: s.displaySummary,
        session: s,
      })),
    }));
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Enhanced Branch Tree with full recursive hierarchy
* Uses branches from database for parent-child relationships
* Visual connectors and branch indicators
* 2025-12-02 Initial implementation
*/
function buildBranchTree(sessions: SessionViewModel[], branches: BranchInfo[]): TreeNode[] {
  // Build lookup maps
  const sessionMap = new Map<string, SessionViewModel>();
  for (const session of sessions) {
    sessionMap.set(session.sessionId, session);
  }

  // Build parent->children map from branches
  const childrenMap = new Map<string, { childId: string; branchName?: string }[]>();
  const hasParent = new Set<string>();

  for (const branch of branches) {
    if (branch.childSessionId) {
      hasParent.add(branch.childSessionId);

      if (!childrenMap.has(branch.parentSessionId)) {
        childrenMap.set(branch.parentSessionId, []);
      }
      childrenMap.get(branch.parentSessionId)!.push({
        childId: branch.childSessionId,
        branchName: branch.branchName,
      });
    }
  }

  // Recursive function to build tree node with children
  function buildNode(session: SessionViewModel, isBranch: boolean = false, isLastChild: boolean = false, branchName?: string): TreeNode {
    const childRefs = childrenMap.get(session.sessionId) || [];
    const children: TreeNode[] = [];

    for (let i = 0; i < childRefs.length; i++) {
      const childRef = childRefs[i];
      const childSession = sessionMap.get(childRef.childId);
      if (childSession) {
        children.push(buildNode(
          childSession,
          true,  // isBranch
          i === childRefs.length - 1,  // isLastChild
          childRef.branchName
        ));
      }
    }

    return {
      id: session.sessionId,
      name: session.displaySummary,
      session: session,
      isGroup: children.length > 0,
      children: children.length > 0 ? children : undefined,
      isBranch,
      isLastChild,
      branchName,
    };
  }

  // Find root sessions (those without parents)
  const roots: TreeNode[] = [];
  for (const session of sessions) {
    if (!hasParent.has(session.sessionId)) {
      roots.push(buildNode(session));
    }
  }

  // Sort roots by timestamp (newest first)
  roots.sort((a, b) => {
    const aTime = a.session?.timestamp?.getTime() || 0;
    const bTime = b.session?.timestamp?.getTime() || 0;
    return bTime - aTime;
  });

  return roots;
}
// <END | Sphere -> Tharyn | CC

function buildFavoritesTree(sessions: SessionViewModel[]): TreeNode[] {
  const favorites = sessions.filter((s) => s.annotation?.isFavorite);

  return favorites.map((s) => ({
    id: s.sessionId,
    name: s.displaySummary,
    session: s,
  }));
}

export default SessionTree;
