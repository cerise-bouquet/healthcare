import { describe, expect, it, vi, beforeEach } from "vitest";

// ---- Mock Prisma Client —— 使用 vi.hoisted 避免变量提升问题 ----

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

  // Mock transaction 默认实现：直接运行回调
  db.$transaction.mockImplementation(
    (fn: (tx: typeof db) => Promise<unknown>) => fn(db)
  );

  return { mockDb: db };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

// ---- Import services after mocking ----

import { createOrRestoreSession } from "@/modules/sessions/service";
import { getProgress, patchStep, submitAssessment } from "@/modules/assessments/service";
import { getResultForSession } from "@/modules/results/service";
import { processMockPayment } from "@/modules/billing/service";
import { ApiError } from "@/lib/errors";

// ---- Helpers ----

function resetMocks() {
  vi.clearAllMocks();
  // Restore default transaction mock
  mockDb.$transaction.mockImplementation(
    (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)
  );
}

function mockSessionLookup(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_001",
    sessionId: overrides.sessionId as string ?? "sess_test_001",
    anonymousId: "anon_001",
    sessions: [{
      id: "as_001",
      userId: "user_001",
      status: overrides.status ?? "DRAFT",
      currentStep: overrides.currentStep ?? "profile",
      completedSteps: overrides.completedSteps ?? [],
      version: overrides.version ?? 1,
      answers: overrides.answers ?? null,
      result: overrides.result ?? null,
      createdAt: new Date() // 最近的会话，不会触发过期
    }],
    subscriptions: overrides.subscriptions ?? [],
    paymentEvents: overrides.paymentEvents ?? []
  };
}

// ---- 测试套件 ----

describe("POST /api/sessions", () => {
  beforeEach(resetMocks);

  it("creates new session for first-time user", async () => {
    mockDb.user.create.mockResolvedValue(mockSessionLookup());

    const result = await createOrRestoreSession({
      source: "test",
      utm: { campaign: "test" }
    });

    expect(result).toHaveProperty("sessionId");
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result).toHaveProperty("userId");
    expect(result.currentStep).toBe("profile");
    expect(result.completedSteps).toEqual([]);
    expect(result.version).toBe(1);
  });

  it("restores existing session when valid sessionId provided", async () => {
    mockDb.user.findUnique.mockResolvedValue(mockSessionLookup({
      currentStep: "goal",
      completedSteps: ["profile"],
      version: 3,
      answers: { gender: "MALE", age: 25 }
    }));

    const result = await createOrRestoreSession({ sessionId: "sess_test_001" });

    expect(result.currentStep).toBe("goal");
    expect(result.completedSteps).toEqual(["profile"]);
    expect(result.version).toBe(3);
    expect(result.answers).toHaveProperty("gender", "MALE");
  });
});

describe("GET /api/assessments/{sessionId}/progress", () => {
  beforeEach(resetMocks);

  it("returns progress for valid session", async () => {
    mockDb.user.findUnique.mockResolvedValue(mockSessionLookup({
      currentStep: "body",
      completedSteps: ["profile", "goal"],
      version: 4
    }));

    const result = await getProgress("sess_test_001");
    expect(result.status).toBe("DRAFT");
    expect(result.currentStep).toBe("body");
    expect(result.version).toBe(4);
  });

  it("throws SESSION_NOT_FOUND for unknown sessionId", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    await expect(getProgress("sess_nonexistent")).rejects.toThrow(ApiError);
    try { await getProgress("sess_nonexistent"); } catch (e) {
      expect((e as ApiError).code).toBe("SESSION_NOT_FOUND");
      expect((e as ApiError).status).toBe(404);
    }
  });
});

