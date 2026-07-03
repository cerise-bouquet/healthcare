import { NextResponse } from "next/server";
import { getResultForSession } from "@/modules/results/service";
import { sessionIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api-utils";

interface Params {
  params: { sessionId: string };
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  return withErrorHandler(async () => {
    sessionIdSchema.parse(params.sessionId);
    const body = await getResultForSession(params.sessionId);
    return { body };
  });
}
