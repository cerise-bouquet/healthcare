"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import AuthModal from "@/components/AuthModal";
import HistoryPanel from "@/components/HistoryPanel";

// ---- 类型定义 ----

type Phase = "landing" | "assessment" | "results" | "history";

interface SessionState {
  sessionId: string;
  version: number;
  currentStep: string;
  completedSteps: string[];
  answers: Record<string, unknown>;
  status: string;
}

interface ResultState {
  sessionId: string;
  subscription: { status: string; expiresAt?: string };
  publicResult: Record<string, unknown>;
  paywall: { required: boolean; reason?: string };
  fullResult?: {
    calorieTarget?: number;
    predictedTargetDate?: string;
    predictionSeries?: Array<{ week: number; weightKg: number }>;
    dailyPlan?: Record<string, unknown>;
  };
}

// ---- 步骤定义 ----

const STEP_ORDER = ["profile", "goal", "body", "activity", "review"];

const STEP_LABELS: Record<string, string> = {
  profile: "基本信息",
  goal: "健康目标",
  body: "身体数据",
  activity: "运动习惯",
  review: "确认提交",
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  profile: "请告诉我们您的基本信息，以便我们为您精准计算。",
  goal: "选择您的健康目标，我们将为您定制专属方案。",
  body: "输入您的身高和体重，评估当前身体状况。",
  activity: "了解您的日常运动频率，计算适合的热量目标。",
  review: "请核对您的信息，确认无误后提交测评。",
};

// ---- 主组件 ----

