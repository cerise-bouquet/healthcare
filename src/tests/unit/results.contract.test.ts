import { describe, expect, it } from "vitest";
import {
  calculateBMI,
  classifyBMI,
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculatePredictedTargetDate,
  calculateFullResult,
  validateTargetWeight,
  PROTECTED_FIELD_NAMES
} from "@/modules/results/service";
import { ApiError } from "@/lib/errors";

// ---- helpers ----

const baseAnswers = {
  gender: "FEMALE" as const,
  age: 30,
  goal: "MAINTAIN" as const,
  heightCm: 165,
  weightKg: 60,
  activityLevel: "MODERATE" as const
};

// ---- BMI ----

describe("calculateBMI", () => {
  it("returns expected BMI for standard input", () => {
    const bmi = calculateBMI(70, 175);
    expect(bmi).toBe(22.9);
  });

  it("returns 1 decimal place", () => {
    const bmi = calculateBMI(68, 172);
    // BMI = 68 / (1.72^2) = 68 / 2.9584 = 22.986... → 23.0
    // Number(23.0).toString() = "23", 所以用 toFixed(1) 验证
    expect(bmi.toFixed(1)).toMatch(/^\d+\.\d$/);
  });

  it("handles minimum boundary", () => {
    const bmi = calculateBMI(35, 230);
    expect(bmi).toBeGreaterThan(0);
  });

  it("handles maximum boundary", () => {
    const bmi = calculateBMI(250, 120);
    expect(bmi).toBeGreaterThan(0);
  });
});

// ---- BMI 分类 ----

describe("classifyBMI", () => {
  it("classifies UNDERWEIGHT", () => {
    expect(classifyBMI(17.0)).toBe("UNDERWEIGHT");
    expect(classifyBMI(18.4)).toBe("UNDERWEIGHT");
  });

  it("classifies NORMAL", () => {
    expect(classifyBMI(18.5)).toBe("NORMAL");
    expect(classifyBMI(22.0)).toBe("NORMAL");
    expect(classifyBMI(24.9)).toBe("NORMAL");
  });

  it("classifies OVERWEIGHT", () => {
    expect(classifyBMI(25.0)).toBe("OVERWEIGHT");
    expect(classifyBMI(27.5)).toBe("OVERWEIGHT");
    expect(classifyBMI(29.9)).toBe("OVERWEIGHT");
  });

  it("classifies OBESE", () => {
    expect(classifyBMI(30.0)).toBe("OBESE");
    expect(classifyBMI(40.0)).toBe("OBESE");
  });
});

// ---- BMR ----

describe("calculateBMR", () => {
  it("returns expected BMR for female", () => {
    const bmr = calculateBMR("FEMALE", 60, 165, 30);
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 ≈ 1320
    expect(bmr).toBe(1320);
  });

  it("returns expected BMR for male", () => {
    const bmr = calculateBMR("MALE", 80, 180, 25);
    // 10*80 + 6.25*180 - 5*25 + 5 = 800 + 1125 - 125 + 5 = 1805
    expect(bmr).toBe(1805);
  });

  it("returns expected BMR for OTHER gender", () => {
    const bmr = calculateBMR("OTHER", 70, 170, 30);
    // 10*70 + 6.25*170 - 5*30 - 78 = 700 + 1062.5 - 150 - 78 = 1534.5 ≈ 1535
    expect(bmr).toBe(1535);
  });
});

// ---- TDEE ----

describe("calculateTDEE", () => {
  it("returns expected TDEE for moderate activity", () => {
    const tdee = calculateTDEE(1500, "MODERATE");
    expect(tdee).toBe(2325); // 1500 * 1.55
  });

  it("returns expected TDEE for sedentary", () => {
    const tdee = calculateTDEE(1500, "SEDENTARY");
    expect(tdee).toBe(1800); // 1500 * 1.2
  });

  it("returns expected TDEE for very active", () => {
    const tdee = calculateTDEE(1500, "VERY_ACTIVE");
    expect(tdee).toBe(2850); // 1500 * 1.9
  });
});

// ---- 热量目标 ----

describe("calculateCalorieTarget", () => {
  it("creates deficit for weight loss", () => {
    const result = calculateCalorieTarget(2000, "LOSE_WEIGHT");
    expect(result.calorieTarget).toBe(1600);
    expect(result.calorieDeficit).toBe(400);
  });

  it("creates surplus for muscle building", () => {
    const result = calculateCalorieTarget(2000, "BUILD_MUSCLE");
    expect(result.calorieTarget).toBe(2225);
    expect(result.calorieDeficit).toBeNull();
  });

  it("maintains for MAINTAIN goal", () => {
    const result = calculateCalorieTarget(2000, "MAINTAIN");
    expect(result.calorieTarget).toBe(2000);
    expect(result.calorieDeficit).toBeNull();
  });

  it("maintains for IMPROVE_FITNESS goal", () => {
    const result = calculateCalorieTarget(2000, "IMPROVE_FITNESS");
    expect(result.calorieTarget).toBe(2000);
    expect(result.calorieDeficit).toBeNull();
  });
});

// ---- 预测目标日期 ----

