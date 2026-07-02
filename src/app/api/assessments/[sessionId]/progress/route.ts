import { NextResponse } from "next/server";
import { getProgress } from "@/modules/assessments/service";

interface Params {
  params: { sessionId: string };
}

export async function GET(_request: Request, { params }: Params) {
  const body = await getProgress(params.sessionId);
  return NextResponse.json(body);
}
