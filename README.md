# ZedUI Session Launcher

A desktop application for managing Claude Code sessions. Browse, organize, tag, and launch your sessions with a modern visual interface.

![ZedUI Screenshot](docs/screenshot.png)

> Important: **ZedUIMax is a Windows desktop app, not a WSL app.**
> The GUI process launches with Windows Electron. WSL is only used by specific provider launch scripts where required.

## Features

- **Visual Session Browser** - Tree view with multiple grouping modes
- **Metadata Management** - Custom summaries, tags, notes, favorites
- **Quick Launch** - Continue or branch sessions with one click
- **Full-Text Search** - Find sessions by content
- **Session Branching** - Create alternative paths from any session

## Requirements

### System Requirements
- **Windows 10/11**
- **Node.js 18+** (Windows)
- **npm 9+** (Windows)
- **Windows Terminal** (recommended for session launching)
- **WSL2** (optional, only for provider workflows that require Linux tooling)

### Claude Code Requirements
- Claude Code installed at `/mnt/e/ZedBang/CLI/Cust/Claude2/`
- Existing sessions in `~/.claude/projects/`

## Installation

### Step 1: Navigate to ZedUI Directory

```bash
cd /mnt/e/ZedBang/CLI/Cust/ZedUIMax_Portable
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- Electron (desktop framework)
- React (UI library)
- better-sqlite3 (database)
- And other dependencies

### Step 3: Build the Main Process

```bash
npm run build:electron
```

### Step 4: Run in Development Mode

```bash
npm run dev
```

This starts:
- Vite dev server on port 5173
- Electron app connecting to Vite

## Usage

### Browsing Sessions

1. **Select a tree mode** from the dropdown:
   - **By Type** - Group by user-assigned category
   - **By Project** - Group by working directory
   - **By Date** - Group by time period
   - **By Branches** - Show parent-child relationships
   - **Favorites** - Show starred sessions only

2. **Adjust the time filter** to show older sessions (default: 30 days)

3. **Click a session** to view details in the preview panel

4. **Right-click** for quick actions

### Organizing Sessions

**Types** are high-level categories for grouping related work:
- Click the type badge in the preview panel
- Enter a name like "Unreal Engine" or "MCP Development"
- Sessions with the same type appear together in "By Type" view

**Tags** are flexible labels for cross-referencing:
- Click "+ Add tag" in the preview panel
- Enter tags like "bugfix", "research", "important"
- Multiple sessions can share the same tags

**Favorites** mark sessions for quick access:
- Click the star icon
- View all favorites with "Favorites Only" tree mode

### Launching Sessions

**Continue** - Resume the session where you left off:
- Click the "Continue" button in preview
- Or right-click → Continue
- Opens Windows Terminal with the session

**Branch** - Create an alternative path:
- Click "Branch" and optionally name it
- Launches a new session from the same point
- Original session remains unchanged

### Searching

Type in the search bar to find sessions by:
- Your custom summaries
- Your notes
- Claude's auto-summaries
- First messages

## Project Structure

```
ZedUI/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # App entry point
│   │   ├── preload.ts        # Context bridge
│   │   ├── session-store.ts  # Session file reading
│   │   ├── metadata-db.ts    # SQLite database
│   │   └── launcher.ts       # Session launching
│   ├── renderer/             # React frontend
│   │   ├── App.tsx           # Root component
│   │   ├── components/       # UI components
│   │   ├── stores/           # State management
│   │   └── types/            # TypeScript types
│   └── shared/               # Shared code
├── data/                     # SQLite database location
├── _devPlans/                # Development documentation
├── package.json              # Dependencies
└── README.md                 # This file
```

## Configuration

### Paths

Edit `src/shared/constants.ts` to customize:

```typescript
// Claude installation
const CLAUDE_BINARY = '/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/.bin/claude';
const MCP_CONFIG = '/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json';

// ZedUI data
const DATA_DIR = 'E:\\ZedBang\\CLI\\Cust\\ZedUIMax_Portable\\data';
```

### Database

User annotations are stored in SQLite at:
```
E:\ZedBang\CLI\Cust\ZedUIMax_Portable\data\zedui.db
```

This is separate from Claude's session files and survives updates.

## Development

### Scripts

```bash
# Development mode (hot reload)
npm run dev

# Build main process only
npm run build:electron

# Build renderer only
npm run build:vite

# Build everything
npm run build

# Run tests
npm test

# Create distributable
npm run package
```

### Testing

Run the test suite to validate core functionality:

```bash
npm test
```

This tests:
- Session store module loading
- Metadata database operations
- Project/session discovery
- Build output verification

Expected output:
```
=== ZedUI Core Tests ===
✓ Session store module loads
✓ Metadata DB module loads
✓ Launcher module loads
✓ Claude projects directory exists
✓ Can retrieve projects
✓ Can retrieve sessions
✓ Can initialize metadata database
✓ Can perform database operations
✓ Renderer build exists
✓ Main process build exists
=== Test Summary ===
Passed: 10
All tests passed!
```

### Adding Features

1. **New IPC handlers**: Add to `src/main/ipc-handlers.ts`
2. **New UI components**: Add to `src/renderer/components/`
3. **State changes**: Update `src/renderer/stores/session-store.ts`

## Troubleshooting

### "Cannot find module 'better-sqlite3'"

Rebuild native modules:
```bash
npm rebuild better-sqlite3
```

### Sessions not appearing

1. Check sessions exist: `ls ~/.claude/projects/`
2. Increase time filter (dropdown next to tree mode)
3. Click refresh button

**Note (January 2026):** Claude Code changed the session file format. New sessions now have 25-50+ summary entries at the start of `.jsonl` files before user messages appear. ZedUI was updated to scan 100 lines (up from 20) to handle this. If running an older version, update ZedUI to see new sessions.

### Launch not working

1. Verify Windows Terminal is installed
2. Check Claude2 path exists: `ls /mnt/e/ZedBang/CLI/Cust/Claude2/`
3. Test WSL terminal: `powershell.exe -Command "wt wsl"`

### Database errors

Reset the database:
```bash
del E:\ZedBang\CLI\Cust\ZedUIMax_Portable\data\zedui.db
# Restart ZedUI - database recreates automatically
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate tree |
| `Enter` | Select/expand |
| `Escape` | Close menu |
| `Ctrl+F` | Focus search |

## Future Plans

- **Edit Tab** - View and edit full conversation history
- **Splice Tab** - Merge and extract session portions
- **Export** - Export sessions to markdown
- **Import** - Import sessions from other sources

## License

Internal tool - ZedBang project

## Related

- [SessionBang MCP](/mnt/e/ZedBang/MPC2/Cust/SessionBang) - MCP server for session management
- [Claude2 Launcher](/mnt/e/ZedBang/CLI/Cust/Claude2) - Custom Claude installation
