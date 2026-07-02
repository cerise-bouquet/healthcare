import { test, expect } from "@playwright/test";

test.describe("健康测评系统主流程 E2E", () => {
  test("首页加载正常", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("健康测评系统");
    await expect(page.locator("button")).toContainText(["创建 session"]);
  });

  test("创建 session 并查看返回", async ({ page }) => {
    await page.goto("/");

    // 使用 page.evaluate 直接调用 API 更可靠
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "e2e-test" })
      });
      return response.json();
    });

    expect(result).toHaveProperty("sessionId");
    expect(result).toHaveProperty("currentStep", "profile");
    expect(result).toHaveProperty("version");
  });

  test("查看进度", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/assessments/demo_session/progress");
      return response.json();
    });

    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("currentStep");
  });

  test("提交测评并检查公开结果", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/assessments/demo_session/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, idempotencyKey: "e2e-submit-001" })
      });
      return response.json();
    });

    expect(result).toHaveProperty("status", "SUBMITTED");
    expect(result).toHaveProperty("publicResult");
    expect(result.publicResult).toHaveProperty("bmi");
    expect(result.publicResult).toHaveProperty("bmiCategory");

    // 应有 paywall 提示
    expect(result).toHaveProperty("paywall");
    expect(result.paywall).toHaveProperty("required", true);
    expect(result.paywall.reason).toContain("SUBSCRIPTION");
  });

  test("查看结果 —— 非会员不应看到付费字段", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/results/demo_session");
      return response.json();
    });

    // 公开字段可见
    expect(result).toHaveProperty("publicResult");
    expect(result.publicResult).toHaveProperty("bmi");

    // 受保护字段不得出现 —— 序列化为 JSON 后检查
    const json = JSON.stringify(result);
    const forbiddenFields = [
      "protectedPayload",
      "calorieTarget",
      "calorieDeficit",
      "predictedTargetDate",
      "dailyPlan",
      "predictionSeries"
    ];
    for (const field of forbiddenFields) {
      expect(json).not.toContain(field);
    }

    // 应有 paywall
    expect(result).toHaveProperty("paywall");
    expect(result.paywall).toHaveProperty("required", true);
  });

  test("模拟支付后获取完整结果", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "demo_paid_session_001",
          idempotencyKey: "e2e-pay-" + Date.now(),
          provider: "mock",
          plan: "monthly"
        })
      });
      return response.json();
    });

    expect(result).toHaveProperty("paid", true);
    expect(result).toHaveProperty("subscription");
    expect(result.subscription).toHaveProperty("status", "ACTIVE");
    expect(result).toHaveProperty("resultAccess", "FULL");
  });
});
