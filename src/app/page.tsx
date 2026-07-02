const steps = ["profile", "goal", "body", "activity", "review"];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">MVP local scaffold</p>
          <h1>健康测评系统</h1>
          <p>
            匿名 session、分步问卷、结果预览、模拟支付和完整报告解锁的本地演示入口。
          </p>
        </div>
        <a className="primary" href="/api/sessions">
          API contract
        </a>
      </section>
      <section className="panel">
        <h2>问卷步骤</h2>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="panel">
        <h2>当前阶段</h2>
        <p>
          页面用于本地端口验收。按钮连接到 mock API，真实业务逻辑由下一阶段按
          docs 文档实现。
        </p>
      </section>
    </main>
  );
}
