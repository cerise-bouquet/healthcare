# AI 协作复盘

本文档记录健康测评系统 MVP 三天构建过程中与 AI 协作的策略、实践和反思。

---

## 1. 拆解方式

把系统按领域拆成五个核心域，并在 API 路由层仅保留请求解析和响应组装：

| 领域 | 模块 | 核心职责 |
|------|------|----------|
| 用户与 Session | `src/modules/sessions/` | 匿名用户创建、session 恢复、cookie 策略 |
| 测评流程 | `src/modules/assessments/` | 分步保存、进度恢复、状态机、乐观锁 |
| 健康评估 | `src/modules/results/` | BMI/BMR/TDEE/热量目标/预测日期算法、权限裁剪 |
| 支付与订阅 | `src/modules/billing/` | 模拟支付、idempotencyKey 幂等、订阅管理 |
| 基础设施 | `src/lib/` | Prisma Client、错误框架、Zod 校验工具 |

这种拆分方式让每个域的内部复杂度对其它域不可见，API handler 只是薄薄一层胶水代码。

---

## 2. 使用 AI 的地方

### 2.1 Schema 候选与数据库建模

AI 辅助生成了 Prisma Schema 的初版建模草案，包括六张核心表的字段定义和关系映射。人工审查后调整了 `extraAnswers` JSON 字段的策略：保留核心字段结构化，扩展字段放入 JSON 列。

### 2.2 测试矩阵生成

AI 帮助生成测试用例的初始样本，包括：
- 单元测试的边界值（BMI 极值、BMR 男女差异、预测日期边界）
- 集成测试的异常路径（年龄越界、身高越界、类型污染、枚举非法）
- E2E 完整流程的场景编排
- 权限安全测试的字段泄露检查清单

### 2.3 异常输入样本

AI 生成了大量的异常输入样本用于 Zod 校验测试，包括：
- 类型污染（字符串代替数字、null 代替必填字段、数组代替枚举）
- SQL 注入尝试（`"FEMALE; DROP TABLE users;"`）
- XSS 注入尝试（`"<script>alert('xss')</script>"`）
- 边界越界值（age=12, age=81, heightCm=119, weightKg=251）

### 2.4 算法草案

AI 提供了健康评估算法的初版实现草案：
- BMI 计算与分类（Mifflin-St Jeor BMR 方程）
- TDEE 活动系数映射
- 热量目标策略（减重 -400kcal，增肌 +225kcal）
- 预测日期估算（周安全变化上限）

### 2.5 CI 工作流与部署配置

AI 辅助生成了 GitHub Actions CI 流水线（typecheck + lint + unit + integration + e2e）和 Vercel 配置文件。

---

## 3. 人工审查

| 审查维度 | 发现与处理 |
|----------|-----------|
| **字段边界** | 逐项检查了 age(13-80)、heightCm(120-230)、weightKg(35-250)、targetWeightKg(35-250) 的范围校验，确保 service 层在 Zod 类型校验之后仍有范围约束。 |
| **权限泄露** | 审查了 `getResultForSession` 的 allowlist 设计，确认非会员响应经过 `sanitizeNonSubscriberResponse` 深度清洗，且使用 `removeProtectedFields` 递归扫描而非黑名单删除。 |
| **幂等处理** | 审查了 `processMockPayment` 的三层幂等：外部检查 → 事务内二次检查 → 事务外 fallback。确保重复 idempotencyKey 不创建重复订阅。 |
| **状态机一致性** | 确认 DRAFT → READY_TO_SUBMIT → SUBMITTED / EXPIRED 的推进只在领域服务（`patchStep`/`submitAssessment`）内完成，API handler 不直接修改状态。 |
| **版本冲突** | 确认乐观锁在事务内实现：读取 session → 校验 version → 更新 → version+1。版本不一致时返回 409。 |
| **非医疗免责** | 确认所有算法输出的 `publicPayload` 都包含免责声明文本。 |

---

## 4. 修正案例

### 4.1 答案存储策略

**AI 原始建议：** 把所有问卷答案存为单一 JSON 列。

**修正：** 保留核心字段（gender、age、heightCm、weightKg、goal、activityLevel）结构化存储，仅将扩展题放入 `extraAnswers` JSON 列。这样兼顾了：
- 结构化字段的查询和统计能力
- 未来扩展题的灵活性
- 类型安全（Prisma 生成强类型）

### 4.2 权限实现方式

