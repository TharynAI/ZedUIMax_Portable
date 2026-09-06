/**
 * metadata-db.ts - SQLite database for session annotations.
 *
 * Stores user summaries, notes, tags, favorites, and branch relationships.
 * Database is stored within the ZedUI data directory.
 *
 * Ported from: /mnt/e/ZedBang/MPC2/Cust/SessionBang/lib/metadata_db.py
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { getRuntimePaths } from './runtime-paths';

/* START> Tharyn | ZedUI Cyberpunk
    2025-12-28
    What: Load the SQLite database from the resolved portable data root
    Why: A portable clone must not read or write another install's metadata
    Expected: Database loads from <appRoot>\data\zedui.db
*/
// <END Tharyn | ZedUI Cyberpunk

let db: Database.Database | null = null;

// Interfaces
export interface Annotation {
  sessionId: string;
  projectPath: string;
  userSummary: string;
  notes: string;
  isFavorite: boolean;
  autoSummary: string;
  firstMessage: string;
  type: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface TypeInfo extends TagInfo {}

export interface SearchResult {
  sessionId: string;
  userSummary: string;
  notes: string;
  autoSummary: string;
  firstMessage: string;
  rank: number;
}

export interface BranchInfo {
  id: number;
  parentSessionId: string;
  childSessionId: string | null;
  branchPoint: number | null;
  branchName: string | null;
  createdAt: Date;
  linkedAt: Date | null;
}

/**
 * Initialize the database schema.
 */
export function initDb(): void {
  const { dataDir, dbPath } = getRuntimePaths();

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Main annotations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS annotations (
      session_id TEXT PRIMARY KEY,
      project_path TEXT,
      user_summary TEXT,
      notes TEXT,
      is_favorite INTEGER DEFAULT 0,
      auto_summary TEXT,
      first_message TEXT,
      type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* START> Tharyn | CursorCLI
      2026-05-04
      What: Migration — add cwd_override TEXT column to annotations if missing
      Why: Cursor relocate has no embedded cwd to rewrite; persist override in DB instead
      Expected: PRAGMA table_info(annotations) gains a `cwd_override` column on first launch after upgrade
  */
  try {
    const columns = db.prepare(`PRAGMA table_info(annotations)`).all() as Array<{ name: string }>;
    const hasOverride = columns.some(c => c.name === 'cwd_override');
    if (!hasOverride) {
      db.exec(`ALTER TABLE annotations ADD COLUMN cwd_override TEXT`);
    }
  } catch (err) {
    console.error('cwd_override migration failed:', err);
  }
  // <END Tharyn | CursorCLI

  /* START> Tharyn | SessionIdentity
      2026-09-06
      What: Migration - add call_sign TEXT column to annotations if missing
      Why:  ZedTrafficControl assigns every agent a call sign when it enrols. Any tool should be
            able to read it without coupling to the tower's process or its names.json layout, so
            ZedUIMax stores it alongside the summary and becomes its published home.
      Expected: PRAGMA table_info(annotations) gains a `call_sign` column on first launch after
            upgrade; existing rows read NULL until the tower publishes.
  */
  try {
    const columns = db.prepare(`PRAGMA table_info(annotations)`).all() as Array<{ name: string }>;
    const hasCallSign = columns.some(c => c.name === 'call_sign');
    if (!hasCallSign) {
      db.exec(`ALTER TABLE annotations ADD COLUMN call_sign TEXT`);
    }
  } catch (err) {
    console.error('call_sign migration failed:', err);
  }
  // <END Tharyn | SessionIdentity

  // Tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Session-tag relationship
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT,
      tag_id INTEGER,
      PRIMARY KEY (session_id, tag_id),
      FOREIGN KEY (session_id) REFERENCES annotations(session_id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  // Branch relationships table
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_session_id TEXT NOT NULL,
      child_session_id TEXT,
      branch_point INTEGER,
      branch_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      linked_at TEXT,
      FOREIGN KEY (parent_session_id) REFERENCES annotations(session_id)
    )
  `);

  // Full-text search virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
      session_id,
      user_summary,
      notes,
      auto_summary,
      first_message,
      tokenize='porter unicode61'
    )
  `);

  /* START> Tharyn | SessionIdentity
      2026-09-06
      What: Maintain session_fts from triggers instead of application code, and rebuild the index
            once when the triggers are first created.
      Why:  session_fts was kept in step by a DELETE+INSERT pair inside upsertAnnotation, which is
            only reached through this module. ZedTrafficControl is about to write call signs and
            summaries into annotations with plain SQL, and every such write would have left the
            search index stale - silently, with no error. Verified before the change: an external
            INSERT landed in annotations (1 row) and was returned by search 0 times.
      Expected: Any writer, in any process, keeps search correct. The index cannot be bypassed.
  */
  const ftsTriggerCount = (db.prepare(
    `SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND tbl_name='annotations'`
  ).get() as { n: number }).n;

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS annotations_fts_after_insert AFTER INSERT ON annotations BEGIN
      DELETE FROM session_fts WHERE session_id = new.session_id;
      INSERT INTO session_fts (session_id, user_summary, notes, auto_summary, first_message)
      VALUES (new.session_id, new.user_summary, new.notes, new.auto_summary, new.first_message);
    END;
  `);

  // session_id is the primary key but is rewritten by id-variant repair, so the update trigger
  // clears the OLD key and writes the NEW one rather than assuming they match.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS annotations_fts_after_update AFTER UPDATE ON annotations BEGIN
      DELETE FROM session_fts WHERE session_id = old.session_id;
      DELETE FROM session_fts WHERE session_id = new.session_id;
      INSERT INTO session_fts (session_id, user_summary, notes, auto_summary, first_message)
      VALUES (new.session_id, new.user_summary, new.notes, new.auto_summary, new.first_message);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS annotations_fts_after_delete AFTER DELETE ON annotations BEGIN
      DELETE FROM session_fts WHERE session_id = old.session_id;
    END;
  `);

