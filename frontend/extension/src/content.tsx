declare const chrome: any;

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import Draggable from "react-draggable";

import StudentApp from "../../student-client/src/app/App";
import TeacherApp from "../../teacher-dashboard/src/app/App";
import { bootstrapStudentClient } from "../../student-client/src/app/bootstrap";
import { bootstrapTeacherDashboard } from "../../teacher-dashboard/src/app/bootstrap";
import type { TeacherClassDecisionSupportView, FlaggedStudentInspectionItem } from "../../teacher-dashboard/src/app/decision-support-model";

const CLASS_ID = "class-101";
const API_BASE = "http://localhost:4000";

// Import true, pure Contexts without activating side-effects
import { StudentContext } from "../../student-client/src/app/context";
import { TeacherContext } from "../../teacher-dashboard/src/app/context";

// --- Types ---
interface TopicMarker { id: string; label: string; timestampSec: number; createdAt: string; }
interface Recording { recordingId: string; classId: string; createdAt: string; fileSize: number; markers: TopicMarker[]; }

// --- UI Helpers ---
const dragBarStyles = {
  background: "#312e81",
  padding: "8px 12px",
  color: "white",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderTopLeftRadius: "12px",
  borderTopRightRadius: "12px",
  fontWeight: "bold" as const,
  fontSize: "14px",
  userSelect: "none" as const
};

const btnStyle = {
  background: "transparent", border: "none", color: "white", cursor: "pointer", 
  marginLeft: "10px", fontSize: "16px", fontWeight: "bold" as const
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode, name: string }, { hasError: boolean, error: any }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { 
    console.error(`[CognitivePulse] ${this.props.name} Crash:`, error, errorInfo); 
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "15px", background: "#7f1d1d", color: "white", borderRadius: "8px", fontSize: "11px", border: "2px solid #ef4444" }}>
          <h4 style={{ margin: "0 0 8px 0" }}>⚠️ {this.props.name} Error</h4>
          <p style={{ margin: "0 0 10px 0", color: "#fca5a5" }}>{this.state.error?.message || "Internal React Error"}</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => this.setState({ hasError: false, error: null })} style={{ background: "white", color: "#7f1d1d", border: "none", padding: "4px 8px", cursor: "pointer", borderRadius: "4px" }}>Retry</button>
            <button onClick={() => window.location.reload()} style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none", padding: "4px 8px", cursor: "pointer", borderRadius: "4px" }}>Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- RECORDING LIBRARY (Student view) ---
