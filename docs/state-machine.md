# 状态机与事务边界

`assessment_sessions` 是测评状态主表。状态推进必须集中在领域服务，不允许 API handler 直接拼状态。

```text
DRAFT
  -> READY_TO_SUBMIT  profile/goal/body/activity 均完成
  -> SUBMITTED        submit 成功并写入 assessment_results
  -> EXPIRED          长期未访问或业务主动失效
```

支付链路：

```text
NONE/EXPIRED/CANCELED
  -> ACTIVE           /api/pay 事务成功
ACTIVE
  -> ACTIVE           重复 pay 返回既有状态
```

## 事务

- 分步保存：读取 session + 校验 version + upsert answers + 更新 completedSteps/currentStep/version。
- 提交：锁定 session + 校验完整性 + 计算结果 + 写 assessment_results + 更新 status。
- 支付：按 idempotencyKey 查询事件；不存在则写 payment_events、更新 subscriptions、关联 source_event_id。
