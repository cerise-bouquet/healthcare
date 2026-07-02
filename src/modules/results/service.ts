export function calculatePublicResult(_answers: Record<string, unknown>) {
  // TODO(next developer): implement BMI/BMR/TDEE/calorie target calculation per
  // docs/algorithm.md, with unit tests for all boundary cases.
  return {
    bmi: 24.1,
    bmiCategory: "NORMAL"
  };
}

export async function getResultForSession(sessionId: string) {
  // TODO(next developer): build response with allowlist serializers. Never
  // delete protected fields from a full object and return the remainder.
  return {
    sessionId,
    subscription: { status: "NONE" },
    publicResult: {
      bmi: 24.1,
      bmiCategory: "NORMAL",
      summary: "You are close to your target range."
    },
    paywall: { required: true }
  };
}
