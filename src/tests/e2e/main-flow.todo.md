# E2E Tests — COMPLETED

Playwright 主流程已覆盖：

1. [x] 打开首页。
2. [x] 创建 session。
3. [x] 查看进度。
4. [x] 提交测评。
5. [x] 确认非会员摘要可见且付费字段不可见。
6. [x] 模拟支付。
7. [x] 确认完整报告字段可见。
8. [x] **完整流程**：创建 session → 分步填写(profile/goal/body/activity/review) → 提交 → 查看非会员结果(验证无保护字段) → 支付 → 查看会员结果(验证 fullResult)。
9. [x] **支付幂等**：重复支付相同 idempotencyKey 返回一致结果。
