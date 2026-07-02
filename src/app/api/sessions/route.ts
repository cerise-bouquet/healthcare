import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrRestoreSession } from "@/modules/sessions/service";
import { withErrorHandler } from "@/lib/api-utils";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  source: z.string().optional(),
  utm: z.record(z.string()).optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  return withErrorHandler(async () => {
    const raw = await request.json();
    const input = requestSchema.parse(raw);
    const body = await createOrRestoreSession(input);
    return { body, status: input.sessionId ? 200 : 201 };
  });
}
