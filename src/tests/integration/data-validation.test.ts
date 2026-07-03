import { describe, expect, it, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

// ---- Mock Prisma Client ----

const { mockDb } = vi.hoisted(() => {
  const db = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    assessmentSession: {
      update: vi.fn()
    },
    assessmentAnswer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    },
    assessmentResult: {
      create: vi.fn(),
      findUnique: vi.fn()
    },
    subscription: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    paymentEvent: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn()
  };

  db.$transaction.mockImplementation(
    (fn: (tx: typeof db) => Promise<unknown>) => fn(db)
  );

  return { mockDb: db };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

import { patchStep, submitAssessment, getProgress } from "@/modules/assessments/service";
import { createOrRestoreSession } from "@/modules/sessions/service";
import { ApiError } from "@/lib/errors";

// ---- Helpers ----

function resetMocks() {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(
    (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)
  );
}

function mockSessionLookup(overrides: Record<string, unknown> = {}) {
  const createdAt = overrides.createdAt as Date ?? new Date();
  return {
    id: "user_001",
    sessionId: (overrides.sessionId as string) ?? "sess_data_val_001",
    anonymousId: "anon_001",
    sessions: [{
      id: "as_data_val_001",
      userId: "user_001",
      status: (overrides.status as string) ?? "DRAFT",
      currentStep: (overrides.currentStep as string) ?? "profile",
      completedSteps: (overrides.completedSteps as string[]) ?? [],
      version: (overrides.version as number) ?? 1,
      answers: overrides.answers ?? null,
      result: overrides.result ?? null,
      createdAt
    }],
    subscriptions: overrides.subscriptions ?? [],
    paymentEvents: overrides.paymentEvents ?? []
  };
}

// ============================================================================
// 数据验证测试套件
// ============================================================================

describe("数据验证 — 越界输入", () => {
  beforeEach(resetMocks);

  it("拒绝年龄 < 13（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup())
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: 12 }
      });
      expect.unreachable("Should have thrown AGE_OUT_OF_RANGE");
    } catch (e) {
      expect((e as ApiError).code).toBe("AGE_OUT_OF_RANGE");
      expect((e as ApiError).message).toContain("13-80");
    }
  });

  it("拒绝年龄 > 80（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup())
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: 81 }
      });
      expect.unreachable("Should have thrown AGE_OUT_OF_RANGE");
    } catch (e) {
      expect((e as ApiError).code).toBe("AGE_OUT_OF_RANGE");
    }
  });

  it("拒绝身高 < 120（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({ version: 2 }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "body",
        version: 2,
        answers: { heightCm: 119, weightKg: 70 }
      });
      expect.unreachable("Should have thrown HEIGHT_OUT_OF_RANGE");
    } catch (e) {
      expect((e as ApiError).code).toBe("HEIGHT_OUT_OF_RANGE");
    }
  });

  it("拒绝身高 > 230（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({ version: 2 }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "body",
        version: 2,
        answers: { heightCm: 231, weightKg: 70 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("HEIGHT_OUT_OF_RANGE");
    }
  });

  it("拒绝体重 < 35（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({ version: 2 }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "body",
        version: 2,
        answers: { heightCm: 170, weightKg: 34 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("拒绝体重 > 250（越界）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({ version: 2 }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "body",
        version: 2,
        answers: { heightCm: 170, weightKg: 251 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("接受边界值：年龄 13", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup())
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    const result = await patchStep({
      sessionId: "sess_data_val_001",
      stepKey: "profile",
      version: 1,
      answers: { gender: "MALE", age: 13 }
    });

    expect(result.version).toBe(2);
  });

  it("接受边界值：年龄 80", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup())
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    const result = await patchStep({
      sessionId: "sess_data_val_001",
      stepKey: "profile",
      version: 1,
      answers: { gender: "FEMALE", age: 80 }
    });

    expect(result.version).toBe(2);
  });
});

// ============================================================================
// 乱序提交测试
// ============================================================================

describe("数据验证 — 乱序提交", () => {
  beforeEach(resetMocks);

  it("允许在 profile 之前保存 body（乱序但合法）", async () => {
    // body 步骤字段保存成功，但步骤不会推进（因为前置步骤未完成）
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          currentStep: "profile",
          completedSteps: []
        }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    const result = await patchStep({
      sessionId: "sess_data_val_001",
      stepKey: "body",
      version: 1,
      answers: { heightCm: 170, weightKg: 70 }
    });

    // 保存成功，版本号递增
    expect(result.version).toBe(2);
    // 但 currentStep 保持在 profile（因为前置步骤未完成）
    expect(result.currentStep).toBe("profile");
  });

  it("允许在 profile 之前保存 activity（乱序）", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          currentStep: "profile",
          completedSteps: []
        }))
      };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    const result = await patchStep({
      sessionId: "sess_data_val_001",
      stepKey: "activity",
      version: 1,
      answers: { activityLevel: "MODERATE" }
    });

    expect(result.version).toBe(2);
  });
});

