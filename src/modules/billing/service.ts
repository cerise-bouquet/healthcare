import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { PrismaClient } from "@prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface PayInput {
  sessionId: string;
  idempotencyKey: string;
  provider: "mock";
  plan: "monthly";
}

export interface PaymentResult {
  paid: boolean;
  subscription: {
    status: string;
    startsAt: string;
    expiresAt: string;
    plan?: string;
  };
  resultAccess: "FULL" | "LIMITED";
}

/**
 * 模拟支付处理
 *
 * 按真实 webhook 思路设计：幂等、事务化、可审计。
 * - 按 idempotencyKey 查询事件；存在则返回既有订阅状态
 * - 不存在则在事务中写 payment_events、更新 subscriptions、关联 source_event_id
 */
export async function processMockPayment(input: PayInput): Promise<PaymentResult> {
  const { sessionId, idempotencyKey, plan } = input;

  // Step 1: 查找用户和 session
  const user = await db.user.findUnique({
    where: { sessionId },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1
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

  // Step 2: 幂等检查 —— 是否已存在相同 idempotencyKey 的支付事件
  const existingEvent = await db.paymentEvent.findUnique({
    where: { idempotencyKey }
  });

  if (existingEvent) {
    // 返回已有的订阅状态
    const subscription = await db.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });

    return {
      paid: true,
      subscription: {
        status: subscription?.status ?? "ACTIVE",
        startsAt: subscription?.startsAt?.toISOString() ?? new Date().toISOString(),
        expiresAt: subscription?.expiresAt?.toISOString() ?? calculateExpiryDate(plan).toISOString(),
        plan
      },
      resultAccess: "FULL"
    };
  }

  // Step 3: 事务中创建支付事件和激活/更新订阅
  const result = await db.$transaction(async (tx: Tx) => {
    // 二次检查（事务内防止竞态）
    const duplicate = await tx.paymentEvent.findUnique({
      where: { idempotencyKey }
    });
    if (duplicate) {
      return null; // 由事务外处理
    }

    // 计算订阅起止时间
    const startsAt = new Date();
    const expiresAt = calculateExpiryDate(plan);

    // 创建支付事件
    const paymentEvent = await tx.paymentEvent.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        idempotencyKey,
        eventType: "mock.payment_succeeded",
        payload: {
          provider: "mock",
          plan,
          sessionId,
          amount: plan === "monthly" ? 29.9 : 0,
          currency: "CNY"
        }
      }
    });

    // 查找现有订阅
    const existingSubscription = await tx.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });

    let subscription;
    if (existingSubscription) {
      // 更新现有订阅为 ACTIVE
      subscription = await tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          status: "ACTIVE",
          startsAt,
          expiresAt,
          provider: "mock",
          sourceEventId: paymentEvent.id
        }
      });
    } else {
      // 创建新订阅
      subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          status: "ACTIVE",
          startsAt,
          expiresAt,
          provider: "mock",
          sourceEventId: paymentEvent.id
        }
      });
    }

    return { paymentEvent, subscription };
  });

  // 事务内发现重复
  if (result === null) {
    // 重试：获取已有的订阅状态
    const subscription = await db.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });

    return {
      paid: true,
      subscription: {
        status: subscription?.status ?? "ACTIVE",
        startsAt: subscription?.startsAt?.toISOString() ?? new Date().toISOString(),
        expiresAt: subscription?.expiresAt?.toISOString() ?? calculateExpiryDate(plan).toISOString(),
        plan
      },
      resultAccess: "FULL"
    };
  }

  return {
    paid: true,
    subscription: {
      status: result.subscription.status,
      startsAt: result.subscription.startsAt!.toISOString(),
      expiresAt: result.subscription.expiresAt!.toISOString(),
      plan
    },
    resultAccess: "FULL"
  };
}

/** 根据计划计算过期时间 */
function calculateExpiryDate(plan: "monthly"): Date {
  const now = new Date();
  switch (plan) {
    case "monthly":
      now.setMonth(now.getMonth() + 1);
      break;
    default:
      now.setMonth(now.getMonth() + 1);
  }
  return now;
}
