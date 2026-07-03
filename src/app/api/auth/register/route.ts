import { NextRequest, NextResponse } from "next/server";
import { register } from "@/modules/auth/service";
import { ApiError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await register({
      email: body.email,
      password: body.password
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { code: error.code, message: error.message, details: error.details },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