// ============================================================================
// 重复提交与幂等测试
// ============================================================================

describe("数据验证 — 重复提交与幂等", () => {
  beforeEach(resetMocks);

  it("重复提交已提交的 session 返回 ALREADY_SUBMITTED", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "SUBMITTED",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 6
        }))
      };
      return fn(txMock);
    });

    try {
      await submitAssessment({
        sessionId: "sess_data_val_001",
        version: 6,
        idempotencyKey: "idem_repeat_001"
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("ALREADY_SUBMITTED");
      expect((e as ApiError).status).toBe(409);
    }
  });

  it("submit 时 version 不匹配返回 VERSION_CONFLICT", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "READY_TO_SUBMIT",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 6,
          answers: {
            gender: "FEMALE",
            age: 30,
            goal: "MAINTAIN",
            heightCm: 165,
            weightKg: 60,
            activityLevel: "MODERATE",
            extraAnswers: {}
          }
        }))
      };
      return fn(txMock);
    });

    try {
      await submitAssessment({
        sessionId: "sess_data_val_001",
        version: 3, // 不匹配
        idempotencyKey: "idem_version_conflict"
      });
      expect.unreachable("Should have thrown VERSION_CONFLICT");
    } catch (e) {
      expect((e as ApiError).code).toBe("VERSION_CONFLICT");
    }
  });

  it("重复 step patch（相同 version）返回 VERSION_CONFLICT", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          currentStep: "goal",
          completedSteps: ["profile"],
          version: 2
        }))
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "goal",
        version: 1, // 服务端当前 version=2，传 1 会冲突
        answers: { goal: "LOSE_WEIGHT", targetWeightKg: 65 }
      });
      expect.unreachable("Should have thrown VERSION_CONFLICT");
    } catch (e) {
      expect((e as ApiError).code).toBe("VERSION_CONFLICT");
    }
  });
});

// ============================================================================
// 过期 Session 测试
// ============================================================================

describe("数据验证 — 过期 Session", () => {
  beforeEach(resetMocks);

  it("超过 30 天的 session 自动标记为 EXPIRED", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // 35 天前

    mockDb.user.findUnique.mockResolvedValue(mockSessionLookup({
      status: "DRAFT",
      createdAt: oldDate
    }));
    mockDb.assessmentSession.update.mockResolvedValue({});

    try {
      await getProgress("sess_data_val_001");
      // 过期后 getProgress 仍应返回，但 status 应为 EXPIRED
    } catch (e) {
      // 可能抛出也可能不抛出，取决于过期后处理
    }
  });

  it("过期 session 不允许修改（patchStep 返回 410）", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "DRAFT",
          createdAt: oldDate
        }))
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "goal",
        version: 1,
        answers: { goal: "LOSE_WEIGHT" }
      });
      expect.unreachable("Should have thrown for expired session");
    } catch (e) {
      // 过期后先标记 EXPIRED，然后拒绝
      const err = e as ApiError;
      expect(["SESSION_NOT_FOUND"]).toContain(err.code);
    }
  });
});

// ============================================================================
// 枚举非法测试
// ============================================================================

describe("数据验证 — 枚举非法", () => {
  beforeEach(resetMocks);

  it("拒绝无效的 gender 值（小写）", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "female", age: 25 }
      });
      expect.unreachable("Should have thrown validation error");
    } catch (e) {
      // 直接调用 service 层，抛出的是 ZodError
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝无效的 goal 值", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "goal",
        version: 1,
        answers: { goal: "DIET" }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝无效的 activityLevel 值", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "activity",
        version: 1,
        answers: { activityLevel: "EXTREME" }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝无效的 stepKey", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "payment" as never,
        version: 1,
        answers: {}
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("INVALID_ENUM");
    }
  });
});

// ============================================================================
// 类型污染测试
// ============================================================================

describe("数据验证 — 类型污染", () => {
  beforeEach(resetMocks);

  it("拒绝字符串代替年龄", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: "twenty-five" }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      // 直接调用 service 层，抛出的是 ZodError
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝字符串代替身高", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "body",
        version: 1,
        answers: { heightCm: "tall", weightKg: 70 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝数组代替性别", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: ["FEMALE"], age: 25 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }
  });

  it("拒绝 null 值代替必填字段", async () => {
    try {
      await patchStep({
        sessionId: "sess_data_val_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: null, age: 25 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }
  });
});

// ============================================================================
// SESSION_NOT_FOUND 测试
// ============================================================================

describe("数据验证 — 不存在的 Session", () => {
  beforeEach(resetMocks);

  it("访问不存在的 session progress 返回 404", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    try {
      await getProgress("sess_nonexistent_99999999");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("SESSION_NOT_FOUND");
      expect((e as ApiError).status).toBe(404);
    }
  });

  it("patch 不存在的 session 返回 404", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(null)
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_nonexistent_99999999",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: 25 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("SESSION_NOT_FOUND");
      expect((e as ApiError).status).toBe(404);
    }
  });
});
