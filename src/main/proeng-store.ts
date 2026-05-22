import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import {
  addTags,
  deleteAnnotation,
  getAnnotation,
  removeTag,
  setAnnotation,
  toggleFavorite,
} from './metadata-db';
import type {
  CreateProEngSessionInput,
  ProEngDefaultsConfig,
  ProEngMessage,
  ProEngProvider,
  ProEngSessionRecord,
  ProEngSessionSummary,
  SavePromptTemplateInput,
  SendProEngMessageInput,
  UpdateProEngSessionInput,
} from '../shared/proeng';

const isWindows = process.platform === 'win32';
const ZEDUI_ROOT = isWindows ? 'E:\\ZedBang\\ZedUIMax' : '/mnt/e/ZedBang/ZedUIMax';
const PROENG_ROOT = path.join(ZEDUI_ROOT, 'resources', 'proeng');
const PROENG_CONFIG_DIR = path.join(PROENG_ROOT, 'config');
const PROENG_STARTER_DIR = path.join(PROENG_CONFIG_DIR, 'starter-prompts');
const PROENG_SCRIPTS_DIR = path.join(PROENG_ROOT, 'scripts');
const PROENG_TEMPLATES_DIR = path.join(PROENG_ROOT, 'templates');
const PROENG_SESSIONS_DIR = path.join(PROENG_ROOT, 'sessions');
const PROVIDER_DEFAULTS_FILE = path.join(PROENG_CONFIG_DIR, 'provider-defaults.json');
const GENERIC_STARTER_PROMPT_FILE = path.join(PROENG_STARTER_DIR, 'generic.md');
const PROENG_LLM_BRIDGE_FILE = path.join(PROENG_SCRIPTS_DIR, 'proeng_llm.py');
const MAX_HISTORY_MESSAGES = 6;

const DEFAULTS: ProEngDefaultsConfig = {
  defaultModels: {
    anthropic: 'claude-opus-best',
    openai: 'gpt-best',
    gemini: 'gemini-best',
  },
  apiModels: {
    anthropic: 'claude-3-5-sonnet-latest',
    openai: 'gpt-4.1-mini',
    gemini: 'gemini-2.0-flash',
  },
  modelAliases: {
    'claude-opus-best': 'claude-3-5-sonnet-latest',
    'gpt-best': 'gpt-4.1-mini',
    'gemini-best': 'gemini-2.0-flash',
  },
};

const GENERIC_STARTER_PROMPT = `# ProEng Generic Starter Prompt

You are collaborating with a user to design, tighten, and validate a high-quality prompt.

Your job is to help the user produce:
- a clear outcome statement
- a structured working prompt
- explicit assumptions, constraints, and acceptance criteria
- revisions that remove ambiguity and reduce context clutter

Working rules:
- Ask clarifying questions even when the request looks mostly complete.
- If any part of the request is ambiguous, call it out directly and propose concrete options.
- Do not silently guess between multiple valid interpretations.
- Keep the active prompt concise, explicit, and easy to hand to another agent.
- When you suggest a revision, return a full updated draft the user can copy forward.
- Prefer organized sections over long paragraphs.
`;

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath: string, contents: string) {
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, contents, 'utf-8');
  }
}

