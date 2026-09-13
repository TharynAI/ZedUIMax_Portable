export interface LaunchClassificationInput {
  userSummary: string;
  type: string;
}

export type LaunchClassificationState = 'applied' | 'pending' | 'failed' | 'unsupported';

export interface LaunchClassificationNotice {
  id: string;
  launcherId: string;
  launcherLabel: string;
  state: LaunchClassificationState;
  userSummary: string;
  type: string;
  sessionId?: string;
  message: string;
  createdAt: string;
  dismissed?: boolean;
}

export interface AssistantLaunchResult {
  success: boolean;
  command?: string;
  error?: string;
  classification?: LaunchClassificationNotice;
}