  // One-time rebuild: rows written before the triggers existed may already be out of step with
  // the index, and from here on nothing else reconciles them.
  if (ftsTriggerCount === 0) {
    try {
      db.exec(`DELETE FROM session_fts`);
      db.exec(`
        INSERT INTO session_fts (session_id, user_summary, notes, auto_summary, first_message)
        SELECT session_id, user_summary, notes, auto_summary, first_message FROM annotations
      `);
    } catch (err) {
      console.error('session_fts rebuild failed:', err);
    }
  }
  // <END Tharyn | SessionIdentity

  // Canonical shared type registry for Browse + ProEng
  db.exec(`
    CREATE TABLE IF NOT EXISTS type_registry (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_annotations_favorite ON annotations(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_path);
    CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
    CREATE INDEX IF NOT EXISTS idx_branches_parent ON session_branches(parent_session_id);
    CREATE INDEX IF NOT EXISTS idx_branches_child ON session_branches(child_session_id);
  `);

  seedTypeRegistryFromAnnotations();
}

/**
 * Get database connection, initializing if needed.
 */
function getDb(): Database.Database {
  if (!db) {
    initDb();
  }
  return db!;
}

// Provider-aware session ID helpers (prefix-friendly with legacy fallback)
function getIdVariants(sessionId: string): string[] {
  if (sessionId.includes(':')) {
    const raw = sessionId.split(':').slice(1).join(':');
    return Array.from(new Set([sessionId, raw]));
  }
  return [sessionId];
}

function pickExistingId(targetIds: string[], db: Database.Database): string | null {
  for (const id of targetIds) {
    const row = db.prepare('SELECT session_id FROM annotations WHERE session_id = ?').get(id);
    if (row) return (row as any).session_id as string;
  }
  return null;
}

function normalizeTypeName(name: string): string {
  return name.trim();
}

