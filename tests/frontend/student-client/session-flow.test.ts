import assert from "assert";
import { createStudentRuntime } from "../../../frontend/student-client/src/app/student-runtime";

const published: Array<{ topic: string; payload: string }> = [];

const runtime = createStudentRuntime({
  classId: "class-101",
  studentId: "aarav-sharma",
  studentName: "Aarav Sharma",
  clientId: "student-class-101-aarav-sharma",
  sessionId: "class-101-live-session",
  publishing: {
    studentEngagementIntervalMs: 5000,
    feedbackEventTrigger: "on-user-interaction",
    messageRequirements: {
      requireIdentifiers: true,
      requireTypedValue: true,
      requireTimestamp: true,
    },
  },
  topics: {
    engagementTopic: "cognitivepulse/class/class-101/student/aarav-sharma/engagement",
    statusTopic: "cognitivepulse/class/class-101/student/aarav-sharma/status",
    feedbackByType: {
      confused: "cognitivepulse/class/class-101/feedback/confused",
      repeat: "cognitivepulse/class/class-101/feedback/repeat",
      understood: "cognitivepulse/class/class-101/feedback/understood",
    },
    sessionInfoTopic: "cognitivepulse/class/class-101/session/info",
  },
  onPublish: (packet) => {
    published.push(packet);
  },
  now: () => "2026-03-25T10:00:00.000Z",
});

assert.strictEqual(runtime.state().sessionPhase, "not-joined");
assert.strictEqual(runtime.state().identityConfirmed, false);

runtime.confirmRealName("Aarav Sharma");
runtime.joinSession();
assert.strictEqual(runtime.state().sessionPhase, "live");
assert.strictEqual(runtime.state().activeSessionId, "class-101-live-session");

runtime.markTemporarilyDisconnected();
assert.strictEqual(runtime.state().sessionPhase, "temporarily-disconnected");

runtime.reconnectSession();
assert.strictEqual(runtime.state().sessionPhase, "live");

runtime.leaveSession();
assert.strictEqual(runtime.state().sessionPhase, "exited");
assert.strictEqual(runtime.state().activeSessionId, null);
assert.ok(published.length > 0);

console.log("[PASS] student runtime session flow lifecycle");
