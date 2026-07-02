import { ApiError } from "@/lib/errors";
import { isStepKey, stepSchemas } from "@/lib/validation";
import type { PatchStepInput, SubmitAssessmentInput } from "./types";

export async function getProgress(sessionId: string) {
  // TODO(next developer): load session, validate ownership boundary, and return
  // draft progress without protected result fields.
  return {
    sessionId,
    status: "DRAFT",
    currentStep: "profile",
    completedSteps: [],
    answers: {},
    version: 1
  };
}

export async function patchStep(input: PatchStepInput) {
  if (!isStepKey(input.stepKey)) {
    throw new ApiError("VALIDATION_ERROR", "Unknown assessment step.", 400);
  }
  stepSchemas[input.stepKey].strict().parse(input.answers);
  // TODO(next developer): implement transaction:
  // read session -> check version -> upsert answers -> advance state -> version++.
  return {
    status: "DRAFT",
    currentStep: input.stepKey,
    completedSteps: [],
    version: input.version + 1
  };
}

export async function submitAssessment(input: SubmitAssessmentInput) {
  // TODO(next developer): implement idempotent submit transaction and delegate
  // calculation to results module.
  return {
    sessionId: input.sessionId,
    status: "SUBMITTED",
    resultId: "res_contract_stub",
    publicResult: {
      bmi: 24.1,
      bmiCategory: "NORMAL",
      summary: "Your current metrics are within a manageable range.",
      nextAction: "Unlock full plan to view target date and detailed daily guidance."
    },
    paywall: {
      required: true,
      reason: "FULL_RESULT_REQUIRES_SUBSCRIPTION"
    }
  };
}
