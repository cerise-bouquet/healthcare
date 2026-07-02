import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrRestoreSession } from "@/modules/sessions/service";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  source: z.string().optional(),
  utm: z.record(z.string()).optional()
});

export async function POST(request: Request) {
  const input = requestSchema.parse(await request.json());
  const body = await createOrRestoreSession(input);
  return NextResponse.json(body, { status: input.sessionId ? 200 : 201 });
}
