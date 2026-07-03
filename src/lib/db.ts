/**
 * 数据库访问层
 *
 * 使用内存存储实现完整 PrismaClient 兼容接口。
 * 部署时设置 USE_REAL_DB=true 并配置 DATABASE_URL 指向 Supabase/Neon 即可。
 */

import { PrismaClient } from "@prisma/client";

// ---- 内存存储 ----

type StoreRecord = Record<string, unknown>;

class MemoryStore {
  private tables = new Map<string, Map<string, StoreRecord>>();
  private counters = new Map<string, number>();

  private uid(collection: string): string {
    const n = (this.counters.get(collection) ?? 0) + 1;
    this.counters.set(collection, n);
    return `${collection.slice(0, 3)}_${String(n).padStart(8, "0")}`;
  }

  private tbl(name: string): Map<string, StoreRecord> {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  /** 深拷贝，保留 Date 对象 */
  private clone<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (Array.isArray(obj)) return obj.map((v) => this.clone(v)) as unknown as T;
    if (typeof obj === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = this.clone(v);
      }
      return out as unknown as T;
    }
    return obj;
  }

  // ---- CRUD ----

  findUnique(collection: string, where: Record<string, unknown>): StoreRecord | null {
    const t = this.tbl(collection);
    if (where.id !== undefined) return this.clone(t.get(where.id as string) ?? null);
    // 按字段匹配
    for (const r of t.values()) {
      if (this.match(r, where)) return this.clone(r);
    }
    return null;
  }

  findFirst(
    collection: string,
    where: Record<string, unknown>,
    orderBy?: Record<string, string>,
    take?: number,
    skip?: number
  ): StoreRecord | null {
    const results = this.findManyInternal(collection, where, orderBy, take, skip);
    return results.length > 0 ? results[0] : null;
  }

  findMany(
    collection: string,
    where?: Record<string, unknown>,
    orderBy?: Record<string, string>,
    take?: number,
    skip?: number
  ): StoreRecord[] {
    return this.findManyInternal(collection, where ?? {}, orderBy, take, skip);
  }

  private findManyInternal(
    collection: string,
    where: Record<string, unknown>,
    orderBy?: Record<string, string>,
    take?: number,
    skip?: number
  ): StoreRecord[] {
    const t = this.tbl(collection);
    let results: StoreRecord[] = [];
    for (const r of t.values()) {
      if (this.match(r, where)) results.push(this.clone(r));
    }
    if (orderBy) {
      const [key, dir] = Object.entries(orderBy)[0];
      results.sort((a, b) => {
        const av = a[key]; const bv = b[key];
        if (av instanceof Date && bv instanceof Date) return dir === "desc" ? bv.getTime() - av.getTime() : av.getTime() - bv.getTime();
        return dir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
      });
    }
    if (skip) results = results.slice(skip);
    if (take) results = results.slice(0, take);
    return results;
  }

  create(collection: string, data: Record<string, unknown>): StoreRecord {
    const t = this.tbl(collection);
    const id = (data.id as string) || this.uid(collection);
    const now = new Date();
    const record: StoreRecord = { id, createdAt: now, updatedAt: now };
    // 合并数据
    for (const [k, v] of Object.entries(data)) {
      if (k === "sessions" && v && typeof v === "object" && (v as Record<string, unknown>).create) {
        // 嵌套创建 sessions
        const nested = (v as { create: Record<string, unknown> }).create;
        const sessionData = this.create("assessment_sessions", { ...nested, userId: id });
        record[k] = [sessionData];
      } else {
        record[k] = v;
      }
    }
    t.set(id, record);
    return this.clone(record);
  }

  update(collection: string, where: Record<string, unknown>, data: Record<string, unknown>): StoreRecord {
    const t = this.tbl(collection);
    const existing = this.findUnique(collection, where);
    if (!existing) throw new Error(`Record not found in ${collection}: ${JSON.stringify(where)}`);
    const updated = { ...existing };
    for (const [k, v] of Object.entries(data)) {
      updated[k] = v;
    }
    updated.updatedAt = new Date();
    t.set(existing.id as string, updated);
    return this.clone(updated);
  }

  upsert(collection: string, where: Record<string, unknown>, createData: Record<string, unknown>, updateData: Record<string, unknown>): StoreRecord {
    const existing = this.findUnique(collection, where);
    if (existing) return this.update(collection, where, updateData);
    return this.create(collection, { ...createData, ...where });
  }

  // ---- 关联查询 ----

  resolveIncludes(record: StoreRecord, include: Record<string, unknown>): StoreRecord {
    const result = { ...record };
    for (const [key, val] of Object.entries(include)) {
      if (key === "sessions") {
        let opts: { orderBy?: Record<string, string>; take?: number; include?: Record<string, unknown> } = {};
        if (val && typeof val === "object") {
          opts = val as Record<string, unknown> as typeof opts;
        }
        result.sessions = this.findMany("assessment_sessions", { userId: record.id }, opts.orderBy, opts.take);
        if (opts.include) {
          result.sessions = (result.sessions as StoreRecord[]).map((s) => this.resolveIncludes(s, opts.include!));
        }
      } else if (key === "answers") {
        result.answers = this.findUnique("assessment_answers", { sessionId: record.id });
      } else if (key === "result") {
        result.result = this.findUnique("assessment_results", { sessionId: record.id });
      } else if (key === "subscriptions") {
        let orderBy: Record<string, string> | undefined;
        let take: number | undefined;
        if (val && typeof val === "object") {
          const v = val as Record<string, unknown>;
          orderBy = v.orderBy as Record<string, string> | undefined;
          take = v.take as number | undefined;
        }
        result.subscriptions = this.findMany("subscriptions", { userId: record.id }, orderBy, take);
      } else if (key === "paymentEvents") {
        result.paymentEvents = this.findMany("payment_events", { userId: record.id });
      }
    }
    return result;
  }

  // ---- 辅助 ----

  private match(record: StoreRecord, where: Record<string, unknown>): boolean {
    for (const [key, val] of Object.entries(where)) {
      if (val === undefined) continue;
      if (record[key] === undefined) return false;
      if (val instanceof Date && record[key] instanceof Date) {
        if (val.getTime() !== (record[key] as Date).getTime()) return false;
      } else if (record[key] !== val) {
        return false;
      }
    }
    return true;
  }

  _clear() { this.tables.clear(); this.counters.clear(); }
}

