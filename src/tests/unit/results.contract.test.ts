import { describe, expect, it } from "vitest";
import { calculatePublicResult } from "@/modules/results/service";

describe("results contract stub", () => {
  it("returns public BMI fields without protected payload", () => {
    const result = calculatePublicResult({});
    expect(result).toEqual({
      bmi: 24.1,
      bmiCategory: "NORMAL"
    });
    expect(result).not.toHaveProperty("protectedPayload");
  });
});
