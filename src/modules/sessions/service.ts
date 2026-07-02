import type { CreateOrRestoreSessionInput, SessionProgressDto } from "./types";

export async function createOrRestoreSession(
  _input: CreateOrRestoreSessionInput
): Promise<SessionProgressDto> {
  // TODO(next developer): persist anonymous user/session and restore existing
  // progress when a valid sessionId is supplied.
  return {
    sessionId: "sess_contract_stub",
    userId: "usr_contract_stub",
    currentStep: "profile",
    completedSteps: [],
    answers: {},
    version: 1
  };
}
