declare const chrome: any;

import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Draggable from "react-draggable";

import StudentApp from "../../student-client/src/app/App";
import TeacherApp from "../../teacher-dashboard/src/app/App";
import { bootstrapStudentClient } from "../../student-client/src/app/bootstrap";
import { bootstrapTeacherDashboard } from "../../teacher-dashboard/src/app/bootstrap";
import type { TeacherClassDecisionSupportView } from "../../teacher-dashboard/src/app/decision-support-model";

const CLASS_ID = "class-101";

// Import true, pure Contexts without activating side-effects
import { StudentContext } from "../../student-client/src/app/context";
import { TeacherContext } from "../../teacher-dashboard/src/app/context";

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

// --- STUDENT WRAPPER ---
function ExtensionStudentApp({ onClose, studentName }: { onClose: () => void, studentName: string }) {
  const STUDENT_ID = studentName.toLowerCase().replace(/\s+/g, '-');
  const [connected, setConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const nodeRef = useRef(null);

  console.log(`[CognitivePulse] Mounting ExtensionStudentApp for ${studentName}`);

  const [studentContext] = useState(() => {
    console.log(`[CognitivePulse] Bootstrapping student client for ${STUDENT_ID}`);
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
    // 1. Confirm identity
    console.log("[CognitivePulse] Confirming identity:", studentName);
    studentContext.confirmRealName(studentName);

    // 2. Setup socket bridge listener
    const handleMessage = (message: any) => {
      console.log("[CognitivePulse] Received chrome message:", message.type);
      if (message.type === "SOCKET_CONNECTED") {
        setConnected(true);
        studentContext.setConnectionHealth("healthy");
      }
      if (message.type === "SOCKET_DISCONNECTED") {
        setConnected(false);
        studentContext.markTemporarilyDisconnected();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    // 3. Init socket in background
    safeSendMessage({ 
      type: "INIT_SOCKET", 
      payload: { role: "student", classId: CLASS_ID, studentId: STUDENT_ID } 
    });

    // 4. Join session
    console.log("[CognitivePulse] Joining session...");
    studentContext.joinClassSession();

    // 5. Global Diagnostic Hook
    (window as any).cpTestSignal = () => {
      console.log("[CognitivePulse] Manual test signal triggered");
      studentContext.publishEngagementHeartbeat();
    };

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      studentContext.leaveClassSession();
    };
  }, [studentContext, studentName, STUDENT_ID]);

  return (
    <Draggable nodeRef={nodeRef}>
      <div ref={nodeRef} style={{ position: "fixed", bottom: "20px", left: "20px", zIndex: 99999, width: "350px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", borderRadius: "12px", background: "#1e1e2d", cursor: "move" }}>
        <div style={dragBarStyles}>
          <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            👩‍🎓 Student Space ({studentName}) 
            <span style={{ fontSize: "10px", color: connected ? "#4ade80" : "#f87171" }}>●</span>
          </span>
          <div>
            <button onClick={() => setIsMinimized(!isMinimized)} style={btnStyle}>{isMinimized ? "⛶" : "−"}</button>
            <button onClick={onClose} style={btnStyle}>✕</button>
          </div>
        </div>
        {!isMinimized && (
          <div style={{ height: "450px", overflow: "hidden", padding: "12px", background: "#11111a" }}>
            <ErrorBoundary name="StudentApp">
              <StudentContext.Provider value={studentContext}>
                <StudentApp />
              </StudentContext.Provider>
            </ErrorBoundary>
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
            if (chrome.runtime.lastError) {
              console.warn("[CognitivePulse] SendMessage error:", chrome.runtime.lastError.message);
            }
          });
        }
      } catch (e) { console.error("[CognitivePulse] Failed to send message", e); }
    };

    safeSendMessage({ 
      type: "INIT_SOCKET", 
      payload: { role: "teacher", classId: CLASS_ID } 
    });

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
          cycles.forEach((cycle: any) => {
             teacherContext.consumeRawMqttMessage(cycle.topic, cycle.payload);
          });
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

  return (
    <Draggable nodeRef={nodeRef}>
      <div ref={nodeRef} style={{ position: "fixed", top: "20px", right: "20px", zIndex: 99999, width: "600px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", borderRadius: "12px", background: "#1e1e2d", border: "1px solid rgba(255,255,255,0.1)", cursor: "move" }}>
        <div style={{...dragBarStyles, background: "#831843"}}>
          <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>👨‍🏫 Live Classroom Dashboard</span>
          <div>
            <button onClick={() => setIsMinimized(!isMinimized)} style={btnStyle}>{isMinimized ? "⛶" : "−"}</button>
            <button onClick={onClose} style={btnStyle}>✕</button>
          </div>
        </div>
        {!isMinimized && (
          <div style={{ height: "70vh", overflowY: "auto", position: "relative" }}>
            <TeacherContext.Provider value={teacherContext}>
              <TeacherApp latestView={decisionView} connected={connected} lastUpdated={lastUpdated} />
            </TeacherContext.Provider>
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
    if (formInput === "teacher123") {
      setView("teacher");
      setErrorMsg("");
    } else { setErrorMsg("Incorrect Teacher Passcode"); }
  };

  const handleStudentLogin = () => {
    if (formInput === "student123" && nameInput.trim().length >= 2) {
      setView("student");
      setErrorMsg("");
    } else { setErrorMsg("Incorrect Passcode or Name too short"); }
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
            <button 
              style={{ padding: "12px", background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "15px" }}
              onClick={() => { setView("login-student"); setFormInput(""); setErrorMsg(""); }}
            >👩‍🎓 Enter as Student</button>
            <button 
              style={{ padding: "12px", background: "linear-gradient(135deg, #be185d 0%, #9f1239 100%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "15px" }}
              onClick={() => { setView("login-teacher"); setFormInput(""); setErrorMsg(""); }}
            >👨‍🏫 Enter as Teacher</button>
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
