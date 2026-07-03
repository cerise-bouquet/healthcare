import { describe, expect, it } from "vitest";
import {
  calculateBMI,
  classifyBMI,
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculatePredictedTargetDate,
  calculateFullResult,
  validateTargetWeight
} from "@/modules/results/service";
import { ApiError } from "@/lib/errors";

// ============================================================================
// BMI 边界测试
// ============================================================================

describe("calculateBMI — 边界与异常", () => {
  it("身高为 0 时返回 Infinity", () => {
    // 身高 0 → 除零导致 Infinity
    const bmi = calculateBMI(70, 0);
    expect(bmi).toBe(Infinity);
  });

  it("极端低身高（矮小症级别）", () => {
    const bmi = calculateBMI(35, 120);
    // 35 / (1.2^2) = 35 / 1.44 = 24.305... → 24.3
    expect(bmi).toBe(24.3);
  });

  it("极端高身高", () => {
    const bmi = calculateBMI(100, 230);
    // 100 / (2.3^2) = 100 / 5.29 = 18.903... → 18.9
    expect(bmi).toBe(18.9);
  });

  it("极端低体重", () => {
    const bmi = calculateBMI(35, 175);
    // 35 / (1.75^2) = 35 / 3.0625 = 11.428... → 11.4
    expect(bmi).toBe(11.4);
  });

  it("极端高体重", () => {
    const bmi = calculateBMI(250, 175);
    // 250 / (1.75^2) = 250 / 3.0625 = 81.632... → 81.6
    expect(bmi).toBe(81.6);
  });

  it("负数体重（理论上不应出现但算法需可计算）", () => {
    const bmi = calculateBMI(-50, 170);
    // -50 / (1.7^2) = -50 / 2.89 = -17.301... → -17.3
    expect(bmi).toBe(-17.3);
  });

  it("负数身高（负值会导致 BMI 为正）", () => {
    const bmi = calculateBMI(70, -170);
    // 70 / ((-1.7)^2) = 70 / 2.89 = 24.2
    expect(bmi).toBe(24.2);
  });

  it("正常边界组合（身高下限+体重上限）", () => {
    const bmi = calculateBMI(250, 120);
    // 250 / 1.44 = 173.6
    expect(bmi).toBe(173.6);
  });

  it("正常边界组合（身高上限+体重下限）", () => {
    const bmi = calculateBMI(35, 230);
    // 35 / 5.29 = 6.6
    expect(bmi).toBe(6.6);
  });

  it("保留 1 位小数精度", () => {
    // 确保各种输入都返回1位小数
    expect(calculateBMI(68, 172).toString()).toMatch(/^\d+(\.\d)?$/);
    expect(calculateBMI(80, 180).toString()).toMatch(/^\d+(\.\d)?$/);
    expect(calculateBMI(55, 160).toString()).toMatch(/^\d+(\.\d)?$/);
  });
});

// ============================================================================
// BMI 分类边界测试
// ============================================================================

describe("classifyBMI — 全边界", () => {
  it("分类边界值：UNDERWEIGHT / NORMAL 分界 18.5", () => {
    expect(classifyBMI(18.4)).toBe("UNDERWEIGHT");
    expect(classifyBMI(18.5)).toBe("NORMAL");
  });

  it("分类边界值：NORMAL / OVERWEIGHT 分界 25.0", () => {
    expect(classifyBMI(24.9)).toBe("NORMAL");
    expect(classifyBMI(25.0)).toBe("OVERWEIGHT");
  });

  it("分类边界值：OVERWEIGHT / OBESE 分界 30.0", () => {
    expect(classifyBMI(29.9)).toBe("OVERWEIGHT");
    expect(classifyBMI(30.0)).toBe("OBESE");
  });

  it("极端偏瘦", () => {
    expect(classifyBMI(10.0)).toBe("UNDERWEIGHT");
    expect(classifyBMI(5.0)).toBe("UNDERWEIGHT");
  });

  it("极端肥胖", () => {
    expect(classifyBMI(50.0)).toBe("OBESE");
    expect(classifyBMI(100.0)).toBe("OBESE");
  });

  it("负 BMI 分类", () => {
    // 负 BMI 落在 UNDERWEIGHT 因为 ≤ 18.4
    expect(classifyBMI(-5)).toBe("UNDERWEIGHT");
  });

  it("零 BMI 分类", () => {
    // 0 ≤ 18.4 → UNDERWEIGHT
    expect(classifyBMI(0)).toBe("UNDERWEIGHT");
  });
});

// ============================================================================
// BMR 边界测试
// ============================================================================

