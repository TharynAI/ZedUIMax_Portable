export type ProEngProvider = 'anthropic' | 'openai' | 'gemini';

export type ProEngChatMode = 'clean' | 'debug';

export type ProEngMessageRole = 'system' | 'user' | 'assistant';

export interface ProEngMessage {
  id: string;
  role: ProEngMessageRole;
  content: string;
  createdAt: string;
  promptSnapshot?: string;
  rawRequest?: string;
  rawResponse?: string;
}

export interface ProEngSessionRecord {
  version: 1;
  id: string;
  name: string;
  provider: ProEngProvider;
  model: string;
  type: string;
  tags: string[];
  isFavorite: boolean;
  autoSummary: string;
  userSummary: string;
  starterPromptPath: string;
  activePromptPath: string;
  debugCaptureEnabled: boolean;
  chatMode: ProEngChatMode;
  createdAt: string;
  updatedAt: string;
  messages: ProEngMessage[];
}

export interface ProEngSessionSummary {
  id: string;
  name: string;
  provider: ProEngProvider;
  model: string;
  type: string;
  tags: string[];
  isFavorite: boolean;
  autoSummary: string;
  userSummary: string;
  displaySummary: string;
  createdAt: string;
  updatedAt: string;
  activePromptPreview: string;
  messageCount: number;
}

export interface ProEngDefaultsConfig {
  defaultModels: Record<ProEngProvider, string>;
  apiModels?: Partial<Record<ProEngProvider, string>>;
  modelAliases?: Record<string, string>;
}

export interface CreateProEngSessionInput {
  name: string;
  provider: ProEngProvider;
  type: string;
}

export interface UpdateProEngSessionInput {
  name?: string;
  provider?: ProEngProvider;
  model?: string;
  type?: string;
  tags?: string[];
  isFavorite?: boolean;
  autoSummary?: string;
  userSummary?: string;
  debugCaptureEnabled?: boolean;
  chatMode?: ProEngChatMode;
}

export interface SendProEngMessageInput {
  content: string;
}

export interface SavePromptTemplateInput {
  sessionId: string;
  filePath?: string;
}
