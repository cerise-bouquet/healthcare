import { NextResponse } from "next/server";
import { z } from "zod";
import { patchStep } from "@/modules/assessments/service";
import { versionSchema, isStepKey, sessionIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api-utils";
import { ApiError } from "@/lib/errors";

const requestSchema = z.object({
  version: versionSchema,
  answers: z.record(z.unknown())
});

interface Params {
  params: { sessionId: string; stepKey: string };
}

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return withErrorHandler(async () => {
    sessionIdSchema.parse(params.sessionId);
    const raw = await request.json();
    const input = requestSchema.parse(raw);

    if (!isStepKey(params.stepKey)) {
      throw new ApiError("INVALID_ENUM", `Unknown assessment step: ${params.stepKey}.`, 400);
    }

    const body = await patchStep({
      sessionId: params.sessionId,
      stepKey: params.stepKey,
      version: input.version,
      answers: input.answers
    });
    return { body };
  });
}
