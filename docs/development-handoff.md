# 项目交接说明

本文档面向接手本项目的开发者，说明当前完成状态、架构决策和后续工作优先级。

---

## 已完成内容（三天构建计划全部完成）

### 第 1 天：接口契约、Schema、Session、分步保存

- [x] Prisma Schema 冻结（6 张核心表：users、assessment_sessions、assessment_answers、assessment_results、subscriptions、payment_events）
- [x] 6 个 API Route Handler：`/api/sessions`、`/api/assessments/{sessionId}/progress`、`/api/assessments/{sessionId}/steps/{stepKey}`、`/api/assessments/{sessionId}/submit`、`/api/results/{sessionId}`、`/api/pay`
- [x] Zod 校验框架：枚举校验（gender/goal/activityLevel）、步骤 Schema（profile/goal/body/activity/review）、idempotencyKey/version 约束
- [x] 统一错误码体系：11 个错误码，`{ code, message, details?, requestId? }` 格式

### 第 2 天：算法、提交、结果、权限、支付

- [x] 健康评估算法：BMI（Mifflin-St Jeor）、BMR、TDEE（5 级活动系数）、热量目标（减重/增肌/维持）、预测日期
- [x] 服务端 allowlist 权限裁剪：非会员响应经过 `sanitizeNonSubscriberResponse` 深度清洗
- [x] 模拟支付：三层幂等（外部检查 → 事务内二次检查 → fallback）
- [x] 状态机：DRAFT → READY_TO_SUBMIT → SUBMITTED / EXPIRED
- [x] 乐观锁：version 字段在事务内校验和递增

### 第 3 天：CI、测试补齐、部署、文档

- [x] GitHub Actions CI：typecheck + lint + unit + integration + e2e（并行执行，`all-checks` 门控）
- [x] 并发测试：版本冲突、支付幂等竞态、状态一致性
- [x] Vercel 部署配置：`vercel.json`（hkg1 区域、Next.js 框架、API 缓存策略）
- [x] 完整 AI 协作复盘：`docs/ai-retrospective.md`
- [x] 四层测试覆盖：单元（算法 + 校验，38 用例）、集成（接口契约 + 数据验证 + 并发，30+ 用例）、权限安全（6 用例）、E2E（主流程 + 幂等，7 用例）

---

## 项目结构速览

```
src/
  app/api/                        # Next.js Route Handlers（薄胶水层）
    sessions/route.ts              # POST /api/sessions
    assessments/[sessionId]/
      progress/route.ts            # GET progress
      steps/[stepKey]/route.ts     # PATCH step
      submit/route.ts              # POST submit
    results/[sessionId]/route.ts   # GET result
    pay/route.ts                   # POST pay
  modules/
    sessions/service.ts            # 匿名用户创建/恢复
    assessments/service.ts         # 分步保存 + 状态机 + 乐观锁
    results/service.ts             # 算法 + 结果序列化 + 权限裁剪
    billing/service.ts             # 模拟支付 + 幂等
  lib/
    db.ts                          # Prisma Client 单例
    errors.ts                      # ApiError 类 + 错误码
    validation.ts                  # Zod Schema + 工具
  tests/
    unit/                          # 算法、Validation 单元测试
    integration/                   # 接口契约、数据验证、并发测试
    e2e/                           # Playwright 主流程
prisma/
  schema.prisma                    # 6 张核心表 + 枚举
docs/                              # 文档目录
.github/workflows/ci.yml           # CI 流水线
vercel.json                        # Vercel 部署配置
```

---

## 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 匿名优先 | 先 session 后注册 | 降低 funnel 流失 |
| 结构化 + JSON | 核心字段结构化，扩展题 JSON | 兼顾校验计算与扩展性 |
| 后端裁剪 | publicResult/fullResult 分离 | 防止付费字段泄露 |
| 支付幂等 | 三层幂等 + idempotencyKey 唯一 | 模拟接口按真实支付可靠性设计 |
| 惰性过期 | 访问时检查而非定时任务 | 简单可靠，无额外调度依赖 |
| 乐观锁 | version 字段在事务内校验 | 防止并发覆盖 |

---

## 关于 Mock Server

`npm run mock:dev` 启动的本地服务器（`scripts/local-server.mjs`）使用纯 Node.js HTTP 模块，不需要数据库。它返回契约桩数据，用于：

- 本地演示页面（`GET /`）
- 前端开发时的 API 响应参考
- E2E 测试的目标服务

集成测试和单元测试使用 Mock Prisma Client（通过 Vitest mocking），不需要 Mock Server 或数据库。

---

## 后续工作优先级

### P0：数据库连接

1. 配置真实 PostgreSQL 数据库（Supabase/Neon 免费层即可）
2. 执行 `npx prisma migrate dev` 创建表
3. 用真实 Prisma Client 替换测试中的 Mock
4. 验证 6 张核心表的读写

### P1：真实支付集成

1. 替换 mock provider 为真实支付（Stripe/LemonSqueezy）
2. 实现 webhook 接收端点
3. 签名验证中间件

### P2：前端完善

1. 实现分步问卷 UI（当前仅有 demo 页面）
2. 进度条、错误提示、版本冲突恢复
3. 结果页（公开摘要 + 付费后完整结果）
4. 支付按钮与订阅状态展示

### P3：功能扩展

1. 用户注册/登录（绑定 anonymousId）
2. 多次测评历史
3. 管理后台
4. 国际化

---

## 快速启动

```bash
# 本地开发（Mock Server，无需数据库）
npm run mock:dev

# 标准开发（需要数据库）
npm install
cp .env.example .env  # 编辑填入 DATABASE_URL
npx prisma migrate dev
npm run dev
```

## 测试

```bash
npm run typecheck     # TypeScript 类型检查
npm run lint          # ESLint
npm test              # 单元测试
npm run test:integration  # 接口集成测试
npm run test:e2e      # E2E 测试
```

---

*最后更新：2026-07-03*