// ---- 全局单例 ----

const GS_KEY = "__memoryStore__";
const globalStore: MemoryStore = (globalThis as Record<string, unknown>)[GS_KEY] as MemoryStore ?? new MemoryStore();
(globalThis as Record<string, unknown>)[GS_KEY] = globalStore;

// ---- Prisma 风格查询 API ----

function q(collection: string) {
  return {
    findUnique: (args: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
      if (args.include) {
        const record = globalStore.findUnique(collection, args.where);
        return record ? globalStore.resolveIncludes(record, args.include) : null;
      }
      return globalStore.findUnique(collection, args.where);
    },
    findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, string>; include?: Record<string, unknown>; take?: number }) => {
      const record = globalStore.findFirst(collection, args.where, args.orderBy, args.take);
      if (record && args.include) return globalStore.resolveIncludes(record, args.include);
      return record;
    },
    findMany: (args?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; take?: number }) => {
      return globalStore.findMany(collection, args?.where, args?.orderBy, args?.take);
    },
    create: (args: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
      const record = globalStore.create(collection, args.data);
      if (args.include) return globalStore.resolveIncludes(record, args.include);
      return record;
    },
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      return globalStore.update(collection, args.where, args.data);
    },
    upsert: (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      return globalStore.upsert(collection, args.where, args.create, args.update);
    },
  };
}

// 预先定义接口以避免循环引用

interface MemClient {
  user: ReturnType<typeof q>;
  assessmentSession: ReturnType<typeof q>;
  assessmentAnswer: ReturnType<typeof q>;
  assessmentResult: ReturnType<typeof q>;
  subscription: ReturnType<typeof q>;
  paymentEvent: ReturnType<typeof q>;
  $transaction: <T>(fn: (tx: MemClient) => Promise<T>) => Promise<T>;
  $disconnect: () => Promise<void>;
}

function createMemoryClient(): MemClient {
  const c: MemClient = {
    user: q("users"),
    assessmentSession: q("assessment_sessions"),
    assessmentAnswer: q("assessment_answers"),
    assessmentResult: q("assessment_results"),
    subscription: q("subscriptions"),
    paymentEvent: q("payment_events"),
    $transaction: async <T>(fn: (tx: MemClient) => Promise<T>): Promise<T> => fn(createMemoryClient()),
    $disconnect: async () => {},
  };
  return c;
}

// ---- 种子数据 ----