describe("calculateBMR — 边界", () => {
  it("极端低值：儿童年龄 13 岁 + 最低体重身高", () => {
    const bmr = calculateBMR("FEMALE", 35, 120, 13);
    // 10*35 + 6.25*120 - 5*13 - 161 = 350 + 750 - 65 - 161 = 874
    expect(bmr).toBe(874);
  });

  it("极端高值：大龄男性 + 最高体重身高", () => {
    const bmr = calculateBMR("MALE", 250, 230, 80);
    // 10*250 + 6.25*230 - 5*80 + 5 = 2500 + 1437.5 - 400 + 5 = 3542.5 → 3543
    expect(bmr).toBe(3543);
  });

  it("所有性别类型的极值", () => {
    const femaleBmr = calculateBMR("FEMALE", 60, 165, 30);
    const maleBmr = calculateBMR("MALE", 60, 165, 30);
    const otherBmr = calculateBMR("OTHER", 60, 165, 30);
    // male > other > female（male offset +5, other -78, female -161）
    expect(maleBmr).toBeGreaterThan(otherBmr);
    expect(otherBmr).toBeGreaterThan(femaleBmr);
  });

  it("高龄边界（80 岁）", () => {
    const bmr = calculateBMR("FEMALE", 60, 165, 80);
    // 10*60 + 6.25*165 - 5*80 - 161 = 600 + 1031.25 - 400 - 161 = 1070.25 → 1070
    expect(bmr).toBe(1070);
  });

  it("低龄边界（13 岁）", () => {
    const bmr = calculateBMR("MALE", 50, 155, 13);
    // 10*50 + 6.25*155 - 5*13 + 5 = 500 + 968.75 - 65 + 5 = 1408.75 → 1409
    expect(bmr).toBe(1409);
  });
});

// ============================================================================
// TDEE 边界测试
// ============================================================================

describe("calculateTDEE — 边界", () => {
  it("所有活动级别的 TDEE 计算结果递增", () => {
    const bmr = 1500;
    const sedentary = calculateTDEE(bmr, "SEDENTARY");     // ×1.2
    const light = calculateTDEE(bmr, "LIGHT");             // ×1.375
    const moderate = calculateTDEE(bmr, "MODERATE");       // ×1.55
    const active = calculateTDEE(bmr, "ACTIVE");           // ×1.725
    const veryActive = calculateTDEE(bmr, "VERY_ACTIVE");  // ×1.9
    expect(sedentary).toBeLessThan(light);
    expect(light).toBeLessThan(moderate);
    expect(moderate).toBeLessThan(active);
    expect(active).toBeLessThan(veryActive);
  });

  it("极低 BMR + 静坐", () => {
    const tdee = calculateTDEE(800, "SEDENTARY");
    expect(tdee).toBe(960); // 800 * 1.2
  });

  it("极高 BMR + 非常活跃", () => {
    const tdee = calculateTDEE(3500, "VERY_ACTIVE");
    expect(tdee).toBe(6650); // 3500 * 1.9
  });
});

// ============================================================================
// 热量目标边界测试
// ============================================================================

describe("calculateCalorieTarget — 边界", () => {
  it("极低 TDEE 减重", () => {
    const result = calculateCalorieTarget(1000, "LOSE_WEIGHT");
    expect(result.calorieTarget).toBe(600);
    expect(result.calorieDeficit).toBe(400);
  });

  it("极高 TDEE 增肌", () => {
    const result = calculateCalorieTarget(5000, "BUILD_MUSCLE");
    expect(result.calorieTarget).toBe(5225);
    expect(result.calorieDeficit).toBeNull();
  });

  it("维持目标不产生热量缺口", () => {
    const maintain = calculateCalorieTarget(2000, "MAINTAIN");
    const improve = calculateCalorieTarget(2000, "IMPROVE_FITNESS");
    expect(maintain.calorieTarget).toBe(2000);
    expect(maintain.calorieDeficit).toBeNull();
    expect(improve.calorieTarget).toBe(2000);
    expect(improve.calorieDeficit).toBeNull();
  });
});

// ============================================================================
// 预测日期边界测试
// ============================================================================

