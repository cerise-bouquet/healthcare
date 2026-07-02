# AI 协作复盘模板

1. 拆解方式：先把系统拆成 session、answers、results、subscriptions、payment_events 五个域。
2. 使用 AI 的地方：生成 Schema 候选、测试矩阵、异常输入样本、算法草案。
3. 人工审查：检查字段边界、权限泄露、幂等处理和状态机一致性。
4. 修正案例：AI 曾建议把所有答案存为 JSON，最终保留 extraAnswers，但将核心字段结构化。
5. 否决案例：AI 曾建议前端隐藏付费字段即可，最终改为服务端 allowlist serializer。
6. 收益：减少重复样例生成时间，但关键业务规则由人工确定并用测试固化。
