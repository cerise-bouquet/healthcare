import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { patchStep, submitAssessment } from "@/modules/assessments/service";
import { processMockPayment } from "@/modules/billing/service";
import { ApiError } from "@/lib/errors";

// ---- Helpers ----

function resetMocks() {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(
    (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)
  );
}

function mockSessionLookup(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_concurrent",
    sessionId: (overrides.sessionId as string) ?? "sess_concurrent_001",
    anonymousId: "anon_concurrent",
    sessions: [{
      id: "as_concurrent_001",
      userId: "user_concurrent",
      status: (overrides.status as string) ?? "DRAFT",
      currentStep: (overrides.currentStep as string) ?? "profile",
      completedSteps: (overrides.completedSteps as string[]) ?? [],
      version: (overrides.version as number) ?? 1,
      answers: overrides.answers ?? null,
      result: overrides.result ?? null,
      createdAt: overrides.createdAt as Date ?? new Date()
    }],
    subscriptions: overrides.subscriptions ?? [],
    paymentEvents: overrides.paymentEvents ?? []
  };
}

// ============================================================================
// 并发版本冲突测试
// ============================================================================

describe("并发测试 — 版本冲突", () => {
  beforeEach(resetMocks);

  it("两个请求用同一 version 保存，第一个成功第二个返回 409", async () => {
    // 服务端当前 version=3
    const session = mockSessionLookup({
      version: 3,
      currentStep: "goal",
      completedSteps: ["profile"]
    });

    // 第一个请求：version=3 成功
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = { ...mockDb.user, findUnique: vi.fn().mockResolvedValue(session) };
      const updatedSession = { ...session.sessions[0], version: 4 };
      txMock.user.findUnique = vi.fn().mockResolvedValue({
        ...session,
        sessions: [{ ...session.sessions[0], version: 3 }]
      });
      txMock.assessmentAnswer = {
        ...mockDb.assessmentAnswer,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn()
      };
      txMock.assessmentSession = {
        ...mockDb.assessmentSession,
        update: vi.fn().mockResolvedValue(updatedSession)
      };
      const result = fn(txMock);
      // 模拟更新内存中的 version
      session.sessions[0].version = 4;
      return result;
    });

    const firstResult = await patchStep({
      sessionId: "sess_concurrent_001",
      stepKey: "goal",
      version: 3,
      answers: { goal: "LOSE_WEIGHT", targetWeightKg: 65 }
    });

    expect(firstResult.version).toBe(4);

    // 第二个请求：也用 version=3，但此时服务端 version 已变为 4
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      // 服务端 version 现在是 4
      txMock.user = { ...mockDb.user, findUnique: vi.fn().mockResolvedValue(session) };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_concurrent_001",
        stepKey: "goal",
        version: 3, // 旧版本
        answers: { goal: "MAINTAIN" }
      });
      expect.unreachable("第二个并发请求应抛出 VERSION_CONFLICT");
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe("VERSION_CONFLICT");
      expect(err.status).toBe(409);
    }
  });

  it("多次快速连续保存（version 逐次递增）", async () => {
    let serverVersion = 1;

    const steps = ["profile", "goal", "body", "activity"] as const;
    const answersList = [
      { gender: "FEMALE", age: 28 },
      { goal: "LOSE_WEIGHT", targetWeightKg: 65 },
      { heightCm: 165, weightKg: 70 },
      { activityLevel: "MODERATE" }
    ];

    for (let i = 0; i < steps.length; i++) {
      const currentVersion = serverVersion;

      mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
        const txMock = { ...mockDb };
        txMock.user = {
          ...mockDb.user,
          findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
            version: serverVersion,
            currentStep: steps[i],
            completedSteps: steps.slice(0, i)
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
        sessionId: "sess_concurrent_001",
        stepKey: steps[i],
        version: currentVersion,
        answers: answersList[i]
      });

      expect(result.version).toBe(currentVersion + 1);
      serverVersion = result.version;
    }

    expect(serverVersion).toBe(5); // 4 次保存后 version 应为 5
  });

  it("submit 时 version 不匹配返回 VERSION_CONFLICT", async () => {
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "READY_TO_SUBMIT",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 6
        }))
      };
      return fn(txMock);
    });

    try {
      await submitAssessment({
        sessionId: "sess_concurrent_001",
        version: 5, // 比服务端版本旧
        idempotencyKey: "submit-vconflict"
      });
      expect.unreachable("应抛出 VERSION_CONFLICT");
    } catch (e) {
      expect((e as ApiError).code).toBe("VERSION_CONFLICT");
      expect((e as ApiError).status).toBe(409);
    }
  });
});

// ============================================================================
// 并发支付幂等测试
// ============================================================================

