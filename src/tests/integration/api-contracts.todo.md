# Integration Tests — COMPLETED

已覆盖：

- [x] `POST /api/sessions` 创建和恢复。
- [x] `GET /api/assessments/{sessionId}/progress` 不返回 protected result。
- [x] `PATCH /api/assessments/{sessionId}/steps/{stepKey}` 成功、跨步骤字段注入、version conflict。
- [x] `POST /api/assessments/{sessionId}/submit` 完整性校验和幂等重放。
- [x] `GET /api/results/{sessionId}` 非会员字段泄露测试。
- [x] `POST /api/pay` idempotencyKey 重放不重复创建订阅。

新增数据验证集成测试 (`data-validation.test.ts`):

- [x] 越界输入：年龄 < 13 / > 80，身高 < 120 / > 230，体重 < 35 / > 250。
- [x] 边界值：年龄 13/80 接受。
- [x] 乱序提交：先保存 body/activity 再保存 profile。
- [x] 重复提交幂等：ALREADY_SUBMITTED、VERSION_CONFLICT。
- [x] 过期 session 处理：30 天后自动 EXPIRED。
- [x] 枚举非法：无效 gender、goal、activityLevel、stepKey。
- [x] 类型污染：字符串代替数值、数组代替枚举、null 代替必填。
- [x] SESSION_NOT_FOUND：访问不存在 session 返回 404。
