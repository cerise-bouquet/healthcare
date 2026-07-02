# API 契约

统一约定：

- 路径前缀：`/api`
- 请求与响应：`application/json`
- 错误响应：`{ code, message, details?, requestId? }`
- 写接口必须做 Zod 校验，未声明字段不得进入领域对象。
- 需要幂等的接口必须接收或生成 `idempotencyKey`。

## POST /api/sessions

创建匿名用户和测评 session。若请求带有效 `sessionId`，返回现有进度。

```json
{
  "sessionId": "optional-existing-session",
  "source": "betterme-like-funnel",
  "utm": { "campaign": "demo" }
}
```

## GET /api/assessments/{sessionId}/progress

恢复问卷进度。不得返回 `protectedPayload` 或完整结果字段。

## PATCH /api/assessments/{sessionId}/steps/{stepKey}

保存指定步骤答案。必须校验 `version`，版本不一致返回 `409 VERSION_CONFLICT`。

`stepKey` 字段边界：

| stepKey | 字段 | 推进条件 |
| --- | --- | --- |
| profile | gender, age | gender 合法，age 13-80 |
| goal | goal, targetWeightKg? | goal 合法，目标方向合理 |
| body | heightCm, weightKg, targetWeightKg? | 身高 120-230，体重 35-250 |
| activity | activityLevel | 枚举合法 |
| review | 无新增字段 | 前置步骤完成 |

## POST /api/assessments/{sessionId}/submit

提交完整答案并生成结果。重复调用若答案未变化，返回同一结果摘要。

## GET /api/results/{sessionId}

服务端按订阅状态 allowlist 构造响应。非会员响应中不得出现：

- `protectedPayload`
- `predictionSeries`
- `dailyPlan`
- `calorieDeficit`
- `calorieTarget`
- `predictedTargetDate`

## POST /api/pay

模拟支付接口，按真实 webhook 思路设计：幂等、事务化、可审计。

```bash
curl -X POST http://localhost:3000/api/pay \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo_paid_session_001","idempotencyKey":"demo-pay-001","provider":"mock","plan":"monthly"}'
```

## 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 字段缺失、类型错误、越界 |
| 400 | AGE_OUT_OF_RANGE | age 超出 13-80 |
| 400 | HEIGHT_OUT_OF_RANGE | heightCm 超出 120-230 |
| 400 | WEIGHT_OUT_OF_RANGE | weightKg 超出 35-250 |
| 400 | INVALID_ENUM | 未知枚举值 |
| 404 | SESSION_NOT_FOUND | sessionId 不存在 |
| 409 | VERSION_CONFLICT | 并发保存版本不一致 |
| 409 | ALREADY_SUBMITTED | 已提交后修改关键答案 |
| 403 | RESULT_LOCKED | 访问付费字段 |
| 422 | INCOMPLETE_ASSESSMENT | submit 时步骤未完成 |
| 500 | INTERNAL_ERROR | 未知异常 |
