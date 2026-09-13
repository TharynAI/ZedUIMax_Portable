import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';

import type {
  LaunchClassificationInput,
  LaunchClassificationNotice,
} from '../shared/launch-classification';
import type { ProviderId } from '../shared/constants';
import type { AssistantLauncherId } from './launch-config';
import { canonPath } from './agent-products';
import { setAnnotation } from './metadata-db';
import { getRuntimePaths } from './runtime-paths';
import { getSessionDetails, getSessionIdentities } from './session-store';

const PENDING_FILE = 'pending-launch-classifications.json';
const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_HISTORY = 100;

export interface ClassificationTarget {
  launcherId: AssistantLauncherId;
  launcherLabel: string;
  providerId: ProviderId | null;
  product?: string;
  exactIdentity: 'claude' | 'cursor' | null;
}

interface PendingLaunchClassification extends LaunchClassificationNotice {
  providerId: ProviderId;
  product?: string;
  workspace: string;
  knownSessionIds: string[];
  attempts: number;
  expiresAt: string;
}

export interface ClassificationCandidate {
  sessionId: string;
  providerId: ProviderId;
  product?: string;
  workspace: string;
  projectPath: string;
  timestamp: string;
}

const TARGETS: Record<AssistantLauncherId, ClassificationTarget> = {
  claude2: {
    launcherId: 'claude2',
    launcherLabel: 'Claude2',
    providerId: 'claude',
    exactIdentity: 'claude',
  },
  codex2: {
    launcherId: 'codex2',
    launcherLabel: 'Codex2',
    providerId: 'codex',
    product: 'codex',
    exactIdentity: null,
  },
  cursx: {
    launcherId: 'cursx',
    launcherLabel: 'CursX',
    providerId: 'codex',
    product: 'cursx',
    exactIdentity: null,
  },
  cursor: {
    launcherId: 'cursor',
    launcherLabel: 'Cursor',
    providerId: 'cursor',
    exactIdentity: 'cursor',
  },
  gemini3: {
    launcherId: 'gemini3',
    launcherLabel: 'Gemini3',
    providerId: null,
    exactIdentity: null,
  },
};

let timer: NodeJS.Timeout | null = null;
let reconciling = false;

export function classificationTargetForLauncher(launcherId: AssistantLauncherId): ClassificationTarget {
  return TARGETS[launcherId];
}

export function sanitizeClassificationInput(input: LaunchClassificationInput): LaunchClassificationInput {
  const userSummary = String(input?.userSummary || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  const type = String(input?.type || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!userSummary || !type) {
    throw new Error('Category and summary are required for a new indexed session.');
  }
  return { userSummary, type };
}

function pendingFilePath(): string {
  return path.join(getRuntimePaths().dataDir, PENDING_FILE);
}

function readRecords(): PendingLaunchClassification[] {
  const filePath = pendingFilePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(value?.records) ? value.records : [];
  } catch (error) {
    console.error('[launch-classification] Unable to read pending classifications:', error);
    return [];
  }
}

function writeRecords(records: PendingLaunchClassification[]): void {
  const filePath = pendingFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const retained = records
    .filter(record => record.state === 'pending' || !record.dismissed)
    .slice(-MAX_HISTORY);
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, records: retained }, null, 2), 'utf8');
}

function broadcast(notice: LaunchClassificationNotice): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('assistant:classification', notice);
  }
}

export function applyExactLaunchClassification(
  target: ClassificationTarget,
  nativeSessionId: string,
  workspace: string,
  input: LaunchClassificationInput,
): LaunchClassificationNotice {
  if (!target.providerId) throw new Error(`${target.launcherLabel} sessions are not indexed by ZedUIMax.`);
  const clean = sanitizeClassificationInput(input);
  const sessionId = `${target.providerId}:${nativeSessionId}`;
  setAnnotation(sessionId, {
    projectPath: workspace,
    userSummary: clean.userSummary,
    type: clean.type,
  });
  return {
    id: `exact:${sessionId}`,
    launcherId: target.launcherId,
    launcherLabel: target.launcherLabel,
    state: 'applied',
    userSummary: clean.userSummary,
    type: clean.type,
    sessionId,
    message: `${clean.type} classification attached to ${target.launcherLabel}.`,
    createdAt: new Date().toISOString(),
  };
}

export function queuePendingLaunchClassification(
  target: ClassificationTarget,
  workspace: string,
  input: LaunchClassificationInput,
): LaunchClassificationNotice {
  if (!target.providerId) throw new Error(`${target.launcherLabel} sessions are not indexed by ZedUIMax.`);
  const clean = sanitizeClassificationInput(input);
  const now = new Date();
  const record: PendingLaunchClassification = {
    id: `launch:${target.launcherId}:${now.getTime()}:${Math.random().toString(16).slice(2, 10)}`,
    launcherId: target.launcherId,
    launcherLabel: target.launcherLabel,
    providerId: target.providerId,
    product: target.product,
    workspace,
    knownSessionIds: getSessionIdentities(target.providerId, target.product).map(identity => identity.sessionId),
    attempts: 0,
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
    state: 'pending',
    userSummary: clean.userSummary,
    type: clean.type,
    message: `Waiting for ${target.launcherLabel} to register its native session…`,
    createdAt: now.toISOString(),
  };
  const records = readRecords();
  records.push(record);
  writeRecords(records);
  scheduleReconciliation(1200);
  return record;
}

