import { NextResponse } from "next/server";
import { z } from "zod";
import { submitAssessment } from "@/modules/assessments/service";
import { idempotencyKeySchema, versionSchema, sessionIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api-utils";

const requestSchema = z.object({
  version: versionSchema,
  idempotencyKey: idempotencyKeySchema
});

interface Params {
  params: { sessionId: string };
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  return withErrorHandler(async () => {
    sessionIdSchema.parse(params.sessionId);
    const raw = await request.json();
    const input = requestSchema.parse(raw);
    const body = await submitAssessment({
      sessionId: params.sessionId,
      version: input.version,
      idempotencyKey: input.idempotencyKey
    });
    return { body };
  });
}