function ensureTypeExists(name: string): void {
  const normalized = normalizeTypeName(name);
  if (!normalized) {
    return;
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO type_registry (name, created_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
  `).run(normalized, new Date().toISOString(), new Date().toISOString());
}

function seedTypeRegistryFromAnnotations(): void {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT type
    FROM annotations
    WHERE type IS NOT NULL AND TRIM(type) != ''
  `).all() as Array<{ type: string }>;

  for (const row of rows) {
    ensureTypeExists(row.type);
  }
}

/**
 * Get annotation for a session.
 */
export function getAnnotation(sessionId: string): Annotation | null {
  const db = getDb();

  const ids = getIdVariants(sessionId);
  let row = db.prepare(`
    SELECT * FROM annotations WHERE session_id = ?
  `).get(ids[0]) as any;

  if (!row && ids.length > 1) {
    row = db.prepare(`
      SELECT * FROM annotations WHERE session_id = ?
    `).get(ids[1]) as any;
  }

  if (!row) {
    return null;
  }

  const resolvedId = row.session_id;

  // Get tags
  const tags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
  `).all(resolvedId) as { name: string }[];

  return {
    sessionId: resolvedId,
    projectPath: row.project_path || '',
    userSummary: row.user_summary || '',
    notes: row.notes || '',
    isFavorite: Boolean(row.is_favorite),
    autoSummary: row.auto_summary || '',
    firstMessage: row.first_message || '',
    type: row.type || '',
    tags: tags.map(t => t.name),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Create or update annotation for a session.
 */
export function setAnnotation(
  sessionId: string,
  data: {
    projectPath?: string;
    userSummary?: string;
    notes?: string;
    autoSummary?: string;
    firstMessage?: string;
    type?: string;
  }
): Annotation | null {
  const db = getDb();
  const now = new Date().toISOString();
  const ids = getIdVariants(sessionId);

  // Check if exists
  const existingId = pickExistingId(ids, db);
  const targetId = existingId || ids[0];

  if (existingId) {
    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (data.userSummary !== undefined) {
      updates.push('user_summary = ?');
      params.push(data.userSummary);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    if (data.projectPath !== undefined) {
      updates.push('project_path = ?');
      params.push(data.projectPath);
    }
    if (data.autoSummary !== undefined) {
      updates.push('auto_summary = ?');
      params.push(data.autoSummary);
    }
    if (data.firstMessage !== undefined) {
      updates.push('first_message = ?');
      params.push(data.firstMessage);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(normalizeTypeName(data.type));
    }

    updates.push('updated_at = ?');
    params.push(now);
    params.push(targetId);

    if (updates.length > 1) {
      db.prepare(`UPDATE annotations SET ${updates.join(', ')} WHERE session_id = ?`).run(...params);
    }
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO annotations
      (session_id, project_path, user_summary, notes, auto_summary, first_message, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ids[0],
      data.projectPath || '',
      data.userSummary || '',
      data.notes || '',
      data.autoSummary || '',
      data.firstMessage || '',
      normalizeTypeName(data.type || ''),
      now,
      now
    );
  }

  if (data.type !== undefined) {
    ensureTypeExists(data.type);
  }

  /* START> Tharyn | SessionIdentity
      2026-09-06
      What: Removed the manual session_fts DELETE+INSERT that ran here.
      Why:  It only kept the index correct for writes that came through this function, so any
            external writer - ZedTrafficControl publishing a call sign, a repair script - left
            search stale with no error. Triggers on annotations now own the index, so it stays
            correct no matter which process writes.
      Expected: Identical search results after an upsert, and correct results after a write that
            never touches this module.
  */
  // session_fts is maintained by annotations_fts_after_{insert,update,delete}.
  // <END Tharyn | SessionIdentity

  return getAnnotation(targetId);
}

/**
 * Toggle favorite status for a session.
 */
export function toggleFavorite(sessionId: string): boolean {
  const db = getDb();
  const ids = getIdVariants(sessionId);

  // Check if annotation exists
  let row = db.prepare('SELECT session_id, is_favorite FROM annotations WHERE session_id = ?')
    .get(ids[0]) as { session_id: string; is_favorite: number } | undefined;
  if (!row && ids.length > 1) {
    row = db.prepare('SELECT session_id, is_favorite FROM annotations WHERE session_id = ?')
      .get(ids[1]) as { session_id: string; is_favorite: number } | undefined;
  }

  let newStatus: boolean;
  const targetId = row?.session_id || ids[0];

  if (!row) {
    // Create empty annotation with favorite=true
    setAnnotation(targetId, {});
    newStatus = true;
  } else {
    newStatus = !Boolean(row.is_favorite);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE annotations SET is_favorite = ?, updated_at = ?
    WHERE session_id = ?
  `).run(newStatus ? 1 : 0, now, targetId);

  return newStatus;
}

/**
 * Add tags to a session.
 */
