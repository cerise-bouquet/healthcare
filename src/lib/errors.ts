export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AGE_OUT_OF_RANGE"
  | "HEIGHT_OUT_OF_RANGE"
  | "WEIGHT_OUT_OF_RANGE"
  | "INVALID_ENUM"
  | "SESSION_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "ALREADY_SUBMITTED"
  | "RESULT_LOCKED"
  | "INCOMPLETE_ASSESSMENT"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 500,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function toErrorBody(error: ApiError, requestId?: string): ApiErrorBody {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    requestId
  };
}