describe("并发测试 — 支付幂等", () => {
  beforeEach(resetMocks);

  it("并发两个相同 idempotencyKey 的支付请求，只有一个创建订阅", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    // 设置用户查找
    mockDb.user.findUnique.mockResolvedValue({
      id: "user_concurrent",
      sessionId: "sess_concurrent_001",
      sessions: [{ id: "as_concurrent_001", userId: "user_concurrent" }]
    });

    // 第一个请求：幂等键不存在
    mockDb.paymentEvent.findUnique.mockResolvedValueOnce(null);

    let paymentEventCreated = false;
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      // 第一次检查：重复检查时也返回 null（还没创建）
      txMock.paymentEvent = {
        ...mockDb.paymentEvent,
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(() => {
          paymentEventCreated = true;
          return { id: "pe_concurrent_001" };
        })
      };
      txMock.subscription = {
        ...mockDb.subscription,
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "sub_concurrent_001",
          status: "ACTIVE",
          startsAt: new Date(),
          expiresAt: futureDate
        }),
        update: vi.fn()
      };
      return fn(txMock);
    });

    const firstResult = await processMockPayment({
      sessionId: "sess_concurrent_001",
      idempotencyKey: "concurrent_pay_001",
      provider: "mock",
      plan: "monthly"
    });

    expect(firstResult.paid).toBe(true);
    expect(paymentEventCreated).toBe(true);

    // 第二个请求：幂等键已存在
    mockDb.paymentEvent.findUnique.mockResolvedValueOnce({
      id: "pe_concurrent_001",
      idempotencyKey: "concurrent_pay_001",
      eventType: "mock.payment_succeeded"
    });
    mockDb.subscription.findFirst.mockResolvedValueOnce({
      id: "sub_concurrent_001",
      status: "ACTIVE",
      startsAt: new Date(),
      expiresAt: futureDate
    });

    const secondResult = await processMockPayment({
      sessionId: "sess_concurrent_001",
      idempotencyKey: "concurrent_pay_001",
      provider: "mock",
      plan: "monthly"
    });

    expect(secondResult.paid).toBe(true);
    expect(secondResult.subscription.status).toBe("ACTIVE");

    // verify: transaction was called exactly once
    const transactionCalls = mockDb.$transaction.mock.calls.length;
    expect(transactionCalls).toBe(1);
  });

  it("事务内发现竞态重复时回退到已有结果", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    mockDb.user.findUnique.mockResolvedValue({
      id: "user_concurrent",
      sessionId: "sess_concurrent_001",
      sessions: [{ id: "as_concurrent_001", userId: "user_concurrent" }]
    });

    // 外部检查：不存在
    mockDb.paymentEvent.findUnique.mockResolvedValueOnce(null);

    // 事务内二次检查：发现已被另一个并发请求创建
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.paymentEvent = {
        ...mockDb.paymentEvent,
        findUnique: vi.fn().mockResolvedValue({ id: "pe_race" })
      };
      // 返回 null 表示事务内发现竞态重复
      return null;
    });

    // 回退查询已有订阅
    mockDb.subscription.findFirst.mockResolvedValueOnce({
      id: "sub_existing",
      status: "ACTIVE",
      startsAt: new Date(),
      expiresAt: futureDate
    });

    const result = await processMockPayment({
      sessionId: "sess_concurrent_001",
      idempotencyKey: "race_condition_key",
      provider: "mock",
      plan: "monthly"
    });

    expect(result.paid).toBe(true);
    expect(result.subscription.status).toBe("ACTIVE");
    expect(result.resultAccess).toBe("FULL");
  });
});

// ============================================================================
// 并发状态下状态一致性测试
// ============================================================================

describe("并发测试 — 状态一致性", () => {
  beforeEach(resetMocks);

  it("已提交后并发 patchStep 被正确拒绝", async () => {
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "SUBMITTED",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 10
        }))
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_concurrent_001",
        stepKey: "body",
        version: 10,
        answers: { heightCm: 180, weightKg: 75 }
      });
      expect.unreachable("已提交后应拒绝保存");
    } catch (e) {
      expect((e as ApiError).code).toBe("ALREADY_SUBMITTED");
      expect((e as ApiError).status).toBe(409);
    }
  });

  it("EXPIRED session 并发保存被拒绝", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "EXPIRED",
          createdAt: oldDate
        }))
      };
      return fn(txMock);
    });

    try {
      await patchStep({
        sessionId: "sess_concurrent_001",
        stepKey: "profile",
        version: 1,
        answers: { gender: "FEMALE", age: 25 }
      });
      expect.unreachable("EXPIRED 后应拒绝保存");
    } catch (e) {
      expect((e as ApiError).code).toBe("SESSION_NOT_FOUND");
    }
  });

  it("并发 submit 对已提交 session 返回 ALREADY_SUBMITTED", async () => {
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
      const txMock = { ...mockDb };
      txMock.user = {
        ...mockDb.user,
        findUnique: vi.fn().mockResolvedValue(mockSessionLookup({
          status: "SUBMITTED",
          completedSteps: ["profile", "goal", "body", "activity", "review"],
          version: 7,
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
        sessionId: "sess_concurrent_001",
        version: 7,
        idempotencyKey: "submit-dup"
      });
      expect.unreachable("应抛出 ALREADY_SUBMITTED");
    } catch (e) {
      expect((e as ApiError).code).toBe("ALREADY_SUBMITTED");
    }
  });
});
