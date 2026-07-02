# Integration Test TODO

下一阶段必须覆盖：

- `POST /api/sessions` 创建和恢复。
- `GET /api/assessments/{sessionId}/progress` 不返回 protected result。
- `PATCH /api/assessments/{sessionId}/steps/{stepKey}` 成功、跨步骤字段注入、version conflict。
- `POST /api/assessments/{sessionId}/submit` 完整性校验和幂等重放。
- `GET /api/results/{sessionId}` 非会员字段泄露测试。
- `POST /api/pay` idempotencyKey 重放不重复创建订阅。