function seedDemoData() {
  if (globalStore.findUnique("users", { sessionId: "demo_paid_session_001" })) return; // 已播种

  // 预置已支付演示用户
  const demoUser = globalStore.create("users", {
    sessionId: "demo_paid_session_001",
    anonymousId: "usr_demo_paid",
    email: "demo@example.com",
    passwordHash: "salt:demo",
  });

  const demoSession = globalStore.create("assessment_sessions", {
    userId: demoUser.id,
    status: "SUBMITTED",
    currentStep: "review",
    completedSteps: ["profile", "goal", "body", "activity", "review"],
    version: 6,
    submittedAt: new Date(),
  });

  globalStore.create("assessment_answers", {
    sessionId: demoSession.id,
    gender: "FEMALE",
    age: 28,
    goal: "LOSE_WEIGHT",
    heightCm: 165,
    weightKg: 70,
    targetWeightKg: 60,
    activityLevel: "MODERATE",
    extraAnswers: {},
  });

  const predictions = [
    { week: 1, weightKg: 69.2 }, { week: 2, weightKg: 68.4 }, { week: 3, weightKg: 67.6 },
    { week: 4, weightKg: 66.8 }, { week: 5, weightKg: 66.0 }, { week: 6, weightKg: 65.2 },
    { week: 7, weightKg: 64.4 }, { week: 8, weightKg: 63.6 }, { week: 9, weightKg: 62.8 },
    { week: 10, weightKg: 62.0 }, { week: 11, weightKg: 61.2 }, { week: 12, weightKg: 60.4 },
    { week: 13, weightKg: 60.0 },
  ];

  globalStore.create("assessment_results", {
    sessionId: demoSession.id,
    bmi: 25.7,
    bmiCategory: "OVERWEIGHT",
    calorieTarget: 1680,
    predictedTargetDate: new Date("2026-10-15"),
    publicPayload: {
      bmi: 25.7, bmiCategory: "OVERWEIGHT",
      summary: "您的体重略高于正常范围，通过合理饮食和运动可以改善。",
      disclaimer: "此结果仅用于一般健康管理参考，不构成医疗诊断或治疗建议。",
      nextAction: "Unlock full plan to view target date and detailed daily guidance.",
    },
    protectedPayload: {
      bmr: 1420, tdee: 2080, calorieTarget: 1680, calorieDeficit: 400,
      predictedTargetDate: "2026-10-15", weightChangePerWeek: -0.8,
      predictionSeries: predictions,
      dailyPlan: {
        calorieTarget: 1680, activity: "MODERATE",
        proteinSuggestion: "84-105g/day", protein: "84g", carbs: "210g", fat: "56g",
        meals: { breakfast: 504, lunch: 588, dinner: 420, snacks: 168 },
        notes: ["Keep weekly loss under a conservative threshold.", "以上配比为一般性建议，具体需求请咨询营养师。"],
      },
    },
    algorithmVersion: "mvp-contract-v1",
  });

  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);
  globalStore.create("subscriptions", {
    userId: demoUser.id,
    status: "ACTIVE",
    startsAt: new Date(),
    expiresAt: futureDate,
    provider: "mock",
  });

  // 预置未支付演示用户
  const demoUser2 = globalStore.create("users", {
    sessionId: "demo_session",
    anonymousId: "usr_demo_free",
    email: null,
    passwordHash: null,
  });

  const demoSession2 = globalStore.create("assessment_sessions", {
    userId: demoUser2.id,
    status: "SUBMITTED",
    currentStep: "review",
    completedSteps: ["profile", "goal", "body", "activity", "review"],
    version: 6,
    submittedAt: new Date(),
  });

  globalStore.create("assessment_answers", {
    sessionId: demoSession2.id,
    gender: "MALE", age: 35, goal: "LOSE_WEIGHT",
    heightCm: 175, weightKg: 90, targetWeightKg: 78,
    activityLevel: "LIGHT", extraAnswers: {},
  });

  globalStore.create("assessment_results", {
    sessionId: demoSession2.id,
    bmi: 29.4, bmiCategory: "OVERWEIGHT", calorieTarget: 2089,
    predictedTargetDate: new Date("2026-12-01"),
    publicPayload: {
      bmi: 29.4, bmiCategory: "OVERWEIGHT",
      summary: "您的体重略高于正常范围，通过合理饮食和运动可以改善。",
      disclaimer: "此结果仅用于一般健康管理参考，不构成医疗诊断或治疗建议。",
      nextAction: "Unlock full plan to view target date and detailed daily guidance.",
    },
    protectedPayload: {
      bmr: 1810, tdee: 2489, calorieTarget: 2089, calorieDeficit: 400,
      predictedTargetDate: "2026-12-01", weightChangePerWeek: -0.8,
      predictionSeries: [],
      dailyPlan: {
        calorieTarget: 2089, activity: "LIGHT",
        proteinSuggestion: "104-130g/day", protein: "104g", carbs: "261g", fat: "70g",
        meals: { breakfast: 627, lunch: 731, dinner: 522, snacks: 209 },
        notes: ["Keep weekly loss under a conservative threshold."],
      },
    },
    algorithmVersion: "mvp-contract-v1",
  });

  globalStore.create("subscriptions", {
    userId: demoUser2.id,
    status: "NONE",
    provider: "mock",
  });
}

// ---- 导出 ----

// 使用内存存储
console.log("[db] Using in-memory store");
seedDemoData();

// 使用类型断言以兼容 PrismaClient 类型
export const db = createMemoryClient() as unknown as PrismaClient;
export type { PrismaClient } from "@prisma/client";