function ensureProEngLayout() {
  ensureDir(PROENG_ROOT);
  ensureDir(PROENG_CONFIG_DIR);
  ensureDir(PROENG_STARTER_DIR);
  ensureDir(PROENG_SCRIPTS_DIR);
  ensureDir(PROENG_TEMPLATES_DIR);
  ensureDir(PROENG_SESSIONS_DIR);
  ensureFile(PROVIDER_DEFAULTS_FILE, JSON.stringify(DEFAULTS, null, 2));
  ensureFile(GENERIC_STARTER_PROMPT_FILE, GENERIC_STARTER_PROMPT);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function normalizeType(type: string) {
  return type.trim();
}

function getSessionFolder(sessionId: string) {
  return path.join(PROENG_SESSIONS_DIR, sessionId.replace(/^proeng:/, ''));
}

function getSessionJsonPath(sessionId: string) {
  return path.join(getSessionFolder(sessionId), 'session.json');
}

function getActivePromptPath(sessionId: string) {
  return path.join(getSessionFolder(sessionId), 'active-prompt.md');
}

function readPrompt(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function buildDisplaySummary(record: ProEngSessionRecord) {
  return record.userSummary.trim() || record.autoSummary.trim() || record.name.trim() || 'Untitled ProEng Session';
}

function buildSummary(record: ProEngSessionRecord): ProEngSessionSummary {
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    model: record.model,
    type: record.type,
    tags: [...record.tags],
    isFavorite: record.isFavorite,
    autoSummary: record.autoSummary,
    userSummary: record.userSummary,
    displaySummary: buildDisplaySummary(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    activePromptPreview: readPrompt(record.activePromptPath).split('\n').slice(0, 8).join('\n').trim(),
    messageCount: record.messages.length,
  };
}

function syncAnnotation(record: ProEngSessionRecord) {
  setAnnotation(record.id, {
    userSummary: record.userSummary,
    autoSummary: record.autoSummary,
    firstMessage: record.messages.find((message) => message.role === 'user')?.content || '',
    type: record.type,
  });

  const annotation = getAnnotation(record.id);
  const currentTags = new Set(annotation?.tags || []);
  const desiredTags = new Set(record.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));

  for (const tag of desiredTags) {
    if (!currentTags.has(tag)) {
      addTags(record.id, [tag]);
    }
  }

  for (const tag of currentTags) {
    if (!desiredTags.has(tag)) {
      removeTag(record.id, tag);
    }
  }

  const isFavorite = Boolean(annotation?.isFavorite);
  if (isFavorite !== record.isFavorite) {
    toggleFavorite(record.id);
  }
}

function saveSession(record: ProEngSessionRecord) {
  ensureDir(getSessionFolder(record.id));
  writeJson(getSessionJsonPath(record.id), record);
  writePrompt(record.id, readPrompt(record.activePromptPath));
  syncAnnotation(record);
}

function writePrompt(sessionId: string, content: string) {
  fs.writeFileSync(getActivePromptPath(sessionId), content, 'utf-8');
}

function readSessionRecord(sessionId: string): ProEngSessionRecord | null {
  const sessionJsonPath = getSessionJsonPath(sessionId);
  if (!fs.existsSync(sessionJsonPath)) {
    return null;
  }
  const record = readJson<ProEngSessionRecord>(sessionJsonPath);
  const annotation = getAnnotation(record.id);
  if (annotation) {
    record.type = annotation.type || record.type;
    record.tags = annotation.tags.length > 0 ? annotation.tags : record.tags;
    record.isFavorite = annotation.isFavorite;
    record.userSummary = annotation.userSummary || record.userSummary;
    record.autoSummary = annotation.autoSummary || record.autoSummary;
  }
  return record;
}

function readAllSessionRecords() {
  ensureProEngLayout();
  const sessionDirs = fs.readdirSync(PROENG_SESSIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PROENG_SESSIONS_DIR, entry.name));

  return sessionDirs
    .map((dirPath) => {
      const sessionPath = path.join(dirPath, 'session.json');
      if (!fs.existsSync(sessionPath)) {
        return null;
      }
      const sessionId = `proeng:${path.basename(dirPath)}`;
      return readSessionRecord(sessionId);
    })
    .filter((record): record is ProEngSessionRecord => Boolean(record))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function resolveDefaults() {
  ensureProEngLayout();
  const savedDefaults = readJson<ProEngDefaultsConfig>(PROVIDER_DEFAULTS_FILE);
  return {
    defaultModels: {
      ...DEFAULTS.defaultModels,
      ...savedDefaults.defaultModels,
    },
    apiModels: {
      ...DEFAULTS.apiModels,
      ...savedDefaults.apiModels,
    },
    modelAliases: {
      ...DEFAULTS.modelAliases,
      ...savedDefaults.modelAliases,
    },
  };
}

function getStarterPrompt() {
  ensureProEngLayout();
  return fs.readFileSync(GENERIC_STARTER_PROMPT_FILE, 'utf-8');
}

function toWslPath(filePath: string) {
  if (!isWindows) {
    return filePath;
  }
  return filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`);
}

function resolveProviderModel(provider: ProEngProvider, model: string, defaults: ProEngDefaultsConfig) {
  const trimmed = model.trim();
  const aliasTarget = defaults.modelAliases?.[trimmed];
  if (aliasTarget) {
    return aliasTarget;
  }
  if (trimmed) {
    return trimmed;
  }
  return defaults.apiModels?.[provider]?.trim() || defaults.defaultModels[provider];
}

function buildConversationContext(messages: ProEngMessage[]) {
  const relevantMessages = messages
    .filter((message) => message.role !== 'system')
    .slice(-MAX_HISTORY_MESSAGES);

  if (relevantMessages.length === 0) {
    return 'No previous user-visible conversation yet.';
  }

  return relevantMessages.map((message) => {
    const speaker = message.role === 'assistant' ? 'Agent' : 'User';
    return `${speaker}:\n${message.content.trim()}`;
  }).join('\n\n');
}

function buildLlmSystemPrompt(starterPrompt: string) {
  return [
    starterPrompt.trim(),
    'You are the ProEng revision engine inside ZedUIMax.',
    'Return JSON only. Do not use markdown fences.',
    'The JSON object must contain the keys assistant_message, revised_prompt, and auto_summary.',
    'assistant_message must explain the revision, call out ambiguity, ask clarifying questions, and propose options when details are unclear.',
    'revised_prompt must be a complete replacement prompt, never a diff, fragment, or note list.',
    'auto_summary must be a short one-line session summary under 160 characters.',
  ].join('\n\n');
}

function buildLlmUserPrompt(
  record: Pick<ProEngSessionRecord, 'name' | 'provider' | 'model' | 'type'>,
  activePrompt: string,
  conversationContext: string,
  latestInstruction: string,
) {
  return [
    'Revise the active prompt for this ProEng session.',
    '',
    'Session',
    `- Name: ${record.name}`,
    `- Provider: ${record.provider}`,
    `- Model: ${record.model}`,
    `- Type: ${record.type || 'Uncategorized'}`,
    '',
    'Conversation Context',
    conversationContext,
    '',
    'Current Active Prompt',
    '<<<ACTIVE_PROMPT',
    activePrompt.trim(),
    'ACTIVE_PROMPT',
    '',
    'Latest User Instruction',
    latestInstruction.trim(),
    '',
    'Response Requirements',
    '- Keep the user intent intact while improving clarity, structure, and explicit constraints.',
    '- If the instruction is ambiguous, surface the ambiguity directly and propose concrete options.',
    '- Ask clarifying questions even when you can still provide a best-effort revision.',
    '- Return a full revised prompt that is ready to save as the next active prompt.',
  ].join('\n');
}

interface ProEngLlmBridgeResponse {
  assistantMessage: string;
  revisedPrompt: string;
  autoSummary?: string;
  rawRequest?: string;
  rawResponse?: string;
}

function runProEngBridge(payload: {
  provider: ProEngProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  return new Promise<ProEngLlmBridgeResponse>((resolve, reject) => {
    const command = isWindows ? 'wsl.exe' : 'python3';
    const args = isWindows
      ? ['bash', '-lc', `python3 '${toWslPath(PROENG_LLM_BRIDGE_FILE).replace(/'/g, `'\\''`)}'`]
      : [PROENG_LLM_BRIDGE_FILE];

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `ProEng bridge exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as ProEngLlmBridgeResponse);
      } catch (error) {
        reject(new Error(`Failed to parse ProEng bridge output: ${String(error)}\n${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function requestPromptRevision(
  record: Pick<ProEngSessionRecord, 'id' | 'name' | 'provider' | 'model' | 'type' | 'messages' | 'debugCaptureEnabled'>,
  starterPrompt: string,
  activePrompt: string,
  latestInstruction: string,
) {
  const defaults = resolveDefaults();
  const model = resolveProviderModel(record.provider, record.model, defaults);
  const bridgeResponse = await runProEngBridge({
    provider: record.provider,
    model,
    systemPrompt: buildLlmSystemPrompt(starterPrompt),
    userPrompt: buildLlmUserPrompt(record, activePrompt, buildConversationContext(record.messages), latestInstruction),
  });

  return {
    assistantMessage: bridgeResponse.assistantMessage.trim(),
    revisedPrompt: bridgeResponse.revisedPrompt.trim(),
    autoSummary: bridgeResponse.autoSummary?.trim(),
    rawRequest: record.debugCaptureEnabled ? bridgeResponse.rawRequest : undefined,
    rawResponse: record.debugCaptureEnabled ? bridgeResponse.rawResponse : undefined,
  };
}

function buildInitialActivePrompt(input: CreateProEngSessionInput, model: string) {
  const typeLabel = normalizeType(input.type) || 'Uncategorized';
  return `# ${input.name}

## Outcome
- Define the concrete result this prompt should produce.

## Context
- Provider: ${input.provider}
- Model: ${model}
- Type: ${typeLabel}

## Requirements
- Ask clarifying questions before locking a draft.
- If anything is ambiguous, surface the ambiguity and propose options.
- Keep the prompt structured, concise, and ready to hand off.

## Draft Prompt
Describe the task, constraints, audience, desired output shape, and verification criteria here.
`;
}

function buildAutoSummary(input: CreateProEngSessionInput) {
  const typeLabel = normalizeType(input.type) || 'Uncategorized';
  return `Develop a ${typeLabel.toLowerCase()} prompt workflow for ${input.name}.`;
}

function buildInitialInstruction(input: CreateProEngSessionInput) {
  return [
    `Kick off a new ProEng session for "${input.name}".`,
    `Type: ${normalizeType(input.type) || 'Uncategorized'}.`,
    'Create the first working revision of the active prompt.',
    'Ask clarifying questions, surface ambiguity, and propose concrete options where the request needs more detail.',
  ].join('\n');
}

export function getProEngDefaults() {
  return {
    ...resolveDefaults(),
    starterPromptPath: GENERIC_STARTER_PROMPT_FILE,
    starterPrompt: getStarterPrompt(),
    templatesDirectory: PROENG_TEMPLATES_DIR,
    sessionsDirectory: PROENG_SESSIONS_DIR,
  };
}

export function listProEngSessions() {
  return readAllSessionRecords().map(buildSummary);
}

export function getProEngSession(sessionId: string) {
  const record = readSessionRecord(sessionId);
  if (!record) {
    return null;
  }
  return {
    session: buildSummary(record),
    record,
    activePrompt: readPrompt(record.activePromptPath),
  };
}

export async function createProEngSession(input: CreateProEngSessionInput) {
  ensureProEngLayout();

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Session name is required.');
  }

  const defaults = resolveDefaults();
  const model = defaults.defaultModels[input.provider];
  const starterPrompt = getStarterPrompt();
  const sessionId = `proeng:${randomUUID()}`;
  const activePromptPath = getActivePromptPath(sessionId);
  const activePrompt = buildInitialActivePrompt(input, model);
  const now = new Date().toISOString();
  const starterMessage: ProEngMessage = {
    id: randomUUID(),
    role: 'system',
    content: starterPrompt.trim(),
    createdAt: now,
    promptSnapshot: activePrompt,
  };
  const record: ProEngSessionRecord = {
    version: 1,
    id: sessionId,
    name: trimmedName,
    provider: input.provider,
    model,
    type: normalizeType(input.type),
    tags: [],
    isFavorite: false,
    autoSummary: buildAutoSummary(input),
    userSummary: '',
    starterPromptPath: GENERIC_STARTER_PROMPT_FILE,
    activePromptPath,
    debugCaptureEnabled: false,
    chatMode: 'clean',
    createdAt: now,
    updatedAt: now,
    messages: [starterMessage],
  };

  const starterResponse = await requestPromptRevision(record, starterPrompt, activePrompt, buildInitialInstruction(input));
  const revisedPrompt = starterResponse.revisedPrompt || activePrompt;
  record.autoSummary = starterResponse.autoSummary || buildAutoSummary(input);
  record.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: starterResponse.assistantMessage,
    createdAt: new Date().toISOString(),
    promptSnapshot: revisedPrompt,
    rawResponse: starterResponse.rawResponse,
  });
  record.updatedAt = new Date().toISOString();

  ensureDir(getSessionFolder(sessionId));
  writePrompt(sessionId, revisedPrompt);
  writeJson(getSessionJsonPath(sessionId), record);
  syncAnnotation(record);

  return getProEngSession(sessionId);
}

