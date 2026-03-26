import React from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { bootstrapStudentClient } from "./bootstrap";
import App from "./App";
import "../../../shared-ui/styles/index.css";

const SERVER_URL = "http://localhost:4000";
const CLASS_ID = "class-101";
const STUDENT_ID = "aarav-sharma";
const STUDENT_NAME = "Aarav Sharma";

// Connect to the real backend server
const socket = io(SERVER_URL, {
  query: { role: "student", classId: CLASS_ID, studentId: STUDENT_ID },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("[student-client] connected to server:", socket.id);
});

socket.on("disconnect", () => {
  console.log("[student-client] disconnected from server");
});

// Bootstrap the student client — onPublish sends via socket instead of in-process broker
const studentContext = bootstrapStudentClient({
  classId: CLASS_ID,
  studentId: STUDENT_ID,
  studentName: STUDENT_NAME,
  sessionId: `${CLASS_ID}-live-session`,
  clientId: `student-${CLASS_ID}-${STUDENT_ID}`,
  publishing: {
    studentEngagementIntervalMs: 5000,
    feedbackEventTrigger: "on-user-interaction",
    messageRequirements: {
      requireIdentifiers: true,
      requireTypedValue: true,
      requireTimestamp: true,
    },
  },
  onPublish: (packet) => {
    // Send every MQTT packet to the real server via Socket.io
    socket.emit("student:event", { topic: packet.topic, payload: packet.payload });
    console.log("[student-client] → server:", packet.topic);
  },
  cameraAccessAdapter: {
    requestAccess: async () => {
      // In browser: request real camera access
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        console.warn("[student-client] camera api unavailable", {
          isSecureContext: window.isSecureContext,
        });
        return "unavailable";
      }

      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        return "granted";
      } catch (error) {
        console.warn("[student-client] camera request denied", {
          errorName: error instanceof DOMException ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
          isSecureContext: window.isSecureContext,
        });
        return "denied";
      }
    },
    stopCamera: () => {
      console.log("[student-client] camera stopped");
    },
  },
  feedbackMinIntervalMs: 1500,
  engagementAnalysis: {
    endpoint: `${SERVER_URL}/api/analyze-engagement`,
    minIntervalMs: 65,
    requestTimeoutMs: 700,
  },
});

studentContext.confirmRealName(STUDENT_NAME);
studentContext.joinClassSession();

import { StudentContext } from "./context";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <StudentContext.Provider value={studentContext}>
        <App />
      </StudentContext.Provider>
    </React.StrictMode>
  );
}
