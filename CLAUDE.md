# ZedUI Session Launcher - Claude Agent Instructions

## Overview

ZedUI is an Electron-based desktop application for managing Claude Code sessions. It provides:
- Visual browsing of sessions with multiple tree grouping modes
- Session metadata editing (summaries, tags, notes, favorites)
- Session launching (continue, branch) via external Windows Terminal
- Integration with the custom Claude2 launcher

## Architecture

```
ZedUI/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Window management, app lifecycle
│   │   ├── preload.ts        # Context bridge for renderer
│   │   ├── ipc-handlers.ts   # IPC handler registration
│   │   ├── session-store.ts  # Session file reading
│   │   ├── metadata-db.ts    # SQLite annotations
│   │   └── launcher.ts       # Session launch logic
│   ├── renderer/             # React frontend
│   │   ├── App.tsx           # Root component
│   │   ├── components/       # UI components
│   │   ├── stores/           # Zustand state
│   │   └── types/            # TypeScript types
│   └── shared/
│       └── constants.ts      # Shared configuration
├── data/
│   └── zedui.db              # SQLite database
└── _devPlans/
    └── 000_ZedUI.md          # Development plan
```

## Data Sources

### Session Data (Read-Only)
Sessions are read from Claude's native storage:
```
~/.claude/projects/{project-path}/
└── {session-uuid}.jsonl
```

Project paths use dashes: `/mnt/e/ZedBang` → `-mnt-e-ZedBang`

### User Annotations (SQLite)
User metadata stored in: `/mnt/e/ZedBang/ZedUIMax/data/zedui.db`

Tables:
- `annotations` - User summaries, notes, favorites, types
- `tags` - Tag definitions
- `session_tags` - Session-to-tag relationships
- `session_branches` - Branch parent-child relationships
- `session_fts` - Full-text search index

## Key Components

### Main Process

**session-store.ts** - Session discovery and parsing:
- `getAllProjects()` - Scan for project directories
- `getSessions(project?, days?, limit?)` - Get session list
- `getSessionDetails(sessionId)` - Full session with messages
- `getResumeInfo(sessionId)` - Resume command data

**metadata-db.ts** - Annotation management:
- `getAnnotation(sessionId)` - Get user metadata
- `setAnnotation(sessionId, data)` - Update metadata
- `toggleFavorite(sessionId)` - Toggle star
- `addTags(sessionId, tags)` - Add tags
- `search(query, limit)` - Full-text search
- `createBranch(parentId, name)` - Create branch record

**launcher.ts** - Session launching:
- `continueSession(sessionId)` - Resume existing session
- `newSession(directory)` - Start new session

### Renderer Components

**SessionTree.tsx** - Tree view with 5 grouping modes:
- By Type (user-assigned categories)
- By Project (directory-based)
- By Date (Today/Yesterday/This Week/etc.)
- By Branches (parent-child relationships)
- Favorites Only

**SessionPreview.tsx** - Detail panel with:
- Summary editing
- Type assignment
- Tag management
- Notes editing
- Action buttons (Continue, Branch)

**ContextMenu.tsx** - Right-click menu for sessions

## Integration with Claude2 Launcher

ZedUI uses the custom Claude2 installation:

```typescript
const CLAUDE_BINARY = '/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/.bin/claude';
const MCP_CONFIG = '/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json';

// Environment variables
CLAUDE_ALLOW_ROOT_BYPASS=1
CLAUDE_DISABLE_UPDATES=1

// Launch flags
--permission-mode bypassPermissions
--mcp-config "{MCP_CONFIG}"
--resume {sessionId}
```

Sessions are launched via:
```bash
powershell.exe -Command "wt wsl --cd '{cwd}' -- bash -c '{command}'"
```

## IPC Channels

Renderer calls main process via `window.electronAPI`:

```typescript
// Session operations
getSessions(days?, limit?)
getSessionDetails(sessionId)
searchSessions(query, limit?)
getProjects()

// Annotations
getAnnotation(sessionId)
updateAnnotation(sessionId, data)
toggleFavorite(sessionId)
addTags(sessionId, tags)
removeTag(sessionId, tag)
getAllTags()

// Branches
createBranch(parentSessionId, branchName?)
getBranches(sessionId?)
linkBranch(branchId, childSessionId)

// Launch
continueSession(sessionId)
newSession(directory)

// Utility
copyToClipboard(text)
showInFolder(filePath)
```

## Development Commands

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

## Development Handoff

When completing development work on ZedUIMax, leave the app running and open so the user can test the finished change immediately. If the app cannot be left open, state why and provide the exact command to launch it.

## Key Files Reference

| Purpose | File |
|---------|------|
| Session parsing | `src/main/session-store.ts` |
| Annotation storage | `src/main/metadata-db.ts` |
| Session launching | `src/main/launcher.ts` |
| IPC handlers | `src/main/ipc-handlers.ts` |
| State management | `src/renderer/stores/session-store.ts` |
| Tree view | `src/renderer/components/SessionTree.tsx` |
| Preview panel | `src/renderer/components/SessionPreview.tsx` |

## Agent Testing

See `E:\ZedBang\Projects\_guides\App_Development_Protocol.md` for the complete testing protocol.

## Notes

- Database is stored separately from SessionBang to avoid conflicts
- Sessions are read-only (never modify Claude's .jsonl files)
- All launches go through external Windows Terminal
- Branch tracking uses metadata-only approach (no file manipulation)