export function updateProEngSession(sessionId: string, updates: UpdateProEngSessionInput) {
  const record = readSessionRecord(sessionId);
  if (!record) {
    throw new Error(`ProEng session not found: ${sessionId}`);
  }

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) {
      throw new Error('Session name is required.');
    }
    record.name = trimmed;
  }
  if (updates.provider) record.provider = updates.provider;
  if (updates.model !== undefined) record.model = updates.model.trim();
  if (updates.type !== undefined) record.type = normalizeType(updates.type);
  if (updates.tags) record.tags = updates.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  if (updates.isFavorite !== undefined) record.isFavorite = updates.isFavorite;
  if (updates.autoSummary !== undefined) record.autoSummary = updates.autoSummary;
  if (updates.userSummary !== undefined) record.userSummary = updates.userSummary;
  if (updates.debugCaptureEnabled !== undefined) record.debugCaptureEnabled = updates.debugCaptureEnabled;
  if (updates.chatMode) record.chatMode = updates.chatMode;
  record.updatedAt = new Date().toISOString();

  writeJson(getSessionJsonPath(sessionId), record);
  syncAnnotation(record);
  return getProEngSession(sessionId);
}

export async function sendProEngMessage(sessionId: string, input: SendProEngMessageInput) {
  const trimmed = input.content.trim();
  if (!trimmed) {
    throw new Error('Message content is required.');
  }

  const record = readSessionRecord(sessionId);
  if (!record) {
    throw new Error(`ProEng session not found: ${sessionId}`);
  }

  const currentPrompt = readPrompt(record.activePromptPath);
  const revision = await requestPromptRevision(record, getStarterPrompt(), currentPrompt, trimmed);
  const nextPrompt = revision.revisedPrompt || currentPrompt;

  const now = new Date().toISOString();
  record.messages.push({
    id: randomUUID(),
    role: 'user',
    content: trimmed,
    createdAt: now,
    promptSnapshot: currentPrompt,
    rawRequest: revision.rawRequest,
  });
  record.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: revision.assistantMessage,
    createdAt: new Date().toISOString(),
    promptSnapshot: nextPrompt,
    rawResponse: revision.rawResponse,
  });

  record.autoSummary = revision.autoSummary || record.autoSummary;
  record.updatedAt = new Date().toISOString();
  writePrompt(sessionId, nextPrompt);
  writeJson(getSessionJsonPath(sessionId), record);
  syncAnnotation(record);
  return getProEngSession(sessionId);
}

