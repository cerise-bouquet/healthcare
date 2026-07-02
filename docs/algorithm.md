# 健康评估算法说明

本阶段只冻结算法契约，不在路由层实现细节。下一层开发者应在 `src/modules/results` 内实现，并以单元测试固化。

## 原则

- 算法只在服务端运行。
- 结果页必须展示非医疗诊断提示。
- 输出要可解释、可测试，不作为专业医疗建议。

## 计算范围

- BMI = `weightKg / (heightM * heightM)`，保留 1 位小数。
- BMI 分类：`UNDERWEIGHT`、`NORMAL`、`OVERWEIGHT`、`OBESE`。
- BMR/TDEE：根据性别、年龄、身高、体重与 activityLevel 估算。
- calorieTarget：减重为 TDEE - 300 到 500，增肌为 TDEE + 150 到 300，维持接近 TDEE。
- predictedTargetDate：按目标体重差和每周安全变化上限估算。

## 非法目标

目标体重超出 35-250，或与目标方向冲突时返回 `VALIDATION_ERROR`，并带字段级 details。
