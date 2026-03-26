import assert from "assert";
import { SessionWindowManager } from "../../../backend/api/src/ingestion/session-window-manager";
import { test } from "../test-harness";

test("session window manager prunes old events and builds cycle input", () => {
  let nowMs = Date.parse("2026-03-25T10:00:00.000Z");

  const manager = new SessionWindowManager({
    classId: "class-101",
    expectedStudentIds: ["Aarav", "Mia", "Noah"],
    cycleIntervalMs: 5000,
    windowConfig: {
      windowDurationMs: 60000,
      activeStudentThresholdMs: 30000,
    },
    now: () => nowMs,
  });

  manager.pushEnvelope({
    messageId: "m-1",
    schemaVersion: "1.0.0",
    source: "student-client",
    payloadType: "engagement-signal",
    payload: {
      studentId: "Aarav",
      classId: "class-101",
      valueType: "engagement-score",
      value: 0.8,
      engagementScore: 0.8,
      cameraStatus: "active",
      timestamp: "2026-03-25T09:59:40.000Z",
    },
  });

  manager.pushEnvelope({
    messageId: "m-2",
    schemaVersion: "1.0.0",
    source: "student-client",
    payloadType: "feedback-event",
    payload: {
      studentId: "Mia",
      classId: "class-101",
      valueType: "feedback-type",
      value: "repeat",
      feedbackType: "repeat",
      timestamp: "2026-03-25T09:58:30.000Z",
    },
  });

  nowMs = Date.parse("2026-03-25T10:00:20.000Z");
  const cycleInput = manager.buildCycleInput(nowMs);

  assert.strictEqual(cycleInput.events.length, 1);
  assert.strictEqual(cycleInput.events[0].valueType, "engagement-score");
});
