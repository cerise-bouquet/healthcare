"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";

interface AuthModalProps {
  mode: "login" | "register";
  onClose: () => void;
  onSwitchMode: () => void;
}

export default function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const { login, register, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (mode === "register" && password !== confirmPassword) {
      setLocalError("两次密码输入不一致");
      return;
    }

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onClose();
    } catch {
      // error is set by auth context
    }
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>
          ✕
        </button>
        <h2>{mode === "login" ? "登录" : "注册"}</h2>
        <p className="auth-subtitle">
          {mode === "login"
            ? "登录后可查看测评历史和完整报告"
            : "注册账号以保存测评记录，随时查看历史"}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="wizard-field">
            <label htmlFor="auth-email">邮箱</label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder="请输入邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="wizard-input"
            />
          </div>

          <div className="wizard-field">
            <label htmlFor="auth-password">密码</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              placeholder="请输入密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="wizard-input"
            />
          </div>

          {mode === "register" && (
            <div className="wizard-field">
              <label htmlFor="auth-confirm">确认密码</label>
              <input
                id="auth-confirm"
                type="password"
                required
                minLength={6}
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="wizard-input"
              />
            </div>
          )}

          {(localError || error) && (
            <div className="wizard-error">{localError || error}</div>
          )}

          <button
            type="submit"
            className="wizard-btn wizard-btn-primary wizard-btn-lg"
            style={{ width: "100%", marginTop: 8 }}
            disabled={loading}
          >
            {loading
              ? "处理中..."
              : mode === "login"
              ? "登录"
              : "注册"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login" ? "还没有账号？" : "已有账号？"}{" "}
          <button onClick={onSwitchMode} className="auth-link">
            {mode === "login" ? "立即注册" : "去登录"}
          </button>
        </p>
      </div>
    </div>
  );
}
