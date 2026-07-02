import http from "node:http";

const port = Number(process.env.PORT || 3000);

function json(res, body, status = 200) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>健康测评系统</title>
  <style>
    body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; background: #f7f8fb; color: #18202f; }
    main { max-width: 980px; margin: 0 auto; padding: 36px 20px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: center; border-bottom: 1px solid #d7dce5; padding-bottom: 24px; }
    h1 { margin: 0 0 10px; font-size: 38px; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0; }
    button { min-height: 40px; border: 0; border-radius: 6px; padding: 0 14px; background: #256b5c; color: white; font-weight: 700; cursor: pointer; }
    button.secondary { background: #465266; }
    section { margin-top: 22px; padding: 18px; border: 1px solid #d7dce5; border-radius: 8px; background: white; }
    ol { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding-left: 20px; }
    pre { white-space: pre-wrap; background: #101828; color: #e6edf3; padding: 14px; border-radius: 8px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p><strong>MVP local scaffold</strong></p>
        <h1>健康测评系统</h1>
        <p>匿名进入问卷、分步保存、提交测评、查看摘要、模拟支付解锁完整报告。</p>
      </div>
    </header>
    <div class="actions">
      <button onclick="callApi('/api/sessions', 'POST', { source: 'local-demo' })">创建 session</button>
      <button class="secondary" onclick="callApi('/api/assessments/demo_session/progress')">读取进度</button>
      <button class="secondary" onclick="callApi('/api/assessments/demo_session/submit', 'POST', { version: 1, idempotencyKey: 'submit-demo-001' })">提交测评</button>
      <button class="secondary" onclick="callApi('/api/results/demo_session')">查看结果</button>
      <button onclick="callApi('/api/pay', 'POST', { sessionId: 'demo_session', idempotencyKey: 'demo-pay-001', provider: 'mock', plan: 'monthly' })">模拟支付</button>
    </div>
    <section>
      <h2>问卷步骤</h2>
      <ol><li>profile</li><li>goal</li><li>body</li><li>activity</li><li>review</li></ol>
    </section>
    <section>
      <h2>接口返回</h2>
      <pre id="output">点击上方按钮查看 mock API 返回。</pre>
    </section>
  </main>
  <script>
    async function callApi(path, method = 'GET', body) {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      document.getElementById('output').textContent = JSON.stringify(await response.json(), null, 2);
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions") {
    await readBody(req);
    json(res, {
      sessionId: "sess_contract_stub",
      userId: "usr_contract_stub",
      currentStep: "profile",
      completedSteps: [],
      answers: {},
      version: 1
    }, 201);
    return;
  }

  if (req.method === "GET" && /^\/api\/assessments\/[^/]+\/progress$/.test(url.pathname)) {
    json(res, {
      sessionId: url.pathname.split("/")[3],
      status: "DRAFT",
      currentStep: "profile",
      completedSteps: [],
      answers: {},
      version: 1
    });
    return;
  }

  if (req.method === "POST" && /^\/api\/assessments\/[^/]+\/submit$/.test(url.pathname)) {
    await readBody(req);
    json(res, {
      sessionId: url.pathname.split("/")[3],
      status: "SUBMITTED",
      resultId: "res_contract_stub",
      publicResult: {
        bmi: 24.1,
        bmiCategory: "NORMAL",
        summary: "Your current metrics are within a manageable range."
      },
      paywall: { required: true, reason: "FULL_RESULT_REQUIRES_SUBSCRIPTION" }
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/results\/[^/]+$/.test(url.pathname)) {
    json(res, {
      subscription: { status: "NONE" },
      publicResult: {
        bmi: 24.1,
        bmiCategory: "NORMAL",
        summary: "You are close to your target range."
      },
      paywall: { required: true }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/pay") {
    await readBody(req);
    json(res, {
      paid: true,
      subscription: {
        status: "ACTIVE",
        startsAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-08-01T00:00:00.000Z"
      },
      resultAccess: "FULL"
    });
    return;
  }

  json(res, { code: "SESSION_NOT_FOUND", message: "Mock route not found." }, 404);
});

server.listen(port, () => {
  console.log(`Health assessment mock server running at http://localhost:${port}`);
});
