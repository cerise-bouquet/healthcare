import { NextResponse } from "next/server";
import { z } from "zod";
import { processMockPayment } from "@/modules/billing/service";
import { idempotencyKeySchema, sessionIdSchema } from "@/lib/validation";

const requestSchema = z.object({
  sessionId: sessionIdSchema,
  idempotencyKey: idempotencyKeySchema,
  provider: z.literal("mock"),
  plan: z.literal("monthly")
});

export async function POST(request: Request) {
  const input = requestSchema.parse(await request.json());
  const body = await processMockPayment(input);
  return NextResponse.json(body);
}