describe("PATCH /api/assessments/{sessionId}/steps/{stepKey}", () => {
  beforeEach(resetMocks);

  it("saves profile step successfully", async () => {
    // Mock transaction 返回成功
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = { ...mockDb.user, findUnique: vi.fn().mockResolvedValue(mockSessionLookup()) };
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue({})
      };
      return fn(txMock);
    });

    const result = await patchStep({
      sessionId: "sess_test_001",
      stepKey: "profile",
      version: 1,
      answers: { gender: "FEMALE", age: 28 }
    });

    expect(result.version).toBe(2);
  });

  it("rejects VERSION_CONFLICT on version mismatch", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({ version: 3 }))
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_test_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: 28 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("VERSION_CONFLICT");
      expect((e as ApiError).status).toBe(409);
    }
  });

  it("rejects unknown stepKey", async () => {
    try {
      await patchStep({
        sessionId: "sess_test_001",
        stepKey: "invalid_step" as never,
        version: 1,
        answers: {}
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("INVALID_ENUM");
    }
  });

  it("rejects ALREADY_SUBMITTED after submission", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "SUBMITTED",
          version: 10
        }))
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_test_001",
        stepKey: "body",
        version: 10,
        answers: { heightCm: 175, weightKg: 70 }
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("ALREADY_SUBMITTED");
      expect((e as ApiError).status).toBe(409);
    }
  });
});

describe("POST /api/assessments/{sessionId}/submit", () => {
  beforeEach(resetMocks);

  it("rejects incomplete assessment", async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          completedSteps: ["profile"],
          version: 5
        }))
      };
      return fn(txMock);
    });

    try {
      await submitAssessment({
        sessionId: "sess_test_001",
        version: 5,
        idempotencyKey: "idem_001"
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as ApiError).code).toBe("INCOMPLETE_ASSESSMENT");
      expect((e as ApiError).status).toBe(422);
    }
  });

  it("rejects ALREADY_SUBMITTED on idempotent replay", async () => {
    const existingResult = {
      id: "res_001",
      bmi: 22.5,
      bmiCategory: "NORMAL",
      publicPayload: {
        bmi: 22.5,
        bmiCategory: "NORMAL",
        summary: "Test summary",
        disclaimer: "Test disclaimer",
        nextAction: "Test next action"
      },
      protectedPayload: {}
    };

    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "SUBMITTED",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 6,
          answers: {
            gender: "FEMALE",
            age: 28,
            goal: "MAINTAIN",
            heightCm: 165,
            weightKg: 60,
            activityLevel: "MODERATE",
            extraAnswers: {}
          },
          result: existingResult
        }))
      };
      return fn(txMock);
    });

    try {
      await submitAssessment({
        sessionId: "sess_test_001",
        version: 6,
        idempotencyKey: "idem_replay"
      });
      expect.unreachable("Should have thrown ALREADY_SUBMITTED");
    } catch (e) {
      expect((e as ApiError).code).toBe("ALREADY_SUBMITTED");
      expect((e as ApiError).status).toBe(409);
    }
  });
});