function RecordingLibrary({ classId }: { classId: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/recordings/${classId}`)
      .then(r => r.json())
      .then(d => { setRecordings(d.recordings ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId]);

  const seekTo = (sec: number) => {
    if (videoRef.current) { videoRef.current.currentTime = sec; videoRef.current.play(); }
  };

  if (loading) return <div style={{ color: "#9ca3af", fontSize: "13px", padding: "8px" }}>Loading recordings...</div>;
  if (recordings.length === 0) return <div style={{ color: "#9ca3af", fontSize: "13px", padding: "8px" }}>No recordings yet.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {!selected ? (
        recordings.map(r => (
          <div key={r.recordingId} onClick={() => setSelected(r)} style={{ padding: "10px", background: "rgba(79,70,229,0.15)", borderRadius: "8px", cursor: "pointer", border: "1px solid rgba(79,70,229,0.3)" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#818cf8" }}>📹 Session Recording</div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "3px" }}>
              {new Date(r.createdAt).toLocaleString()} · {r.markers.length} topics
            </div>
          </div>
        ))
      ) : (
        <div>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", marginBottom: "8px", fontSize: "13px" }}>← Back to list</button>
          <video ref={videoRef} src={`${API_BASE}/api/recordings/file/${selected.recordingId}`} controls style={{ width: "100%", borderRadius: "8px", background: "#000" }} />
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#c4b5fd", marginBottom: "6px" }}>📌 Topics</div>
            {selected.markers.length === 0 ? (
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>No topics marked yet.</div>
            ) : (
              selected.markers.sort((a, b) => a.timestampSec - b.timestampSec).map(m => (
                <div key={m.id} onClick={() => seekTo(m.timestampSec)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "rgba(139,92,246,0.15)", borderRadius: "6px", cursor: "pointer", marginBottom: "4px", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <span style={{ fontSize: "12px", color: "#e9d5ff" }}>📍 {m.label}</span>
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>{Math.floor(m.timestampSec / 60)}:{String(Math.round(m.timestampSec % 60)).padStart(2, "0")}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- TEACHER RECORDING MANAGER (Teacher view in dashboard) ---
function TeacherRecordingManager({ classId }: { classId: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [markerLabel, setMarkerLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fetchRecordings = useCallback(() => {
    fetch(`${API_BASE}/api/recordings/${classId}`)
      .then(r => r.json())
      .then(d => { setRecordings(d.recordings ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId]);

  useEffect(() => { fetchRecordings(); }, [fetchRecordings]);

  const addMarker = async () => {
    if (!selected || !markerLabel.trim() || !videoRef.current) return;
    const timestampSec = videoRef.current.currentTime;
    await fetch(`${API_BASE}/api/recordings/${selected.recordingId}/markers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: markerLabel.trim(), timestampSec }),
    });
    setMarkerLabel("");
    // Refresh selected recording markers
    const resp = await fetch(`${API_BASE}/api/recordings/${selected.recordingId}/markers`);
    const data = await resp.json();
    setSelected(prev => prev ? { ...prev, markers: data.markers ?? [] } : null);
  };

  if (loading) return <div style={{ color: "#9ca3af", fontSize: "13px" }}>Loading recordings...</div>;
  if (recordings.length === 0) return <div style={{ color: "#9ca3af", fontSize: "13px" }}>No recordings yet. Use the Record button to capture a session.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {!selected ? (
        recordings.map(r => (
          <div key={r.recordingId} onClick={() => setSelected(r)} style={{ padding: "10px", background: "rgba(190,24,93,0.15)", borderRadius: "8px", cursor: "pointer", border: "1px solid rgba(190,24,93,0.3)" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#fb7185" }}>📹 Session Recording</div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "3px" }}>
              {new Date(r.createdAt).toLocaleString()} · {r.markers.length} topics marked
            </div>
          </div>
        ))
      ) : (
        <div>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#fb7185", cursor: "pointer", marginBottom: "8px", fontSize: "13px" }}>← Back to list</button>
          <video ref={videoRef} src={`${API_BASE}/api/recordings/file/${selected.recordingId}`} controls style={{ width: "100%", borderRadius: "8px", background: "#000" }} />
          {/* Mark topic */}
          <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
            <input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)} placeholder="Topic name…"
              style={{ flex: 1, padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.3)", color: "white", fontSize: "12px", outline: "none" }} />
            <button onClick={addMarker}
              style={{ padding: "6px 10px", background: "linear-gradient(135deg,#be185d,#9f1239)", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
              📍 Mark
            </button>
          </div>
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#fb7185", marginBottom: "4px" }}>Topics</div>
            {selected.markers.sort((a, b) => a.timestampSec - b.timestampSec).map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: "rgba(190,24,93,0.1)", borderRadius: "5px", marginBottom: "3px" }}>
                <span style={{ fontSize: "12px", color: "#fda4af" }}>📍 {m.label}</span>
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>{Math.floor(m.timestampSec / 60)}:{String(Math.round(m.timestampSec % 60)).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- STUDENT ENGAGEMENT LIST (in teacher overlay) ---
function StudentEngagementList({ decisionView }: { decisionView: TeacherClassDecisionSupportView | null }) {
  if (!decisionView) return <div style={{ color: "#9ca3af", fontSize: "12px" }}>Waiting for students…</div>;
  const allStudents = Object.values(decisionView.flaggedStudentInspection);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {allStudents.length === 0 && <div style={{ color: "#9ca3af", fontSize: "12px" }}>No students active.</div>}
      {allStudents.map((s: FlaggedStudentInspectionItem) => {
        const score = s.latestEngagement ?? null;
        const pct = score !== null ? Math.round(score * 100) : null;
        const color = score === null ? "#9ca3af" : score > 0.7 ? "#4ade80" : score > 0.4 ? "#facc15" : "#f87171";
        return (
          <div key={s.studentId} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }}>
            <span style={{ fontSize: "11px", color: "white", flex: 1, fontWeight: 500 }}>{s.studentName}</span>
            {pct !== null ? (
              <>
                <div style={{ flex: 2, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.5s ease" }} />
                </div>
                <span style={{ fontSize: "11px", color, minWidth: "32px", textAlign: "right" }}>{pct}%</span>
              </>
            ) : (
              <span style={{ fontSize: "10px", color: "#9ca3af" }}>No data</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- STUDENT WRAPPER ---
function ExtensionStudentApp({ onClose, studentName }: { onClose: () => void, studentName: string }) {
  const STUDENT_ID = studentName.toLowerCase().replace(/\s+/g, '-');
  const [connected, setConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "recordings">("live");
  const nodeRef = useRef(null);

  const [studentContext] = useState(() => {
    const ctx = bootstrapStudentClient({
      classId: CLASS_ID,
      studentId: STUDENT_ID,
      studentName: studentName,
      sessionId: `${CLASS_ID}-live-session`,
      clientId: `student-${CLASS_ID}-${STUDENT_ID}`,
      publishing: {
        studentEngagementIntervalMs: 5000,
        feedbackEventTrigger: "on-user-interaction",
        messageRequirements: { requireIdentifiers: true, requireTypedValue: true, requireTimestamp: true },
      },
      onPublish: (packet) => {
        try {
          if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
              type: "EMIT_EVENT",
              payload: { event: "student:event", data: { topic: packet.topic, payload: packet.payload } }
            });
          }
        } catch (e) { console.error("[CognitivePulse] Publish failed", e); }
      },
      cameraAccessAdapter: {
        requestAccess: async () => { try { await navigator.mediaDevices.getUserMedia({ video: true }); return "granted"; } catch { return "denied"; } },
        stopCamera: () => {},
      },
      feedbackMinIntervalMs: 1500,
    });
    return ctx;
  });

  const safeSendMessage = (msg: any) => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(msg, () => {
          if (chrome.runtime.lastError) {
            console.warn("[CognitivePulse] Background bridge error:", chrome.runtime.lastError.message);
          }
        });
      }
    } catch (e) { console.error("[CognitivePulse] Message failed", e); }
  };

  useEffect(() => {
    studentContext.confirmRealName(studentName);
    const handleMessage = (message: any) => {
      if (message.type === "SOCKET_CONNECTED") { setConnected(true); studentContext.setConnectionHealth("healthy"); }
      if (message.type === "SOCKET_DISCONNECTED") { setConnected(false); studentContext.markTemporarilyDisconnected(); }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    safeSendMessage({ type: "INIT_SOCKET", payload: { role: "student", classId: CLASS_ID, studentId: STUDENT_ID } });
    studentContext.joinClassSession();
    return () => { chrome.runtime.onMessage.removeListener(handleMessage); studentContext.leaveClassSession(); };
  }, [studentContext, studentName, STUDENT_ID]);

  const tabStyle = (active: boolean) => ({
    flex: 1, padding: "6px 0", background: active ? "rgba(79,70,229,0.3)" : "transparent",
    border: "none", color: active ? "white" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: active ? 600 : 400, borderRadius: "6px"
  });

  return (
    <Draggable nodeRef={nodeRef}>
      <div ref={nodeRef} style={{ position: "fixed", bottom: "20px", left: "20px", zIndex: 99999, width: "350px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", borderRadius: "12px", background: "#1e1e2d", cursor: "move" }}>
        <div style={dragBarStyles}>
          <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            👩‍🎓 {studentName}
            <span style={{ fontSize: "10px", color: connected ? "#4ade80" : "#f87171" }}>●</span>
          </span>
          <div>
            <button onClick={() => setIsMinimized(!isMinimized)} style={btnStyle}>{isMinimized ? "⛶" : "−"}</button>
            <button onClick={onClose} style={btnStyle}>✕</button>
          </div>
        </div>
        {!isMinimized && (
          <div style={{ background: "#11111a", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px", overflow: "hidden" }}>
            {/* Tabs */}
            <div style={{ display: "flex", padding: "8px 8px 0", gap: "4px" }}>
              <button style={tabStyle(activeTab === "live")} onClick={() => setActiveTab("live")}>📡 Live</button>
              <button style={tabStyle(activeTab === "recordings")} onClick={() => setActiveTab("recordings")}>📹 Recordings</button>
            </div>
            {activeTab === "live" ? (
              <div style={{ height: "420px", overflow: "hidden", padding: "12px" }}>
                <ErrorBoundary name="StudentApp">
                  <StudentContext.Provider value={studentContext}>
                    <StudentApp />
                  </StudentContext.Provider>
                </ErrorBoundary>
              </div>
            ) : (
              <div style={{ maxHeight: "420px", overflow: "auto", padding: "12px" }}>
                <RecordingLibrary classId={CLASS_ID} />
              </div>
            )}
          </div>
        )}
      </div>
    </Draggable>
  );
}

// --- TEACHER WRAPPER ---
function ExtensionTeacherApp({ onClose }: { onClose: () => void }) {
  const [decisionView, setDecisionView] = useState<TeacherClassDecisionSupportView | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "recordings">("dashboard");
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nodeRef = useRef(null);

  const [teacherContext] = useState(() => bootstrapTeacherDashboard({
    classId: CLASS_ID,
    clientId: `teacher-${CLASS_ID}-dashboard`,
    historyReader: { listRecentCycles: () => [], listRecentInterventions: () => [] },
  }));

  useEffect(() => {
    const safeSendMessage = (msg: any) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage(msg, () => {
            if (chrome.runtime.lastError) console.warn("[CognitivePulse] SendMessage error:", chrome.runtime.lastError.message);
          });
        }
      } catch (e) { console.error("[CognitivePulse] Failed to send message", e); }
    };

    safeSendMessage({ type: "INIT_SOCKET", payload: { role: "teacher", classId: CLASS_ID } });

    const listener = (message: any) => {
      if (message.type === "SOCKET_CONNECTED") setConnected(true);
      if (message.type === "SOCKET_DISCONNECTED") setConnected(false);
      if (message.type === "BACKEND_MESSAGE") {
        const data = message.payload;
        try {
          teacherContext.consumeRawMqttMessage(data.topic, data.payload);
          setDecisionView(teacherContext.decisionSupportView());
          setLastUpdated(new Date().toLocaleTimeString());
        } catch (e) { console.error("Failed to parse", e); }
      }
      if (message.type === "BACKEND_HISTORY") {
        const { cycles } = message.payload;
        if (cycles && cycles.length > 0) {
          cycles.forEach((cycle: any) => { teacherContext.consumeRawMqttMessage(cycle.topic, cycle.payload); });
          setDecisionView(teacherContext.decisionSupportView());
          setLastUpdated(new Date().toLocaleTimeString());
        }
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
    }
    return () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(listener);
      }
    };
  }, [teacherContext]);

  const startRecording = async () => {
    try {
      setRecordingStatus("Requesting screen access…");
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t: any) => t.stop());
        setRecordingStatus("Uploading recording…");
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const form = new FormData();
        form.append("video", blob, "recording.webm");
        form.append("classId", CLASS_ID);
        try {
          await fetch(`${API_BASE}/api/recordings/upload`, { method: "POST", body: form });
          setRecordingStatus("✅ Saved! View in Recordings tab.");
        } catch {
          setRecordingStatus("❌ Upload failed.");
        }
        setTimeout(() => setRecordingStatus(""), 4000);
        setIsRecording(false);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingStatus("🔴 Recording…");
    } catch (e) {
      setRecordingStatus("Screen access denied.");
      setTimeout(() => setRecordingStatus(""), 3000);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const tabStyle = (active: boolean) => ({
    flex: 1, padding: "6px 0", background: active ? "rgba(190,24,93,0.3)" : "transparent",
    border: "none", color: active ? "white" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: active ? 600 : 400, borderRadius: "6px"
  });

  return (
    <Draggable nodeRef={nodeRef}>
      <div ref={nodeRef} style={{ position: "fixed", top: "20px", right: "20px", zIndex: 99999, width: "620px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", borderRadius: "12px", background: "#1e1e2d", border: "1px solid rgba(255,255,255,0.1)", cursor: "move" }}>
        <div style={{...dragBarStyles, background: "#831843"}}>
          <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            👨‍🏫 Live Classroom Dashboard
            <span style={{ fontSize: "10px", color: connected ? "#4ade80" : "#f87171" }}>●</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {/* Record button */}
            {!isRecording ? (
              <button onClick={startRecording} title="Start Recording"
                style={{ padding: "4px 10px", background: "rgba(239,68,68,0.2)", border: "1px solid #ef4444", borderRadius: "6px", color: "#ef4444", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                ⏺ Record
              </button>
            ) : (
              <button onClick={stopRecording} title="Stop Recording"
                style={{ padding: "4px 10px", background: "rgba(239,68,68,0.8)", border: "1px solid #ef4444", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "12px", fontWeight: 600, animation: "pulse 1s infinite" }}>
                ⏹ Stop
              </button>
            )}
            <button onClick={() => setIsMinimized(!isMinimized)} style={btnStyle}>{isMinimized ? "⛶" : "−"}</button>
            <button onClick={onClose} style={btnStyle}>✕</button>
          </div>
        </div>
        {recordingStatus && (
          <div style={{ background: "rgba(239,68,68,0.15)", borderBottom: "1px solid rgba(239,68,68,0.3)", padding: "4px 12px", fontSize: "12px", color: "#fca5a5" }}>
            {recordingStatus}
          </div>
        )}
        {!isMinimized && (
          <div style={{ borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px", overflow: "hidden" }}>
            {/* Tabs */}
            <div style={{ display: "flex", padding: "8px 8px 0", gap: "4px", background: "#1e1e2d" }}>
              <button style={tabStyle(activeTab === "dashboard")} onClick={() => setActiveTab("dashboard")}>📊 Dashboard</button>
              <button style={tabStyle(activeTab === "students")} onClick={() => setActiveTab("students")}>👥 Students</button>
              <button style={tabStyle(activeTab === "recordings")} onClick={() => setActiveTab("recordings")}>📹 Recordings</button>
            </div>
            {activeTab === "dashboard" && (
              <div style={{ height: "70vh", overflowY: "auto", position: "relative" }}>
                <TeacherContext.Provider value={teacherContext}>
                  <TeacherApp latestView={decisionView} connected={connected} lastUpdated={lastUpdated} />
                </TeacherContext.Provider>
              </div>
            )}
            {activeTab === "students" && (
              <div style={{ padding: "12px", maxHeight: "70vh", overflowY: "auto" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#f472b6", marginBottom: "10px" }}>
                  Live Engagement — All Students {decisionView ? `(${decisionView.classPulse.activeStudentCount} active)` : ""}
                </div>
                <StudentEngagementList decisionView={decisionView} />
              </div>
            )}
            {activeTab === "recordings" && (
              <div style={{ padding: "12px", maxHeight: "70vh", overflowY: "auto" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#fb7185", marginBottom: "10px" }}>📹 Session Recordings</div>
                <TeacherRecordingManager classId={CLASS_ID} />
              </div>
            )}
          </div>
        )}
      </div>
    </Draggable>
  );
}

// --- GATEWAY MENU ---
function Gateway() {
  const [view, setView] = useState<"menu" | "login-student" | "login-teacher" | "student" | "teacher">("menu");
  const [formInput, setFormInput] = useState("");
  const [nameInput, setNameInput] = useState("Aarav Sharma");
  const [errorMsg, setErrorMsg] = useState("");
  const nodeRef = useRef(null);

  const handleTeacherLogin = () => {
    if (formInput === "teacher123") { setView("teacher"); setErrorMsg(""); }
    else { setErrorMsg("Incorrect Teacher Passcode"); }
  };

  const handleStudentLogin = () => {
    if (formInput === "student123" && nameInput.trim().length >= 2) { setView("student"); setErrorMsg(""); }
    else { setErrorMsg("Incorrect Passcode or Name too short"); }
  };

  if (view === "student") return <ExtensionStudentApp onClose={() => setView("menu")} studentName={nameInput} />;
  if (view === "teacher") return <ExtensionTeacherApp onClose={() => setView("menu")} />;

  const inputStyle = { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.3)", color: "white", outline: "none", boxSizing: "border-box" as const };
  const btnSecondary = { background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "14px", marginTop: "12px", padding: "8px 0" };

  return (
    <Draggable nodeRef={nodeRef}>
      <div ref={nodeRef} style={{ position: "fixed", top: "20px", right: "20px", zIndex: 99999, background: "#1e1e2d", padding: "16px 24px 24px 24px", borderRadius: "14px", color: "white", border: "1px solid rgba(255,255,255,0.15)", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 15px 40px rgba(0,0,0,0.6)", width: "320px", cursor: "move" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px", marginBottom: "4px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, letterSpacing: "0.5px" }}>CognitivePulse</h3>
          <span style={{ opacity: 0.5 }}>☷</span>
        </div>
        {view === "menu" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
            <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#9ca3af", lineHeight: 1.4 }}>Select your role to join the session analytics overlay.</p>
            <button style={{ padding: "12px", background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "15px" }}
              onClick={() => { setView("login-student"); setFormInput(""); setErrorMsg(""); }}>👩‍🎓 Enter as Student</button>
            <button style={{ padding: "12px", background: "linear-gradient(135deg, #be185d 0%, #9f1239 100%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "15px" }}
              onClick={() => { setView("login-teacher"); setFormInput(""); setErrorMsg(""); }}>👨‍🏫 Enter as Teacher</button>
          </div>
        )}
        {view === "login-student" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#818cf8" }}>Student Login</div>
            <input type="text" placeholder="Your Display Name" value={nameInput} onChange={e => setNameInput(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Passcode (student123)" value={formInput} onChange={e => setFormInput(e.target.value)} style={inputStyle} />
            {errorMsg && <div style={{ color: "#f87171", fontSize: "13px", fontWeight: 500 }}>{errorMsg}</div>}
            <button style={{ padding: "12px", background: "#4f46e5", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }} onClick={handleStudentLogin}>Join Session</button>
            <button style={btnSecondary} onClick={() => setView("menu")}>← Back to Menu</button>
          </div>
        )}
        {view === "login-teacher" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#f472b6" }}>Educator Area</div>
            <input type="password" placeholder="Passcode (teacher123)" value={formInput} onChange={e => setFormInput(e.target.value)} style={inputStyle} />
            {errorMsg && <div style={{ color: "#f87171", fontSize: "13px", fontWeight: 500 }}>{errorMsg}</div>}
            <button style={{ padding: "12px", background: "#be185d", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }} onClick={handleTeacherLogin}>Access Dashboard</button>
            <button style={btnSecondary} onClick={() => setView("menu")}>← Back to Menu</button>
          </div>
        )}
      </div>
    </Draggable>
  );
}

// --- INJECTION BOOTSTRAP ---
function injectExtension() {
  const containerId = "cognitivepulse-extension-root";
  if (document.getElementById(containerId)) return;
  const container = document.createElement("div");
  container.id = containerId;
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <ErrorBoundary name="Gateway">
      <Gateway />
    </ErrorBoundary>
  );
}
injectExtension();
