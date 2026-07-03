import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { Gender, Goal, ActivityLevel } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

// ---- 类型定义 ----

export interface AssessmentAnswers {
  gender: Gender;
  age: number;
  goal: Goal;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: ActivityLevel;
}

export interface FullResult {
  bmi: number;
  bmiCategory: string;
  bmr: number;
  tdee: number;
  calorieTarget: number | null;
  calorieDeficit: number | null;
  predictedTargetDate: string | null;
  weightChangePerWeek: number | null;
  predictionSeries: Array<{ week: number; weightKg: number }>;
  publicPayload: Record<string, unknown>;
  protectedPayload: Record<string, unknown>;
  algorithmVersion: string;
}

export interface PublicResultDto {
  sessionId: string;
  subscription: { status: string };
  publicResult: Record<string, unknown>;
  paywall: { required: boolean; reason?: string };
}

export interface FullResultDto extends PublicResultDto {
  subscription: { status: string; expiresAt?: string };
  fullResult: {
    calorieTarget?: number | null;
    predictedTargetDate?: string | null;
    predictionSeries: Array<{ week: number; weightKg: number }>;
    dailyPlan?: unknown;
  };
}

// ---- 常量 ----

const ALGORITHM_VERSION = process.env.ALGORITHM_VERSION ?? "mvp-contract-v1";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9
};

const BMI_CATEGORIES = [
  { max: 18.4, label: "UNDERWEIGHT" },
  { max: 24.9, label: "NORMAL" },
  { max: 29.9, label: "OVERWEIGHT" },
  { max: Infinity, label: "OBESE" }
] as const;

// 安全周变化上限（kg）
const MAX_WEEKLY_LOSS_KG = 1.0;
const MAX_WEEKLY_GAIN_KG = 0.5;

// ---- 核心算法 ----

/** BMI = weightKg / (heightM × heightM)，保留 1 位小数 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/** BMI 分类 */
export function classifyBMI(bmi: number): string {
  for (const category of BMI_CATEGORIES) {
    if (bmi <= category.max) return category.label;
  }
  return "OBESE";
}

/** BMR 使用 Mifflin-St Jeor 方程 */
export function calculateBMR(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  // BMR = 10 × weight + 6.25 × height - 5 × age + s
  // s = +5 (MALE), s = -161 (FEMALE), s = -78 (OTHER, 取中值)
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const offset = gender === "MALE" ? 5 : gender === "FEMALE" ? -161 : -78;
  return Math.round(base + offset);
}

/** TDEE = BMR × 活动系数 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  return Math.round(bmr * multiplier);
}

/**
 * 计算每日热量目标
 * - 减重: TDEE - 300 到 500 kcal
 * - 增肌: TDEE + 150 到 300 kcal
 * - 维持: 接近 TDEE
 */
export function calculateCalorieTarget(
  tdee: number,
  goal: Goal
): { calorieTarget: number; calorieDeficit: number | null } {
  switch (goal) {
    case "LOSE_WEIGHT":
      return {
        calorieTarget: tdee - 400, // 取 300~500 中间值
        calorieDeficit: 400
      };
    case "BUILD_MUSCLE":
      return {
        calorieTarget: tdee + 225, // 取 150~300 中间值
        calorieDeficit: null
      };
    case "MAINTAIN":
    case "IMPROVE_FITNESS":
    default:
      return {
        calorieTarget: tdee,
        calorieDeficit: null
      };
  }
}

/**
 * 计算预计达成目标日期
 * 按目标体重差和安全周变化上限估算
 */
export function calculatePredictedTargetDate(
  currentWeightKg: number,
  targetWeightKg: number | undefined,
  goal: Goal
): { predictedDate: string | null; weeklyChange: number | null } {
  if (targetWeightKg === undefined || targetWeightKg === null) {
    return { predictedDate: null, weeklyChange: null };
  }

  const diffKg = targetWeightKg - currentWeightKg;
  const absDiff = Math.abs(diffKg);

  if (absDiff < 0.1) {
    // 已在目标范围
    const now = new Date();
    return {
      predictedDate: now.toISOString().split("T")[0],
      weeklyChange: 0
    };
  }

  let weeklyChange: number;
  if (goal === "LOSE_WEIGHT") {
    weeklyChange = -Math.min(absDiff / Math.max(absDiff / MAX_WEEKLY_LOSS_KG, 1), MAX_WEEKLY_LOSS_KG);
  } else if (goal === "BUILD_MUSCLE") {
    weeklyChange = Math.min(absDiff, MAX_WEEKLY_GAIN_KG);
  } else {
    // 维持/改善体能：不需要目标日期
    return { predictedDate: null, weeklyChange: null };
  }

  const weeks = absDiff / Math.abs(weeklyChange);
  const days = Math.ceil(weeks * 7);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  return {
    predictedDate: targetDate.toISOString().split("T")[0],
    weeklyChange: Math.round(weeklyChange * 10) / 10
  };
}

