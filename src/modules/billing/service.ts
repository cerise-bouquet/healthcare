export interface PayInput {
  sessionId: string;
  idempotencyKey: string;
  provider: "mock";
  plan: "monthly";
}

export async function processMockPayment(_input: PayInput) {
  // TODO(next developer): implement idempotent payment event transaction and
  // subscription activation with source_event_id audit trail.
  return {
    paid: true,
    subscription: {
      status: "ACTIVE",
      startsAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-08-01T00:00:00.000Z"
    },
    resultAccess: "FULL"
  };
}