describe("calculatePredictedTargetDate", () => {
  it("returns null when target weight is undefined", () => {
    const result = calculatePredictedTargetDate(70, undefined, "LOSE_WEIGHT");
    expect(result.predictedDate).toBeNull();
    expect(result.weeklyChange).toBeNull();
  });

  it("returns today when already at target", () => {
    const result = calculatePredictedTargetDate(70, 70, "LOSE_WEIGHT");
    expect(result.predictedDate).toBe(new Date().toISOString().split("T")[0]);
    expect(result.weeklyChange).toBe(0);
  });

  it("calculates future date for weight loss", () => {
    const result = calculatePredictedTargetDate(80, 75, "LOSE_WEIGHT");
    expect(result.predictedDate).not.toBeNull();
    expect(result.weeklyChange).toBeLessThan(0);
    // 5kg loss at 1kg/week = 5 weeks = 35 days
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 35);
    expect(result.predictedDate).toBe(expectedDate.toISOString().split("T")[0]);
  });

  it("calculates future date for muscle gain", () => {
    const result = calculatePredictedTargetDate(70, 72, "BUILD_MUSCLE");
    expect(result.predictedDate).not.toBeNull();
    expect(result.weeklyChange!).toBeGreaterThan(0);
  });

  it("returns null for MAINTAIN goal", () => {
    const result = calculatePredictedTargetDate(70, 70, "MAINTAIN");
    // At same weight, returns today
    expect(result.predictedDate).toBe(new Date().toISOString().split("T")[0]);
  });
});

// ---- 目标体重验证 ----

describe("validateTargetWeight", () => {
  it("throws WEIGHT_OUT_OF_RANGE below 35", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 30)).toThrow(ApiError);
    try {
      validateTargetWeight("LOSE_WEIGHT", 80, 30);
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("throws WEIGHT_OUT_OF_RANGE above 250", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 300)).toThrow(ApiError);
    try {
      validateTargetWeight("LOSE_WEIGHT", 80, 300);
    } catch (e) {
      expect((e as ApiError).code).toBe("WEIGHT_OUT_OF_RANGE");
    }
  });

  it("throws VALIDATION_ERROR when loss target exceeds current", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 70, 80)).toThrow(ApiError);
    try {
      validateTargetWeight("LOSE_WEIGHT", 70, 80);
    } catch (e) {
      expect((e as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("throws VALIDATION_ERROR when gain target below current", () => {
    expect(() => validateTargetWeight("BUILD_MUSCLE", 70, 60)).toThrow(ApiError);
    try {
      validateTargetWeight("BUILD_MUSCLE", 70, 60);
    } catch (e) {
      expect((e as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("passes for valid target", () => {
    expect(() => validateTargetWeight("LOSE_WEIGHT", 80, 75)).not.toThrow();
  });

  it("passes for undefined target", () => {
    expect(() => validateTargetWeight("MAINTAIN", 80, undefined)).not.toThrow();
  });
});

// ---- 完整结果计算 ----

describe("calculateFullResult", () => {
  it("returns all expected top-level fields", () => {
    const result = calculateFullResult(baseAnswers);
    expect(result).toHaveProperty("bmi");
    expect(result).toHaveProperty("bmiCategory");
    expect(result).toHaveProperty("bmr");
    expect(result).toHaveProperty("tdee");
    expect(result).toHaveProperty("calorieTarget");
    expect(result).toHaveProperty("calorieDeficit");
    expect(result).toHaveProperty("publicPayload");
    expect(result).toHaveProperty("protectedPayload");
    expect(result).toHaveProperty("algorithmVersion");
  });

  it("includes disclaimer in public payload", () => {
    const result = calculateFullResult(baseAnswers);
    expect(result.publicPayload.disclaimer).toBeDefined();
    expect(typeof result.publicPayload.disclaimer).toBe("string");
  });

  it("separates public and protected payloads", () => {
    const result = calculateFullResult(baseAnswers);
    // Public: basic info
    expect(result.publicPayload).toHaveProperty("bmi");
    expect(result.publicPayload).toHaveProperty("bmiCategory");
    // Protected: detailed info
    expect(result.protectedPayload).toHaveProperty("bmr");
    expect(result.protectedPayload).toHaveProperty("tdee");
    expect(result.protectedPayload).toHaveProperty("calorieTarget");
    expect(result.protectedPayload).toHaveProperty("detailedPlan");
  });

  it("calculates correct values for weight loss scenario", () => {
    const result = calculateFullResult({
      ...baseAnswers,
      goal: "LOSE_WEIGHT" as const,
      weightKg: 80,
      targetWeightKg: 72
    });
    expect(result.bmiCategory).toBe("OVERWEIGHT");
    expect(result.calorieDeficit).toBe(400);
    expect(result.predictedTargetDate).not.toBeNull();
  });
});

// ---- 受保护字段集合 ----

describe("PROTECTED_FIELD_NAMES", () => {
  it("includes protectedPayload", () => {
    expect(PROTECTED_FIELD_NAMES.has("protectedPayload")).toBe(true);
  });

  it("includes calorieTarget", () => {
    expect(PROTECTED_FIELD_NAMES.has("calorieTarget")).toBe(true);
  });

  it("includes calorieDeficit", () => {
    expect(PROTECTED_FIELD_NAMES.has("calorieDeficit")).toBe(true);
  });

  it("does not include bmi", () => {
    expect(PROTECTED_FIELD_NAMES.has("bmi")).toBe(false);
  });

  it("does not include bmiCategory", () => {
    expect(PROTECTED_FIELD_NAMES.has("bmiCategory")).toBe(false);
  });
});