/** 验证目标体重合法性 */
export function validateTargetWeight(
  goal: Goal,
  currentWeightKg: number,
  targetWeightKg?: number
): void {
  if (targetWeightKg === undefined || targetWeightKg === null) return;

  if (targetWeightKg < 35 || targetWeightKg > 250) {
    throw new ApiError(
      "WEIGHT_OUT_OF_RANGE",
      "Target weight must be between 35 and 250 kg.",
      400,
      { field: "targetWeightKg", value: targetWeightKg }
    );
  }

  if (goal === "LOSE_WEIGHT" && targetWeightKg >= currentWeightKg) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Target weight must be lower than current weight for weight loss goal.",
      400,
      { field: "targetWeightKg", currentWeightKg, targetWeightKg }
    );
  }

  if (goal === "BUILD_MUSCLE" && targetWeightKg <= currentWeightKg) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Target weight must be higher than current weight for muscle building goal.",
      400,
      { field: "targetWeightKg", currentWeightKg, targetWeightKg }
    );
  }
}

/** 完整结果计算 */
export function calculateFullResult(answers: Record<string, unknown>): FullResult {
  const gender = answers.gender as Gender;
  const age = answers.age as number;
  const goal = answers.goal as Goal;
  const heightCm = answers.heightCm as number;
  const weightKg = answers.weightKg as number;
  const targetWeightKg = answers.targetWeightKg as number | undefined;
  const activityLevel = answers.activityLevel as ActivityLevel;

  // 验证目标体重
  validateTargetWeight(goal, weightKg, targetWeightKg);

  // 计算各指标
  const bmi = calculateBMI(weightKg, heightCm);
  const bmiCategory = classifyBMI(bmi);
  const bmr = calculateBMR(gender, weightKg, heightCm, age);
  const tdee = calculateTDEE(bmr, activityLevel);
  const { calorieTarget, calorieDeficit } = calculateCalorieTarget(tdee, goal);
  const { predictedDate, weeklyChange } = calculatePredictedTargetDate(
    weightKg,
    targetWeightKg,
    goal
  );

  // 构建公开载荷
  const publicPayload: Record<string, unknown> = {
    bmi,
    bmiCategory,
    summary: generateSummary(bmiCategory, goal),
    disclaimer:
      "此结果仅用于一般健康管理参考，不构成医疗诊断或治疗建议。" +
      "涉及疾病、药物、特殊人群或明显异常指标时，请咨询专业医疗人员。",
    nextAction:
      "Unlock full plan to view target date and detailed daily guidance."
  };

  // 生成周预测序列
  const predictionSeries = generatePredictionSeries(
    weightKg,
    targetWeightKg ?? weightKg,
    weeklyChange ?? 0
  );

  // 构建受保护载荷
  const protectedPayload: Record<string, unknown> = {
    bmr,
    tdee,
    calorieTarget,
    calorieDeficit,
    predictedTargetDate: predictedDate,
    weightChangePerWeek: weeklyChange,
    predictionSeries,
    dailyPlan: generateDailyPlan(calorieTarget ?? tdee, goal, activityLevel)
  };

  return {
    bmi,
    bmiCategory,
    bmr,
    tdee,
    calorieTarget,
    calorieDeficit,
    predictedTargetDate: predictedDate,
    weightChangePerWeek: weeklyChange,
    predictionSeries,
    publicPayload,
    protectedPayload,
    algorithmVersion: ALGORITHM_VERSION
  };
}

/** 生成周预测序列（付费内容） */
function generatePredictionSeries(
  currentWeight: number,
  targetWeight: number,
  weeklyChange: number
): Array<{ week: number; weightKg: number }> {
  if (weeklyChange === 0) return [];
  const series: Array<{ week: number; weightKg: number }> = [];
  let w = currentWeight;
  let week = 0;
  const maxWeeks = 52;
  while (Math.abs(w - targetWeight) > 0.1 && week < maxWeeks) {
    w += weeklyChange;
    week++;
    // 确保不会越过目标体重
    if (
      (weeklyChange < 0 && w < targetWeight) ||
      (weeklyChange > 0 && w > targetWeight)
    ) {
      w = targetWeight;
    }
    series.push({ week, weightKg: Math.round(w * 10) / 10 });
  }
  return series;
}

/** 公开摘要文案 */
function generateSummary(bmiCategory: string, _goal: Goal): string {
  const messages: Record<string, string> = {
    UNDERWEIGHT: "您的 BMI 偏低，建议关注营养摄入并咨询专业人士。",
    NORMAL: "您的体重处于正常范围，各项指标良好。",
    OVERWEIGHT: "您的体重略高于正常范围，通过合理饮食和运动可以改善。",
    OBESE: "您的 BMI 处于肥胖范围，建议咨询医生制定健康管理计划。"
  };
  return messages[bmiCategory] ?? "请关注您的健康指标。";
}

