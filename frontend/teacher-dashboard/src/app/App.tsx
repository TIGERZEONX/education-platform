import React from "react";
import type { TeacherClassDecisionSupportView, TeacherRecommendation, FlaggedStudentInspectionItem } from "./decision-support-model";
import { GlassCard } from "../../../shared-ui/components/core-components";

interface AppProps {
  latestView: TeacherClassDecisionSupportView | null;
  connected: boolean;
  lastUpdated: string | null;
}

export default function App({ latestView, connected, lastUpdated }: AppProps) {
  if (!latestView) {
    return (
      <div className="app-container" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="glass-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📡</div>
          <h2>{connected ? "Waiting for first classroom signal..." : "Connecting to server..."}</h2>
          <p style={{ marginTop: "0.5rem" }}>
            {connected
              ? "Server connected. Waiting for students to join."
              : "Make sure the backend server is running: npm run start:server"}
          </p>
          <div style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1rem",
            borderRadius: "20px",
            background: connected ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
            border: `1px solid ${connected ? "var(--accent-green)" : "var(--accent-red)"}`,
            display: "inline-block",
            fontSize: "0.85rem",
          }}>
            {connected ? "🟢 Server Connected" : "🔴 Not Connected"}
          </div>
        </div>
      </div>
    );
  }

  const pulse = latestView.classPulse.liveClassPulse;
  const health = latestView.systemHealth;
  const alert = latestView.alerting;
  const liveSignalState = latestView.classPulse.liveSignalState;
  const pulseTimestampMs = latestView.sessionAwareness.lastUpdatedAt
    ? Date.parse(latestView.sessionAwareness.lastUpdatedAt)
    : Number.NaN;
  const pulseAgeMs = Number.isFinite(pulseTimestampMs) ? Math.max(0, Date.now() - pulseTimestampMs) : Number.POSITIVE_INFINITY;
  const isStaleLiveSignal = pulseAgeMs > 15000;
  const hasLivePulse = pulse !== null && liveSignalState === "live" && !isStaleLiveSignal;

  const pulseColor = hasLivePulse
    ? pulse > 0.7 ? "var(--accent-green)" : pulse > 0.4 ? "var(--accent-yellow)" : "var(--accent-red)"
    : "var(--text-secondary)";

  return (
    <div className="app-container">
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>CognitivePulse Dashboard</h1>
          <p>Session: {latestView.sessionAwareness.classId}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
          <div style={{
            padding: "0.25rem 0.75rem",
            borderRadius: "20px",
            background: connected ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
            border: `1px solid ${connected ? "var(--accent-green)" : "var(--accent-red)"}`,
            fontSize: "0.8rem",
          }}>
            {connected ? "🟢 Live" : "🔴 Offline"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {latestView.classPulse.activeStudentCount} active student{latestView.classPulse.activeStudentCount !== 1 ? "s" : ""}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
            {latestView.classPulse.contributingStudentCount} contributing · {latestView.classPulse.missingSignalCount} missing signal
          </div>
          <div style={{ fontSize: "0.7rem", color: isStaleLiveSignal ? "var(--accent-yellow)" : "var(--text-secondary)" }}>
            Live feed: {isStaleLiveSignal ? "stale" : "fresh"}
          </div>
          {lastUpdated && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Last update: {lastUpdated}
            </div>
          )}
        </div>
      </header>

      {/* Alert Banner */}
      {(alert.severity === "yellow" || alert.severity === "red") && (
        <div style={{
          padding: "var(--spacing-md)",
          borderRadius: "var(--radius-md)",
          background: alert.severity === "red" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
          border: `1px solid ${alert.severity === "red" ? "var(--accent-red)" : "var(--accent-yellow)"}`,
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}>
          <span style={{ fontSize: "1.5rem" }}>{alert.severity === "red" ? "🚨" : "⚠️"}</span>
          <div>
            <strong>{alert.severity === "red" ? "Critical: " : "Warning: "}</strong>
            {alert.reason}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem" }}>

        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Live Engagement Gauge */}
          <GlassCard title="Live Engagement">
            <div style={{ textAlign: "center" }}>
              {/* SVG circular gauge */}
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ display: "block", margin: "0 auto" }}>
                <circle cx="70" cy="70" r="55" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                <circle
                  cx="70" cy="70" r="55"
                  fill="none"
                  stroke={pulseColor}
                  strokeWidth="14"
                  strokeDasharray={`${(hasLivePulse ? pulse : 0) * 345.6} 345.6`}
                  strokeDashoffset="86.4"
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 1s ease, stroke 0.5s ease" }}
                />
                <text x="70" y="66" textAnchor="middle" fill={pulseColor} fontSize="24" fontWeight="bold">
                  {hasLivePulse ? `${Math.round(pulse * 100)}%` : "--"}
                </text>
                <text x="70" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="11">
                  {hasLivePulse ? "engagement" : isStaleLiveSignal ? "signal stale" : "signal unavailable"}
                </text>
              </svg>
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Trend: <span style={{ color: pulseColor }}>
                  {latestView.trendVisibility.trendDirection === "up" ? "↑ Improving"
                    : latestView.trendVisibility.trendDirection === "down" ? "↓ Declining"
                    : "→ Steady"}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Signal confidence: <strong>{health.confidence}</strong>
              </div>
              {(liveSignalState !== "live" || isStaleLiveSignal) && (
                <div style={{ fontSize: "0.78rem", color: "var(--accent-yellow)", marginTop: "0.25rem" }}>
                  {isStaleLiveSignal
                    ? "Live signal is stale; waiting for fresh YOLO-driven updates."
                    : "Insufficient live engagement signals right now."}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Teacher Suggestions */}
          <GlassCard title="Suggestions">
            {latestView.teacherActionArea.immediateRecommendations.length === 0 ? (
              <p style={{ fontSize: "0.9rem" }}>✅ No immediate actions needed.</p>
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {latestView.teacherActionArea.immediateRecommendations.map((rec: TeacherRecommendation, idx: number) => (
                  <li key={idx} style={{
                    padding: "0.75rem",
                    background: "rgba(59, 130, 246, 0.1)",
                    borderRadius: "8px",
                    borderLeft: "3px solid var(--accent-blue)",
                    fontSize: "0.875rem",
                  }}>
                    <div style={{ fontWeight: "600", color: "var(--accent-blue)", marginBottom: "0.25rem" }}>
                      {rec.category.toUpperCase()}
                    </div>
                    {rec.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* Cognitive Insight */}
          {latestView.cognitiveInsightArea.latest && (
            <GlassCard title="Cognitive Insight">
              <p style={{ fontSize: "0.9rem", fontStyle: "italic", lineHeight: "1.6" }}>
                "{latestView.cognitiveInsightArea.latest}"
              </p>
            </GlassCard>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Engagement Trend Chart (SVG line chart) */}
          <GlassCard title="Engagement Trend">
            {latestView.trendArea.engagementSeries.length < 2 ? (
              <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p>Collecting data... (needs at least 2 cycles)</p>
              </div>
            ) : (() => {
              const series = latestView.trendArea.engagementSeries;
              const W = 500; const H = 120;
              const maxVal = 1; const minVal = 0;
              const pts = series.map((pt, i) => {
                const x = (i / (series.length - 1)) * W;
                const y = H - ((pt.value - minVal) / (maxVal - minVal)) * H;
                return `${x},${y}`;
              }).join(" ");
              return (
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "120px" }}>
                  <defs>
                    <linearGradient id="eng-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points={pts} fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            })()}
          </GlassCard>

          {/* All Students Engagement */}
          <GlassCard title="All Students — Live Engagement">
            {latestView.allStudentEngagement.length === 0 ? (
              <p style={{ fontSize: "0.9rem" }}>⏳ Waiting for students to join...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {latestView.allStudentEngagement
                  .sort((a, b) => (b.latestEngagement ?? -1) - (a.latestEngagement ?? -1))
                  .map((s) => {
                    const score = s.latestEngagement ?? null;
                    const pct = score !== null ? Math.round(score * 100) : null;
                    const barColor = score === null ? "var(--text-secondary)" : score > 0.7 ? "var(--accent-green)" : score > 0.4 ? "var(--accent-yellow)" : "var(--accent-red)";
                    return (
                      <div key={s.studentId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px" }}>
                        <div style={{ flex: "0 0 120px", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.studentName}
                        </div>
                        <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct ?? 0}%`, background: barColor, borderRadius: "4px", transition: "width 0.7s ease" }} />
                        </div>
                        <span style={{ flex: "0 0 38px", fontSize: "0.8rem", color: barColor, textAlign: "right", fontWeight: 600 }}>
                          {pct !== null ? `${pct}%` : "—"}
                        </span>
                        {s.latestEngagementCategory && (
                          <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "8px", background: `${barColor}22`, color: barColor }}>
                            {s.latestEngagementCategory}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </GlassCard>

          {/* Flagged Students */}
          <GlassCard title="Students Needing Attention">
            {latestView.flaggedStudentInspection.length === 0 ? (
              <p style={{ fontSize: "0.9rem" }}>✅ All students appear engaged.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {latestView.flaggedStudentInspection.map((student: FlaggedStudentInspectionItem) => (
                  <div key={student.studentId} style={{
                    padding: "1rem",
                    background: "rgba(239, 68, 68, 0.08)",
                    borderRadius: "10px",
                    borderLeft: "3px solid var(--accent-red)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <h4 style={{ color: "var(--text-primary)" }}>{student.studentName}</h4>
                      {student.latestEngagement !== undefined && (
                        <span style={{
                          fontSize: "0.8rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "10px",
                          background: student.latestEngagement < 0.4 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                        }}>
                          {student.latestEngagementBand ?? Math.round(student.latestEngagement * 100)} / 100
                          {student.latestEngagementCategory ? ` • ${student.latestEngagementCategory}` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {student.reasons.map((r: string, i: number) => (
                        <div key={i} style={{ marginBottom: "0.1rem" }}>• {r}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* System Health */}
          {health.degraded && (
            <GlassCard title="System Health Warnings">
              {health.reasons.map((reason, i) => (
                <div key={i} style={{ fontSize: "0.85rem", color: "var(--accent-yellow)", marginBottom: "0.25rem" }}>
                  ⚠ {reason}
                </div>
              ))}
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