describe("GET /api/results/{sessionId} —— 权限安全测试", () => {
  beforeEach(resetMocks);

  const publicPayload = {
    bmi: 24.1,
    bmiCategory: "NORMAL",
    summary: "Test summary",
    disclaimer: "Test disclaimer",
    nextAction: "Unlock full plan"
  };
  const protectedPayload = {
    bmr: 1500,
    tdee: 2200,
    calorieTarget: 1800,
    calorieDeficit: 400,
    predictedTargetDate: "2026-09-01",
    detailedPlan: { meals: "test" }
  };

  it("非会员 JSON 中不得出现付费字段名", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user_001",
      sessionId: "sess_test_001",
      sessions: [{
        id: "as_001",
        status: "SUBMITTED",
        result: {
          id: "res_001",
          bmi: 24.1,
          bmiCategory: "NORMAL",
          publicPayload,
          protectedPayload
        }
      }],
      subscriptions: [{ status: "NONE" }]
    });

    const result = await getResultForSession("sess_test_001");

    // 非会员必须看到 paywall
    expect(result.paywall).toEqual({ required: true, reason: "FULL_RESULT_REQUIRES_SUBSCRIPTION" });

    // 关键安全：非会员 JSON 中不得出现受保护字段名
    const json = JSON.stringify(result);
    expect(json).not.toContain("fullResult");
    expect(json).not.toContain("protectedPayload");
    expect(json).not.toContain("calorieTarget");
    expect(json).not.toContain("calorieDeficit");
    expect(json).not.toContain("predictedTargetDate");
    expect(json).not.toContain("dailyPlan");
    expect(json).not.toContain("bmr");
    expect(json).not.toContain("tdee");
  });

  it("会员可以看到完整结果", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    mockDb.user.findUnique.mockResolvedValue({
      id: "user_001",
      sessionId: "sess_test_paid",
      sessions: [{
        id: "as_001",
        status: "SUBMITTED",
        result: {
          id: "res_001",
          bmi: 24.1,
          bmiCategory: "NORMAL",
          publicPayload,
          protectedPayload: {
            ...protectedPayload,
            predictionSeries: [],
            dailyPlan: { activity: "MODERATE", proteinSuggestion: "80-100g/day" }
          }
        }
      }],
      subscriptions: [{
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt: futureDate
      }]
    });

    const result = await getResultForSession("sess_test_paid") as import("@/modules/results/service").FullResultDto;

    // 会员可看到 fullResult（嵌套受保护字段）
    expect(result).toHaveProperty("fullResult");
    expect(result.fullResult).toHaveProperty("calorieTarget");
    expect(result.fullResult).toHaveProperty("predictedTargetDate");
    expect(result.fullResult).toHaveProperty("predictionSeries");
    expect(result.fullResult).toHaveProperty("dailyPlan");
    expect(result.paywall).toEqual({ required: false });
    expect(result.subscription).toHaveProperty("expiresAt");
  });

  it("过期订阅视为非会员", async () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    mockDb.user.findUnique.mockResolvedValue({
      id: "user_001",
      sessionId: "sess_expired",
      sessions: [{
        id: "as_001",
        status: "SUBMITTED",
        result: {
          id: "res_001",
          bmi: 24.1,
          bmiCategory: "NORMAL",
          publicPayload,
          protectedPayload
        }
      }],
      subscriptions: [{
        status: "ACTIVE",
        startsAt: new Date("2026-01-01"),
        expiresAt: pastDate // 已过期
      }]
    });

    const result = await getResultForSession("sess_expired");

    // 过期订阅 = 非会员
    expect(result.paywall.required).toBe(true);

    // 不应包含受保护字段
    const json = JSON.stringify(result);
    expect(json).not.toContain("fullResult");
    expect(json).not.toContain("protectedPayload");
    expect(json).not.toContain("calorieTarget");
  });
});

describe("POST /api/pay —— 幂等测试", () => {
  beforeEach(resetMocks);

  it("processes payment successfully", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    mockDb.user.findUnique.mockResolvedValue({
      id: "user_001",
      sessionId: "sess_test_001",
      sessions: [{ id: "as_001", userId: "user_001" }]
    });
    mockDb.paymentEvent.findUnique.mockResolvedValue(null);
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.paymentEvent = {
        ...mockDb.paymentEvent,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pe_001" })
      };
      txMock.subscription = {
        ...mockDb.subscription,
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "sub_001",
          status: "ACTIVE",
          startsAt: new Date(),
          expiresAt: futureDate
        }),
        update: vi.fn()
      };
      return fn(txMock);
    });

    const result = await processMockPayment({
      sessionId: "sess_test_001",
      idempotencyKey: "pay_idem_001",
      provider: "mock",
      plan: "monthly"
    });

    expect(result.paid).toBe(true);
    expect(result.subscription.status).toBe("ACTIVE");
    expect(result.resultAccess).toBe("FULL");
  });

  it("重放不重复创建订阅", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user_001",
      sessionId: "sess_test_001",
      sessions: [{ id: "as_001", userId: "user_001" }]
    });
    // 幂等键已存在
    mockDb.paymentEvent.findUnique.mockResolvedValue({
      id: "pe_existing",
      idempotencyKey: "pay_idem_existing",
      eventType: "mock.payment_succeeded"
    });
    mockDb.subscription.findFirst.mockResolvedValue({
      id: "sub_001",
      status: "ACTIVE",
      startsAt: new Date(),
      expiresAt: new Date("2026-08-01")
    });

    const result = await processMockPayment({
      sessionId: "sess_test_001",
      idempotencyKey: "pay_idem_existing",
      provider: "mock",
      plan: "monthly"
    });

    expect(result.paid).toBe(true);
    // 不应重复创建支付事件
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
