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

  test("完整流程：创建 session → 分步填写 → 提交 → 查看结果 → 支付 → 完整结果", async ({ page }) => {
    await page.goto("/");

    // Step 1: 创建 session
    const session = await page.evaluate(async () => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "e2e-full-flow" })
      });
      return res.json();
    });

    expect(session).toHaveProperty("sessionId");
    expect(session).toHaveProperty("version");
    const sessionId = session.sessionId as string;
    let version = session.version as number;

    // Step 2: 填写 profile
    const step1 = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/steps/profile`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              version,
              answers: { gender: "FEMALE", age: 28 }
            })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(step1).toHaveProperty("version");
    expect(step1.version).toBeGreaterThan(version);
    version = step1.version;

    // Step 3: 填写 goal
    const step2 = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/steps/goal`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              version,
              answers: { goal: "LOSE_WEIGHT", targetWeightKg: 60 }
            })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(step2).toHaveProperty("version");
    version = step2.version;

    // Step 4: 填写 body
    const step3 = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/steps/body`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              version,
              answers: { heightCm: 165, weightKg: 70, targetWeightKg: 60 }
            })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(step3).toHaveProperty("version");
    version = step3.version;

    // Step 5: 填写 activity
    const step4 = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/steps/activity`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              version,
              answers: { activityLevel: "MODERATE" }
            })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(step4).toHaveProperty("version");
    version = step4.version;

    // Step 6: review
    const step5 = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/steps/review`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ version, answers: {} })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(step5).toHaveProperty("version");
    version = step5.version;

    // Step 7: 提交测评
    const submitResult = await page.evaluate(
      async ({ sessionId, version }) => {
        const res = await fetch(
          `/api/assessments/${sessionId}/submit`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              version,
              idempotencyKey: "e2e-full-submit-" + Date.now()
            })
          }
        );
        return res.json();
      },
      { sessionId, version }
    );

    expect(submitResult).toHaveProperty("status", "SUBMITTED");
    expect(submitResult).toHaveProperty("publicResult");
    expect(submitResult.publicResult).toHaveProperty("bmi");
    expect(submitResult.publicResult).toHaveProperty("bmiCategory");
    expect(submitResult).toHaveProperty("paywall");
    expect(submitResult.paywall).toHaveProperty("required", true);

    // Step 8: 查看结果（非会员）
    const nonMemberResult = await page.evaluate(
      async ({ sessionId }) => {
        const res = await fetch(`/api/results/${sessionId}`);
        return res.json();
      },
      { sessionId }
    );

    expect(nonMemberResult).toHaveProperty("publicResult");
    const nonMemberJson = JSON.stringify(nonMemberResult);
    // 确保非会员看不到受保护字段
    const protectedFields = [
      "fullResult",
      "calorieTarget",
      "calorieDeficit",
      "predictedTargetDate",
      "dailyPlan",
      "predictionSeries"
    ];
    for (const field of protectedFields) {
      expect(nonMemberJson, `非会员结果不应包含: ${field}`).not.toContain(field);
    }
    expect(nonMemberResult.paywall).toHaveProperty("required", true);

    // Step 9: 模拟支付
    const payResult = await page.evaluate(
      async ({ sessionId }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            idempotencyKey: "e2e-full-pay-" + Date.now(),
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { sessionId }
    );

    expect(payResult).toHaveProperty("paid", true);
    expect(payResult).toHaveProperty("subscription");
    expect(payResult.subscription).toHaveProperty("status", "ACTIVE");
    expect(payResult).toHaveProperty("resultAccess", "FULL");

    // Step 10: 查看结果（会员）—— 应有完整字段
    const memberResult = await page.evaluate(
      async ({ sessionId }) => {
        const res = await fetch(`/api/results/${sessionId}`);
        return res.json();
      },
      { sessionId }
    );

    expect(memberResult).toHaveProperty("fullResult");
    expect(memberResult.fullResult).toHaveProperty("calorieTarget");
    expect(memberResult.fullResult).toHaveProperty("predictedTargetDate");
    expect(memberResult.fullResult).toHaveProperty("predictionSeries");
    expect(memberResult.fullResult).toHaveProperty("dailyPlan");
    expect(memberResult.paywall).toHaveProperty("required", false);
    expect(memberResult.subscription).toHaveProperty("expiresAt");
  });

  test("支付幂等：重复支付返回相同结果", async ({ page }) => {
    await page.goto("/");

    const idempotencyKey = "e2e-idem-" + Date.now();

    // 第一次支付
    const first = await page.evaluate(
      async ({ idempotencyKey }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "demo_paid_session_001",
            idempotencyKey,
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { idempotencyKey }
    );

    expect(first).toHaveProperty("paid", true);

    // 第二次支付（相同 idempotencyKey）
    const second = await page.evaluate(
      async ({ idempotencyKey }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "demo_paid_session_001",
            idempotencyKey,
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { idempotencyKey }
    );

    expect(second).toHaveProperty("paid", true);
    // 两次结果一致
    expect(second.subscription.status).toBe(first.subscription.status);
  });
});
