import { NextResponse } from "next/server";
import { getResultForSession } from "@/modules/results/service";

interface Params {
  params: { sessionId: string };
}

export async function GET(_request: Request, { params }: Params) {
  const body = await getResultForSession(params.sessionId);
  return NextResponse.json(body);
}