describe("calculatePredictedTargetDate — 边界", () => {
  it("极小减重（< 0.1kg 差距）", () => {
    const result = calculatePredictedTargetDate(70, 70.05, "LOSE_WEIGHT");
    // diff < 0.1 → 已在目标范围
    expect(result.predictedDate).toBe(new Date().toISOString().split("T")[0]);
    expect(result.weeklyChange).toBe(0);
  });

  it("大体重减重（> 50kg）", () => {
    const result = calculatePredictedTargetDate(150, 80, "LOSE_WEIGHT");
    expect(result.predictedDate).not.toBeNull();
    // 70kg loss at 1kg/week = 70 weeks
    expect(result.weeklyChange).toBe(-1.0);
  });

  it("大体重增肌（> 10kg）", () => {
    const result = calculatePredictedTargetDate(60, 75, "BUILD_MUSCLE");
    expect(result.predictedDate).not.toBeNull();
    // 15kg gain at 0.5kg/week = 30 weeks = 210 days
    expect(result.weeklyChange).toBe(0.5);
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 210);
    expect(result.predictedDate).toBe(expectedDate.toISOString().split("T")[0]);
  });

  it("null 目标体重返回 null", () => {
    const result = calculatePredictedTargetDate(70, null as unknown as undefined, "LOSE_WEIGHT");
    expect(result.predictedDate).toBeNull();
    expect(result.weeklyChange).toBeNull();
  });

  it("维持目标 — 体重相同则返回今天", () => {
    const result = calculatePredictedTargetDate(70, 70, "MAINTAIN");
    expect(result.predictedDate).toBe(new Date().toISOString().split("T")[0]);
    expect(result.weeklyChange).toBe(0);
  });

  it("维持目标 — 体重有差异仍返回 null（无预测）", () => {
    const result = calculatePredictedTargetDate(70, 75, "MAINTAIN");
    expect(result.predictedDate).toBeNull();
    expect(result.weeklyChange).toBeNull();
  });

  it("改善体能目标 — 不计算预测日期", () => {
    const result = calculatePredictedTargetDate(70, 75, "IMPROVE_FITNESS");
    expect(result.predictedDate).toBeNull();
    expect(result.weeklyChange).toBeNull();
  });
});

// ============================================================================
// validateTargetWeight 全边界测试
// ============================================================================

describe("validateTargetWeight — 全边界", () => {
  it("undefined/null 应静默通过", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, undefined)).not.toThrow();
    expect(() => validateTargetWeight("MAINTAIN", 80, null as unknown as undefined)).not.toThrow();
  });

  it("目标体重 = 35（精确下边界）", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 35)).not.toThrow();
  });

  it("目标体重 = 250（精确上边界）", () => {
    expect(() => validateTargetWeight("BUILD_MUSCLE", 200, 250)).not.toThrow();
  });

  it("目标体重 = 34（超出下边界）", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 34)).toThrow(ApiError);
    try {
      validateTargetWeight("LOSE_WEIGHT", 80, 34);
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("目标体重 = 251（超出上边界）", () => {
    expect(() => validateTargetWeight("BUILD_MUSCLE", 200, 251)).toThrow(ApiError);
    try {
      validateTargetWeight("BUILD_MUSCLE", 200, 251);
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("LOSE_WEIGHT 目标体重大于等于当前体重", () => {
    // 等于
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 80)).toThrow(ApiError);
    // 大于
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 85)).toThrow(ApiError);
  });

  it("BUILD_MUSCLE 目标体重小于等于当前体重", () => {
    // 等于
    expect(() => validateTargetWeight("BUILD_MUSCLE", 80, 80)).toThrow(ApiError);
    // 小于
    expect(() => validateTargetWeight("BUILD_MUSCLE", 80, 75)).toThrow(ApiError);
  });

  it("MAINTAIN 目标体重无方向限制", () => {
    expect(() => validateTargetWeight("MAINTAIN", 80, 70)).not.toThrow();
    expect(() => validateTargetWeight("MAINTAIN", 80, 90)).not.toThrow();
    expect(() => validateTargetWeight("MAINTAIN", 80, 80)).not.toThrow();
  });

  it("IMPROVE_FITNESS 目标体重无方向限制", () => {
    expect(() => validateTargetWeight("IMPROVE_FITNESS", 80, 70)).not.toThrow();
    expect(() => validateTargetWeight("IMPROVE_FITNESS", 80, 90)).not.toThrow();
  });
});

// ============================================================================
// calculateFullResult 完整流程测试
// ============================================================================

