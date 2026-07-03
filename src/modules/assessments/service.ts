import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { isStepKey, stepSchemas } from "@/lib/validation";
import type { PatchStepInput, SubmitAssessmentInput } from "./types";
import { calculateFullResult, validateTargetWeight } from "@/modules/results/service";
import type { PrismaClient } from "@prisma/client";

// ---- 内部辅助 ----

/** 事务客户端类型 */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** 通过外部 sessionId 查找 User 及其最新的 AssessmentSession */
async function lookupSession(sessionId: string) {
  const user = await db.user.findUnique({
    where: { sessionId },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { answers: true, result: true }
      }
    }
  });

  if (!user) {
    throw new ApiError("SESSION_NOT_FOUND", `Session ${sessionId} not found.`, 404);
  }

  const session = user.sessions[0];
  if (!session) {
    throw new ApiError("INTERNAL_ERROR", "User has no assessment session.", 500);
  }

  // 惰性过期检查：超过 30 天未提交的 session 自动标记为 EXPIRED
  const EXPIRY_DAYS = 30;
  if (
    session.status !== "SUBMITTED" &&
    session.status !== "EXPIRED" &&
    (Date.now() - session.createdAt.getTime()) > EXPIRY_DAYS * 86400000
  ) {
    await db.assessmentSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" }
    });
    session.status = "EXPIRED";
  }

  return { user, session };
}

/** 判断指定步骤是否已完成（其字段已存在于 answers 中） */
function isStepComplete(
  stepKey: string,
  answers: Record<string, unknown>
): boolean {
  const schema = stepSchemas[stepKey as keyof typeof stepSchemas];
  if (!schema) return false;

  const shape = schema.shape as Record<string, unknown>;
  const requiredKeys = Object.keys(shape).filter(
    (k) => !(shape[k] as { isOptional?: () => boolean }).isOptional?.()
  );

  // 对于 review 步骤，只需检查前置步骤是否全部完成
  if (stepKey === "review") return true;

  return requiredKeys.every((key) => answers[key] !== undefined && answers[key] !== null);
}

/** 根据已有答案计算可以推进到哪个步骤 */
function determineNextStep(
  currentStep: string,
  completedSteps: string[],
  answers: Record<string, unknown>
): { nextStep: string; newCompleted: string[] } {
  const stepOrder = ["profile", "goal", "body", "activity", "review"];

  // 更新 completedSteps
  const newCompleted = new Set(completedSteps);

  // 检查当前步骤是否完成
  if (isStepComplete(currentStep, answers)) {
    newCompleted.add(currentStep);
  }

  // 找到下一个未完成的步骤
  let nextStep = currentStep;
  for (const step of stepOrder) {
    if (!newCompleted.has(step)) {
      nextStep = step;
      break;
    }
  }

  // 如果所有步骤都完成了，currentStep 保持在最后一个完成步骤
  if (Array.from(newCompleted).length >= stepOrder.length) {
    nextStep = "review";
  }

  return {
    nextStep,
    newCompleted: Array.from(newCompleted)
  };
}

/** 检查是否所有步骤都已完成（用于 submit 校验） */
function allStepsCompleted(completedSteps: string[]): boolean {
  const required = ["profile", "goal", "body", "activity", "review"];
  return required.every((s) => completedSteps.includes(s));
}

/** 将答案字典合并写入 AssessmentAnswer 模型字段 */
function buildAnswerData(
  sessionId: string,
  answers: Record<string, unknown>
): Record<string, unknown> {
  const data: Record<string, unknown> = { sessionId };
  if ("gender" in answers) data.gender = answers.gender;
  if ("goal" in answers) data.goal = answers.goal;
  if ("age" in answers) data.age = answers.age;
  if ("heightCm" in answers) data.heightCm = answers.heightCm;
  if ("weightKg" in answers) data.weightKg = answers.weightKg;
  if ("targetWeightKg" in answers) data.targetWeightKg = answers.targetWeightKg;
  if ("activityLevel" in answers) data.activityLevel = answers.activityLevel;
  return data;
}

// ---- 导出的服务函数 ----

export async function getProgress(sessionId: string) {
  const { session } = await lookupSession(sessionId);

  return {
    sessionId,
    status: session.status,
    currentStep: session.currentStep,
    completedSteps: session.completedSteps,
    answers: session.answers
      ? serializeAnswersForProgress(session.answers)
      : {},
    version: session.version
  };
}