export function addTags(sessionId: string, tags: string[]): string[] {
  const db = getDb();
  const ids = getIdVariants(sessionId);
  const existingId = pickExistingId(ids, db);
  const targetId = existingId || ids[0];

  // Ensure annotation exists
  const exists = db.prepare('SELECT session_id FROM annotations WHERE session_id = ?')
    .get(targetId);

  if (!exists) {
    setAnnotation(targetId, {});
  }

  for (let tag of tags) {
    tag = tag.trim().toLowerCase();
    if (!tag) continue;

    // Remove # prefix if present
    if (tag.startsWith('#')) {
      tag = tag.slice(1);
    }

    // Ensure tag exists
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);

    // Get tag id
    const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as { id: number };

    // Link to session
    db.prepare('INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)')
      .run(targetId, tagRow.id);
  }

  // Get all tags for session
  const allTags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
  `).all(targetId) as { name: string }[];

  return allTags.map(t => t.name);
}

/**
 * Remove a tag from a session.
 */
export function removeTag(sessionId: string, tag: string): string[] {
  const db = getDb();
  const ids = getIdVariants(sessionId);
  const targetId = pickExistingId(ids, db) || ids[0];

  tag = tag.trim().toLowerCase();
  if (tag.startsWith('#')) {
    tag = tag.slice(1);
  }

  db.prepare(`
    DELETE FROM session_tags
    WHERE session_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)
  `).run(targetId, tag);

  // Get remaining tags
  const remaining = db.prepare(`
    SELECT t.name FROM tags t
    JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
  `).all(targetId) as { name: string }[];

  return remaining.map(t => t.name);
}

/**
 * Full-text search across annotations.
 */
export function search(query: string, limit: number = 20): SearchResult[] {
  const db = getDb();

  const results = db.prepare(`
    SELECT
      session_id,
      user_summary,
      notes,
      auto_summary,
      first_message,
      rank
    FROM session_fts
    WHERE session_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as any[];

  return results.map(row => ({
    sessionId: row.session_id,
    userSummary: row.user_summary || '',
    notes: row.notes || '',
    autoSummary: row.auto_summary || '',
    firstMessage: row.first_message || '',
    rank: row.rank,
  }));
}

/**
 * Get all favorited session IDs.
 */
export function getFavorites(): string[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT session_id FROM annotations WHERE is_favorite = 1
  `).all() as { session_id: string }[];

  return rows.map(r => r.session_id);
}

/**
 * Get all tags with usage count.
 */
export function getAllTags(): TagInfo[] {
  const db = getDb();

  const tags = db.prepare(`
    SELECT t.name, COUNT(st.session_id) as count
    FROM tags t
    LEFT JOIN session_tags st ON t.id = st.tag_id
    GROUP BY t.id
    ORDER BY count DESC
  `).all() as { name: string; count: number }[];

  return tags;
}

/**
 * Get all unique types with usage count.
 */
export function getAllTypes(): TypeInfo[] {
  const db = getDb();

  const types = db.prepare(`
    SELECT
      tr.name as name,
      COUNT(a.session_id) as count
    FROM type_registry tr
    LEFT JOIN annotations a ON LOWER(a.type) = LOWER(tr.name)
    GROUP BY tr.name
    ORDER BY
      CASE WHEN COUNT(a.session_id) = 0 THEN 1 ELSE 0 END,
      LOWER(tr.name)
  `).all() as { name: string; count: number }[];

  return types;
}

/**
 * Rename a type across all sessions that have it.
 * Returns the number of sessions updated.
 */
export function renameType(oldName: string, newName: string): number {
  const db = getDb();
  const normalizedOld = normalizeTypeName(oldName);
  const normalizedNew = normalizeTypeName(newName);
  if (!normalizedOld || !normalizedNew) {
    throw new Error('Type name is required.');
  }
  if (normalizedOld.toLowerCase() !== normalizedNew.toLowerCase()) {
    const existing = db.prepare('SELECT name FROM type_registry WHERE LOWER(name) = LOWER(?)')
      .get(normalizedNew) as { name: string } | undefined;
    if (existing) {
      throw new Error(`Type already exists: ${normalizedNew}`);
    }
  }

  const usageCount = getTypeUsageCount(normalizedOld);
  const result = db.prepare(`
    UPDATE annotations
    SET type = ?, updated_at = ?
    WHERE LOWER(type) = LOWER(?)
  `).run(normalizedNew, new Date().toISOString(), normalizedOld);

  db.prepare(`
    UPDATE type_registry
    SET name = ?, updated_at = ?
    WHERE LOWER(name) = LOWER(?)
  `).run(normalizedNew, new Date().toISOString(), normalizedOld);

  return Math.max(result.changes, usageCount);
}

export function createType(name: string): TypeInfo {
  const normalized = normalizeTypeName(name);
  if (!normalized) {
    throw new Error('Type name is required.');
  }

  ensureTypeExists(normalized);
  return { name: normalized, count: getTypeUsageCount(normalized) };
}

export function getTypeUsageCount(name: string): number {
  const db = getDb();
  const normalized = normalizeTypeName(name);
  if (!normalized) {
    return 0;
  }

  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM annotations
    WHERE LOWER(type) = LOWER(?)
  `).get(normalized) as { count: number };
  return row.count;
}

