import assert from "assert";
import { buildStudentLaptopFirstView } from "../../../frontend/student-client/src/app/student-interface-model";

const view = buildStudentLaptopFirstView(
  {
    sessionPhase: "live",
    identityConfirmed: true,
    visibleStudentName: "Aarav Sharma",
    activeSessionId: "class-101-live-session",
    connectionHealth: "healthy",
    queuedOutboundMessages: 0,
    operationalState: "active",
    cameraStatus: "active",
    joined: true,
    lastEngagementScore: 0.72,
  },
  {
    operationalState: "camera-active",
    cameraStatus: "active",
    helpText: "help",
  },
  {
    engagementScore: 0.72,
    signalQuality: "stable",
  },
);

assert.strictEqual(view.studentIdentity, "Aarav Sharma");
assert.strictEqual(view.fallbackMode.mode, "full-signals");
assert.ok(view.supportMessage.includes("support"));

console.log("[PASS] laptop-first student view model");