export function updateProEngPrompt(sessionId: string, content: string) {
  const record = readSessionRecord(sessionId);
  if (!record) {
    throw new Error(`ProEng session not found: ${sessionId}`);
  }

  writePrompt(sessionId, content);
  record.updatedAt = new Date().toISOString();
  writeJson(getSessionJsonPath(sessionId), record);
  syncAnnotation(record);
  return getProEngSession(sessionId);
}

export function saveProEngPromptTemplate(input: SavePromptTemplateInput) {
  const session = getProEngSession(input.sessionId);
  if (!session) {
    throw new Error(`ProEng session not found: ${input.sessionId}`);
  }

  const defaultFileName = `${session.session.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'proeng-template'}.md`;
  const targetFilePath = input.filePath || path.join(PROENG_TEMPLATES_DIR, defaultFileName);
  ensureDir(path.dirname(targetFilePath));
  fs.copyFileSync(session.record.activePromptPath, targetFilePath);
  return { filePath: targetFilePath };
}

export function deleteProEngSessions(sessionIds: string[]) {
  let deletedCount = 0;

  for (const sessionId of sessionIds) {
    const folder = getSessionFolder(sessionId);
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
      deleteAnnotation(sessionId);
      deletedCount += 1;
    }
  }

  return deletedCount;
}