export function deleteType(name: string): boolean {
  const db = getDb();
  const normalized = normalizeTypeName(name);
  if (!normalized) {
    throw new Error('Type name is required.');
  }

  const usageCount = getTypeUsageCount(normalized);
  if (usageCount > 0) {
    throw new Error(`Cannot delete type "${normalized}" because it is still assigned to ${usageCount} session(s).`);
  }

  const result = db.prepare(`
    DELETE FROM type_registry
    WHERE LOWER(name) = LOWER(?)
  `).run(normalized);
  return result.changes > 0;
}

/**
 * Delete annotation for a session (not the session itself).
 */
export function deleteAnnotation(sessionId: string): boolean {
  const db = getDb();
  const ids = getIdVariants(sessionId);

  ids.forEach(id => {
    db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM session_fts WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM annotations WHERE session_id = ?').run(id);
  });

  return true;
}

// Branch operations

/**
 * Create a branch record.
 */
export function createBranch(
  parentSessionId: string,
  branchName?: string,
  branchPoint?: number
): BranchInfo {
  const db = getDb();
  const now = new Date().toISOString();
  const parentIds = getIdVariants(parentSessionId);

  // session_branches.parent_session_id has an FK to annotations.session_id.
  // Ensure a row exists for the exact provider-aware ID before inserting branch records.
  const exactParent = db.prepare('SELECT * FROM annotations WHERE session_id = ?')
    .get(parentSessionId) as any;
  if (!exactParent) {
    let seedRow: any = null;
    for (const id of parentIds) {
      if (id === parentSessionId) continue;
      seedRow = db.prepare('SELECT * FROM annotations WHERE session_id = ?').get(id) as any;
      if (seedRow) break;
    }

    if (seedRow) {
      db.prepare(`
        INSERT OR IGNORE INTO annotations
        (session_id, project_path, user_summary, notes, is_favorite, auto_summary, first_message, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        parentSessionId,
        seedRow.project_path || '',
        seedRow.user_summary || '',
        seedRow.notes || '',
        seedRow.is_favorite || 0,
        seedRow.auto_summary || '',
        seedRow.first_message || '',
        seedRow.type || '',
        seedRow.created_at || now,
        now
      );
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO annotations
        (session_id, project_path, user_summary, notes, is_favorite, auto_summary, first_message, type, created_at, updated_at)
        VALUES (?, '', '', '', 0, '', '', '', ?, ?)
      `).run(parentSessionId, now, now);
    }
  }

  const result = db.prepare(`
    INSERT INTO session_branches (parent_session_id, branch_name, branch_point, created_at)
    VALUES (?, ?, ?, ?)
  `).run(parentSessionId, branchName || null, branchPoint || null, now);

  return {
    id: Number(result.lastInsertRowid),
    parentSessionId,
    childSessionId: null,
    branchPoint: branchPoint || null,
    branchName: branchName || null,
    createdAt: new Date(now),
    linkedAt: null,
  };
}

/**
 * Link a child session to a branch.
 */
