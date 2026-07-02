import { NextResponse } from "next/server";
import { z } from "zod";
import { patchStep } from "@/modules/assessments/service";
import { versionSchema } from "@/lib/validation";

const requestSchema = z.object({
  version: versionSchema,
  answers: z.record(z.unknown())
});

interface Params {
  params: { sessionId: string; stepKey: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const input = requestSchema.parse(await request.json());
  const body = await patchStep({
    sessionId: params.sessionId,
    stepKey: params.stepKey as never,
    version: input.version,
    answers: input.answers
  });
  return NextResponse.json(body);
}
