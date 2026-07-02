import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { CreateOrRestoreSessionInput, SessionProgressDto } from "./types";

function generateSessionId(): string {
  return `sess_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateUserId(): string {
  return `usr_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function createOrRestoreSession(
  input: CreateOrRestoreSessionInput
): Promise<SessionProgressDto> {
  const { sessionId, source, utm } = input;

  // 若提供了有效的 sessionId，尝试恢复已有 session
  if (sessionId) {
    const existingUser = await db.user.findUnique({
      where: { sessionId },
      include: {
        sessions: {
          include: { answers: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (existingUser) {
      const latestSession = existingUser.sessions[0];
      if (!latestSession) {
        throw new ApiError("INTERNAL_ERROR", "User has no assessment session.", 500);
      }

      // 更新最后访问时间
      await db.user.update({
        where: { id: existingUser.id },
        data: { lastSeenAt: new Date() }
      });

      return {
        sessionId: existingUser.sessionId,
        userId: existingUser.id,
        currentStep: latestSession.currentStep,
        completedSteps: latestSession.completedSteps,
        answers: latestSession.answers ? serializeAnswers(latestSession.answers) : {},
        version: latestSession.version
      };
    }
    // sessionId 不存在时，当作无效，走新建流程（避免泄露是否存在）
  }

  // 创建新的匿名用户和测评 session
  const newSessionId = generateSessionId();
  const newUserId = generateUserId();

  const user = await db.user.create({
    data: {
      sessionId: newSessionId,
      anonymousId: newUserId,
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
      sessions: true
    }
  });

  const assessmentSession = user.sessions[0];
  if (!assessmentSession) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create assessment session.", 500);
  }

  return {
    sessionId: user.sessionId,
    userId: user.id,
    currentStep: assessmentSession.currentStep,
    completedSteps: assessmentSession.completedSteps,
    answers: {},
    version: assessmentSession.version
  };
}

/** 将 AssessmentAnswer 数据库行转为前端安全的 answers 字典 */
function serializeAnswers(
  answer: {
    gender: string | null;
    goal: string | null;
    age: number | null;
    heightCm: unknown;
    weightKg: unknown;
    targetWeightKg: unknown;
    activityLevel: string | null;
    extraAnswers: unknown;
  }
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (answer.gender !== null) result.gender = answer.gender;
  if (answer.goal !== null) result.goal = answer.goal;
  if (answer.age !== null) result.age = answer.age;
  if (answer.heightCm !== null) result.heightCm = Number(answer.heightCm);
  if (answer.weightKg !== null) result.weightKg = Number(answer.weightKg);
  if (answer.targetWeightKg !== null) result.targetWeightKg = Number(answer.targetWeightKg);
  if (answer.activityLevel !== null) result.activityLevel = answer.activityLevel;
  if (answer.extraAnswers !== null) result.extraAnswers = answer.extraAnswers;
  return result;
}
