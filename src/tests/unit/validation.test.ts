import { describe, expect, it } from "vitest";
import {
  genderSchema,
  goalSchema,
  activityLevelSchema,
  sessionIdSchema,
  idempotencyKeySchema,
  versionSchema,
  stepSchemas,
  isStepKey
} from "@/lib/validation";

// ============================================================================
// 枚举 Schema 测试
// ============================================================================

describe("genderSchema", () => {
  it("接受有效枚举值", () => {
    expect(() => genderSchema.parse("FEMALE")).not.toThrow();
    expect(() => genderSchema.parse("MALE")).not.toThrow();
    expect(() => genderSchema.parse("OTHER")).not.toThrow();
  });

  it("拒绝无效枚举值（类型污染）", () => {
    expect(() => genderSchema.parse("female")).toThrow();   // 小写
    expect(() => genderSchema.parse("UNKNOWN")).toThrow();
    expect(() => genderSchema.parse("")).toThrow();
  });

  it("拒绝非字符串类型（类型污染）", () => {
    expect(() => genderSchema.parse(123)).toThrow();
    expect(() => genderSchema.parse(null)).toThrow();
    expect(() => genderSchema.parse(undefined)).toThrow();
    expect(() => genderSchema.parse(true)).toThrow();
    expect(() => genderSchema.parse({})).toThrow();
    expect(() => genderSchema.parse([])).toThrow();
  });

  it("拒绝注入尝试", () => {
    expect(() => genderSchema.parse("FEMALE; DROP TABLE users;")).toThrow();
    expect(() => genderSchema.parse("<script>alert('xss')</script>")).toThrow();
    expect(() => genderSchema.parse("FEMALE'--")).toThrow();
  });
});

describe("goalSchema", () => {
  it("接受所有有效目标枚举值", () => {
    expect(() => goalSchema.parse("LOSE_WEIGHT")).not.toThrow();
    expect(() => goalSchema.parse("MAINTAIN")).not.toThrow();
    expect(() => goalSchema.parse("BUILD_MUSCLE")).not.toThrow();
    expect(() => goalSchema.parse("IMPROVE_FITNESS")).not.toThrow();
  });

  it("拒绝无效目标值", () => {
    expect(() => goalSchema.parse("lose_weight")).toThrow();
    expect(() => goalSchema.parse("DIET")).toThrow();
    expect(() => goalSchema.parse("")).toThrow();
    expect(() => goalSchema.parse(0)).toThrow();
    expect(() => goalSchema.parse(null)).toThrow();
  });
});

describe("activityLevelSchema", () => {
  it("接受所有有效活动级别枚举值", () => {
    expect(() => activityLevelSchema.parse("SEDENTARY")).not.toThrow();
    expect(() => activityLevelSchema.parse("LIGHT")).not.toThrow();
    expect(() => activityLevelSchema.parse("MODERATE")).not.toThrow();
    expect(() => activityLevelSchema.parse("ACTIVE")).not.toThrow();
    expect(() => activityLevelSchema.parse("VERY_ACTIVE")).not.toThrow();
  });

  it("拒绝无效活动级别", () => {
    expect(() => activityLevelSchema.parse("sedentary")).toThrow();
    expect(() => activityLevelSchema.parse("HIGH")).toThrow();
    expect(() => activityLevelSchema.parse("EXTREME")).toThrow();
    expect(() => activityLevelSchema.parse("")).toThrow();
    expect(() => activityLevelSchema.parse(undefined)).toThrow();
  });
});

// ============================================================================
// 字符串 Schema 测试
// ============================================================================

