// Session data from Claude's .jsonl files
export interface Session {
  sessionId: string;           // Provider-prefixed ID (e.g., "claude:uuid")
  rawSessionId: string;        // ID from provider file
  providerId: 'claude' | 'codex' | 'cursor';
  model?: string;              // Model name (e.g., claude-3-opus, gpt-4)
  projectPath: string;         // e.g., "-mnt-e-ZedBang"
  projectDisplay: string;      // e.g., "/mnt/e/ZedBang"
  autoSummary: string;         // Claude's auto-generated summary
  firstMessage: string;        // Truncated first user message
  timestamp: Date;             // Session start time
  messageCount: number;        // Total messages
  cwd: string;                 // Working directory
  fileSize: number;            // File size in bytes
  filePath: string;            // Full path to .jsonl file
}

// User annotation from SQLite
export interface Annotation {
  sessionId: string;
  userSummary: string;         // User's custom summary
  notes: string;               // Additional notes
  isFavorite: boolean;         // Starred status
  tags: string[];              // User tags
  type?: string;               // Type tag for grouping (e.g., "unreal-engine")
  parentSessionId?: string;    // For branch tracking
  branchName?: string;         // Optional branch label
  createdAt: Date;
  updatedAt: Date;
}

// Combined view model for rendering
export interface SessionViewModel extends Session {
  annotation?: Annotation;
  displaySummary: string;      // userSummary || autoSummary || firstMessage
  shortId: string;             // First 8 chars of sessionId
  sizeDisplay: string;         // Human-readable size "15 KB"
  ageDisplay: string;          // "2h ago" or "Nov 28"
  dateDisplay: string;         // "Nov 28 17:50"
}

// Project info
export interface ProjectInfo {
  path: string;                // Directory name, e.g., "-mnt-e-ZedBang"
  displayPath: string;         // Human-readable, e.g., "/mnt/e/ZedBang"
  sessionCount: number;
  lastActivity: Date | null;
  providerId: 'claude' | 'codex' | 'cursor';
}

// Session details with full message history
export interface SessionDetails extends Session {
  messages: SessionMessage[];
  version: string;
}

// Individual message entry
export interface SessionMessage {
  type: 'user' | 'assistant' | 'summary';
  uuid?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: string;
  };
  summary?: string;
  // Claude Code flags for context continuation messages
  isCompactSummary?: boolean;          // True for auto-generated context summaries
  isVisibleInTranscriptOnly?: boolean; // True for metadata-only entries
}

// Branch relationship
export interface BranchInfo {
  id: number;
  parentSessionId: string;
  childSessionId?: string;
  branchPoint?: number;
  branchName?: string;
  createdAt: Date;
  linkedAt?: Date;
}

// Tree node for react-arborist
export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  data?: SessionViewModel | { type: 'group'; groupName: string };
  isGroup?: boolean;
}

// Tag with usage count
export interface TagInfo {
  name: string;
  count: number;
}

// Search result
export interface SearchResult {
  sessionId: string;
  userSummary: string;
  notes: string;
  autoSummary: string;
  firstMessage: string;
  rank: number;
}

/* START> 2025-12-02 | Sphere -> Tharyn | CC
* Phase 3: Message search result type
* 2025-12-02 Initial implementation
*/
// Message search result
export interface MessageSearchResult {
  sessionId: string;
  projectPath: string;
  projectDisplay: string;
  messageIndex: number;
  messageType: 'user' | 'assistant';
  snippet: string;           // Context around the match
  matchStart: number;        // Position of match in snippet
  matchLength: number;       // Length of matched text
  timestamp?: Date;
}
// <END | Sphere -> Tharyn | CC