export function linkBranch(branchId: number, childSessionId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE session_branches
    SET child_session_id = ?, linked_at = ?
    WHERE id = ?
  `).run(childSessionId, now, branchId);

  return result.changes > 0;
}

/**
 * Get all branches, optionally filtered by parent session.
 */
export function getBranches(sessionId?: string): BranchInfo[] {
  const db = getDb();

  let query = 'SELECT * FROM session_branches';
  const params: any[] = [];

  if (sessionId) {
    const ids = getIdVariants(sessionId);
    if (ids.length === 1) {
      query += ' WHERE parent_session_id = ? OR child_session_id = ?';
      params.push(ids[0], ids[0]);
    } else {
      query += ' WHERE parent_session_id IN (?, ?) OR child_session_id IN (?, ?)';
      params.push(ids[0], ids[1], ids[0], ids[1]);
    }
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(row => ({
    id: row.id,
    parentSessionId: row.parent_session_id,
    childSessionId: row.child_session_id,
    branchPoint: row.branch_point,
    branchName: row.branch_name,
    createdAt: new Date(row.created_at),
    linkedAt: row.linked_at ? new Date(row.linked_at) : null,
  }));
}

/**
 * Get child sessions (branches) of a parent session.
 */
export function getChildSessions(parentSessionId: string): string[] {
  const db = getDb();
  const ids = getIdVariants(parentSessionId);

  const rows = db.prepare(`
    SELECT child_session_id FROM session_branches
    WHERE parent_session_id IN (${ids.map(() => '?').join(',')}) AND child_session_id IS NOT NULL
  `).all(...ids) as { child_session_id: string }[];

  return rows.map(r => r.child_session_id);
}

/* START> Tharyn | CursorCLI
    2026-05-04
    What: Transactional metadata cleanup for a deleted session — annotations, session_tags, session_fts, session_branches (parent OR child)
    Why: SQLite FKs are not enabled; delete cascade is manual. Without this, deleting a session leaves orphan rows.
    Expected: Returns counts {annotation, branches, fts, tags} for logging; runs in a single transaction so partial failure rolls back
*/
export interface DeleteMetadataResult {
  annotation: number;
  branches: number;
  fts: number;
  tags: number;
}

export function deleteSessionMetadata(sessionId: string): DeleteMetadataResult {
  const db = getDb();
  const ids = getIdVariants(sessionId);
  const placeholders = ids.map(() => '?').join(',');

  const result: DeleteMetadataResult = { annotation: 0, branches: 0, fts: 0, tags: 0 };

  const txn = db.transaction((targetIds: string[]) => {
    // Delete from session_tags (parent of join)
    const tagsRes = db.prepare(
      `DELETE FROM session_tags WHERE session_id IN (${placeholders})`
    ).run(...targetIds);
    result.tags = tagsRes.changes;

    // Delete from FTS
    const ftsRes = db.prepare(
      `DELETE FROM session_fts WHERE session_id IN (${placeholders})`
    ).run(...targetIds);
    result.fts = ftsRes.changes;

    // Delete from session_branches where this session is parent OR child
    const branchesRes = db.prepare(
      `DELETE FROM session_branches WHERE parent_session_id IN (${placeholders}) OR child_session_id IN (${placeholders})`
    ).run(...targetIds, ...targetIds);
    result.branches = branchesRes.changes;

    // Finally delete the annotations row itself
    const annRes = db.prepare(
      `DELETE FROM annotations WHERE session_id IN (${placeholders})`
    ).run(...targetIds);
    result.annotation = annRes.changes;
  });

  txn(ids);
  return result;
}

export function setCwdOverride(sessionId: string, cwd: string | null): void {
  const db = getDb();
  const ids = getIdVariants(sessionId);
  const existingId = pickExistingId(ids, db);
  const targetId = existingId || ids[0];

  // Ensure annotation row exists so we have a place to put the override
  if (!existingId) {
    setAnnotation(targetId, {});
  }

  db.prepare(
    `UPDATE annotations SET cwd_override = ?, updated_at = ? WHERE session_id = ?`
  ).run(cwd, new Date().toISOString(), targetId);
}

export function getCwdOverride(sessionId: string): string | null {
  const db = getDb();
  const ids = getIdVariants(sessionId);
  for (const id of ids) {
    const row = db.prepare(`SELECT cwd_override FROM annotations WHERE session_id = ?`).get(id) as
      | { cwd_override: string | null }
      | undefined;
    if (row && row.cwd_override) return row.cwd_override;
  }
  return null;
}

/**
 * Batch fetch ALL cwd overrides as a Map<sessionId, override>.
 * Used by getSessions() to avoid one DB call per session during enumeration.
 */
export function getAllCwdOverrides(): Map<string, string> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT session_id, cwd_override FROM annotations WHERE cwd_override IS NOT NULL AND TRIM(cwd_override) != ''`
  ).all() as Array<{ session_id: string; cwd_override: string }>;
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.session_id, row.cwd_override);
  }
  return map;
}
// <END Tharyn | CursorCLI

/**
 * Get parent session of a branch.
 */
export function getParentSession(childSessionId: string): string | null {
  const db = getDb();
  const ids = getIdVariants(childSessionId);

  const row = db.prepare(`
    SELECT parent_session_id FROM session_branches
    WHERE child_session_id IN (${ids.map(() => '?').join(',')})
    LIMIT 1
  `).get(...ids) as { parent_session_id: string } | undefined;

  return row?.parent_session_id || null;
}
