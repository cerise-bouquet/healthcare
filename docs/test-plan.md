# 测试计划与验收矩阵

建议命令：

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e
```

| 测试层 | 必须覆盖 | 验收标准 |
| --- | --- | --- |
| 单元测试 | BMI、BMR/TDEE、热量目标、预测日期、边界输入 | 给定输入得到稳定输出，非法输入抛明确错误 |
| 接口集成 | session、progress、patch、submit、result、pay | 每个接口覆盖成功和主要错误分支 |
| 权限安全 | 非会员结果字段、会员完整结果、直接访问 protected 字段 | 非会员 JSON 中不得出现付费字段名 |
| 幂等测试 | submit 重放、pay 重放、重复 step patch | 重复请求返回一致结果，不重复创建订阅 |
| 并发测试 | 两个版本同时保存 | 旧 version 返回 409，新 version 成功 |
| 端到端 | 创建 session -> 填问卷 -> 提交 -> 摘要 -> pay -> 完整结果 | Playwright 主流程通过 |
