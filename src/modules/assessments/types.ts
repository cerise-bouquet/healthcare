import type { StepKey } from "@/lib/validation";

export type AssessmentStatus =
  | "DRAFT"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "EXPIRED";

export interface PatchStepInput {
  sessionId: string;
  stepKey: StepKey;
  version: number;
  answers: Record<string, unknown>;
}

export interface SubmitAssessmentInput {
  sessionId: string;
  version: number;
  idempotencyKey: string;
}
