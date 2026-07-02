import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, toErrorBody } from "@/lib/errors";

/**
 * 包装 API handler，统一错误处理：
 * - ApiError → 对应 HTTP 状态码
 * - ZodError → 400 VALIDATION_ERROR
 * - 其他异常 → 500 INTERNAL_ERROR
 */
export async function withErrorHandler(
  handler: () => Promise<{ body: unknown; status?: number }>
): Promise<NextResponse> {
  try {
    const { body, status } = await handler();
    return NextResponse.json(body, { status: status ?? 200 });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json(toErrorBody(error), { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: error.flatten()
        },
        { status: 400 }
      );
    }

    // 未知异常
    console.error("Unhandled API error:", error);
    return NextResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: crypto.randomUUID()
      },
      { status: 500 }
    );
  }
}