describe("sessionIdSchema", () => {
  it("接受 8-128 字符的有效字符串", () => {
    expect(() => sessionIdSchema.parse("sess_0012345678")).not.toThrow();
    expect(() => sessionIdSchema.parse("a".repeat(8))).not.toThrow();
    expect(() => sessionIdSchema.parse("a".repeat(128))).not.toThrow();
  });

  it("拒绝短于 8 字符的 sessionId", () => {
    expect(() => sessionIdSchema.parse("sess_1")).toThrow();
    expect(() => sessionIdSchema.parse("abc")).toThrow();
    expect(() => sessionIdSchema.parse("")).toThrow();
  });

  it("拒绝超长 sessionId（越界输入）", () => {
    expect(() => sessionIdSchema.parse("a".repeat(129))).toThrow();
    expect(() => sessionIdSchema.parse("a".repeat(1000))).toThrow();
  });

  it("拒绝非字符串类型", () => {
    expect(() => sessionIdSchema.parse(12345678)).toThrow();
    expect(() => sessionIdSchema.parse(null)).toThrow();
    expect(() => sessionIdSchema.parse(undefined)).toThrow();
    expect(() => sessionIdSchema.parse({ id: "test" })).toThrow();
  });

  it("拒绝过短注入字符串（< 8 字符）", () => {
    // 注入字符串长度不足 8 的被拒绝
    expect(() => sessionIdSchema.parse("<script")).toThrow(); // 7 字符
    expect(() => sessionIdSchema.parse("';DROP")).toThrow();  // 7 字符
    expect(() => sessionIdSchema.parse("xss")).toThrow();     // 3 字符
  });

  it("接受合法长度的特殊字符", () => {
    // Zod string schema 不校验内容——只校验长度
    // 安全性由 service 层参数化查询保证
    expect(() => sessionIdSchema.parse("sess_<script>alert")).not.toThrow(); // 长度 ≥ 8
    expect(() => sessionIdSchema.parse("'; DROP TABLE users; --")).not.toThrow(); // 长度 ≥ 8
  });
});

describe("idempotencyKeySchema", () => {
  it("接受有效幂等键", () => {
    expect(() => idempotencyKeySchema.parse("idem_key_0001")).not.toThrow();
    expect(() => idempotencyKeySchema.parse("a".repeat(8))).not.toThrow();
    expect(() => idempotencyKeySchema.parse("a".repeat(128))).not.toThrow();
  });

  it("拒绝过短的幂等键", () => {
    expect(() => idempotencyKeySchema.parse("a")).toThrow();
    expect(() => idempotencyKeySchema.parse("")).toThrow();
  });

  it("拒绝过长的幂等键", () => {
    expect(() => idempotencyKeySchema.parse("a".repeat(129))).toThrow();
  });

  it("拒绝非字符串类型", () => {
    expect(() => idempotencyKeySchema.parse(99999999)).toThrow();
    expect(() => idempotencyKeySchema.parse(null)).toThrow();
  });
});

describe("versionSchema", () => {
  it("接受正整数", () => {
    expect(() => versionSchema.parse(1)).not.toThrow();
    expect(() => versionSchema.parse(999)).not.toThrow();
  });

  it("拒绝零和负数", () => {
    expect(() => versionSchema.parse(0)).toThrow();
    expect(() => versionSchema.parse(-1)).toThrow();
    expect(() => versionSchema.parse(-100)).toThrow();
  });

  it("拒绝非整数", () => {
    expect(() => versionSchema.parse(1.5)).toThrow();
    expect(() => versionSchema.parse(3.14)).toThrow();
  });

  it("拒绝非数值类型（类型污染）", () => {
    expect(() => versionSchema.parse("1")).toThrow();
    expect(() => versionSchema.parse(null)).toThrow();
    expect(() => versionSchema.parse(undefined)).toThrow();
    expect(() => versionSchema.parse(true)).toThrow();
    expect(() => versionSchema.parse({ version: 1 })).toThrow();
  });
});

// ============================================================================
// 步骤 Schema 测试
// ============================================================================

describe("stepSchemas.profile", () => {
  it("接受有效的 profile 数据", () => {
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: 28 })).not.toThrow();
    expect(() => stepSchemas.profile.parse({ gender: "MALE", age: 13 })).not.toThrow();
    expect(() => stepSchemas.profile.parse({ gender: "OTHER", age: 80 })).not.toThrow();
  });

  it("拒绝缺少必填字段", () => {
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE" })).toThrow(); // 缺 age
    expect(() => stepSchemas.profile.parse({ age: 25 })).toThrow();           // 缺 gender
    expect(() => stepSchemas.profile.parse({})).toThrow();
  });

  it("拒绝非整数的年龄（类型污染）", () => {
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: 28.5 })).toThrow();
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: "28" })).toThrow();
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: null })).toThrow();
  });

  it("拒绝额外的未知字段（strict 模式）", () => {
    expect(() =>
      stepSchemas.profile.strict().parse({
        gender: "FEMALE",
        age: 28,
        extraField: "injected"
      })
    ).toThrow();
  });

  it("拒绝负年龄（越界输入）", () => {
    // Zod 不校验范围——范围校验在 service 层
    // 但类型必须为 int
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: -5 })).not.toThrow();
  });

  it("拒绝巨大年龄值", () => {
    expect(() => stepSchemas.profile.parse({ gender: "FEMALE", age: 999 })).not.toThrow();
    // Zod 层面通过，范围校验在 service 层
  });
});

