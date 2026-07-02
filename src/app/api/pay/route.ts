import { NextResponse } from "next/server";
import { z } from "zod";
import { processMockPayment } from "@/modules/billing/service";
import { idempotencyKeySchema, sessionIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api-utils";

const requestSchema = z.object({
  sessionId: sessionIdSchema,
  idempotencyKey: idempotencyKeySchema,
  provider: z.literal("mock"),
  plan: z.literal("monthly")
});

export async function POST(request: Request): Promise<NextResponse> {
  return withErrorHandler(async () => {
    const raw = await request.json();
    const input = requestSchema.parse(raw);
    const body = await processMockPayment(input);
    return { body };
  });
}
