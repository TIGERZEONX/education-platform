import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { bootstrapTeacherDashboard } from "./bootstrap";
import App from "./App";
import "../../../shared-ui/styles/index.css";
import type { TeacherClassDecisionSupportView } from "./decision-support-model";
import { parseIncomingPacket } from "../../../../backend/services/realtime-messaging/src";

const SERVER_URL = "http://localhost:4000";
const CLASS_ID = "class-101";

// Connect to the real backend server as a teacher client
const socket = io(SERVER_URL, {
  query: { role: "teacher", classId: CLASS_ID },
  transports: ["websocket"],
});

// Bootstrap teacher dashboard context with a stub history reader
// (actual history is loaded via REST API on mount)
const teacherContext = bootstrapTeacherDashboard({
  classId: CLASS_ID,
  clientId: `teacher-${CLASS_ID}-dashboard`,
  historyReader: {
    listRecentCycles: () => [],
    listRecentInterventions: () => [],
  },
});

import { TeacherContext } from "./context";

function RootProvider() {
  const [decisionView, setDecisionView] = useState<TeacherClassDecisionSupportView | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("[teacher-dashboard] connected to server:", socket.id);
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[teacher-dashboard] disconnected from server");
      setConnected(false);
    });

    // Receive all backend-derived MQTT packets (class-pulse, cognitive-map, teacher-nudges)
    socket.on("backend:message", (data: { topic: string; payload: string }) => {
      try {
        console.log("[teacher-dashboard] ← server:", data.topic);
        teacherContext.consumeRawMqttMessage(data.topic, data.payload);
        setDecisionView(teacherContext.decisionSupportView());
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        console.error("[teacher-dashboard] failed to process backend message", e);
      }
    });

    // Load history on connect
    socket.on("backend:history", (data: { cycles: unknown[] }) => {
      console.log("[teacher-dashboard] received history:", data.cycles.length, "cycles");
      // History cycles can be used for chart data — stored in state
    });

    // Also poll REST API for history on mount
    fetch(`${SERVER_URL}/api/session/${CLASS_ID}/history?limit=20`)
      .then((r) => r.json())
      .then((data) => {
        console.log("[teacher-dashboard] REST history loaded:", data?.cycles?.length ?? 0, "cycles");
      })
      .catch((e) => console.error("[teacher-dashboard] failed to load history:", e));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("backend:message");
      socket.off("backend:history");
    };
  }, []);

  return (
    <React.StrictMode>
      <TeacherContext.Provider value={teacherContext}>
        <App latestView={decisionView} connected={connected} lastUpdated={lastUpdated} />
      </TeacherContext.Provider>
    </React.StrictMode>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<RootProvider />);
}
