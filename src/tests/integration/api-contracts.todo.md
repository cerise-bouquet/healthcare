# Integration Tests — COMPLETED

已覆盖：

- [x] `POST /api/sessions` 创建和恢复。
- [x] `GET /api/assessments/{sessionId}/progress` 不返回 protected result。
- [x] `PATCH /api/assessments/{sessionId}/steps/{stepKey}` 成功、跨步骤字段注入、version conflict。
- [x] `POST /api/assessments/{sessionId}/submit` 完整性校验和幂等重放。
- [x] `GET /api/results/{sessionId}` 非会员字段泄露测试。
- [x] `POST /api/pay` idempotencyKey 重放不重复创建订阅。
