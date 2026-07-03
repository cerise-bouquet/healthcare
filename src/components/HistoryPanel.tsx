"use client";

import { useAuth, type SessionSummary } from "@/lib/auth-context";

interface HistoryPanelProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

export default function HistoryPanel({ onSelectSession, onClose }: HistoryPanelProps) {
  const { history, refreshHistory, user } = useAuth();

  const statusLabel = (s: SessionSummary): string => {
    switch (s.status) {
      case "SUBMITTED": return "已完成";
      case "READY_TO_SUBMIT": return "待提交";
      case "EXPIRED": return "已过期";
      default: return "进行中";
    }
  };

  const statusClass = (s: SessionSummary): string => {
    switch (s.status) {
      case "SUBMITTED": return "history-status-done";
      case "READY_TO_SUBMIT": return "history-status-ready";
      case "EXPIRED": return "history-status-expired";
      default: return "history-status-draft";
    }
  };

  return (
    <div className="history-panel">
      <div className="history-header">
        <h3>📋 测评历史</h3>
        <div className="history-header-actions">
          <button onClick={refreshHistory} className="wizard-btn wizard-btn-secondary" style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}>
            刷新
          </button>
          <button onClick={onClose} className="auth-close">✕</button>
        </div>
      </div>

      {user && (
        <p className="history-user">当前用户: {user.email}</p>
      )}

      {history.length === 0 ? (
        <div className="history-empty">
          <p>暂无测评记录</p>
          <p className="history-empty-hint">完成一次测评后，记录将显示在此处。</p>
        </div>
      ) : (
        <ul className="history-list">
          {history.map((s, i) => (
            <li key={i} className="history-item">
              <div className="history-item-main">
                <div className="history-item-header">
                  <span className={`history-status ${statusClass(s)}`}>
                    {statusLabel(s)}
                  </span>
                  <span className="history-date">
                    {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <div className="history-item-meta">
                  <span>步骤: {s.currentStep}</span>
                  {s.submittedAt && (
                    <span>提交于: {new Date(s.submittedAt).toLocaleDateString("zh-CN")}</span>
                  )}
                </div>
              </div>
              <button
                className="wizard-btn wizard-btn-outline"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                onClick={() => onSelectSession(s.sessionId)}
              >
                {s.status === "SUBMITTED" ? "查看结果" : "继续"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