export async function patchStep(input: PatchStepInput) {
  if (!isStepKey(input.stepKey)) {
    throw new ApiError("INVALID_ENUM", `Unknown assessment step: ${input.stepKey}`, 400);
  }

  // Zod 校验答案字段（结构校验，不含范围约束）
  const parsed = stepSchemas[input.stepKey].strict().parse(input.answers);

  // 专项范围校验（使用特定错误码，便于前端精确提示）
  const answers = parsed as Record<string, unknown>;
  if (typeof answers.age === "number" && (answers.age < 13 || answers.age > 80)) {
    throw new ApiError("AGE_OUT_OF_RANGE", "年龄需在 13-80 岁之间", 400, { field: "age", value: answers.age });
  }
  if (typeof answers.heightCm === "number" && (answers.heightCm < 120 || answers.heightCm > 230)) {
    throw new ApiError("HEIGHT_OUT_OF_RANGE", "身高需在 120-230 cm 之间", 400, { field: "heightCm", value: answers.heightCm });
  }
  if (typeof answers.weightKg === "number" && (answers.weightKg < 35 || answers.weightKg > 250)) {
    throw new ApiError("WEIGHT_OUT_OF_RANGE", "体重需在 35-250 kg 之间", 400, { field: "weightKg", value: answers.weightKg });
  }
  if (typeof answers.targetWeightKg === "number" && (answers.targetWeightKg < 35 || answers.targetWeightKg > 250)) {
    throw new ApiError("WEIGHT_OUT_OF_RANGE", "目标体重需在 35-250 kg 之间", 400, { field: "targetWeightKg", value: answers.targetWeightKg });
  }

  // 在事务中执行：读取 → 版本校验 → 更新答案 → 推进状态 → 版本号+1
  const result = await db.$transaction(async (tx: Tx) => {
    const user = await tx.user.findUnique({
      where: { sessionId: input.sessionId },
      include: {
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { answers: true }
        }
      }
    });

    if (!user) {
      throw new ApiError("SESSION_NOT_FOUND", `Session ${input.sessionId} not found.`, 404);
    }

    const session = user.sessions[0];
    if (!session) {
      throw new ApiError("INTERNAL_ERROR", "User has no assessment session.", 500);
    }

    // 惰性过期检查（事务内）
    const EXPIRY_DAYS = 30;
    if (
      session.status !== "SUBMITTED" &&
      session.status !== "EXPIRED" &&
      (Date.now() - session.createdAt.getTime()) > EXPIRY_DAYS * 86400000
    ) {
      await tx.assessmentSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" }
      });
      session.status = "EXPIRED";
    }

    // 版本校验
    if (session.version !== input.version) {
      throw new ApiError(
        "VERSION_CONFLICT",
        `Expected version ${session.version}, got ${input.version}.`,
        409
      );
    }

    // 已过期不允许修改
    if (session.status === "EXPIRED") {
      throw new ApiError(
        "SESSION_NOT_FOUND",
        "This assessment session has expired. Please create a new session.",
        410
      );
    }

    // 已提交后不允许修改
    if (session.status === "SUBMITTED") {
      throw new ApiError(
        "ALREADY_SUBMITTED",
        "Cannot modify answers after submission.",
        409
      );
    }

    // 合并已有答案与新答案
    const existingAnswers = session.answers
      ? serializeAnswersForProgress(session.answers)
      : {};
    const mergedAnswers: Record<string, unknown> = { ...existingAnswers, ...(parsed as Record<string, unknown>) };

    // goal/body 步骤：若已有当前体重和目标，提前校验目标方向合理性
    if (
      typeof mergedAnswers.goal === "string" &&
      typeof mergedAnswers.weightKg === "number" &&
      typeof mergedAnswers.targetWeightKg === "number"
    ) {
      validateTargetWeight(
        mergedAnswers.goal as "LOSE_WEIGHT" | "MAINTAIN" | "BUILD_MUSCLE" | "IMPROVE_FITNESS",
        mergedAnswers.weightKg as number,
        mergedAnswers.targetWeightKg as number
      );
    }

    // 更新或创建答案
    const answerData = buildAnswerData(session.id, mergedAnswers);
    const existingAnswer = await tx.assessmentAnswer.findUnique({
      where: { sessionId: session.id }
    });
    if (existingAnswer) {
      await tx.assessmentAnswer.update({
        where: { sessionId: session.id },
        data: answerData
      });
    } else {
      await tx.assessmentAnswer.create({
        data: answerData as never
      });
    }

    // 计算步骤推进
    const { nextStep, newCompleted } = determineNextStep(
      input.stepKey,
      session.completedSteps,
      mergedAnswers
    );

    const newStatus = allStepsCompleted(newCompleted) ? "READY_TO_SUBMIT" : "DRAFT";
    const newVersion = session.version + 1;

    // 更新 session
    await tx.assessmentSession.update({
      where: { id: session.id },
      data: {
        currentStep: nextStep,
        completedSteps: newCompleted,
        version: newVersion,
        status: newStatus
      }
    });

    return {
      status: newStatus,
      currentStep: nextStep,
      completedSteps: newCompleted,
      version: newVersion
    };
  });

  return result;
}