export default function AssessmentWizard() {
  const auth = useAuth();

  // 阶段状态
  const [phase, setPhase] = useState<Phase>("landing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 会话状态
  const [session, setSession] = useState<SessionState | null>(null);

  // 当前步骤表单数据
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // 结果状态
  const [result, setResult] = useState<ResultState | null>(null);
  const [paying, setPaying] = useState(false);

  // 认证 UI 状态
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showHistory, setShowHistory] = useState(false);

  // 步骤进度
  const currentStepIdx = session ? STEP_ORDER.indexOf(session.currentStep) : -1;
  const totalSteps = STEP_ORDER.length;

  // ---- API 调用封装 ----

  const apiCall = useCallback(
    async (path: string, options: RequestInit = {}) => {
      setError(null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> || {}),
      };
      // 已登录用户携带 token
      if (auth.user) {
        headers["Authorization"] = `Bearer ${auth.user.token}`;
      }
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.code || `请求失败 (${res.status})`);
      }
      return data;
    },
    [auth.user]
  );

  // ---- 开始测评 ----

  const startAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ source: "web" }),
      });
      setSession({
        sessionId: data.sessionId,
        version: data.version,
        currentStep: data.currentStep || "profile",
        completedSteps: data.completedSteps || [],
        answers: data.answers || {},
        status: data.status || "DRAFT",
      });
      setFormData({});
      setPhase("assessment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建会话失败");
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  // ---- 保存步骤并前进 ----

  const saveAndNext = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall(
        `/api/assessments/${session.sessionId}/steps/${session.currentStep}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            version: session.version,
            answers: formData,
          }),
        }
      );
      setSession((prev) =>
        prev
          ? {
              ...prev,
              version: data.version,
              currentStep: data.currentStep,
              completedSteps: data.completedSteps,
              status: data.status,
              answers: { ...prev.answers, ...formData },
            }
          : prev
      );
      setFormData({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }, [session, formData, apiCall]);

  // ---- 上一步 ----

  const goBack = useCallback(() => {
    if (!session) return;
    const completed = session.completedSteps;
    if (completed.length === 0) return;
    const prevStep = completed[completed.length - 1];
    const newCompleted = completed.slice(0, -1);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentStep: prevStep,
            completedSteps: newCompleted,
          }
        : prev
    );
    setError(null);
  }, [session]);

  // ---- 提交测评 ----

  const submitAssessment = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const idempotencyKey = `submit-${session.sessionId}-${Date.now()}`;
    try {
      const data = await apiCall(
        `/api/assessments/${session.sessionId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            version: session.version,
            idempotencyKey,
          }),
        }
      );
      setResult({
        sessionId: data.sessionId,
        subscription: { status: "NONE" },
        publicResult: data.publicResult || {},
        paywall: data.paywall || { required: true },
      });
      setPhase("results");
      // 刷新历史记录
      if (auth.user) {
        auth.refreshHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setLoading(false);
    }
  }, [session, apiCall, auth]);

  // ---- 查看结果 ----

  const viewResults = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall(`/api/results/${session.sessionId}`);
      setResult(data);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取结果失败");
    } finally {
      setLoading(false);
    }
  }, [session, apiCall]);

  // ---- 从历史中选择 session ----

  const selectHistorySession = useCallback(async (historySessionId: string) => {
    setShowHistory(false);
    setLoading(true);
    setError(null);
    try {
      // 获取该 session 的进度
      const progress = await apiCall(`/api/assessments/${historySessionId}/progress`);
      if (progress.status === "SUBMITTED") {
        // 已提交：直接查看结果
        setSession({
          sessionId: historySessionId,
          version: progress.version,
          currentStep: progress.currentStep,
          completedSteps: progress.completedSteps,
          answers: progress.answers || {},
          status: progress.status,
        });
        const resultData = await apiCall(`/api/results/${historySessionId}`);
        setResult(resultData);
        setPhase("results");
      } else {
        // 未完成：恢复测评
        setSession({
          sessionId: historySessionId,
          version: progress.version,
          currentStep: progress.currentStep,
          completedSteps: progress.completedSteps,
          answers: progress.answers || {},
          status: progress.status,
        });
        setFormData({});
        setPhase("assessment");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载测评失败");
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  // ---- 模拟支付 ----

  const handlePay = useCallback(async () => {
    if (!session) return;
    setPaying(true);
    setError(null);
    const idempotencyKey = `pay-${session.sessionId}-${Date.now()}`;
    try {
      await apiCall("/api/pay", {
        method: "POST",
        body: JSON.stringify({
          sessionId: session.sessionId,
          idempotencyKey,
          provider: "mock",
          plan: "monthly",
        }),
      });
      const data = await apiCall(`/api/results/${session.sessionId}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "支付失败");
    } finally {
      setPaying(false);
    }
  }, [session, apiCall]);

  // ---- 重新开始 ----

  const resetAll = useCallback(() => {
    setPhase("landing");
    setSession(null);
    setResult(null);
    setFormData({});
    setError(null);
  }, []);

  // ---- 表单字段变更 ----

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // ---- 打开认证弹窗 ----

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  // ---- 渲染：落地页 ----

  if (phase === "landing" && !showHistory) {
    return (
      <div className="wizard-root">
        {/* 顶栏 */}
        <header className="wizard-header">
          <span className="wizard-header-logo">🩺 健康测评系统</span>
          <nav className="wizard-header-nav">
            {auth.user ? (
              <>
                <span className="wizard-header-email">{auth.user.email}</span>
                <button
                  className="wizard-btn wizard-btn-secondary"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={() => setShowHistory(true)}
                >
                  📋 测评历史
                </button>
                <button
                  className="wizard-btn wizard-btn-outline"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={auth.logout}
                >
                  退出
                </button>
              </>
            ) : (
              <>
                <button
                  className="wizard-btn wizard-btn-secondary"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={() => openAuth("login")}
                >
                  登录
                </button>
                <button
                  className="wizard-btn wizard-btn-primary"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={() => openAuth("register")}
                >
                  注册
                </button>
              </>
            )}
          </nav>
        </header>

        <main className="wizard-shell">
          <section className="wizard-hero">
            <p className="wizard-eyebrow">Health Assessment</p>
            <h1>健康测评系统</h1>
            <p className="wizard-subtitle">
              只需 5 分钟，完成 5 个简单步骤，获取专属健康评估报告。
              <br />
              无需注册，匿名测评，您的数据完全私密。
            </p>
            <button
              className="wizard-btn wizard-btn-primary wizard-btn-lg"
              onClick={startAssessment}
              disabled={loading}
            >
              {loading ? "正在创建会话..." : "开始免费测评"}
            </button>
            {error && <p className="wizard-error">{error}</p>}
          </section>

          <section className="wizard-features">
            <div className="wizard-feature-card">
              <h3>📋 分步问卷</h3>
              <p>一步一个主题，清晰节奏，低负担体验。</p>
            </div>
            <div className="wizard-feature-card">
              <h3>📊 科学算法</h3>
              <p>基于 Mifflin-St Jeor 方程，精准计算 BMI、BMR、TDEE。</p>
            </div>
            <div className="wizard-feature-card">
              <h3>🔒 隐私优先</h3>
              <p>匿名会话，无需注册，数据安全有保障。</p>
            </div>
          </section>
        </main>

        {/* 认证弹窗 */}
        {showAuth && (
          <AuthModal
            mode={authMode}
            onClose={() => setShowAuth(false)}
            onSwitchMode={() =>
              setAuthMode((m) => (m === "login" ? "register" : "login"))
            }
          />
        )}
      </div>
    );
  }

  // ---- 渲染：历史面板 ----

  if (phase === "landing" && showHistory) {
    return (
      <div className="wizard-root">
        <header className="wizard-header">
          <span className="wizard-header-logo">🩺 健康测评系统</span>
          <nav className="wizard-header-nav">
            <button
              className="wizard-btn wizard-btn-secondary"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              onClick={() => setShowHistory(false)}
            >
              ← 返回首页
            </button>
          </nav>
        </header>
        <main className="wizard-shell">
          <HistoryPanel
            onSelectSession={selectHistorySession}
            onClose={() => setShowHistory(false)}
          />
        </main>
      </div>
    );
  }

  // ---- 渲染：测评阶段 ----

  if (phase === "assessment" && session) {
    const stepKey = session.currentStep;
    const stepLabel = STEP_LABELS[stepKey] || stepKey;
    const stepDesc = STEP_DESCRIPTIONS[stepKey] || "";
    const isFirst = currentStepIdx === 0;
    const isReview = stepKey === "review";
    const allDone = session.completedSteps.length >= STEP_ORDER.length;

    return (
      <div className="wizard-root">
        {/* 顶栏 */}
        <header className="wizard-header">
          <span className="wizard-header-logo">🩺 健康测评系统</span>
          <nav className="wizard-header-nav">
            {auth.user && (
              <button
                className="wizard-btn wizard-btn-secondary"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                onClick={() => { setShowHistory(true); setPhase("landing"); }}
              >
                📋 历史
              </button>
            )}
            <button
              className="wizard-btn wizard-btn-outline"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              onClick={resetAll}
            >
              退出测评
            </button>
          </nav>
        </header>

        <main className="wizard-shell">
          {/* 进度条 */}
          <div className="wizard-progress-bar">
            <div className="wizard-progress-header">
              <span>
                第 {currentStepIdx + 1}/{totalSteps} 步 · {stepLabel}
              </span>
              <span className="wizard-progress-pct">
                {Math.round(((currentStepIdx + 1) / totalSteps) * 100)}%
              </span>
            </div>
            <div className="wizard-progress-track">
              <div
                className="wizard-progress-fill"
                style={{
                  width: `${Math.round(((currentStepIdx + 1) / totalSteps) * 100)}%`,
                }}
              />
            </div>
            <div className="wizard-step-dots">
              {STEP_ORDER.map((s, i) => (
                <span
                  key={s}
                  className={`wizard-dot ${
                    session.completedSteps.includes(s)
                      ? "wizard-dot-done"
                      : i === currentStepIdx
                      ? "wizard-dot-active"
                      : ""
                  }`}
                >
                  {session.completedSteps.includes(s) ? "✓" : i + 1}
                </span>
              ))}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="wizard-error-banner">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* 步骤内容 */}
          <section className="wizard-step-card">
            <h2>{stepLabel}</h2>
            <p className="wizard-step-desc">{stepDesc}</p>

            <div className="wizard-form">
              {stepKey === "profile" && (
                <>
                  <div className="wizard-field">
                    <label>性别</label>
                    <div className="wizard-radio-group">
                      {[
                        { value: "MALE", label: "男" },
                        { value: "FEMALE", label: "女" },
                        { value: "OTHER", label: "其他" },
                      ].map((opt) => (
                        <label key={opt.value} className="wizard-radio">
                          <input
                            type="radio"
                            name="gender"
                            value={opt.value}
                            checked={formData.gender === opt.value}
                            onChange={() => updateField("gender", opt.value)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="wizard-field">
                    <label htmlFor="age">年龄</label>
                    <input
                      id="age"
                      type="number"
                      min={13}
                      max={80}
                      placeholder="请输入年龄（13-80）"
                      value={(formData.age as number) ?? ""}
                      onChange={(e) =>
                        updateField("age", e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="wizard-input"
                    />
                  </div>
                </>
              )}

              {stepKey === "goal" && (
                <>
                  <div className="wizard-field">
                    <label>您的健康目标</label>
                    <div className="wizard-radio-group wizard-radio-stack">
                      {[
                        { value: "LOSE_WEIGHT", label: "🏃 减重", desc: "减少体脂，降低体重" },
                        { value: "BUILD_MUSCLE", label: "💪 增肌", desc: "增加肌肉量，提升力量" },
                        { value: "MAINTAIN", label: "⚖️ 维持", desc: "保持当前体重和体型" },
                        { value: "IMPROVE_FITNESS", label: "🫀 改善体能", desc: "提升心肺功能和整体健康" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`wizard-radio-card ${
                            formData.goal === opt.value ? "wizard-radio-card-active" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="goal"
                            value={opt.value}
                            checked={formData.goal === opt.value}
                            onChange={() => updateField("goal", opt.value)}
                          />
                          <div>
                            <strong>{opt.label}</strong>
                            <small>{opt.desc}</small>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="wizard-field">
                    <label htmlFor="targetWeightKg">目标体重（选填）</label>
                    <input
                      id="targetWeightKg"
                      type="number"
                      min={35}
                      max={250}
                      step={0.1}
                      placeholder="请输入目标体重 kg（35-250）"
                      value={(formData.targetWeightKg as number) ?? ""}
                      onChange={(e) =>
                        updateField(
                          "targetWeightKg",
                          e.target.value ? Number(e.target.value) : undefined
                        )
                      }
                      className="wizard-input"
                    />
                  </div>
                </>
              )}

              {stepKey === "body" && (
                <>
                  <div className="wizard-field">
                    <label htmlFor="heightCm">身高（cm）</label>
                    <input
                      id="heightCm"
                      type="number"
                      min={120}
                      max={230}
                      step={0.1}
                      placeholder="请输入身高（120-230 cm）"
                      value={(formData.heightCm as number) ?? ""}
                      onChange={(e) =>
                        updateField("heightCm", e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="wizard-input"
                    />
                  </div>

                  <div className="wizard-field">
                    <label htmlFor="weightKg">体重（kg）</label>
                    <input
                      id="weightKg"
                      type="number"
                      min={35}
                      max={250}
                      step={0.1}
                      placeholder="请输入体重（35-250 kg）"
                      value={(formData.weightKg as number) ?? ""}
                      onChange={(e) =>
                        updateField("weightKg", e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="wizard-input"
                    />
                  </div>

                  <div className="wizard-field">
                    <label htmlFor="bodyTargetWeightKg">目标体重（选填）</label>
                    <input
                      id="bodyTargetWeightKg"
                      type="number"
                      min={35}
                      max={250}
                      step={0.1}
                      placeholder="请输入目标体重 kg"
                      value={(formData.targetWeightKg as number) ?? ""}
                      onChange={(e) =>
                        updateField(
                          "targetWeightKg",
                          e.target.value ? Number(e.target.value) : undefined
                        )
                      }
                      className="wizard-input"
                    />
                  </div>
                </>
              )}

              {stepKey === "activity" && (
                <div className="wizard-field">
                  <label>日常运动频率</label>
                  <div className="wizard-radio-group wizard-radio-stack">
                    {[
                      { value: "SEDENTARY", label: "🪑 久坐少动", desc: "几乎不运动，长时间坐着工作" },
                      { value: "LIGHT", label: "🚶 轻度活动", desc: "每周轻度运动 1-3 天" },
                      { value: "MODERATE", label: "🏋️ 中等活动", desc: "每周中等强度运动 3-5 天" },
                      { value: "ACTIVE", label: "🏃‍♂️ 高度活跃", desc: "每周高强度运动 6-7 天" },
                      { value: "VERY_ACTIVE", label: "🔥 极度活跃", desc: "高强度体力劳动或每天高强度训练" },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`wizard-radio-card ${
                          formData.activityLevel === opt.value ? "wizard-radio-card-active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="activityLevel"
                          value={opt.value}
                          checked={formData.activityLevel === opt.value}
                          onChange={() => updateField("activityLevel", opt.value)}
                        />
                        <div>
                          <strong>{opt.label}</strong>
                          <small>{opt.desc}</small>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {stepKey === "review" && (
                <div className="wizard-review">
                  <p className="wizard-step-desc">
                    请核对以下信息，确认无误后点击&ldquo;提交测评&rdquo;。
                  </p>
                  <ul className="wizard-review-list">
                    {session.answers && Object.keys(session.answers).length > 0 ? (
                      Object.entries(session.answers).map(([key, val]) => {
                        if (key === "extraAnswers") return null;
                        return (
                          <li key={key}>
                            <span className="wizard-review-label">
                              {key === "gender" && "性别"}
                              {key === "age" && "年龄"}
                              {key === "goal" && "健康目标"}
                              {key === "heightCm" && "身高"}
                              {key === "weightKg" && "体重"}
                              {key === "targetWeightKg" && "目标体重"}
                              {key === "activityLevel" && "运动频率"}
                            </span>
                            <span className="wizard-review-value">
                              {key === "gender" && (val === "MALE" ? "男" : val === "FEMALE" ? "女" : "其他")}
                              {key === "age" && `${val} 岁`}
                              {key === "goal" &&
                                (val === "LOSE_WEIGHT"
                                  ? "减重"
                                  : val === "BUILD_MUSCLE"
                                  ? "增肌"
                                  : val === "MAINTAIN"
                                  ? "维持"
                                  : "改善体能")}
                              {key === "heightCm" && `${val} cm`}
                              {key === "weightKg" && `${val} kg`}
                              {key === "targetWeightKg" && `${val} kg`}
                              {key === "activityLevel" &&
                                (val === "SEDENTARY"
                                  ? "久坐少动"
                                  : val === "LIGHT"
                                  ? "轻度活动"
                                  : val === "MODERATE"
                                  ? "中等活动"
                                  : val === "ACTIVE"
                                  ? "高度活跃"
                                  : "极度活跃")}
                            </span>
                          </li>
                        );
                      })
                    ) : (
                      <li className="wizard-review-empty">暂未填写任何信息</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="wizard-actions">
              {!isFirst && !isReview && (
                <button
                  className="wizard-btn wizard-btn-secondary"
                  onClick={goBack}
                  disabled={loading}
                >
                  上一步
                </button>
              )}
              <div className="wizard-actions-spacer" />
              {!isReview ? (
                <button
                  className="wizard-btn wizard-btn-primary"
                  onClick={saveAndNext}
                  disabled={loading}
                >
                  {loading ? "保存中..." : "下一步"}
                </button>
              ) : (
                <button
                  className="wizard-btn wizard-btn-primary"
                  onClick={submitAssessment}
                  disabled={loading || !allDone}
                >
                  {loading ? "提交中..." : "提交测评"}
                </button>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ---- 渲染：结果页 ----

  if (phase === "results" && result) {
    const pub = result.publicResult;
    const isSubscribed =
      result.subscription?.status === "ACTIVE" && !!result.fullResult;

    return (
      <div className="wizard-root">
        {/* 顶栏 */}
        <header className="wizard-header">
          <span className="wizard-header-logo">🩺 健康测评系统</span>
          <nav className="wizard-header-nav">
            {auth.user && (
              <button
                className="wizard-btn wizard-btn-secondary"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                onClick={() => { setShowHistory(true); setPhase("landing"); }}
              >
                📋 历史
              </button>
            )}
            {!auth.user && (
              <>
                <button
                  className="wizard-btn wizard-btn-secondary"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={() => openAuth("register")}
                >
                  注册保存记录
                </button>
              </>
            )}
            <button
              className="wizard-btn wizard-btn-outline"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              onClick={resetAll}
            >
              开始新测评
            </button>
          </nav>
        </header>

        <main className="wizard-shell">
          {/* 错误提示 */}
          {error && (
            <div className="wizard-error-banner">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* 公开结果 */}
          <section className="wizard-result-card">
            <h2>📊 您的健康评估结果</h2>

            <div className="wizard-result-metrics">
              <div className="wizard-metric">
                <span className="wizard-metric-label">BMI</span>
                <span className="wizard-metric-value">{String(pub.bmi ?? "—")}</span>
              </div>
              <div className="wizard-metric">
                <span className="wizard-metric-label">体重分类</span>
                <span className="wizard-metric-value">
                  {String(pub.bmiCategory ?? "—")}
                </span>
              </div>
            </div>

            <div className="wizard-summary">
              <p>{String(pub.summary ?? "")}</p>
            </div>

            <p className="wizard-disclaimer">
              {String(
                pub.disclaimer ??
                  "此结果仅用于一般健康管理参考，不构成医疗诊断或治疗建议。"
              )}
            </p>
          </section>

          {/* 付费弹窗 / 完整结果 */}
          {isSubscribed && result.fullResult ? (
            <section className="wizard-result-card wizard-full-result">
              <h2>🔓 完整报告</h2>

              <div className="wizard-result-metrics">
                <div className="wizard-metric">
                  <span className="wizard-metric-label">每日热量目标</span>
                  <span className="wizard-metric-value">
                    {result.fullResult.calorieTarget ?? "—"} kcal
                  </span>
                </div>
                <div className="wizard-metric">
                  <span className="wizard-metric-label">预计达成日期</span>
                  <span className="wizard-metric-value">
                    {result.fullResult.predictedTargetDate ?? "—"}
                  </span>
                </div>
              </div>

              {result.fullResult.dailyPlan && (
                <div className="wizard-daily-plan">
                  <h3>📅 每日计划</h3>
                  <p>
                    运动级别:{" "}
                    {String(
                      (result.fullResult.dailyPlan as Record<string, unknown>).activity ?? "—"
                    )}
                  </p>
                  <p>
                    蛋白质:{" "}
                    {String(
                      (result.fullResult.dailyPlan as Record<string, unknown>).protein ?? "—"
                    )}
                  </p>
                  <p>
                    碳水:{" "}
                    {String(
                      (result.fullResult.dailyPlan as Record<string, unknown>).carbs ?? "—"
                    )}
                  </p>
                  <p>
                    脂肪:{" "}
                    {String(
                      (result.fullResult.dailyPlan as Record<string, unknown>).fat ?? "—"
                    )}
                  </p>
                  {(
                    (result.fullResult.dailyPlan as Record<string, unknown>).meals as
                      | Record<string, unknown>
                      | undefined
                  ) && (
                    <div className="wizard-meals">
                      <h4>三餐分配</h4>
                      <ul>
                        {Object.entries(
                          (result.fullResult.dailyPlan as Record<string, unknown>)
                            .meals as Record<string, unknown>
                        ).map(([meal, cal]) => (
                          <li key={meal}>
                            {meal === "breakfast" && "早餐"}
                            {meal === "lunch" && "午餐"}
                            {meal === "dinner" && "晚餐"}
                            {meal === "snacks" && "零食"}: {String(cal)} kcal
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(
                    (result.fullResult.dailyPlan as Record<string, unknown>).notes as string[]
                  )?.map((note, i) => (
                    <p key={i} className="wizard-note">
                      💡 {note}
                    </p>
                  ))}
                </div>
              )}

              {result.fullResult.predictionSeries &&
                result.fullResult.predictionSeries.length > 0 && (
                  <div className="wizard-prediction">
                    <h3>📈 体重预测曲线</h3>
                    <div className="wizard-prediction-table">
                      {result.fullResult.predictionSeries
                        .filter((_, i) => i % 4 === 0 || i < 4)
                        .slice(0, 13)
                        .map((p) => (
                          <div key={p.week} className="wizard-prediction-row">
                            <span>第 {p.week} 周</span>
                            <span>{p.weightKg} kg</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              <p className="wizard-sub-status">
                订阅状态: {result.subscription.status} · 到期:{" "}
                {result.subscription.expiresAt
                  ? new Date(result.subscription.expiresAt).toLocaleDateString("zh-CN")
                  : "—"}
              </p>
            </section>
          ) : (
            <section className="wizard-paywall-card">
              <div className="wizard-paywall-icon">🔒</div>
              <h2>解锁完整报告</h2>
              <p>获取您的每日热量目标、预计达成日期、体重预测曲线和个性化每日计划。</p>
              <ul className="wizard-paywall-features">
                <li>📊 每日热量目标与营养素配比</li>
                <li>📅 预计目标达成日期</li>
                <li>📈 52 周体重预测曲线</li>
                <li>🍽️ 三餐热量分配建议</li>
              </ul>
              <button
                className="wizard-btn wizard-btn-primary wizard-btn-lg"
                onClick={handlePay}
                disabled={paying}
              >
                {paying ? "支付处理中..." : "¥29.9/月 — 立即解锁"}
              </button>
              <p className="wizard-paywall-note">模拟支付，点击即解锁</p>
            </section>
          )}

          {/* 未登录提示 */}
          {!auth.user && isSubscribed && (
            <section className="wizard-result-card" style={{ textAlign: "center", marginTop: 16 }}>
              <p style={{ margin: 0, color: "#5f6b7a" }}>
                💡 注册账号可永久保存本次测评结果，随时回顾
              </p>
              <button
                className="wizard-btn wizard-btn-primary"
                style={{ marginTop: 12 }}
                onClick={() => openAuth("register")}
              >
                免费注册
              </button>
            </section>
          )}

          {/* 操作按钮 */}
          <div className="wizard-actions wizard-actions-center">
            <button
              className="wizard-btn wizard-btn-secondary"
              onClick={viewResults}
              disabled={loading}
            >
              刷新结果
            </button>
            <button
              className="wizard-btn wizard-btn-outline"
              onClick={resetAll}
            >
              开始新测评
            </button>
          </div>
        </main>

        {/* 认证弹窗 */}
        {showAuth && (
          <AuthModal
            mode={authMode}
            onClose={() => setShowAuth(false)}
            onSwitchMode={() =>
              setAuthMode((m) => (m === "login" ? "register" : "login"))
            }
          />
        )}
      </div>
    );
  }

  // fallback
  return (
    <main className="wizard-shell">
      <p>加载中...</p>
    </main>
  );
}