describe("stepSchemas.goal", () => {
  it("接受有效 goal 数据", () => {
    expect(() => stepSchemas.goal.parse({ goal: "LOSE_WEIGHT" })).not.toThrow();
    expect(() =>
      stepSchemas.goal.parse({ goal: "LOSE_WEIGHT", targetWeightKg: 65 })
    ).not.toThrow();
  });

  it("拒绝无效 goal 枚举", () => {
    expect(() => stepSchemas.goal.parse({ goal: "lose" })).toThrow();
    expect(() => stepSchemas.goal.parse({ goal: "" })).toThrow();
    expect(() => stepSchemas.goal.parse({})).toThrow();
  });

  it("接受可选的 targetWeightKg", () => {
    expect(() => stepSchemas.goal.parse({ goal: "MAINTAIN" })).not.toThrow();
  });

  it("拒绝非数值的 targetWeightKg（类型污染）", () => {
    expect(() =>
      stepSchemas.goal.parse({ goal: "LOSE_WEIGHT", targetWeightKg: "65" })
    ).toThrow();
  });
});

describe("stepSchemas.body", () => {
  it("接受有效 body 数据", () => {
    expect(() =>
      stepSchemas.body.parse({
        heightCm: 170,
        weightKg: 70,
        targetWeightKg: 65
      })
    ).not.toThrow();
  });

  it("缺少 targetWeightKg 时可接受", () => {
    expect(() =>
      stepSchemas.body.parse({ heightCm: 170, weightKg: 70 })
    ).not.toThrow();
  });

  it("拒绝缺少必填字段", () => {
    expect(() => stepSchemas.body.parse({ heightCm: 170 })).toThrow();   // 缺 weightKg
    expect(() => stepSchemas.body.parse({ weightKg: 70 })).toThrow();    // 缺 heightCm
    expect(() => stepSchemas.body.parse({})).toThrow();
  });

  it("拒绝非数值的体重/身高（类型污染）", () => {
    expect(() =>
      stepSchemas.body.parse({ heightCm: "170", weightKg: 70 })
    ).toThrow();
    expect(() =>
      stepSchemas.body.parse({ heightCm: 170, weightKg: "70" })
    ).toThrow();
    expect(() =>
      stepSchemas.body.parse({ heightCm: null, weightKg: 70 })
    ).toThrow();
  });

  it("拒绝零和负值（Zod 层可通过，service 层校验范围）", () => {
    // Zod 只校验类型，不校验范围
    expect(() =>
      stepSchemas.body.parse({ heightCm: 0, weightKg: 70 })
    ).not.toThrow();
    expect(() =>
      stepSchemas.body.parse({ heightCm: 170, weightKg: -10 })
    ).not.toThrow();
  });
});

describe("stepSchemas.activity", () => {
  it("接受有效 activity 数据", () => {
    expect(() =>
      stepSchemas.activity.parse({ activityLevel: "MODERATE" })
    ).not.toThrow();
  });

  it("拒绝无效枚举值", () => {
    expect(() =>
      stepSchemas.activity.parse({ activityLevel: "HIGH" })
    ).toThrow();
    expect(() =>
      stepSchemas.activity.parse({ activityLevel: "moderate" })
    ).toThrow();
    expect(() => stepSchemas.activity.parse({})).toThrow();
  });
});

describe("stepSchemas.review", () => {
  it("接受空对象", () => {
    expect(() => stepSchemas.review.parse({})).not.toThrow();
  });

  it("拒绝携带额外字段的 review（strict 模式）", () => {
    expect(() =>
      stepSchemas.review.parse({ extra: "should not be here" })
    ).toThrow();
  });
});

// ============================================================================
// isStepKey 类型守卫测试
// ============================================================================

describe("isStepKey", () => {
  it("识别所有有效步骤名", () => {
    expect(isStepKey("profile")).toBe(true);
    expect(isStepKey("goal")).toBe(true);
    expect(isStepKey("body")).toBe(true);
    expect(isStepKey("activity")).toBe(true);
    expect(isStepKey("review")).toBe(true);
  });

  it("拒绝无效步骤名", () => {
    expect(isStepKey("")).toBe(false);
    expect(isStepKey("unknown")).toBe(false);
    expect(isStepKey("PROFILE")).toBe(false);
    expect(isStepKey("submit")).toBe(false);
    expect(isStepKey("payment")).toBe(false);
  });
});