export async function submitAssessment(input: SubmitAssessmentInput) {
  const { sessionId, version, idempotencyKey } = input;

  return await db.$transaction(async (tx: Tx) => {
    const user = await tx.user.findUnique({
      where: { sessionId },
      include: {
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { answers: true, result: true }
        }
      }
    });

    if (!user) {
      throw new ApiError("SESSION_NOT_FOUND", `Session ${sessionId} not found.`, 404);
    }

    const session = user.sessions[0];
    if (!session) {
      throw new ApiError("INTERNAL_ERROR", "User has no assessment session.", 500);
    }

    // 惰性过期检查（事务内）
    const EXPIRY_DAYS = 30;
    if (
      session.status !== "SUBMITTED" &&
      session.status !== "EXPIRED" &&
      (Date.now() - session.createdAt.getTime()) > EXPIRY_DAYS * 86400000
    ) {
      await tx.assessmentSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" }
      });
      session.status = "EXPIRED";
    }

    // 已过期：不允许提交
    if (session.status === "EXPIRED") {
      throw new ApiError(
        "SESSION_NOT_FOUND",
        "This assessment session has expired. Please create a new session.",
        410
      );
    }

    // 已提交：返回 ALREADY_SUBMITTED 错误，提示创建新测评
    if (session.status === "SUBMITTED") {
      throw new ApiError(
        "ALREADY_SUBMITTED",
        "Assessment already submitted. Create a new session to start a new assessment.",
        409
      );
    }

    // 版本校验
    if (session.version !== version) {
      throw new ApiError(
        "VERSION_CONFLICT",
        `Expected version ${session.version}, got ${version}.`,
        409
      );
    }

    // 完整性校验
    if (!allStepsCompleted(session.completedSteps)) {
      throw new ApiError(
        "INCOMPLETE_ASSESSMENT",
        "All assessment steps must be completed before submission.",
        422
      );
    }

    if (!session.answers) {
      throw new ApiError(
        "INCOMPLETE_ASSESSMENT",
        "No answers found for this session.",
        422
      );
    }

    // 收集所有答案
    const answers = serializeAnswersForProgress(session.answers);

    // 计算结果
    const fullResult = calculateFullResult(answers);

    // 写入结果
    const resultRecord = await tx.assessmentResult.create({
      data: {
        sessionId: session.id,
        bmi: fullResult.bmi,
        bmiCategory: fullResult.bmiCategory,
        calorieTarget: fullResult.calorieTarget ?? null,
        predictedTargetDate: fullResult.predictedTargetDate
          ? new Date(fullResult.predictedTargetDate)
          : null,
        publicPayload: fullResult.publicPayload as never,
        protectedPayload: fullResult.protectedPayload as never,
        algorithmVersion: fullResult.algorithmVersion
      }
    });

    // 更新 session 状态
    await tx.assessmentSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        version: session.version + 1
      }
    });

    return buildSubmitResponse(sessionId, resultRecord, user.sessionId);
  });
}

// ---- 响应构建 ----

function buildSubmitResponse(
  sessionId: string,
  result: {
    bmi: unknown;
    bmiCategory: string;
    id: string;
    publicPayload: unknown;
    protectedPayload: unknown;
  },
  _userSessionId: string
) {
  const pub = result.publicPayload as Record<string, unknown>;
  return {
    sessionId,
    status: "SUBMITTED" as const,
    resultId: result.id,
    publicResult: {
      bmi: pub.bmi ?? Number(result.bmi),
      bmiCategory: pub.bmiCategory ?? result.bmiCategory,
      summary: pub.summary ?? "",
      nextAction: pub.nextAction ?? "Unlock full plan to view target date and detailed daily guidance."
    },
    paywall: {
      required: true,
      reason: "FULL_RESULT_REQUIRES_SUBSCRIPTION"
    }
  };
}

function serializeAnswersForProgress(
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
  if (answer.extraAnswers !== null && typeof answer.extraAnswers === "object") {
    const extra = answer.extraAnswers as Record<string, unknown>;
    if (Object.keys(extra).length > 0) {
      result.extraAnswers = extra;
    }
  }
  return result;
}
