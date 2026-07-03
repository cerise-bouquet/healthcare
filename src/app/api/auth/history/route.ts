import { NextRequest, NextResponse } from "next/server";
import { getUserHistory, getUserIdFromToken } from "@/modules/auth/service";
import { ApiError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    // 从 Authorization header 获取 token
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "请先登录" },
        { status: 401 }
      );
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "登录已过期，请重新登录" },
        { status: 401 }
      );
    }

    const history = await getUserHistory(userId);
    return NextResponse.json(history);
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
