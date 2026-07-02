export interface CreateOrRestoreSessionInput {
  sessionId?: string;
  source?: string;
  utm?: Record<string, string>;
}

export interface SessionProgressDto {
  sessionId: string;
  userId: string;
  currentStep: string;
  completedSteps: string[];
  answers: Record<string, unknown>;
  version: number;
}
