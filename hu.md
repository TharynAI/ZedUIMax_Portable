# ZedUI Session Launcher - User Guide

## What is ZedUI?

ZedUI is a desktop application for managing your Claude Code sessions. Instead of using the command line to find and resume sessions, you can:

- **Browse** all your sessions in an organized tree view
- **Search** across sessions and your notes
- **Tag** and organize sessions into types
- **Star** important sessions as favorites
- **Launch** sessions with one click

## Installation

### Prerequisites
- Node.js 18+
- npm
- Windows Terminal (recommended)
- WSL with Claude Code installed

### Setup

```bash
cd /mnt/e/ZedBang/ZedUI

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm run package
```

## Features

### Tree View Modes

Switch between different ways to organize your sessions:

| Mode | Description |
|------|-------------|
| **By Type** | Group sessions by user-assigned category (e.g., "Unreal Engine", "MCP Development") |
| **By Project** | Group by the directory where sessions were created |
| **By Date** | Group into Today, Yesterday, This Week, This Month, Older |
| **By Branches** | Show parent-child relationships for branched sessions |
| **Favorites** | Show only starred sessions |

### Session Preview

Click on a session to see:
- Summary (auto-generated or your custom summary)
- Project location
- Date and time
- Message count and file size
- Your tags and notes

### Editing Metadata

**Set Type:** Click the type badge to assign a category (great for grouping related work)

**Add Tags:** Click "+ Add tag" to categorize sessions (e.g., #bugfix, #feature)

**Edit Summary:** Replace Claude's auto-summary with your own description

**Add Notes:** Keep additional context or reminders

**Star:** Click the star to mark important sessions

### Session Actions

**Continue:** Resume the session in a new terminal window

**Branch:** Create a new session that starts from this point (for exploring alternatives)

**Copy ID:** Copy the session UUID to clipboard

**Copy Command:** Copy the full resume command for manual use

**Open in Explorer:** Open the session file location

### Context Menu

Right-click any session for quick actions:
- Continue
- Branch
- Toggle Favorite
- Set Type
- Edit Summary
- Copy Session ID
- Copy Resume Command
- Open in Explorer

### Search

Use the search bar to find sessions by:
- Your custom summaries
- Your notes
- Claude's auto-summaries
- First messages

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate tree |
| `Enter` | Select session |
| `→` | Expand group |
| `←` | Collapse group |
| `Esc` | Close context menu |

## Tips

### Organizing Sessions

1. **Use Types for major categories** - e.g., "Unreal Engine", "MCP Development", "Personal"
2. **Use Tags for cross-cutting concerns** - e.g., #debugging, #refactor, #research
3. **Star sessions you'll return to** - Quick access via Favorites view
4. **Write good summaries** - Future you will thank you

### Efficient Workflow

1. Start ZedUI at the beginning of your day
2. Review recent sessions to remember context
3. Continue relevant sessions or branch to explore alternatives
4. Tag and annotate as you go

### Branching

When you "Branch" a session:
1. A new terminal opens with the original session resumed
2. ZedUI tracks this as a branch
3. The new session appears as a child in "By Branches" view

This is great for:
- Trying different approaches
- Preserving a working state before experiments
- Creating variations of a solution

## Troubleshooting

### Sessions Not Appearing

- Check that Claude Code sessions exist in `~/.claude/projects/`
- Adjust the time filter (default is 30 days)
- Try refreshing with the refresh button

#### Session Format Change (January 2026)
If sessions suddenly stop appearing after a Claude Code update, the session file format may have changed. As of late January 2026, Claude Code places 25-50+ summary entries at the **start** of `.jsonl` files before any user/assistant messages.

ZedUI was updated to handle this by scanning the first 100 lines (instead of 20) and accepting sessions with summaries even if no user messages are found in the initial scan. If you're running an older ZedUI version, update to fix this issue.

### Launch Not Working

- Ensure Windows Terminal is installed
- Check that the Claude2 installation is at the expected path
- Verify WSL is working properly

### Database Issues

The annotation database is at `/mnt/e/ZedBang/ZedUI/data/zedui.db`. If corrupted:
1. Stop ZedUI
2. Delete the database file
3. Restart ZedUI (database recreates automatically)

Note: This only affects your annotations, not the actual sessions.

## File Locations

| What | Where |
|------|-------|
| ZedUI Application | `/mnt/e/ZedBang/ZedUI/` |
| Annotation Database | `/mnt/e/ZedBang/ZedUI/data/zedui.db` |
| Claude Sessions | `~/.claude/projects/` |
| Claude2 Launcher | `/mnt/e/ZedBang/CLI/Cust/Claude2/` |

## Getting Help

- Development plan: `/mnt/e/ZedBang/ZedUI/_devPlans/000_ZedUI.md`
- Agent instructions: `/mnt/e/ZedBang/ZedUI/CLAUDE.md`
- This guide: `/mnt/e/ZedBang/ZedUI/hu.md`