describe("calculateFullResult — 全场景", () => {
  it("减重场景全链路计算", () => {
    const result = calculateFullResult({
      gender: "MALE",
      age: 35,
      goal: "LOSE_WEIGHT",
      heightCm: 175,
      weightKg: 90,
      targetWeightKg: 78,
      activityLevel: "LIGHT"
    });

    expect(result.bmi).toBe(29.4);       // 90 / 3.0625
    expect(result.bmiCategory).toBe("OVERWEIGHT");
    expect(result.calorieDeficit).toBe(400);
    expect(result.predictedTargetDate).not.toBeNull();
    expect(result.predictionSeries.length).toBeGreaterThan(0);
    expect(result.protectedPayload).toHaveProperty("dailyPlan");
    expect(result.protectedPayload).toHaveProperty("predictionSeries");
    expect(result.publicPayload).not.toHaveProperty("dailyPlan");
  });

  it("维持场景 — 无预测曲线", () => {
    const result = calculateFullResult({
      gender: "FEMALE",
      age: 28,
      goal: "MAINTAIN",
      heightCm: 165,
      weightKg: 60,
      activityLevel: "MODERATE"
    });

    expect(result.calorieDeficit).toBeNull();
    expect(result.predictedTargetDate).toBeNull();
    expect(result.predictionSeries).toEqual([]);
  });

  it("增肌场景全链路计算", () => {
    const result = calculateFullResult({
      gender: "MALE",
      age: 25,
      goal: "BUILD_MUSCLE",
      heightCm: 180,
      weightKg: 72,
      targetWeightKg: 78,
      activityLevel: "ACTIVE"
    });

    expect(result.calorieDeficit).toBeNull();
    expect(result.predictedTargetDate).not.toBeNull();
    expect(result.weightChangePerWeek).toBeGreaterThan(0);
  });

  it("结果包含免责声明", () => {
    const result = calculateFullResult({
      gender: "OTHER",
      age: 40,
      goal: "IMPROVE_FITNESS",
      heightCm: 170,
      weightKg: 70,
      activityLevel: "SEDENTARY"
    });

    const disclaimer = result.publicPayload.disclaimer as string;
    expect(disclaimer).toBeDefined();
    expect(typeof disclaimer).toBe("string");
    expect(disclaimer.length).toBeGreaterThan(10);
  });

  it("算法版本号存在", () => {
    const result = calculateFullResult({
      gender: "FEMALE",
      age: 30,
      goal: "MAINTAIN",
      heightCm: 165,
      weightKg: 60,
      activityLevel: "MODERATE"
    });

    expect(result.algorithmVersion).toBeDefined();
    expect(typeof result.algorithmVersion).toBe("string");
  });

  it("dailyPlan 包含宏量营养建议", () => {
    const result = calculateFullResult({
      gender: "FEMALE",
      age: 30,
      goal: "LOSE_WEIGHT",
      heightCm: 165,
      weightKg: 70,
      targetWeightKg: 65,
      activityLevel: "MODERATE"
    });

    const dailyPlan = result.protectedPayload.dailyPlan as Record<string, unknown>;
    expect(dailyPlan).toHaveProperty("calorieTarget");
    expect(dailyPlan).toHaveProperty("protein");
    expect(dailyPlan).toHaveProperty("carbs");
    expect(dailyPlan).toHaveProperty("fat");
    expect(dailyPlan).toHaveProperty("meals");
  });
});

// ============================================================================
// 预测序列测试
// ============================================================================

describe("predictionSeries — 边界", () => {
  it("不越过目标体重（减重）", () => {
    const result = calculateFullResult({
      gender: "FEMALE",
      age: 30,
      goal: "LOSE_WEIGHT",
      heightCm: 165,
      weightKg: 65,
      targetWeightKg: 60,
      activityLevel: "MODERATE"
    });

    const series = result.predictionSeries;
    const lastEntry = series[series.length - 1];
    // 最终体重不应低于目标体重
    expect(lastEntry.weightKg).toBeGreaterThanOrEqual(60);
  });

  it("不越过目标体重（增肌）", () => {
    const result = calculateFullResult({
      gender: "MALE",
      age: 25,
      goal: "BUILD_MUSCLE",
      heightCm: 180,
      weightKg: 70,
      targetWeightKg: 72,
      activityLevel: "ACTIVE"
    });

    const series = result.predictionSeries;
    const lastEntry = series[series.length - 1];
    // 最终体重不应超过目标体重
    expect(lastEntry.weightKg).toBeLessThanOrEqual(72);
  });

  it("序列不超过 52 周", () => {
    const result = calculateFullResult({
      gender: "MALE",
      age: 30,
      goal: "LOSE_WEIGHT",
      heightCm: 175,
      weightKg: 150,
      targetWeightKg: 75,
      activityLevel: "MODERATE"
    });

    // 75kg loss at 1kg/week → 75 weeks, capped at 52
    expect(result.predictionSeries.length).toBe(52);
  });
});