export function failPendingLaunchClassification(id: string, error: string): void {
  const records = readRecords();
  const record = records.find(item => item.id === id);
  if (!record) return;
  record.state = 'failed';
  record.message = error;
  writeRecords(records);
  broadcast(record);
}

export function getVisibleLaunchClassificationNotices(): LaunchClassificationNotice[] {
  return readRecords()
    .filter(record => !record.dismissed && (record.state === 'pending' || record.state === 'failed'))
    .map(record => ({ ...record }));
}

export function dismissLaunchClassification(id: string): void {
  const records = readRecords();
  const record = records.find(item => item.id === id);
  if (!record) return;
  record.dismissed = true;
  writeRecords(records);
}

export function selectPendingCandidate(
  record: Pick<PendingLaunchClassification, 'providerId' | 'product' | 'workspace' | 'knownSessionIds' | 'createdAt'>,
  candidates: ClassificationCandidate[],
  claimedSessionIds: Set<string> = new Set(),
): ClassificationCandidate | null {
  const known = new Set(record.knownSessionIds);
  const createdAt = new Date(record.createdAt).getTime();
  const expectedProduct = record.providerId === 'codex' ? (record.product || 'codex') : undefined;
  return candidates
    .filter(candidate => candidate.providerId === record.providerId)
    .filter(candidate => !known.has(candidate.sessionId) && !claimedSessionIds.has(candidate.sessionId))
    .filter(candidate => new Date(candidate.timestamp).getTime() >= createdAt - 5000)
    .filter(candidate => !expectedProduct || (candidate.product || 'codex') === expectedProduct)
    .filter(candidate => canonPath(candidate.workspace) === canonPath(record.workspace))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())[0] || null;
}

function candidatesFor(record: PendingLaunchClassification): ClassificationCandidate[] {
  return getSessionIdentities(record.providerId, record.product).flatMap(identity => {
    if (record.knownSessionIds.includes(identity.sessionId)) return [];
    const details = getSessionDetails(identity.sessionId);
    if (!details) return [];
    return [{
      sessionId: identity.sessionId,
      providerId: identity.providerId,
      product: identity.product || details.product,
      workspace: details.cwd || details.projectDisplay,
      projectPath: details.projectPath,
      timestamp: identity.timestamp.toISOString(),
    }];
  });
}

export async function reconcilePendingLaunchClassifications(): Promise<LaunchClassificationNotice[]> {
  if (reconciling) return [];
  reconciling = true;
  const changed: LaunchClassificationNotice[] = [];
  try {
    const records = readRecords();
    const claimed = new Set(records.flatMap(record => record.sessionId ? [record.sessionId] : []));
    const now = Date.now();

    for (const record of records
      .filter(item => item.state === 'pending')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      if (new Date(record.expiresAt).getTime() <= now) {
        record.state = 'failed';
        record.message = `${record.launcherLabel} opened, but ZedUIMax could not identify its new native session within 10 minutes. The session remains Ungrouped until classified manually.`;
        changed.push({ ...record });
        continue;
      }

      record.attempts += 1;
      const candidate = selectPendingCandidate(record, candidatesFor(record), claimed);
      if (!candidate) continue;

      setAnnotation(candidate.sessionId, {
        projectPath: candidate.projectPath || record.workspace,
        userSummary: record.userSummary,
        type: record.type,
      });
      record.state = 'applied';
      record.sessionId = candidate.sessionId;
      record.message = `${record.type} classification attached to ${record.launcherLabel}.`;
      claimed.add(candidate.sessionId);
      changed.push({ ...record });
    }

    writeRecords(records);
    for (const notice of changed) broadcast(notice);
    if (records.some(record => record.state === 'pending')) scheduleReconciliation(2500);
    return changed;
  } catch (error) {
    console.error('[launch-classification] Reconciliation failed:', error);
    scheduleReconciliation(5000);
    return changed;
  } finally {
    reconciling = false;
  }
}

function scheduleReconciliation(delayMs: number): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void reconcilePendingLaunchClassifications();
  }, delayMs);
  timer.unref?.();
}

export function startLaunchClassificationService(): void {
  if (readRecords().some(record => record.state === 'pending')) scheduleReconciliation(500);
}

export function unsupportedClassificationNotice(target: ClassificationTarget): LaunchClassificationNotice {
  return {
    id: `unsupported:${target.launcherId}`,
    launcherId: target.launcherId,
    launcherLabel: target.launcherLabel,
    state: 'unsupported',
    userSummary: '',
    type: '',
    message: `${target.launcherLabel} sessions are not indexed by ZedUIMax yet, so launches cannot be categorized automatically.`,
    createdAt: new Date().toISOString(),
  };
}
