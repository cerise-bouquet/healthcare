import { test, expect } from "@playwright/test";

test.describe("健康测评系统主流程 E2E", () => {
  test("首页加载正常", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("健康测评系统");
    // 新版 UI 包含登录、注册和开始免费测评按钮
    await expect(page.locator("button")).toContainText(["开始免费测评"]);
  });

  test("创建 session 并查看返回", async ({ page }) => {
    await page.goto("/");

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

  test("已提交 session 不可重复提交", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/assessments/demo_session/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 6, idempotencyKey: "e2e-submit-002" })
      });
      return response.json();
    });

    // demo_session 已提交 → 返回 ALREADY_SUBMITTED
    expect(result).toHaveProperty("code", "ALREADY_SUBMITTED");
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

    // 受保护字段不得出现
    const json = JSON.stringify(result);
    const forbiddenFields = [
      "protectedPayload",
      "fullResult",
      "calorieTarget",
      "calorieDeficit",
      "predictedTargetDate",
      "dailyPlan",
      "predictionSeries"
    ];
    for (const field of forbiddenFields) {
      expect(json).not.toContain(field);
    }

    // 非会员有 paywall
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

    // 支付后查看结果应有完整数据
    const memberResult = await page.evaluate(async () => {
      const res = await fetch("/api/results/demo_paid_session_001");
      return res.json();
    });

    expect(memberResult).toHaveProperty("fullResult");
    expect(memberResult.paywall).toHaveProperty("required", false);
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
    const sessionId = session.sessionId as string;
    let version = session.version as number;

    // Step 2-6: 分步填写
    const steps = [
      { step: "profile", answers: { gender: "FEMALE", age: 28 } },
      { step: "goal", answers: { goal: "LOSE_WEIGHT", targetWeightKg: 60 } },
      { step: "body", answers: { heightCm: 165, weightKg: 70, targetWeightKg: 60 } },
      { step: "activity", answers: { activityLevel: "MODERATE" } },
      { step: "review", answers: {} },
    ];

    for (const { step, answers } of steps) {
      const data = await page.evaluate(
        async ({ sid, ver, stepKey, ans }) => {
          const res = await fetch(`/api/assessments/${sid}/steps/${stepKey}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ version: ver, answers: ans })
          });
          return res.json();
        },
        { sid: sessionId, ver: version, stepKey: step, ans: answers }
      );
      expect(data).toHaveProperty("version");
      version = data.version;
    }

    // Step 7: 提交
    const submitResult = await page.evaluate(
      async ({ sid, ver }) => {
        const res = await fetch(`/api/assessments/${sid}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: ver, idempotencyKey: "e2e-full-" + Date.now() })
        });
        return res.json();
      },
      { sid: sessionId, ver: version }
    );

    expect(submitResult).toHaveProperty("status", "SUBMITTED");
    expect(submitResult).toHaveProperty("publicResult");
    expect(submitResult.publicResult).toHaveProperty("bmi");
    expect(submitResult).toHaveProperty("paywall");
    expect(submitResult.paywall).toHaveProperty("required", true);

    // Step 8: 查看结果（非会员）
    const nonMemberResult = await page.evaluate(
      async ({ sid }) => {
        const res = await fetch(`/api/results/${sid}`);
        return res.json();
      },
      { sid: sessionId }
    );

    expect(nonMemberResult).toHaveProperty("publicResult");
    const nonMemberJson = JSON.stringify(nonMemberResult);
    const protectedFields = ["fullResult", "calorieTarget", "calorieDeficit",
      "predictedTargetDate", "dailyPlan", "predictionSeries"];
    for (const field of protectedFields) {
      expect(nonMemberJson, `非会员结果不应包含: ${field}`).not.toContain(field);
    }
    expect(nonMemberResult.paywall).toHaveProperty("required", true);

    // Step 9: 模拟支付
    const payResult = await page.evaluate(
      async ({ sid }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            idempotencyKey: "e2e-full-pay-" + Date.now(),
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { sid: sessionId }
    );

    expect(payResult).toHaveProperty("paid", true);
    expect(payResult.subscription).toHaveProperty("status", "ACTIVE");
    expect(payResult).toHaveProperty("resultAccess", "FULL");

    // Step 10: 查看结果（会员）—— 应有完整字段
    const memberResult = await page.evaluate(
      async ({ sid }) => {
        const res = await fetch(`/api/results/${sid}`);
        return res.json();
      },
      { sid: sessionId }
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
      async ({ key }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "demo_session",
            idempotencyKey: key,
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { key: idempotencyKey }
    );

    expect(first).toHaveProperty("paid", true);

    // 第二次支付（相同 idempotencyKey）
    const second = await page.evaluate(
      async ({ key }) => {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "demo_session",
            idempotencyKey: key,
            provider: "mock",
            plan: "monthly"
          })
        });
        return res.json();
      },
      { key: idempotencyKey }
    );

    expect(second).toHaveProperty("paid", true);
    expect(second.subscription.status).toBe(first.subscription.status);
  });
});
