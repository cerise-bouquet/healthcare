import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { createHash, randomBytes } from "node:crypto";

// ---- 类型 ----

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUserDto {
  userId: string;
  email: string;
  token: string;
  sessions: Array<{
    sessionId: string;
    status: string;
    currentStep: string;
    submittedAt: string | null;
    createdAt: string;
  }>;
}

// ---- 密码哈希 ----

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const computed = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return computed === hash;
}

function generateToken(): string {
  return `tok_${randomBytes(32).toString("hex")}`;
}

// ---- 简单 token store（内存，MVP 用；生产应使用 JWT 或 session store） ----

const tokenStore = new Map<string, string>(); // token → userId

export function getUserIdFromToken(token: string): string | null {
  return tokenStore.get(token) ?? null;
}

// ---- 注册 ----

export async function register(input: RegisterInput): Promise<AuthUserDto> {
  const { email, password } = input;

  if (!email || !email.includes("@")) {
    throw new ApiError("VALIDATION_ERROR", "请输入有效的邮箱地址", 400);
  }
  if (!password || password.length < 6) {
    throw new ApiError("VALIDATION_ERROR", "密码至少需要 6 个字符", 400);
  }

  // 检查邮箱是否已注册
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError("VALIDATION_ERROR", "该邮箱已注册，请直接登录", 409);
  }

  // 创建用户
  const sessionId = `sess_${randomBytes(12).toString("hex")}`;
  const user = await db.user.create({
    data: {
      sessionId,
      anonymousId: `usr_${randomBytes(12).toString("hex")}`,
      email,
      passwordHash: hashPassword(password),
      sessions: {
        create: {
          status: "DRAFT",
          currentStep: "profile",
          completedSteps: [],
          version: 1
        }
      }
    },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  const token = generateToken();
  tokenStore.set(token, user.id);

  return buildAuthUserDto(user, token);
}

// ---- 登录 ----

export async function login(input: LoginInput): Promise<AuthUserDto> {
  const { email, password } = input;

  if (!email || !password) {
    throw new ApiError("VALIDATION_ERROR", "请输入邮箱和密码", 400);
  }

  const user = await db.user.findUnique({
    where: { email },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!user || !user.passwordHash) {
    throw new ApiError("VALIDATION_ERROR", "邮箱或密码错误", 401);
  }

  if (!verifyPassword(password, user.passwordHash)) {
    throw new ApiError("VALIDATION_ERROR", "邮箱或密码错误", 401);
  }

  // 更新最后访问时间
  await db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() }
  });

  const token = generateToken();
  tokenStore.set(token, user.id);

  return buildAuthUserDto(user, token);
}

// ---- 获取用户测评历史 ----

export async function getUserHistory(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        include: { result: true }
      }
    }
  });

  if (!user) {
    throw new ApiError("SESSION_NOT_FOUND", "用户不存在", 404);
  }

  return {
    userId: user.id,
    email: user.email,
    sessions: user.sessions.map((s) => ({
      sessionId: user.sessionId,
      assessmentId: s.id,
      status: s.status,
      currentStep: s.currentStep,
      completedSteps: s.completedSteps,
      version: s.version,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      hasResult: !!s.result,
      resultSummary: s.result
        ? {
            bmi: Number(s.result.bmi),
            bmiCategory: s.result.bmiCategory
          }
        : null
    }))
  };
}

// ---- 辅助 ----

function buildAuthUserDto(
  user: {
    id: string;
    email: string | null;
    sessions: Array<{
      status: string;
      currentStep: string;
      submittedAt: Date | null;
      createdAt: Date;
    }>;
  },
  token: string
): AuthUserDto {
  return {
    userId: user.id,
    email: user.email!,
    token,
    sessions: user.sessions.map((s) => ({
      sessionId: `sess_${s.status === "SUBMITTED" ? "completed" : "active"}`,
      status: s.status,
      currentStep: s.currentStep,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString()
    }))
  };
}
