import { NextResponse } from "next/server";
import { z } from "zod";
import { submitAssessment } from "@/modules/assessments/service";
import { idempotencyKeySchema, versionSchema } from "@/lib/validation";

const requestSchema = z.object({
  version: versionSchema,
  idempotencyKey: idempotencyKeySchema
});

interface Params {
  params: { sessionId: string };
}

export async function POST(request: Request, { params }: Params) {
  const input = requestSchema.parse(await request.json());
  const body = await submitAssessment({
    sessionId: params.sessionId,
    version: input.version,
    idempotencyKey: input.idempotencyKey
  });
  return NextResponse.json(body);
}