**AI 原始建议：** 前端隐藏付费字段，后端返回完整数据由前端裁剪。

**修正：** 改为服务端 allowlist serializer（`sanitizeNonSubscriberResponse`），非会员 JSON 中不出现受保护字段名。防止：
- 浏览器开发者工具直接读取网络响应
- curl/Postman 绕过前端直接调用 API
- 新增付费字段被前端遗漏裁剪

### 4.3 测验过期策略

**AI 原始建议：** 使用定时任务定期扫描并标记过期 session。

**修正：** 改为惰性过期检查（在 `lookupSession` 和事务内按需检查 `createdAt > 30天`），避免引入额外的调度依赖，更简单可靠。

### 4.4 结果计算方法

**AI 原始建议：** 在 submit API handler 中直接计算 BMI 等结果。

**修正：** 将 `calculateFullResult` 等全部计算逻辑抽取到 `src/modules/results/service.ts`，确保：
- 算法函数可独立单测（无需 HTTP 上下文）
- 算法版本可追踪（`ALGORITHM_VERSION` 常量）
- 输入输出有明确类型定义（`AssessmentAnswers`、`FullResult`）

---

## 5. 否决案例

### 5.1 前端隐藏付费字段

**AI 建议：** 后端返回完整数据，由前端根据 `paywall.required` 条件渲染/隐藏。

**否决理由：** 这是最严重的安全反模式。API 响应可以通过 curl/Postman/浏览器 Network 面板直接读取。最终采用服务端 allowlist serializer，非会员 JSON 中不得出现 `fullResult`、`protectedPayload`、`calorieTarget`、`calorieDeficit`、`predictedTargetDate`、`dailyPlan`、`predictionSeries` 等字段名。自动化测试验证了这一点。

### 5.2 使用自增 ID 作为 sessionId

**AI 建议：** 使用数据库自增 ID 生成 sessionId。

**否决理由：** 可猜测的 sessionId 带来安全和隐私风险。最终使用 `cuid()` 生成足够随机的 ID，并设置 `@unique` 约束。

### 5.3 在 URL 参数中传递敏感数据

**AI 建议：** 在 URL query string 中传递 `?paid=true` 标识支付状态。

**否决理由：** URL 可能被日志记录、浏览器历史保存、Referer header 泄露。最终支付状态完全由服务端通过 subscription 表查询，不信任任何客户端传入的 paid/member 标记。

### 5.4 算法结果缓存在前端

**AI 建议：** 将 BMI/BMR/TDEE 等计算结果缓存在 localStorage 以减少 API 调用。

**否决理由：** 本地缓存的算法结果无法反映服务端算法版本更新，且可能被篡改。最终所有算法结果仅由服务端计算并持久化在 `assessment_results` 表中。

---

## 6. 收益总结

| 收益 | 说明 |
|------|------|
| **效率提升** | AI 辅助生成测试用例样板和边界值，减少手动编写重复测试的时间约 60%。 |
| **覆盖完整** | AI 帮助遍历了更多异常路径和边界条件，测试发现了一些手动编写时容易遗漏的场景（如过期 session 的惰性标记、竞态条件下的事务内二次检查）。 |
| **质量保证** | 关键业务规则（权限裁剪、状态机、幂等、输入校验）全部由人工确定并用测试固化，AI 生成的代码经过审查后调整。 |
| **不依赖 AI 的地方** | 架构设计、领域划分、安全模型、数据库范式化、错误码规范——这些需要业务理解和工程判断的决策完全由人工完成。 |
| **关键教训** | AI 倾向于"能跑就行"的实现（如前端隐藏付费字段），但不能替代安全思维和防御性设计。每个 AI 建议的权限/安全相关方案都需要独立审查。 |

---

## 7. 三天开发中的 AI 使用模式

| 阶段 | AI 角色 | 人工角色 |
|------|---------|----------|
| 第 1 天（接口契约 + Schema + Session） | 生成 Prisma Schema 草案、Zod DTO 样板、API 路由骨架 | 审查字段边界、确定范式化策略、编写进展/保存测试 |
| 第 2 天（算法 + submit + 权限 + 支付） | 生成算法草案、测试用例样本、权限测试清单 | 审查算法正确性、确定 allowlist 策略、编写安全测试 |
| 第 3 天（CI + 部署 + 文档 + 复盘） | 生成 CI 工作流、部署配置、文档模板 | 审查 CI 完整性、补全并发测试、编写复盘文档 |

---

*最后更新：2026-07-03*