/** 生成每日计划 */
function generateDailyPlan(
  calorieTarget: number,
  _goal: Goal,
  activityLevel: ActivityLevel
): Record<string, unknown> {
  return {
    calorieTarget,
    activity: activityLevel,
    proteinSuggestion: `${Math.round(calorieTarget * 0.2 / 4)}-${Math.round(calorieTarget * 0.25 / 4)}g/day`,
    meals: {
      breakfast: Math.round(calorieTarget * 0.3),
      lunch: Math.round(calorieTarget * 0.35),
      dinner: Math.round(calorieTarget * 0.25),
      snacks: Math.round(calorieTarget * 0.1)
    },
    protein: `${Math.round(calorieTarget * 0.2 / 4)}g`,
    carbs: `${Math.round(calorieTarget * 0.5 / 4)}g`,
    fat: `${Math.round(calorieTarget * 0.3 / 9)}g`,
    notes: [
      "Keep weekly loss under a conservative threshold.",
      "以上配比为一般性建议，具体需求请咨询营养师。"
    ]
  };
}

// ---- 受保护字段 allowlist ----

/** 只有付费会员才能看到的字段名集合 */
const PROTECTED_FIELD_NAMES = new Set([
  "fullResult",
  "protectedPayload",
  "predictionSeries",
  "dailyPlan",
  "calorieDeficit",
  "calorieTarget",
  "predictedTargetDate"
]);

// ---- 结果查询 ----

export async function getResultForSession(sessionId: string): Promise<PublicResultDto | FullResultDto> {
  const user = await db.user.findUnique({
    where: { sessionId },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { result: true }
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!user) {
    throw new ApiError("SESSION_NOT_FOUND", `Session ${sessionId} not found.`, 404);
  }

  const session = user.sessions[0];
  if (!session || !session.result) {
    throw new ApiError("SESSION_NOT_FOUND", "No result found for this session.", 404);
  }

  if (session.status !== "SUBMITTED") {
    throw new ApiError("INCOMPLETE_ASSESSMENT", "Assessment has not been submitted yet.", 422);
  }

  const subscription = user.subscriptions[0];
  const isSubscribed =
    subscription?.status === "ACTIVE" &&
    (!subscription.expiresAt || subscription.expiresAt > new Date());

  // 付费门槛守卫：非会员尝试访问受保护数据时返回 403
  function requireActiveSubscription(): void {
    if (!isSubscribed) {
      throw new ApiError(
        "RESULT_LOCKED",
        "Full result requires an active subscription. Please complete payment to unlock.",
        403
      );
    }
  }

  const result = session.result;
  const pub = result.publicPayload as Record<string, unknown>;
  const prot = result.protectedPayload as Record<string, unknown>;

  // 基础公开结果（所有用户可见）
  const baseResponse: PublicResultDto = {
    sessionId,
    subscription: {
      status: subscription?.status ?? "NONE"
    },
    publicResult: {
      bmi: pub.bmi ?? Number(result.bmi),
      bmiCategory: pub.bmiCategory ?? result.bmiCategory,
      summary: pub.summary ?? "",
      disclaimer: pub.disclaimer ?? "",
      nextAction: pub.nextAction ?? "Unlock full plan to view target date and detailed daily guidance."
    },
    paywall: {
      required: !isSubscribed,
      reason: isSubscribed ? undefined : "FULL_RESULT_REQUIRES_SUBSCRIPTION"
    }
  };

  // 付费会员：展开完整结果
  if (isSubscribed) {
    requireActiveSubscription();

    return {
      ...baseResponse,
      subscription: {
        status: subscription!.status,
        expiresAt: subscription!.expiresAt?.toISOString()
      },
      fullResult: {
        calorieTarget: prot.calorieTarget as number | null | undefined,
        predictedTargetDate: prot.predictedTargetDate as string | null | undefined,
        predictionSeries: (prot.predictionSeries as Array<{ week: number; weightKg: number }>) ?? [],
        dailyPlan: prot.dailyPlan as Record<string, unknown> | undefined
      }
    };
  }

  // 非会员：不得出现任何受保护字段
  return sanitizeNonSubscriberResponse(baseResponse);
}

/**
 * 非会员响应安全清洗：确保受保护字段名不出现在 JSON 中
 * 使用 allowlist 构建而非黑名单删除，防止新增字段意外泄露
 */
function sanitizeNonSubscriberResponse(
  response: PublicResultDto
): PublicResultDto {
  // 深度检查：确保没有任何受保护字段名
  const sanitized = JSON.parse(JSON.stringify(response));
  removeProtectedFields(sanitized);
  return sanitized;
}

function removeProtectedFields(obj: unknown, depth = 0): void {
  if (depth > 20 || obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      removeProtectedFields(item, depth + 1);
    }
    return;
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (PROTECTED_FIELD_NAMES.has(key)) {
        delete record[key];
      } else {
        removeProtectedFields(record[key], depth + 1);
      }
    }
  }
}

// 导出供测试使用
export { PROTECTED_FIELD_NAMES };
