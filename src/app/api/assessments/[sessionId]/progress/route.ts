import { NextResponse } from "next/server";
import { getProgress } from "@/modules/assessments/service";
import { withErrorHandler } from "@/lib/api-utils";

interface Params {
  params: { sessionId: string };
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  return withErrorHandler(async () => {
    const body = await getProgress(params.sessionId);
    return { body };
  });
}
